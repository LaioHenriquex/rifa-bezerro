
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useState } from "react";

import Home from "./pages/Home";
import Admin from "./pages/Admin";
import Login from "./pages/Login";
import { auth } from "./firebase";

const ADMIN_UID = "aP2oK0J58GWViujxUwIvf6jx0dk1";

function RotaProtegida() {
  const [usuario, setUsuario] = useState(auth.currentUser);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
      setVerificando(false);
    });

    return () => cancelar();
  }, []);

  if (verificando) {
    return <p>Verificando acesso...</p>;
  }

  if (!usuario || usuario.uid !== ADMIN_UID) {
    return <Navigate to="/login" replace />;
  }

  return <Admin />;
}

function RotaLogin() {
  const [usuario, setUsuario] = useState(auth.currentUser);
  const [verificando, setVerificando] = useState(true);

  useEffect(() => {
    const cancelar = onAuthStateChanged(auth, (user) => {
      setUsuario(user);
      setVerificando(false);
    });

    return () => cancelar();
  }, []);

  if (verificando) {
    return <p>Verificando acesso...</p>;
  }

  if (usuario?.uid === ADMIN_UID) {
    return <Navigate to="/admin" replace />;
  }

  return <Login />;
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        <Route path="/admin" element={<RotaProtegida />} />

        <Route path="/login" element={<RotaLogin />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
