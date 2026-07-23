import { useState } from "react";
import { api } from "./api";
import { auth } from "./auth";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    setCargando(true);
    try {
      const r = await api.login(username.trim(), password);
      auth.guardar(r.token, r.usuario);
      onLogin(r.usuario);
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="login-pantalla">
      <form className="login-caja" onSubmit={enviar}>
        <div className="login-marca">
          <div className="logo-mark">BI</div>
          <div className="brand-txt">
            <strong style={{ color: "var(--text)", fontSize: "15px" }}>Banco de Imágenes</strong>
            <span style={{ color: "var(--muted)" }}>Hergo.com.ar</span>
          </div>
        </div>
        <p className="login-sub">Ingresá con tu usuario para continuar.</p>

        <label className="campo">
          <span>Usuario</span>
          <input
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>

        <label className="campo">
          <span>Contraseña</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {error && <div className="login-error">{error}</div>}

        <button className="btn primario login-btn" type="submit" disabled={cargando}>
          {cargando ? "Ingresando…" : "Ingresar"}
        </button>
      </form>
    </div>
  );
}
