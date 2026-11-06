import {
  FieldValue,
  Timestamp,
  type Firestore
} from "firebase-admin/firestore";

export async function liberarReservasExpiradas(db: Firestore) {
  const agora = Timestamp.now();

  const snapshot = await db
    .collection("reservas")
    .where("status", "==", "pendente")
    .where("expiraEm", "<=", agora)
    .get();

  let totalLiberado = 0;

  for (const reservaDocumento of snapshot.docs) {
    const quantidade = await db.runTransaction(async (transaction) => {
      const reservaRef = reservaDocumento.ref;
      const reservaAtual = await transaction.get(reservaRef);

      if (!reservaAtual.exists) return 0;

      const reserva = reservaAtual.data()!;

      if (reserva.status !== "pendente") return 0;

      const numeros = Array.isArray(reserva.numeros)
        ? reserva.numeros
        : [];

      const referencias = numeros
        .filter(
          (numero: unknown) =>
            Number.isInteger(numero) &&
            Number(numero) >= 1 &&
            Number(numero) <= 200
        )
        .map((numero: number) =>
          db.collection("numeros").doc(String(numero).padStart(3, "0"))
        );

      const documentos = await Promise.all(
        referencias.map((referencia) => transaction.get(referencia))
      );

      let liberados = 0;

      documentos.forEach((documento, indice) => {
        if (!documento.exists) return;

        const dados = documento.data();

        if (
          dados?.status === "reservado" &&
          dados?.reservaId === reservaDocumento.id
        ) {
          transaction.update(referencias[indice], {
            status: "disponivel",
            reservaId: null,
            participanteId: null,
            atualizadoEm: FieldValue.serverTimestamp()
          });

          liberados++;
        }
      });

      transaction.update(reservaRef, {
        status: "expirado",
        expiradoEm: FieldValue.serverTimestamp(),
        atualizadoEm: FieldValue.serverTimestamp()
      });

      return liberados;
    });

    totalLiberado += quantidade;
  }

  return totalLiberado;
}