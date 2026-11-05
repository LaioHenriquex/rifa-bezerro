import { useEffect, useMemo, useState, type CSSProperties } from "react";

import {
  doc,
  writeBatch,
  getDoc,
  collection,
  onSnapshot,
  updateDoc,
  query,
  orderBy,
  setDoc
} from "firebase/firestore";

import { auth, db } from "../firebase";

type StatusNumero = "disponivel" | "reservado" | "vendido";

type Numero = {
  id: string;
  numero: number;
  status: StatusNumero;
};

type Configuracao = {
  chavePix: string;
  nomeTitular: string;
  valorNumero: number;
  quantidadeNumeros: number;
  prazoReserva: number;
  dataSorteio: string;
};

type StatusReserva = "pendente" | "confirmado" | "negado";

type Reserva = {
  id: string;
  nome: string;
  whatsapp: string;
  numeros: number[];
  quantidade: number;
  valorTotal: number;
  status: StatusReserva;
  criadoEm?: {
    toDate?: () => Date;
  } | Date | null;
};

const configuracaoInicial: Configuracao = {
  chavePix: "",
  nomeTitular: "",
  valorNumero: 20,
  quantidadeNumeros: 200,
  prazoReserva: 30,
  dataSorteio: ""
};

function Admin() {
  const [carregando, setCarregando] = useState(false);
  const [mensagem, setMensagem] = useState("");
  const [numeros, setNumeros] = useState<Numero[]>([]);
  const [atualizando, setAtualizando] = useState<string | null>(null);

  const [configuracao, setConfiguracao] =
    useState<Configuracao>(configuracaoInicial);

  const [carregandoConfig, setCarregandoConfig] = useState(true);
  const [salvandoConfig, setSalvandoConfig] = useState(false);

  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [carregandoReservas, setCarregandoReservas] = useState(true);
  const [processandoReserva, setProcessandoReserva] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  // Acompanha os números em tempo real
  useEffect(() => {
    const consulta = query(
      collection(db, "numeros"),
      orderBy("numero")
    );

    const cancelar = onSnapshot(
      consulta,
      (snapshot) => {
        const lista: Numero[] = snapshot.docs.map((documento) => {
          const dados = documento.data();

          return {
            id: documento.id,
            numero: dados.numero,
            status: dados.status
          };
        });

        setNumeros(lista);
      },
      (erro) => {
        console.error(erro);
        setMensagem("Erro ao carregar os números.");
      }
    );

    return () => cancelar();
  }, []);

  // Carrega as configurações da campanha
  useEffect(() => {
    const referencia = doc(db, "configuracoes", "campanha");

    const cancelar = onSnapshot(
      referencia,
      (documento) => {
        if (documento.exists()) {
          const dados = documento.data();

          setConfiguracao({
            chavePix: dados.chavePix ?? "",
            nomeTitular: dados.nomeTitular ?? "",
            valorNumero: dados.valorNumero ?? 20,
            quantidadeNumeros: dados.quantidadeNumeros ?? 200,
            prazoReserva: dados.prazoReserva ?? 30,
            dataSorteio: dados.dataSorteio ?? ""
          });
        }

        setCarregandoConfig(false);
      },
      (erro) => {
        console.error("Erro ao carregar configurações:", erro);
        setMensagem("Erro ao carregar as configurações.");
        setCarregandoConfig(false);
      }
    );

    return () => cancelar();
  }, []);

  // Acompanha as solicitações em tempo real
  useEffect(() => {
    const consulta = query(
      collection(db, "reservas"),
      orderBy("criadoEm", "desc")
    );

    const cancelar = onSnapshot(
      consulta,
      (snapshot) => {
        const lista: Reserva[] = snapshot.docs.map((documento) => {
          const dados = documento.data();

          return {
            id: documento.id,
            nome: dados.nome ?? "",
            whatsapp: dados.whatsapp ?? "",
            numeros: Array.isArray(dados.numeros) ? dados.numeros : [],
            quantidade: dados.quantidade ?? 0,
            valorTotal: dados.valorTotal ?? 0,
            status: dados.status ?? "pendente",
            criadoEm: dados.criadoEm ?? null
          };
        });

        setReservas(lista);
        setCarregandoReservas(false);
      },
      (erro) => {
        console.error("Erro ao carregar solicitações:", erro);
        setMensagem("Erro ao carregar as solicitações.");
        setCarregandoReservas(false);
      }
    );

    return () => cancelar();
  }, []);

  // Cadastra os 200 números sem apagar os existentes
  async function criarNumeros() {
    try {
      setCarregando(true);
      setMensagem("");

      const batch = writeBatch(db);
      let criados = 0;

      for (let numero = 1; numero <= 200; numero++) {
        const id = String(numero).padStart(3, "0");
        const referencia = doc(db, "numeros", id);
        const existente = await getDoc(referencia);

        if (!existente.exists()) {
          batch.set(referencia, {
            numero,
            status: "disponivel",
            reservaId: null,
            participanteId: null,
            criadoEm: new Date()
          });

          criados++;
        }
      }

      if (criados > 0) {
        await batch.commit();
      }

      setMensagem(
        `${criados} números cadastrados. Os números existentes foram preservados.`
      );
    } catch (erro) {
      console.error(erro);
      setMensagem("Erro ao cadastrar os números.");
    } finally {
      setCarregando(false);
    }
  }

  // Altera o status de um número
  async function alterarStatus(
    id: string,
    status: StatusNumero
  ) {
    try {
      setAtualizando(id);
      setMensagem("");

      await updateDoc(doc(db, "numeros", id), {
        status
      });

      setMensagem(`Número ${id} atualizado com sucesso.`);
    } catch (erro) {
      console.error(erro);
      setMensagem(`Erro ao atualizar o número ${id}.`);
    } finally {
      setAtualizando(null);
    }
  }

  // Atualiza os campos das configurações
  function atualizarConfiguracao(
    campo: keyof Configuracao,
    valor: string
  ) {
    setConfiguracao((atual) => ({
      ...atual,
      [campo]:
        campo === "valorNumero" ||
        campo === "quantidadeNumeros" ||
        campo === "prazoReserva"
          ? Number(valor)
          : valor
    }));
  }

  // Salva as configurações no Firestore
  async function salvarConfiguracoes() {
    try {
      setSalvandoConfig(true);
      setMensagem("");

      if (
        !configuracao.chavePix.trim() ||
        !configuracao.nomeTitular.trim()
      ) {
        setMensagem("Preencha a chave PIX e o nome da titular.");
        return;
      }

      if (
        !Number.isFinite(configuracao.valorNumero) ||
        configuracao.valorNumero <= 0 ||
        !Number.isInteger(configuracao.quantidadeNumeros) ||
        configuracao.quantidadeNumeros <= 0 ||
        !Number.isInteger(configuracao.prazoReserva) ||
        configuracao.prazoReserva <= 0
      ) {
        setMensagem("Confira os valores numéricos informados.");
        return;
      }

      await setDoc(
        doc(db, "configuracoes", "campanha"),
        {
          chavePix: configuracao.chavePix.trim(),
          nomeTitular: configuracao.nomeTitular.trim(),
          valorNumero: configuracao.valorNumero,
          quantidadeNumeros: configuracao.quantidadeNumeros,
          prazoReserva: configuracao.prazoReserva,
          dataSorteio: configuracao.dataSorteio
        },
        { merge: true }
      );

      setMensagem("Configurações salvas com sucesso!");
    } catch (erro) {
      console.error(erro);
      setMensagem("Erro ao salvar as configurações.");
    } finally {
      setSalvandoConfig(false);
    }
  }

  // Confirma, nega ou exclui uma solicitação pela API
  async function processarSolicitacao(
    reservaId: string,
    acao: "confirmar" | "negar" | "excluir"
  ) {
    const reserva = reservas.find((item) => item.id === reservaId);

    if (!reserva) {
      setMensagem("Solicitação não encontrada.");
      return;
    }

    if (
      (acao === "confirmar" || acao === "negar") &&
      reserva.status !== "pendente"
    ) {
      setMensagem("Esta solicitação já foi processada.");
      return;
    }

    if (acao === "excluir" && reserva.status !== "confirmado") {
      setMensagem("Somente solicitações confirmadas podem ser excluídas.");
      return;
    }

    const confirmacao =
      acao === "confirmar"
        ? `Deseja confirmar a solicitação de ${reserva.nome}? Os números serão marcados como vendidos.`
        : acao === "negar"
          ? `Deseja negar a solicitação de ${reserva.nome}? Os números serão liberados novamente.`
          : `Deseja excluir definitivamente a solicitação confirmada de ${reserva.nome}? Os números continuarão vendidos.`;

    if (!window.confirm(confirmacao)) return;

    try {
      setProcessandoReserva(reservaId);
      setMensagem("");

      const usuario = auth.currentUser;

      if (!usuario) {
        throw new Error("Sua sessão expirou. Entre novamente no painel.");
      }

      const token = await usuario.getIdToken();

      const resposta = await fetch("/api/reservas", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          acao,
          reservaId
        })
      });

      const resultado = await resposta.json();

      if (!resposta.ok) {
        throw new Error(
          resultado.erro || "Não foi possível processar a solicitação."
        );
      }

      setMensagem(
        acao === "confirmar"
          ? "Solicitação confirmada com sucesso!"
          : acao === "negar"
            ? "Solicitação negada e números liberados!"
            : "Solicitação confirmada excluída com sucesso!"
      );
    } catch (erro) {
      console.error("Erro ao processar solicitação:", erro);

      setMensagem(
        erro instanceof Error
          ? erro.message
          : "Erro ao processar a solicitação."
      );
    } finally {
      setProcessandoReserva(null);
    }
  }

  // Formata a data da solicitação
  function formatarData(data: Reserva["criadoEm"]) {
    if (!data) return "Data não disponível";

    let dataConvertida: Date;

    if (data instanceof Date) {
      dataConvertida = data;
    } else if (typeof data.toDate === "function") {
      dataConvertida = data.toDate();
    } else {
      return "Data não disponível";
    }

    return dataConvertida.toLocaleString("pt-BR");
  }

  // Pesquisa por nome, WhatsApp ou número
  const reservasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();

    if (!termo) return reservas;

    const termoNumerico = termo.replace(/\D/g, "");

    return reservas.filter((reserva) => {
      const nomeEncontrado = reserva.nome.toLowerCase().includes(termo);

      const whatsappEncontrado = reserva.whatsapp
        .replace(/\D/g, "")
        .includes(termoNumerico);

      const numeroEncontrado = reserva.numeros.some((numero) =>
        String(numero).padStart(3, "0").includes(termo)
      );

      return nomeEncontrado || whatsappEncontrado || numeroEncontrado;
    });
  }, [reservas, busca]);

  const disponiveis = numeros.filter(
    (n) => n.status === "disponivel"
  ).length;

  const reservados = numeros.filter(
    (n) => n.status === "reservado"
  ).length;

  const vendidos = numeros.filter(
    (n) => n.status === "vendido"
  ).length;

  const pendentes = reservas.filter(
    (r) => r.status === "pendente"
  ).length;

  const estiloCard: CSSProperties = {
    background: "#181818",
    padding: 20,
    borderRadius: 12,
    flex: "1 1 150px"
  };

  const estiloCampo: CSSProperties = {
    width: "100%",
    padding: 13,
    marginTop: 8,
    background: "#101010",
    color: "#fff",
    border: "1px solid #444",
    borderRadius: 8,
    fontSize: 15,
    boxSizing: "border-box"
  };

  const estiloBotao: CSSProperties = {
    padding: "14px 20px",
    background: "#d4af37",
    color: "#000",
    border: "none",
    borderRadius: 8,
    fontWeight: "bold",
    cursor: "pointer"
  };

  const estiloBotaoAcao = (cor: string): CSSProperties => ({
    padding: "10px 14px",
    background: cor,
    color: "#000",
    border: "none",
    borderRadius: 7,
    fontWeight: "bold",
    cursor: "pointer"
  });

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#0b0b0b",
        color: "#fff",
        padding: "40px 20px",
        fontFamily: "Arial"
      }}
    >
      <h1>Painel Administrativo</h1>

      <p style={{ marginTop: 12, color: "#aaa" }}>
        Gerenciamento da campanha RF PREMIUM
      </p>

      {/* Resumo */}
      <section
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: 15,
          marginTop: 30,
          maxWidth: 1100
        }}
      >
        <div style={estiloCard}>
          <span style={{ color: "#aaa" }}>Total cadastrado</span>
          <h2>{numeros.length}</h2>
        </div>

        <div style={estiloCard}>
          <span style={{ color: "#4ade80" }}>Disponíveis</span>
          <h2>{disponiveis}</h2>
        </div>

        <div style={estiloCard}>
          <span style={{ color: "#facc15" }}>Reservados</span>
          <h2>{reservados}</h2>
        </div>

        <div style={estiloCard}>
          <span style={{ color: "#f87171" }}>Vendidos</span>
          <h2>{vendidos}</h2>
        </div>

        <div style={estiloCard}>
          <span style={{ color: "#d4af37" }}>Solicitações pendentes</span>
          <h2>{pendentes}</h2>
        </div>
      </section>

      {/* Solicitações recebidas */}
      <section
        style={{
          marginTop: 35,
          padding: 25,
          background: "#181818",
          border: "1px solid #3b3320",
          borderRadius: 12,
          maxWidth: 1100
        }}
      >
        <h2>Solicitações recebidas</h2>

        <p style={{ color: "#aaa", margin: "10px 0 20px" }}>
          Consulte os participantes e gerencie as solicitações em tempo real.
        </p>

        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Pesquisar por nome, WhatsApp ou número..."
          style={estiloCampo}
        />

        {carregandoReservas ? (
          <p style={{ color: "#d4af37", marginTop: 20 }}>
            Carregando solicitações...
          </p>
        ) : reservasFiltradas.length === 0 ? (
          <p style={{ color: "#aaa", marginTop: 20 }}>
            {busca
              ? "Nenhuma solicitação encontrada para essa pesquisa."
              : "Nenhuma solicitação recebida até o momento."}
          </p>
        ) : (
          <div
            style={{
              display: "grid",
              gap: 15,
              marginTop: 20
            }}
          >
            {reservasFiltradas.map((reserva) => {
              const pendente = reserva.status === "pendente";
              const confirmada = reserva.status === "confirmado";
              const processando = processandoReserva === reserva.id;

              const corStatus =
                reserva.status === "confirmado"
                  ? "#4ade80"
                  : reserva.status === "negado"
                    ? "#f87171"
                    : "#facc15";

              return (
                <article
                  key={reserva.id}
                  style={{
                    background: "#101010",
                    border: "1px solid #333",
                    borderRadius: 10,
                    padding: 18
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      justifyContent: "space-between",
                      gap: 12,
                      alignItems: "center"
                    }}
                  >
                    <h3 style={{ margin: 0 }}>
                      {reserva.nome || "Participante sem nome"}
                    </h3>

                    <span
                      style={{
                        color: corStatus,
                        border: `1px solid ${corStatus}`,
                        borderRadius: 20,
                        padding: "5px 12px",
                        fontSize: 12,
                        fontWeight: "bold",
                        textTransform: "uppercase"
                      }}
                    >
                      {reserva.status}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                      gap: 14,
                      marginTop: 18
                    }}
                  >
                    <div>
                      <small style={{ color: "#aaa" }}>WhatsApp</small>
                      <p style={{ margin: "5px 0" }}>
                        {reserva.whatsapp}
                      </p>
                    </div>

                    <div>
                      <small style={{ color: "#aaa" }}>Quantidade</small>
                      <p style={{ margin: "5px 0" }}>
                        {reserva.quantidade}
                      </p>
                    </div>

                    <div>
                      <small style={{ color: "#aaa" }}>Valor de referência</small>
                      <p style={{ margin: "5px 0" }}>
                        {Number(reserva.valorTotal).toLocaleString("pt-BR", {
                          style: "currency",
                          currency: "BRL"
                        })}
                      </p>
                    </div>

                    <div>
                      <small style={{ color: "#aaa" }}>Data da solicitação</small>
                      <p style={{ margin: "5px 0" }}>
                        {formatarData(reserva.criadoEm)}
                      </p>
                    </div>
                  </div>

                  <div style={{ marginTop: 15 }}>
                    <small style={{ color: "#aaa" }}>
                      Números escolhidos
                    </small>

                    <p
                      style={{
                        color: "#d4af37",
                        fontWeight: "bold",
                        lineHeight: 1.8,
                        margin: "6px 0 0",
                        wordBreak: "break-word"
                      }}
                    >
                      {reserva.numeros
                        .map((numero) => String(numero).padStart(3, "0"))
                        .join(", ")}
                    </p>
                  </div>

                  {/* AÇÕES PARA SOLICITAÇÕES PENDENTES */}
                  {pendente && (
                    <div
                      style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 10,
                        marginTop: 18
                      }}
                    >
                      <button
                        type="button"
                        disabled={processando}
                        onClick={() =>
                          processarSolicitacao(reserva.id, "confirmar")
                        }
                        style={{
                          ...estiloBotaoAcao("#4ade80"),
                          opacity: processando ? 0.6 : 1
                        }}
                      >
                        {processando ? "PROCESSANDO..." : "CONFIRMAR"}
                      </button>

                      <button
                        type="button"
                        disabled={processando}
                        onClick={() =>
                          processarSolicitacao(reserva.id, "negar")
                        }
                        style={{
                          ...estiloBotaoAcao("#f87171"),
                          opacity: processando ? 0.6 : 1
                        }}
                      >
                        {processando ? "PROCESSANDO..." : "NEGAR"}
                      </button>
                    </div>
                  )}

                  {/* AÇÃO PARA SOLICITAÇÕES CONFIRMADAS */}
                  {confirmada && (
                    <div style={{ marginTop: 18 }}>
                      <button
                        type="button"
                        disabled={processando}
                        onClick={() =>
                          processarSolicitacao(reserva.id, "excluir")
                        }
                        style={{
                          ...estiloBotaoAcao("#f87171"),
                          opacity: processando ? 0.6 : 1
                        }}
                      >
                        {processando
                          ? "PROCESSANDO..."
                          : "EXCLUIR SOLICITAÇÃO"}
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Configurações da campanha */}
      <section
        style={{
          marginTop: 35,
          padding: 25,
          background: "#181818",
          borderRadius: 12,
          maxWidth: 600
        }}
      >
        <h2>Configurações da campanha</h2>

        <p style={{ color: "#aaa", margin: "12px 0 20px" }}>
          Configure os dados da campanha.
        </p>

        {carregandoConfig ? (
          <p style={{ color: "#d4af37" }}>
            Carregando configurações...
          </p>
        ) : (
          <div style={{ display: "grid", gap: 18 }}>
            <label>
              Data do sorteio

              <input
                type="date"
                value={configuracao.dataSorteio}
                onChange={(e) =>
                  atualizarConfiguracao("dataSorteio", e.target.value)
                }
                style={estiloCampo}
              />

              <small style={{ color: "#aaa" }}>
                Deixe vazio enquanto a data não estiver definida.
              </small>
            </label>

            <label>
              Chave PIX (e-mail)

              <input
                type="email"
                value={configuracao.chavePix}
                onChange={(e) =>
                  atualizarConfiguracao("chavePix", e.target.value)
                }
                placeholder="teste@email.com"
                style={estiloCampo}
              />
            </label>

            <label>
              Nome da titular

              <input
                type="text"
                value={configuracao.nomeTitular}
                onChange={(e) =>
                  atualizarConfiguracao("nomeTitular", e.target.value)
                }
                placeholder="Nome da titular da chave"
                style={estiloCampo}
              />
            </label>

            <label>
              Valor por número (R$)

              <input
                type="number"
                min="1"
                step="0.01"
                value={configuracao.valorNumero}
                onChange={(e) =>
                  atualizarConfiguracao("valorNumero", e.target.value)
                }
                style={estiloCampo}
              />
            </label>

            <label>
              Quantidade de números

              <input
                type="number"
                min="1"
                step="1"
                value={configuracao.quantidadeNumeros}
                onChange={(e) =>
                  atualizarConfiguracao("quantidadeNumeros", e.target.value)
                }
                style={estiloCampo}
              />
            </label>

            <label>
              Prazo de reserva (minutos)

              <input
                type="number"
                min="1"
                step="1"
                value={configuracao.prazoReserva}
                onChange={(e) =>
                  atualizarConfiguracao("prazoReserva", e.target.value)
                }
                style={estiloCampo}
              />
            </label>

            <button
              onClick={salvarConfiguracoes}
              disabled={salvandoConfig}
              style={{
                ...estiloBotao,
                opacity: salvandoConfig ? 0.6 : 1
              }}
            >
              {salvandoConfig
                ? "SALVANDO..."
                : "SALVAR CONFIGURAÇÕES"}
            </button>
          </div>
        )}
      </section>

      {/* Cadastro dos números */}
      <section
        style={{
          marginTop: 35,
          padding: 25,
          background: "#181818",
          borderRadius: 12,
          maxWidth: 500
        }}
      >
        <h2>Cadastro dos números</h2>

        <p style={{ margin: "15px 0", color: "#ccc" }}>
          Cadastre automaticamente os 200 números da campanha.
        </p>

        <button
          onClick={criarNumeros}
          disabled={carregando}
          style={estiloBotao}
        >
          {carregando ? "CADASTRANDO..." : "CRIAR 200 NÚMEROS"}
        </button>
      </section>

      {mensagem && (
        <p
          role="status"
          style={{ marginTop: 20, color: "#d4af37" }}
        >
          {mensagem}
        </p>
      )}

      {/* Gerenciamento dos números */}
      <section style={{ marginTop: 40 }}>
        <h2>Gerenciar números</h2>

        <p style={{ color: "#aaa", margin: "10px 0 20px" }}>
          Altere o status de cada número.
        </p>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(125px, 1fr))",
            gap: 12,
            maxWidth: 1000
          }}
        >
          {numeros.map((item) => (
            <div
              key={item.id}
              style={{
                background: "#181818",
                border: "1px solid #333",
                borderRadius: 10,
                padding: 12,
                textAlign: "center"
              }}
            >
              <strong
                style={{
                  display: "block",
                  fontSize: 20,
                  marginBottom: 10
                }}
              >
                {String(item.numero).padStart(3, "0")}
              </strong>

              <select
                value={item.status}
                disabled={atualizando === item.id}
                onChange={(e) =>
                  alterarStatus(
                    item.id,
                    e.target.value as StatusNumero
                  )
                }
                style={{
                  width: "100%",
                  padding: 8,
                  borderRadius: 6,
                  border: "1px solid #444",
                  background: "#292929",
                  color: "#fff"
                }}
              >
                <option value="disponivel">Disponível</option>
                <option value="reservado">Reservado</option>
                <option value="vendido">Vendido</option>
              </select>

              {atualizando === item.id && (
                <small style={{ color: "#d4af37" }}>
                  Salvando...
                </small>
              )}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

export default Admin;