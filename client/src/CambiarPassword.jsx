import { useState } from "react";
import { api } from "./api";

// forzado = true cuando el usuario DEBE cambiarla (primer ingreso). Sin cancelar.
export default function CambiarPassword({ forzado, onListo, onCancelar }) {
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetir, setRepetir] = useState("");
  const [error, setError] = useState(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(e) {
    e.preventDefault();
    setError(null);
    if (nueva.length < 6) return setError("La nueva contraseña debe tener al menos 6 caracteres.");
    if (nueva !== repetir) return setError("Las contraseñas nuevas no coinciden.");
    setCargando(true);
    try {
      await api.cambiarPassword(actual, nueva);
      onListo();
    } catch (err) {
      setError(err.message);
    } finally {
      setCargando(false);
    }
  }

  const contenido = (
    <form className="login-caja" onSubmit={enviar}>
      <h1>Cambiar contraseña</h1>
      <p className="login-sub">
        {forzado
          ? "Es tu primer ingreso. Definí una contraseña nueva para continuar."
          : "Actualizá tu contraseña."}
      </p>

      <label className="campo">
        <span>Contraseña actual</span>
        <input type="password" value={actual} onChange={(e) => setActual(e.target.value)} autoFocus />
      </label>
      <label className="campo">
        <span>Contraseña nueva</span>
        <input type="password" value={nueva} onChange={(e) => setNueva(e.target.value)} />
      </label>
      <label className="campo">
        <span>Repetir contraseña nueva</span>
        <input type="password" value={repetir} onChange={(e) => setRepetir(e.target.value)} />
      </label>

      {error && <div className="login-error">{error}</div>}

      <div className="cambiar-acciones">
        {!forzado && (
          <button type="button" className="btn" onClick={onCancelar}>
            Cancelar
          </button>
        )}
        <button className="btn primario login-btn" type="submit" disabled={cargando}>
          {cargando ? "Guardando…" : "Guardar contraseña"}
        </button>
      </div>
    </form>
  );

  return <div className="login-pantalla">{contenido}</div>;
}
