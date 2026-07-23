import { useEffect, useState } from "react";
import { api } from "./api";
import Toast from "./Toast.jsx";
import { useConfirm } from "./Confirm.jsx";

export default function Usuarios({ usuarioActual }) {
  const confirmar = useConfirm();
  const [usuarios, setUsuarios] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [nuevo, setNuevo] = useState({ username: "", password: "", rol: "usuario" });
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    refrescar();
  }, []);

  async function refrescar() {
    try {
      setUsuarios(await api.listUsuarios());
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    }
  }

  async function crear(e) {
    e.preventDefault();
    setCargando(true);
    try {
      await api.crearUsuario(nuevo.username.trim(), nuevo.password, nuevo.rol);
      setMensaje({ tipo: "ok", texto: `Usuario "${nuevo.username.trim()}" creado.` });
      setNuevo({ username: "", password: "", rol: "usuario" });
      await refrescar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message });
    } finally {
      setCargando(false);
    }
  }

  async function eliminar(username) {
    const ok = await confirmar({
      titulo: "Eliminar usuario",
      mensaje: `¿Eliminar al usuario "${username}"? No podrá volver a ingresar.`,
      textoConfirmar: "Eliminar",
    });
    if (!ok) return;
    try {
      await api.eliminarUsuario(username);
      setMensaje({ tipo: "ok", texto: `Usuario "${username}" eliminado.` });
      await refrescar();
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message });
    }
  }

  async function resetear(username) {
    const ok = await confirmar({
      titulo: "Restablecer contraseña",
      mensaje: `Se asignará una contraseña temporal a "${username}", que deberá cambiar al ingresar. ¿Continuar?`,
      textoConfirmar: "Restablecer",
      peligro: false,
    });
    if (!ok) return;
    const temporal = "cambiar123";
    try {
      await api.resetPassword(username, temporal);
      setMensaje({ tipo: "ok", texto: `Contraseña de "${username}" restablecida a: ${temporal}` });
    } catch (err) {
      setMensaje({ tipo: "error", texto: err.message });
    }
  }

  return (
    <div className="admin">
      <div className="alerta alerta-info">
        Gestioná las cuentas que pueden ingresar. Los <b>usuarios</b> solo cargan imágenes; los{" "}
        <b>administradores</b> además configuran rutas y gestionan usuarios.
      </div>

      <Toast mensaje={mensaje} onClose={() => setMensaje(null)} />

      <div className="bloque">
        <div className="secciones-titulo">Crear usuario</div>
        <form className="seccion-grid" onSubmit={crear}>
          <label className="mini-campo">
            <span>Usuario</span>
            <input
              value={nuevo.username}
              onChange={(e) => setNuevo({ ...nuevo, username: e.target.value })}
              placeholder="ej. marketing"
            />
          </label>
          <label className="mini-campo">
            <span>Contraseña</span>
            <input
              type="password"
              value={nuevo.password}
              onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
              placeholder="mínimo 6 caracteres"
            />
          </label>
          <label className="mini-campo">
            <span>Rol</span>
            <select value={nuevo.rol} onChange={(e) => setNuevo({ ...nuevo, rol: e.target.value })}>
              <option value="usuario">Usuario (solo cargar imágenes)</option>
              <option value="administrador">Administrador (todo)</option>
            </select>
          </label>
          <div className="mini-campo campo-carpeta" style={{ alignSelf: "end" }}>
            <button className="btn primario" type="submit" disabled={cargando}>
              {cargando ? "Creando…" : "Crear usuario"}
            </button>
          </div>
        </form>
      </div>

      <div className="secciones-titulo">Usuarios existentes</div>
      <div className="tabla-usuarios">
        {usuarios.map((u) => (
          <div className="fila-usuario" key={u.username}>
            <div className="usuario-datos">
              <span className="usuario-nombre">{u.username}</span>
              <span className={`chip-rol ${u.rol === "administrador" ? "rol-admin" : "rol-user"}`}>
                {u.rol === "administrador" ? "Administrador" : "Usuario"}
              </span>
              {u.username === usuarioActual.username && <span className="chip-vos">vos</span>}
            </div>
            <div className="usuario-acciones">
              <button className="btn mini" onClick={() => resetear(u.username)}>
                Restablecer contraseña
              </button>
              {u.username !== usuarioActual.username && (
                <button className="btn mini peligro" onClick={() => eliminar(u.username)}>
                  Eliminar
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
