import type { VercelRequest, VercelResponse } from "@vercel/node";

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

import { liberarReservasExpiradas } from "../src/lib/expirarReservas";

function obterBanco() {
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

  return getFirestore(app);
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  if (req.method !== "GET") {
    return res.status(405).json({
      erro: "Método não permitido."
    });
  }

  try {
    const db = obterBanco();

    // Libera números de reservas que já venceram.
    await liberarReservasExpiradas(db);

    const [documentosNumeros, documentoConfiguracao] =
      await Promise.all([
        db.collection("numeros").get(),
        db.collection("configuracoes").doc("campanha").get()
      ]);

    if (!documentoConfiguracao.exists) {
      return res.status(404).json({
        erro: "Configuração da campanha não encontrada."
      });
    }

    const numeros: Record<number, string> = {};

    documentosNumeros.forEach((documento) => {
      const dados = documento.data();

      const numero =
        typeof dados.numero === "number"
          ? dados.numero
          : Number(documento.id);

      if (
        Number.isInteger(numero) &&
        numero >= 1 &&
        numero <= 200 &&
        ["disponivel", "reservado", "vendido"].includes(dados.status)
      ) {
        numeros[numero] = dados.status;
      }
    });

    const configuracao = documentoConfiguracao.data()!;

    res.setHeader(
      "Cache-Control",
      "public, max-age=0, s-maxage=10, stale-while-revalidate=20"
    );

    return res.status(200).json({
      sucesso: true,
      numeros,
      configuracao: {
        chavePix: configuracao.chavePix ?? "",
        nomeTitular: configuracao.nomeTitular ?? "",
        dataSorteio: configuracao.dataSorteio ?? ""
      },
      atualizadoEm: new Date().toISOString()
    });
  } catch (erro) {
    console.error("Erro ao carregar status:", erro);

    return res.status(500).json({
      erro: "Não foi possível carregar os dados da campanha."
    });
  }
}