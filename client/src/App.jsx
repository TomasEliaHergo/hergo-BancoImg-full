import { useEffect, useState } from "react";
import Usuario from "./Usuario.jsx";
import Administrador from "./Administrador.jsx";
import Usuarios from "./Usuarios.jsx";
import Login from "./Login.jsx";
import CambiarPassword from "./CambiarPassword.jsx";
import { auth } from "./auth";
import { onNoAutorizado } from "./api";
import { IconImagen, IconConfig, IconUsuarios, IconSalir, IconLlave, IconMenu } from "./icons.jsx";

const VISTAS = {
  usuario: { titulo: "Cargar imágenes", subtitulo: "Agregá, reemplazá o eliminá las imágenes del sitio." },
  admin: { titulo: "Configuración", subtitulo: "Definí las secciones y sus carpetas destino." },
  usuarios: { titulo: "Usuarios", subtitulo: "Gestioná las cuentas que pueden ingresar." },
};

export default function App() {
  const [usuario, setUsuario] = useState(() => auth.getUsuario());
  const [vista, setVista] = useState("usuario");
  const [cambiarClave, setCambiarClave] = useState(false);
  const [menuAbierto, setMenuAbierto] = useState(false);

  useEffect(() => {
    onNoAutorizado.handler = () => setUsuario(null);
    return () => {
      onNoAutorizado.handler = null;
    };
  }, []);

  function cerrarSesion() {
    auth.limpiar();
    setUsuario(null);
    setVista("usuario");
  }

  function irA(v) {
    setVista(v);
    setMenuAbierto(false);
  }

  if (!usuario) return <Login onLogin={(u) => setUsuario(u)} />;

  if (usuario.debeCambiarPassword) {
    return (
      <CambiarPassword
        forzado
        onListo={() => {
          const actualizado = { ...usuario, debeCambiarPassword: false };
          auth.actualizarUsuario(actualizado);
          setUsuario(actualizado);
        }}
      />
    );
  }

  if (cambiarClave) {
    return <CambiarPassword onListo={() => setCambiarClave(false)} onCancelar={() => setCambiarClave(false)} />;
  }

  const esAdmin = usuario.rol === "administrador";
  const nav = [
    { id: "usuario", label: "Cargar imágenes", Icon: IconImagen, visible: true },
    { id: "admin", label: "Configuración", Icon: IconConfig, visible: esAdmin },
    { id: "usuarios", label: "Usuarios", Icon: IconUsuarios, visible: esAdmin },
  ].filter((n) => n.visible);

  const info = VISTAS[vista];

  return (
    <div className="shell">
      <aside className={`sidebar ${menuAbierto ? "abierta" : ""}`}>
        <div className="sidebar-top">
          <div className="sidebar-brand">
            <div className="logo-mark">BI</div>
            <div className="brand-txt">
              <strong>Banco de Imágenes</strong>
              <span>Hergo.com.ar</span>
            </div>
          </div>
          <button className="menu-toggle" onClick={() => setMenuAbierto((v) => !v)} aria-label="Menú">
            <IconMenu />
          </button>
        </div>

        <nav className="side-nav">
          {nav.map(({ id, label, Icon }) => (
            <button key={id} className={vista === id ? "side-link activo" : "side-link"} onClick={() => irA(id)}>
              <Icon width={18} height={18} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="sidebar-user">
          <div className="avatar">{usuario.username.slice(0, 1).toUpperCase()}</div>
          <div className="user-txt">
            <strong>{usuario.username}</strong>
            <span>{esAdmin ? "Administrador" : "Usuario"}</span>
          </div>
          <div className="user-acciones">
            <button title="Cambiar contraseña" onClick={() => setCambiarClave(true)}>
              <IconLlave width={16} height={16} />
            </button>
            <button title="Salir" onClick={cerrarSesion}>
              <IconSalir width={16} height={16} />
            </button>
          </div>
        </div>
      </aside>

      <div className="main">
        <header className="main-header">
          <h1>{info.titulo}</h1>
          <p>{info.subtitulo}</p>
        </header>
        <div className="main-body">
          {vista === "usuario" && <Usuario />}
          {vista === "admin" && esAdmin && <Administrador />}
          {vista === "usuarios" && esAdmin && <Usuarios usuarioActual={usuario} />}
        </div>
      </div>
    </div>
  );
}
