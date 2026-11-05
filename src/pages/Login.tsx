
import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../firebase";
import { useNavigate } from "react-router-dom";

function Login() {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [carregando, setCarregando] = useState(false);

  const navegar = useNavigate();

  async function entrar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErro("");
    setCarregando(true);

    try {
      await signInWithEmailAndPassword(auth, email, senha);
      navegar("/admin");
    } catch {
      setErro("E-mail ou senha incorretos.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <main style={{
      minHeight: "100vh",
      background: "#0b0b0b",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 20,
      color: "#fff",
      fontFamily: "Arial"
    }}>
      <form
        onSubmit={entrar}
        style={{
          width: "100%",
          maxWidth: 380,
          padding: 30,
          background: "#181818",
          borderRadius: 14
        }}
      >
        <h1 style={{ color: "#d4af37", marginBottom: 10 }}>
          LH PREMIUM
        </h1>

        <p style={{ color: "#aaa", marginBottom: 25 }}>
          Acesso administrativo
        </p>

        <label>E-mail</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          style={estiloInput}
        />

        <label>Senha</label>
        <input
          type="password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          required
          style={estiloInput}
        />

        {erro && (
          <p style={{ color: "#ff5555", marginBottom: 15 }}>
            {erro}
          </p>
        )}

        <button
          type="submit"
          disabled={carregando}
          style={{
            width: "100%",
            padding: 14,
            background: "#d4af37",
            border: "none",
            borderRadius: 8,
            fontWeight: "bold",
            cursor: "pointer"
          }}
        >
          {carregando ? "ENTRANDO..." : "ENTRAR"}
        </button>
      </form>
    </main>
  );
}

const estiloInput: React.CSSProperties = {
  width: "100%",
  padding: 12,
  marginTop: 8,
  marginBottom: 20,
  background: "#292929",
  color: "#fff",
  border: "1px solid #444",
  borderRadius: 7,
  outline: "none"
};

export default Login;
