
import { useEffect, useState } from "react";

import {
  collection,
  onSnapshot,
  query,
  orderBy,
  doc
} from "firebase/firestore";

import {
  onAuthStateChanged,
  signInAnonymously
} from "firebase/auth";

import { auth, db } from "../firebase";
import "./Home.css";

type StatusNumero = "disponivel" | "reservado" | "vendido";

function Home() {
  const [selecionados, setSelecionados] = useState<number[]>([]);
  const [statusNumeros, setStatusNumeros] = useState<Record<number, StatusNumero>>({});
  const [carregando, setCarregando] = useState(true);
  const [erroBanco, setErroBanco] = useState("");

  const [mostrarCadastro, setMostrarCadastro] = useState(false);
  const [nome, setNome] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [erroFormulario, setErroFormulario] = useState("");

  const [chavePix, setChavePix] = useState("");
  const [nomeTitular, setNomeTitular] = useState("");
  const [dataSorteio, setDataSorteio] = useState("");
  const [mensagemCopia, setMensagemCopia] = useState("");

  const numeros = Array.from({ length: 200 }, (_, i) => i + 1);

  // Autenticação anônima
  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, (usuario) => {
      if (!usuario) {
        signInAnonymously(auth).catch((erro) => {
          console.error("Erro na autenticação anônima:", erro);
        });
      }
    });

    return () => cancelar();
  }, []);

  // Carrega os dados da campanha
  useEffect(() => {
    const referencia = doc(db, "configuracoes", "campanha");

    const cancelar = onSnapshot(
      referencia,
      (documento) => {
        if (documento.exists()) {
          const dados = documento.data();

          setChavePix(dados.chavePix ?? "");
          setNomeTitular(dados.nomeTitular ?? "");
          setDataSorteio(dados.dataSorteio ?? "");
        }
      },
      (erro) => console.error("Erro ao carregar configurações:", erro)
    );

    return () => cancelar();
  }, []);

  // Copia a chave PIX
  async function copiarPix() {
    if (!chavePix) return;

    try {
      await navigator.clipboard.writeText(chavePix);
      setMensagemCopia("Chave PIX copiada!");
    } catch (erro) {
      console.error(erro);
      setMensagemCopia("Não foi possível copiar a chave.");
    }

    setTimeout(() => setMensagemCopia(""), 2500);
  }

  // Atualização dos números em tempo real
  useEffect(() => {
    const consulta = query(
      collection(db, "numeros"),
      orderBy("numero")
    );

    const cancelar = onSnapshot(
      consulta,
      (snapshot) => {
        const status: Record<number, StatusNumero> = {};

        snapshot.forEach((documento) => {
          const dados = documento.data();

          if (
            typeof dados.numero === "number" &&
            ["disponivel", "reservado", "vendido"].includes(dados.status)
          ) {
            status[dados.numero] = dados.status;
          }
        });

        setStatusNumeros(status);

        // Remove da seleção os números indisponíveis
        setSelecionados((atuais) =>
          atuais.filter((numero) => status[numero] === "disponivel")
        );

        setCarregando(false);
        setErroBanco("");
      },
      (erro) => {
        console.error("Erro ao carregar números:", erro);
        setErroBanco("Não foi possível carregar os números.");
        setCarregando(false);
      }
    );

    return () => cancelar();
  }, []);

  function selecionarNumero(numero: number) {
    if (statusNumeros[numero] !== "disponivel") return;

    setSelecionados((atuais) =>
      atuais.includes(numero)
        ? atuais.filter((n) => n !== numero)
        : [...atuais, numero]
    );
  }

  function formatarWhatsApp(valor: string) {
    const numeros = valor.replace(/\D/g, "").slice(0, 11);

    if (numeros.length <= 2) {
      return numeros.length ? `(${numeros}` : "";
    }

    if (numeros.length <= 7) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2)}`;
    }

    if (numeros.length <= 10) {
      return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 6)}-${numeros.slice(6)}`;
    }

    return `(${numeros.slice(0, 2)}) ${numeros.slice(2, 7)}-${numeros.slice(7)}`;
  }

  function avancarCadastro(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErroFormulario("");

    const nomeLimpo = nome.trim().replace(/\s+/g, " ");
    const telefoneLimpo = whatsapp.replace(/\D/g, "");

    if (nomeLimpo.split(" ").length < 2) {
      setErroFormulario("Digite seu nome e sobrenome.");
      return;
    }

    if (telefoneLimpo.length !== 10 && telefoneLimpo.length !== 11) {
      setErroFormulario("Digite um WhatsApp válido com DDD.");
      return;
    }

    if (selecionados.length === 0) {
      setErroFormulario("Selecione pelo menos um número.");
      return;
    }

    const listaNumeros = [...selecionados]
      .sort((a, b) => a - b)
      .map((n) => String(n).padStart(3, "0"))
      .join(", ");

    const total = selecionados.length * 20;

    const mensagem = [
      "Tenho interesse na rifa demonstrativa.",
      "",
      `Nome: ${nomeLimpo}`,
      `WhatsApp: ${whatsapp}`,
      `Números escolhidos: ${listaNumeros}`,
      `Quantidade: ${selecionados.length}`,
      `Valor de referência: ${total.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL"
      })}`
    ].join("\n");

    const numeroDestino = "557398645777";
    const link = `https://wa.me/${numeroDestino}?text=${encodeURIComponent(mensagem)}`;

    window.open(link, "_blank", "noopener,noreferrer");
  }

  const total = selecionados.length * 20;

  return (
    <main className="rifa-page">
      <header className="rifa-header">
        <div className="brand">
          RF <span>PREMIUM</span>
        </div>
        <a href="#numeros">ESCOLHER NÚMEROS</a>
      </header>

      <section className="hero">
        <div className="hero-image">
          <img src="/bezerro.jpg" alt="Bezerro da campanha" />
          <div className="hero-overlay" />

          <div className="hero-content">
            <span className="eyebrow">EDIÇÃO ESPECIAL</span>
            <h1>
              RIFA DO<br />
              <span>BEZERRO</span>
            </h1>
            <p>Concorra a um bezerro ou R$ 1.200 no PIX!</p>
            <a href="#numeros" className="gold-button">
              ESCOLHER MEUS NÚMEROS
            </a>
          </div>
        </div>
      </section>

      {/* CAMPANHA DE SOLIDARIEDADE */}
      <section className="solidarity-section">
        <span className="eyebrow">UMA CAMPANHA DE SOLIDARIEDADE</span>

        <h2>Uma corrente de solidariedade pela vida!</h2>

        <p>
          Esta campanha é realizada em prol de <strong>Alane Carvalho</strong>,
          que está enfrentando varios problemas de saúde.
          Neste momento, cada gesto de apoio, carinho e esperança faz a diferença.
          Vamos juntos fortalecer essa corrente de solidariedade!
        </p>

        <span className="solidarity-message">
          Por Alane Carvalho. Pela vida. Pela esperança.
        </span>
      </section>

      <section className="prize-info">
        <div>
          <span>PRÊMIO ALTERNATIVO</span>
          <strong>R$ 1.200 no PIX</strong>
        </div>

        <div>
          <span>VALOR POR NÚMERO</span>
          <strong>R$ 20,00</strong>
        </div>

        <div>
          <span>DATA DO SORTEIO</span>
          <strong>
            {dataSorteio
              ? new Date(dataSorteio + "T12:00:00").toLocaleDateString("pt-BR")
              : "Data a definir"}
          </strong>
        </div>
      </section>

      <section className="numbers-section" id="numeros">
        <span className="eyebrow">SUA CHANCE COMEÇA AQUI</span>
        <h2>Escolha seus números</h2>
        <p>Selecione um ou mais números.</p>

        <div className="legend">
          <span><i className="available" /> Disponível</span>
          <span><i className="selected" /> Selecionado</span>
          <span><i className="unavailable" /> Indisponível</span>
        </div>

        {carregando && <p>Carregando números...</p>}
        {erroBanco && <p>{erroBanco}</p>}

        <div className="numbers-grid">
          {numeros.map((numero) => {
            const status = statusNumeros[numero];
            const ativo = selecionados.includes(numero);
            const indisponivel = status !== "disponivel";

            return (
              <button
                key={numero}
                className={`number ${
                  ativo
                    ? "number-selected"
                    : indisponivel
                    ? "number-unavailable"
                    : ""
                }`}
                onClick={() => selecionarNumero(numero)}
                disabled={carregando || indisponivel}
                aria-pressed={ativo}
                title={
                  status === "vendido"
                    ? "Número vendido"
                    : status === "reservado"
                    ? "Número reservado"
                    : status === "disponivel"
                    ? "Número disponível"
                    : "Aguardando carregamento"
                }
              >
                {String(numero).padStart(3, "0")}
              </button>
            );
          })}
        </div>

        <div className="selection-summary">
          <div>
            <span>Números selecionados</span>
            <strong>{selecionados.length}</strong>
          </div>

          <div>
            <span>Valor de referência</span>
            <strong>
              {total.toLocaleString("pt-BR", {
                style: "currency",
                currency: "BRL"
              })}
            </strong>
          </div>

          <button
            className="gold-button"
            disabled={selecionados.length === 0}
            onClick={() => {
              setErroFormulario("");
              setMostrarCadastro(true);

              setTimeout(() => {
                document.getElementById("cadastro")?.scrollIntoView({
                  behavior: "smooth"
                });
              }, 100);
            }}
          >
            CONTINUAR
          </button>
        </div>
      </section>

      {/* DADOS DO PARTICIPANTE E PIX DEMONSTRATIVO */}
      {mostrarCadastro && (
        <section className="numbers-section" id="cadastro">
          <span className="eyebrow">QUASE LÁ!</span>
          <h2>Continue seu atendimento</h2>
          <p>Confira os números e informe seus dados.</p>

          <div className="selection-summary">
            <div>
              <span>Números escolhidos</span>
              <strong>
                {[...selecionados]
                  .sort((a, b) => a - b)
                  .map((n) => String(n).padStart(3, "0"))
                  .join(", ")}
              </strong>
            </div>

            <div>
              <span>Quantidade</span>
              <strong>{selecionados.length}</strong>
            </div>

            <div>
              <span>Valor de referência</span>
              <strong>
                {total.toLocaleString("pt-BR", {
                  style: "currency",
                  currency: "BRL"
                })}
              </strong>
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))",
              gap: 25,
              maxWidth: 950,
              margin: "30px auto",
              alignItems: "stretch"
            }}
          >
            {/* FORMULÁRIO */}
            <form
              onSubmit={avancarCadastro}
              style={{
                display: "grid",
                alignContent: "start",
                gap: 15,
                textAlign: "left",
                background: "#181818",
                border: "1px solid #333",
                borderRadius: 12,
                padding: 22
              }}
            >
              <h3 style={{ margin: "0 0 8px" }}>Seus dados</h3>

              <label>
                Nome completo
                <input
                  type="text"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  placeholder="Digite seu nome completo"
                  autoComplete="name"
                  required
                  style={estiloCampo}
                />
              </label>

              <label>
                WhatsApp
                <input
                  type="tel"
                  value={whatsapp}
                  onChange={(e) =>
                    setWhatsapp(formatarWhatsApp(e.target.value))
                  }
                  placeholder="(00) 00000-0000"
                  autoComplete="tel"
                  inputMode="numeric"
                  maxLength={15}
                  required
                  style={estiloCampo}
                />
              </label>

              {erroFormulario && (
                <p
                  role="alert"
                  style={{
                    color: "#ff6b6b",
                    fontSize: 14,
                    margin: 0
                  }}
                >
                  {erroFormulario}
                </p>
              )}

              <button type="submit" className="gold-button">
                AVANÇAR PARA O WHATSAPP
              </button>

              <button
                type="button"
                className="gold-button"
                onClick={() => setMostrarCadastro(false)}
              >
                VOLTAR AOS NÚMEROS
              </button>
            </form>

            {/* PIX DEMONSTRATIVO */}
            <div
              style={{
                background: "#181818",
                border: "1px solid #d4af37",
                borderRadius: 12,
                padding: 22,
                textAlign: "left"
              }}
            >
              <span className="eyebrow">DADOS PIX</span>
              <h3 style={{ marginTop: 10 }}>Chave PIX</h3>

              <p style={{ color: "#aaa", fontSize: 14 }}>
                Dados fictícios para demonstração do sistema. Não realize pagamentos.
              </p>

              <label style={{ display: "block", marginTop: 22 }}>
                Nome da titular
                <input
                  type="text"
                  value={nomeTitular || "Carregando..."}
                  readOnly
                  style={estiloCampo}
                />
              </label>

              <label style={{ display: "block", marginTop: 18 }}>
                Chave PIX (e-mail)
                <input
                  type="text"
                  value={chavePix || "Carregando..."}
                  readOnly
                  style={{
                    ...estiloCampo,
                    color: "#d4af37"
                  }}
                />
              </label>

              <button
                type="button"
                onClick={copiarPix}
                disabled={!chavePix}
                className="gold-button"
                style={{ width: "100%", marginTop: 15 }}
              >
                COPIAR CHAVE PIX
              </button>

              {mensagemCopia && (
                <p
                  role="status"
                  style={{
                    color: "#d4af37",
                    fontSize: 13,
                    marginTop: 12
                  }}
                >
                  {mensagemCopia}
                </p>
              )}
            </div>
          </div>
        </section>
      )}

      <footer className="rifa-footer">
        <strong>RF PREMIUM</strong>
        <a href="/login" className="admin-access">
  Acesso administrativo
</a>
      </footer>
    </main>
  );
}

const estiloCampo: React.CSSProperties = {
  display: "block",
  width: "100%",
  padding: "14px",
  marginTop: "8px",
  background: "#101010",
  color: "#fff",
  border: "1px solid #444",
  borderRadius: "8px",
  fontSize: "15px",
  boxSizing: "border-box"
};

export default Home;
