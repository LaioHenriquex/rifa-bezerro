
import type { VercelRequest, VercelResponse } from "@vercel/node";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

import {
  FieldValue,
  Timestamp,
  getFirestore
} from "firebase-admin/firestore";

const UID_ADMIN = "aP2oK0J58GWViujxUwIvf6jx0dk1";

// =========================================
// CONEXÃO COM FIREBASE ADMIN
// =========================================

function obterFirebaseAdmin() {
  const credencialJSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

  if (!credencialJSON) {
    throw new Error("CREDENCIAL_NAO_CONFIGURADA");
  }

  let credencial;

  try {
    let textoCredencial = credencialJSON.trim();

    if (/^"type"\s*:/.test(textoCredencial)) {
      textoCredencial = "{" + textoCredencial;
    }

    credencial = JSON.parse(textoCredencial);
  } catch (erro) {
    console.error("Falha ao interpretar credencial:", erro);
    throw new Error("CREDENCIAL_JSON_INVALIDO");
  }

  const app =
    getApps().length > 0
      ? getApps()[0]
      : initializeApp({
          credential: cert(credencial)
        });

  return {
    auth: getAuth(app),
    db: getFirestore(app)
  };
}

// =========================================
// API DE RESERVAS
// =========================================

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({
      erro: "Método não permitido."
    });
  }

  try {
    const authorization = req.headers.authorization;

    if (!authorization?.startsWith("Bearer ")) {
      return res.status(401).json({
        erro: "Autenticação necessária."
      });
    }

    const token = authorization.substring(7);

    const { auth, db } = obterFirebaseAdmin();

    const usuario = await auth.verifyIdToken(token);

    const corpo =
      typeof req.body === "string"
        ? JSON.parse(req.body)
        : req.body ?? {};

    const { acao, reservaId } = corpo;

    // =========================================
    // AÇÕES ADMINISTRATIVAS
    // =========================================

    if (
      acao === "confirmar" ||
      acao === "negar" ||
      acao === "excluir"
    ) {
      if (usuario.uid !== UID_ADMIN) {
        return res.status(403).json({
          erro: "Você não tem permissão para realizar esta ação."
        });
      }

      if (
        typeof reservaId !== "string" ||
        reservaId.trim().length === 0
      ) {
        return res.status(400).json({
          erro: "Identificação da solicitação inválida."
        });
      }

      const reservaRef = db.collection("reservas").doc(reservaId);

      // =========================================
      // EXCLUIR SOMENTE RESERVAS CONFIRMADAS
      // =========================================

      if (acao === "excluir") {
        await db.runTransaction(async (transaction) => {
          const reservaDoc = await transaction.get(reservaRef);

          if (!reservaDoc.exists) {
            throw new Error("RESERVA_NAO_ENCONTRADA");
          }

          const reserva = reservaDoc.data()!;

          if (reserva.status !== "confirmado") {
            throw new Error("RESERVA_NAO_CONFIRMADA");
          }

          if (
            !Array.isArray(reserva.numeros) ||
            reserva.numeros.length === 0
          ) {
            throw new Error("RESERVA_SEM_NUMEROS");
          }

          const numeros = reserva.numeros as number[];

          const referencias = numeros.map((numero) => {
            if (
              !Number.isInteger(numero) ||
              numero < 1 ||
              numero > 200
            ) {
              throw new Error("NUMERO_INVALIDO");
            }

            const id = String(numero).padStart(3, "0");

            return db.collection("numeros").doc(id);
          });

          const documentos = await Promise.all(
            referencias.map((referencia) =>
              transaction.get(referencia)
            )
          );

          // Confere se todos continuam vendidos
          // e vinculados à reserva que será excluída.
          for (const documento of documentos) {
            if (!documento.exists) {
              throw new Error("NUMERO_NAO_ENCONTRADO");
            }

            const dados = documento.data();

            if (
              dados?.status !== "vendido" ||
              dados?.reservaId !== reservaId
            ) {
              throw new Error("RESERVA_INCONSISTENTE");
            }
          }

          // Exclui somente o documento da reserva.
          // Os números permanecem vendidos.
          transaction.delete(reservaRef);
        });

        return res.status(200).json({
          sucesso: true,
          mensagem: "Solicitação confirmada excluída com sucesso."
        });
      }

      // =========================================
      // CONFIRMAR OU NEGAR SOLICITAÇÃO
      // =========================================

      const resultado = await db.runTransaction(async (transaction) => {
        const reservaDoc = await transaction.get(reservaRef);

        if (!reservaDoc.exists) {
          throw new Error("RESERVA_NAO_ENCONTRADA");
        }

        const reserva = reservaDoc.data()!;

        if (reserva.status !== "pendente") {
          throw new Error("RESERVA_JA_PROCESSADA");
        }

        if (
          !Array.isArray(reserva.numeros) ||
          reserva.numeros.length === 0
        ) {
          throw new Error("RESERVA_SEM_NUMEROS");
        }

        const numeros = reserva.numeros as number[];

        const referencias = numeros.map((numero) => {
          if (
            !Number.isInteger(numero) ||
            numero < 1 ||
            numero > 200
          ) {
            throw new Error("NUMERO_INVALIDO");
          }

          const id = String(numero).padStart(3, "0");

          return db.collection("numeros").doc(id);
        });

        // Todas as leituras acontecem antes das escritas.
        const documentos = await Promise.all(
          referencias.map((referencia) =>
            transaction.get(referencia)
          )
        );

        // Verifica se todos os números pertencem à solicitação.
        for (const documento of documentos) {
          if (!documento.exists) {
            throw new Error("NUMERO_NAO_ENCONTRADO");
          }

          const dados = documento.data();

          if (
            dados?.status !== "reservado" ||
            dados?.reservaId !== reservaId
          ) {
            throw new Error("RESERVA_INCONSISTENTE");
          }
        }

        // CONFIRMAR: números passam para vendidos.
        if (acao === "confirmar") {
          referencias.forEach((referencia) => {
            transaction.update(referencia, {
              status: "vendido",
              atualizadoEm: FieldValue.serverTimestamp()
            });
          });

          transaction.update(reservaRef, {
            status: "confirmado",
            confirmadoEm: FieldValue.serverTimestamp(),
            atualizadoEm: FieldValue.serverTimestamp()
          });
        }

        // NEGAR: números voltam a ficar disponíveis.
        if (acao === "negar") {
          referencias.forEach((referencia) => {
            transaction.update(referencia, {
              status: "disponivel",
              reservaId: null,
              participanteId: null,
              atualizadoEm: FieldValue.serverTimestamp()
            });
          });

          transaction.update(reservaRef, {
            status: "negado",
            negadoEm: FieldValue.serverTimestamp(),
            atualizadoEm: FieldValue.serverTimestamp()
          });
        }

        return {
          reservaId,
          status: acao === "confirmar" ? "confirmado" : "negado",
          quantidade: numeros.length
        };
      });

      return res.status(200).json({
        sucesso: true,
        mensagem:
          acao === "confirmar"
            ? "Solicitação confirmada."
            : "Solicitação negada e números liberados.",
        reserva: resultado
      });
    }

    // =========================================
    // REGISTRAR SOLICITAÇÃO - VISITANTE
    // =========================================

    // Somente visitantes autenticados anonimamente podem solicitar.
    if (usuario.firebase?.sign_in_provider !== "anonymous") {
      return res.status(403).json({
        erro: "Esta operação é permitida somente para visitantes."
      });
    }

    const { nome, whatsapp, numeros } = corpo;

    if (
      typeof nome !== "string" ||
      nome.trim().length < 3 ||
      nome.trim().length > 100
    ) {
      return res.status(400).json({
        erro: "Informe um nome válido."
      });
    }

    const telefoneLimpo =
      typeof whatsapp === "string"
        ? whatsapp.replace(/\D/g, "")
        : "";

    if (!/^\d{10,11}$/.test(telefoneLimpo)) {
      return res.status(400).json({
        erro: "WhatsApp inválido."
      });
    }

    if (
      !Array.isArray(numeros) ||
      numeros.length < 1 ||
      numeros.length > 20 ||
      numeros.some(
        (numero: unknown) =>
          typeof numero !== "number" ||
          !Number.isInteger(numero) ||
          numero < 1 ||
          numero > 200
      ) ||
      new Set(numeros).size !== numeros.length
    ) {
      return res.status(400).json({
        erro: "Seleção de números inválida."
      });
    }

    const reservaRef = db.collection("reservas").doc();

    const configuracaoRef = db
      .collection("configuracoes")
      .doc("campanha");

    const numerosOrdenados = [...numeros].sort(
      (a: number, b: number) => a - b
    );

    const referenciasNumeros = numerosOrdenados.map((numero: number) =>
      db.collection("numeros").doc(
        String(numero).padStart(3, "0")
      )
    );

    const resultado = await db.runTransaction(async (transaction) => {
      const configuracaoDoc = await transaction.get(configuracaoRef);

      if (!configuracaoDoc.exists) {
        throw new Error("CONFIGURACAO_NAO_ENCONTRADA");
      }

      const documentosNumeros = await Promise.all(
        referenciasNumeros.map((referencia) =>
          transaction.get(referencia)
        )
      );

      const configuracao = configuracaoDoc.data()!;

      const valorNumero = Number(configuracao.valorNumero);
      const prazoReserva = Number(configuracao.prazoReserva);

      if (
        !Number.isFinite(valorNumero) ||
        valorNumero <= 0 ||
        !Number.isFinite(prazoReserva) ||
        prazoReserva <= 0
      ) {
        throw new Error("CONFIGURACAO_INVALIDA");
      }

      for (const documento of documentosNumeros) {
        if (!documento.exists) {
          throw new Error("NUMERO_NAO_ENCONTRADO");
        }

        if (documento.data()?.status !== "disponivel") {
          throw new Error("NUMERO_INDISPONIVEL");
        }
      }

      const agora = new Date();

      const expiraEm = new Date(
        agora.getTime() + prazoReserva * 60 * 1000
      );

      const valorTotal = numerosOrdenados.length * valorNumero;

      transaction.set(reservaRef, {
        nome: nome.trim(),
        whatsapp: telefoneLimpo,
        numeros: numerosOrdenados,
        quantidade: numerosOrdenados.length,
        valorTotal,
        status: "pendente",
        participanteId: usuario.uid,
        criadoEm: FieldValue.serverTimestamp(),
        expiraEm: Timestamp.fromDate(expiraEm),
        origem: "demonstracao"
      });

      referenciasNumeros.forEach((referencia) => {
        transaction.update(referencia, {
          status: "reservado",
          reservaId: reservaRef.id,
          participanteId: usuario.uid,
          atualizadoEm: FieldValue.serverTimestamp()
        });
      });

      return {
        reservaId: reservaRef.id,
        quantidade: numerosOrdenados.length,
        valorTotal,
        expiraEm: expiraEm.toISOString()
      };
    });

    return res.status(201).json({
      sucesso: true,
      mensagem: "Solicitação demonstrativa registrada.",
      reserva: resultado
    });

  } catch (erro: unknown) {
    console.error("Erro na API de reservas:", erro);

    const codigoErro =
      erro instanceof Error ? erro.message : "";

    if (codigoErro === "NUMERO_INDISPONIVEL") {
      return res.status(409).json({
        erro: "Um ou mais números não estão mais disponíveis."
      });
    }

    if (codigoErro === "RESERVA_NAO_ENCONTRADA") {
      return res.status(404).json({
        erro: "Solicitação não encontrada."
      });
    }

    if (codigoErro === "RESERVA_JA_PROCESSADA") {
      return res.status(409).json({
        erro: "Esta solicitação já foi processada."
      });
    }

    if (codigoErro === "RESERVA_NAO_CONFIRMADA") {
      return res.status(409).json({
        erro: "Somente solicitações confirmadas podem ser excluídas."
      });
    }

    if (
      codigoErro === "NUMERO_NAO_ENCONTRADO" ||
      codigoErro === "CONFIGURACAO_NAO_ENCONTRADA" ||
      codigoErro === "CONFIGURACAO_INVALIDA" ||
      codigoErro === "RESERVA_SEM_NUMEROS" ||
      codigoErro === "NUMERO_INVALIDO" ||
      codigoErro === "RESERVA_INCONSISTENTE"
    ) {
      return res.status(400).json({
        erro: "Não foi possível validar os dados da solicitação."
      });
    }

    if (codigoErro === "CREDENCIAL_NAO_CONFIGURADA") {
      return res.status(500).json({
        erro: "A credencial do servidor não está configurada."
      });
    }

    if (codigoErro === "CREDENCIAL_JSON_INVALIDO") {
      return res.status(500).json({
        erro: "A credencial do servidor está em formato inválido."
      });
    }

    return res.status(500).json({
      erro: "Erro interno ao processar a solicitação."
    });
  }
}
