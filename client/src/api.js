// Capa de acceso al backend.
// - En desarrollo o sirviendo todo desde el mismo server, VITE_API_BASE_URL queda vacío
//   y las rutas /api son relativas (proxy de Vite o mismo origen).
// - Si el backend viviera en otra URL, VITE_API_BASE_URL apunta a él (hoy no se usa).
import { auth } from "./auth";

const API_BASE = (import.meta.env.VITE_API_BASE_URL || "").replace(/\/$/, "");
const u = (ruta) => `${API_BASE}${ruta}`;

// Evento global para avisar cuando el token dejó de ser válido (401).
export const onNoAutorizado = { handler: null };

async function json(res) {
  if (res.status === 401) {
    auth.limpiar();
    if (onNoAutorizado.handler) onNoAutorizado.handler();
    throw new Error("Sesión expirada. Ingresá de nuevo.");
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || "Error del servidor");
  }
  return res.json();
}

// fetch con header de auth para JSON
function pedir(ruta, opciones = {}) {
  const headers = { ...(opciones.headers || {}), ...auth.authHeader() };
  return fetch(u(ruta), { ...opciones, headers }).then(json);
}
// fetch con auth para FormData (no seteamos Content-Type: lo pone el navegador)
function pedirForm(ruta, metodo, fd) {
  return fetch(u(ruta), { method: metodo, body: fd, headers: { ...auth.authHeader() } }).then(json);
}

export const api = {
  // ----- Auth -----
  login: (username, password) =>
    fetch(u("/api/login"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(json),
  yo: () => pedir("/api/yo"),
  cambiarPassword: (passwordActual, passwordNueva) =>
    pedir("/api/cambiar-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passwordActual, passwordNueva }),
    }),

  // ----- Usuarios (admin) -----
  listUsuarios: () => pedir("/api/usuarios"),
  crearUsuario: (username, password, rol) =>
    pedir("/api/usuarios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password, rol }),
    }),
  resetPassword: (username, password) =>
    pedir(`/api/usuarios/${encodeURIComponent(username)}/password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }),
  eliminarUsuario: (username) =>
    pedir(`/api/usuarios/${encodeURIComponent(username)}`, { method: "DELETE" }),

  // ----- Config -----
  getConfig: () => pedir("/api/config"),
  saveConfig: (config) =>
    pedir("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    }),

  // ----- Imágenes libres (popup) -----
  listImages: (carpeta) => pedir(`/api/images?carpeta=${encodeURIComponent(carpeta)}`),
  fileUrl: (carpeta, nombre) =>
    u(`/api/file?carpeta=${encodeURIComponent(carpeta)}&nombre=${encodeURIComponent(nombre)}`),
  upload: (carpeta, file, nombre) => {
    const fd = new FormData();
    fd.append("imagen", file);
    const q = new URLSearchParams({ carpeta });
    if (nombre) q.set("nombre", nombre);
    return pedirForm(`/api/images?${q.toString()}`, "POST", fd);
  },
  remove: (carpeta, nombre) =>
    pedir(`/api/images?carpeta=${encodeURIComponent(carpeta)}&nombre=${encodeURIComponent(nombre)}`, {
      method: "DELETE",
    }),

  // ----- Banners numerados (una carpeta) -----
  listBanners: (carpeta) => pedir(`/api/banners?carpeta=${encodeURIComponent(carpeta)}`),
  addBanner: (carpeta, file) => {
    const fd = new FormData();
    fd.append("imagen", file);
    return pedirForm(`/api/banners?carpeta=${encodeURIComponent(carpeta)}`, "POST", fd);
  },
  replaceBanner: (carpeta, numero, file) => {
    const fd = new FormData();
    fd.append("imagen", file);
    const q = new URLSearchParams({ carpeta, numero });
    return pedirForm(`/api/banners/reemplazar?${q.toString()}`, "POST", fd);
  },
  removeBanner: (carpeta, numero) =>
    pedir(`/api/banners?carpeta=${encodeURIComponent(carpeta)}&numero=${numero}`, { method: "DELETE" }),
  reordenarBanners: (carpeta, orden) =>
    pedir(`/api/banners/orden?carpeta=${encodeURIComponent(carpeta)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orden }),
    }),

  // ----- Programaciones -----
  listarProgramaciones: (params = {}) => {
    const q = new URLSearchParams(params).toString();
    return pedir(`/api/programaciones${q ? "?" + q : ""}`);
  },
  programarPublicacion: ({ carpeta, tipo, fechaAlta, fechaBaja, file }) => {
    const fd = new FormData();
    fd.append("imagen", file);
    fd.append("carpeta", carpeta);
    fd.append("tipo", tipo);
    fd.append("fechaAlta", String(fechaAlta));
    if (fechaBaja) fd.append("fechaBaja", String(fechaBaja));
    return pedirForm("/api/programaciones/publicar", "POST", fd);
  },
  programarBaja: ({ carpeta, tipo, archivo, fecha }) =>
    pedir("/api/programaciones/eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ carpeta, tipo, archivo, fecha }),
    }),
  cancelarProgramacion: (id) =>
    pedir(`/api/programaciones/${encodeURIComponent(id)}`, { method: "DELETE" }),
};
