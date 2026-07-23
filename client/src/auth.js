// Manejo simple de sesión en localStorage.
const CLAVE_TOKEN = "bi_token";
const CLAVE_USUARIO = "bi_usuario";

export const auth = {
  getToken: () => localStorage.getItem(CLAVE_TOKEN),
  getUsuario: () => {
    try {
      return JSON.parse(localStorage.getItem(CLAVE_USUARIO) || "null");
    } catch {
      return null;
    }
  },
  guardar: (token, usuario) => {
    localStorage.setItem(CLAVE_TOKEN, token);
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  },
  actualizarUsuario: (usuario) => {
    localStorage.setItem(CLAVE_USUARIO, JSON.stringify(usuario));
  },
  limpiar: () => {
    localStorage.removeItem(CLAVE_TOKEN);
    localStorage.removeItem(CLAVE_USUARIO);
  },
  authHeader: () => {
    const t = localStorage.getItem(CLAVE_TOKEN);
    return t ? { Authorization: `Bearer ${t}` } : {};
  },
};
