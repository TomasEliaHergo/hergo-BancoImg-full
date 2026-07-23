require("dotenv").config();
const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const http = require("http");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 4000;
const CONFIG_PATH = path.join(__dirname, "config.json");
const USERS_PATH = path.join(__dirname, "usuarios.json");
const SECRET_PATH = path.join(__dirname, ".secret");
const DIST = path.join(__dirname, "..", "client", "dist");
const TOKEN_TTL_MS = 12 * 60 * 60 * 1000; // 12 horas

// CORS: si se define CORS_ORIGIN (ej. la URL de Vercel), se restringe a esos orígenes.
// Sin definir, queda abierto (útil en red interna sirviendo el frontend desde acá).
const CORS_ORIGIN = process.env.CORS_ORIGIN;
app.use(cors(CORS_ORIGIN ? { origin: CORS_ORIGIN.split(",").map((s) => s.trim()) } : {}));
app.use(express.json());

// ==================== Autenticación local ====================
// Secreto para firmar tokens. Se genera solo la primera vez. NO versionar.
function getSecret() {
  if (fs.existsSync(SECRET_PATH)) return fs.readFileSync(SECRET_PATH, "utf-8");
  const s = crypto.randomBytes(48).toString("hex");
  fs.writeFileSync(SECRET_PATH, s, "utf-8");
  return s;
}
const SECRET = getSecret();

// Hash de contraseña con scrypt + salt.
function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return { salt, hash };
}
function verifyPassword(password, salt, hash) {
  const h = crypto.scryptSync(password, salt, 64).toString("hex");
  const a = Buffer.from(h, "hex");
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Token propio firmado (HMAC-SHA256): body.base64url + firma.
function firmarToken(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
function verificarToken(token) {
  const [body, sig] = String(token || "").split(".");
  if (!body || !sig) return null;
  const esperado = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let payload;
  try {
    payload = JSON.parse(Buffer.from(body, "base64url").toString());
  } catch {
    return null;
  }
  if (!payload.exp || Date.now() > payload.exp) return null;
  return payload;
}

// ---------- Almacenamiento de usuarios ----------
function leerUsuarios() {
  if (!fs.existsSync(USERS_PATH)) return [];
  return JSON.parse(fs.readFileSync(USERS_PATH, "utf-8"));
}
function guardarUsuarios(usuarios) {
  fs.writeFileSync(USERS_PATH, JSON.stringify(usuarios, null, 2), "utf-8");
}
function buscarUsuario(username) {
  const objetivo = String(username || "").toLowerCase();
  return leerUsuarios().find((u) => u.username.toLowerCase() === objetivo) || null;
}
// Al primer arranque, si no hay usuarios, crea el admin inicial.
function asegurarAdminInicial() {
  const usuarios = leerUsuarios();
  if (usuarios.length === 0) {
    const { salt, hash } = hashPassword("admin123");
    usuarios.push({ username: "admin", salt, hash, rol: "administrador", debeCambiarPassword: true });
    guardarUsuarios(usuarios);
    console.log("[INFO] Admin inicial creado: usuario 'admin' / contraseña 'admin123' (cambiar al ingresar).");
  }
}
asegurarAdminInicial();

// Vista pública del usuario (sin datos sensibles).
function usuarioPublico(u) {
  return { username: u.username, rol: u.rol, debeCambiarPassword: !!u.debeCambiarPassword };
}

// ---------- Middlewares de autenticación ----------
function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  const payload = token ? verificarToken(token) : null;
  if (!payload) return res.status(401).json({ error: "No autenticado." });
  const u = buscarUsuario(payload.username);
  if (!u) return res.status(401).json({ error: "Sesión inválida." });
  req.usuario = u;
  next();
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.usuario.rol !== "administrador") {
      return res.status(403).json({ error: "Requiere rol administrador." });
    }
    next();
  });
}

// ---------- Login / sesión ----------
app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};
  const u = buscarUsuario(username);
  if (!u || !verifyPassword(password || "", u.salt, u.hash)) {
    return res.status(401).json({ error: "Usuario o contraseña incorrectos." });
  }
  const token = firmarToken({ username: u.username, exp: Date.now() + TOKEN_TTL_MS });
  res.json({ token, usuario: usuarioPublico(u) });
});

app.get("/api/yo", requireAuth, (req, res) => {
  res.json(usuarioPublico(req.usuario));
});

app.post("/api/cambiar-password", requireAuth, (req, res) => {
  const { passwordActual, passwordNueva } = req.body || {};
  const u = req.usuario;
  if (!verifyPassword(passwordActual || "", u.salt, u.hash)) {
    return res.status(400).json({ error: "La contraseña actual no es correcta." });
  }
  if (!passwordNueva || passwordNueva.length < 6) {
    return res.status(400).json({ error: "La nueva contraseña debe tener al menos 6 caracteres." });
  }
  const usuarios = leerUsuarios();
  const idx = usuarios.findIndex((x) => x.username === u.username);
  const { salt, hash } = hashPassword(passwordNueva);
  usuarios[idx] = { ...usuarios[idx], salt, hash, debeCambiarPassword: false };
  guardarUsuarios(usuarios);
  res.json({ ok: true });
});

// ==================== Gestión de usuarios (solo admin) ====================
app.get("/api/usuarios", requireAdmin, (req, res) => {
  res.json(leerUsuarios().map((u) => ({ username: u.username, rol: u.rol })));
});

app.post("/api/usuarios", requireAdmin, (req, res) => {
  const { username, password, rol } = req.body || {};
  const nombre = String(username || "").trim();
  if (!nombre) return res.status(400).json({ error: "Falta el usuario." });
  if (!["usuario", "administrador"].includes(rol)) return res.status(400).json({ error: "Rol inválido." });
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }
  if (buscarUsuario(nombre)) return res.status(400).json({ error: "Ya existe un usuario con ese nombre." });
  const usuarios = leerUsuarios();
  const { salt, hash } = hashPassword(password);
  usuarios.push({ username: nombre, salt, hash, rol, debeCambiarPassword: true });
  guardarUsuarios(usuarios);
  res.json({ ok: true });
});

app.post("/api/usuarios/:username/password", requireAdmin, (req, res) => {
  const { password } = req.body || {};
  if (!password || password.length < 6) {
    return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
  }
  const usuarios = leerUsuarios();
  const idx = usuarios.findIndex((u) => u.username.toLowerCase() === req.params.username.toLowerCase());
  if (idx === -1) return res.status(404).json({ error: "Usuario inexistente." });
  const { salt, hash } = hashPassword(password);
  usuarios[idx] = { ...usuarios[idx], salt, hash, debeCambiarPassword: true };
  guardarUsuarios(usuarios);
  res.json({ ok: true });
});

app.delete("/api/usuarios/:username", requireAdmin, (req, res) => {
  if (req.params.username.toLowerCase() === req.usuario.username.toLowerCase()) {
    return res.status(400).json({ error: "No podés eliminarte a vos mismo." });
  }
  const usuarios = leerUsuarios();
  const restantes = usuarios.filter((u) => u.username.toLowerCase() !== req.params.username.toLowerCase());
  if (restantes.length === usuarios.length) return res.status(404).json({ error: "Usuario inexistente." });
  guardarUsuarios(restantes);
  res.json({ ok: true });
});

// ==================== Banco de imágenes ====================
const EXTENSIONES_VALIDAS = [".png", ".jpg", ".jpeg", ".webp"];
const RE_BANNER = /^banner-(\d+)\.(png|jpe?g|webp)$/i;

function leerConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, "utf-8"));
}
function guardarConfig(config) {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf-8");
}
function baseDir() {
  return process.env.BASE_DIR || leerConfig().baseDir;
}
function resolverCarpeta(carpetaRelativa) {
  const base = path.resolve(baseDir());
  const destino = path.resolve(base, carpetaRelativa || "");
  const rel = path.relative(base, destino);
  if (rel.startsWith("..") || path.isAbsolute(rel)) throw new Error("Ruta inválida: fuera del directorio base.");
  return destino;
}
function esImagen(nombre) {
  return EXTENSIONES_VALIDAS.includes(path.extname(nombre).toLowerCase());
}
function mapaBanners(destino) {
  const mapa = {};
  if (!fs.existsSync(destino)) return mapa;
  for (const f of fs.readdirSync(destino)) {
    const m = RE_BANNER.exec(f);
    if (m) mapa[parseInt(m[1], 10)] = f;
  }
  return mapa;
}
function proximoNumero(...mapas) {
  const usados = new Set();
  for (const m of mapas) for (const k of Object.keys(m)) usados.add(Number(k));
  let n = 1;
  while (usados.has(n)) n++;
  return n;
}
function borrarBanner(destino, n) {
  if (!fs.existsSync(destino)) return;
  for (const f of fs.readdirSync(destino)) {
    const m = RE_BANNER.exec(f);
    if (m && Number(m[1]) === n) fs.unlinkSync(path.join(destino, f));
  }
}
function guardarBanner(destino, n, file) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (!EXTENSIONES_VALIDAS.includes(ext)) throw new Error("Extensión no permitida.");
  fs.mkdirSync(destino, { recursive: true });
  borrarBanner(destino, n);
  fs.writeFileSync(path.join(destino, `banner-${n}${ext}`), file.buffer);
}
function renumerar(destino, borrado) {
  if (!fs.existsSync(destino)) return;
  const mayores = Object.keys(mapaBanners(destino))
    .map(Number)
    .filter((n) => n > borrado)
    .sort((a, b) => a - b);
  for (const n of mayores) {
    for (const f of fs.readdirSync(destino)) {
      const m = RE_BANNER.exec(f);
      if (m && Number(m[1]) === n) {
        const ext = path.extname(f);
        fs.renameSync(path.join(destino, f), path.join(destino, `banner-${n - 1}${ext}`));
      }
    }
  }
}

const subir = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) =>
    esImagen(file.originalname) ? cb(null, true) : cb(new Error("Solo imágenes .png, .jpg, .jpeg o .webp.")),
  limits: { fileSize: 25 * 1024 * 1024 },
});

// ---------- Config (lectura: miembros; escritura: admin) ----------
app.get("/api/config", requireAuth, (req, res) => {
  try {
    res.json(leerConfig());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put("/api/config", requireAdmin, (req, res) => {
  try {
    const nueva = req.body;
    if (!nueva || !Array.isArray(nueva.apps) || !nueva.baseDir) {
      return res.status(400).json({ error: "Configuración inválida." });
    }
    guardarConfig(nueva);
    res.json({ ok: true, config: nueva });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------- Imágenes libres (popup) ----------
app.get("/api/images", requireAuth, (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    if (!fs.existsSync(destino)) return res.json({ carpeta: req.query.carpeta, imagenes: [] });
    const imagenes = fs
      .readdirSync(destino)
      .filter((f) => esImagen(f) && fs.statSync(path.join(destino, f)).isFile())
      .map((f) => {
        const st = fs.statSync(path.join(destino, f));
        return { nombre: f, tamano: st.size, modificado: st.mtime };
      })
      .sort((a, b) => new Date(b.modificado) - new Date(a.modificado));
    res.json({ carpeta: req.query.carpeta, imagenes });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Preview de imagen (sin auth para poder usarse en <img>).
app.get("/api/file", (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    const nombre = path.basename(req.query.nombre || "");
    const ruta = path.join(destino, nombre);
    if (!fs.existsSync(ruta) || !esImagen(nombre)) return res.status(404).end();
    res.setHeader("Cache-Control", "no-store");
    res.sendFile(ruta);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/images", requireAuth, subir.single("imagen"), (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    fs.mkdirSync(destino, { recursive: true });
    const original = path.basename(req.file.originalname);
    const ext = path.extname(original);
    const base = path.basename(original, ext);
    let nombre = original;
    let i = 1;
    while (fs.existsSync(path.join(destino, nombre))) {
      nombre = `${base}-${i}${ext}`;
      i++;
    }
    fs.writeFileSync(path.join(destino, nombre), req.file.buffer);
    res.json({ ok: true, nombre });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/images", requireAuth, (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    const nombre = path.basename(req.query.nombre || "");
    const ruta = path.join(destino, nombre);
    if (!fs.existsSync(ruta)) return res.status(404).json({ error: "No existe la imagen." });
    fs.unlinkSync(ruta);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ---------- Banners numerados ----------
app.get("/api/banners", requireAuth, (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    const mapa = mapaBanners(destino);
    const numeros = Object.keys(mapa).map(Number).sort((a, b) => a - b);
    const banners = numeros.map((n) => ({ numero: n, archivo: mapa[n] }));
    let primerHueco = null;
    for (let i = 0; i < numeros.length; i++) {
      if (numeros[i] !== i + 1) {
        primerHueco = i + 1;
        break;
      }
    }
    res.json({ banners, primerHueco });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/banners", requireAuth, subir.single("imagen"), (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    if (!req.file) return res.status(400).json({ error: "Falta la imagen." });
    const n = proximoNumero(mapaBanners(destino));
    guardarBanner(destino, n, req.file);
    res.json({ ok: true, numero: n });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.post("/api/banners/reemplazar", requireAuth, subir.single("imagen"), (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    const numero = parseInt(req.query.numero, 10);
    if (!Number.isInteger(numero) || numero < 1) return res.status(400).json({ error: "Número inválido." });
    if (!req.file) return res.status(400).json({ error: "Falta la imagen." });
    guardarBanner(destino, numero, req.file);
    res.json({ ok: true, numero });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete("/api/banners", requireAuth, (req, res) => {
  try {
    const destino = resolverCarpeta(req.query.carpeta);
    const numero = parseInt(req.query.numero, 10);
    if (!Number.isInteger(numero) || numero < 1) return res.status(400).json({ error: "Número inválido." });
    borrarBanner(destino, numero);
    renumerar(destino, numero);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// ==================== Frontend (client/dist) ====================
// Sirve el build de React y hace fallback a index.html para rutas del SPA.
// Se apaga con SERVE_FRONTEND=false (ej. en el portal, donde el frontend vive en Vercel).
const SERVE_FRONTEND = process.env.SERVE_FRONTEND !== "false";
if (SERVE_FRONTEND && fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(DIST, "index.html"));
    }
    next();
  });
} else {
  // API pura: raíz informativa (no sirve la app).
  app.get("/", (req, res) => res.json({ servicio: "Banco de imágenes — API", ok: true }));
}

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

// ==================== Arranque (HTTP o HTTPS) ====================
// Si hay certificado configurado, sirve por HTTPS. Si no, por HTTP.
// Opción A (un archivo):   SSL_PFX + SSL_PASSPHRASE
// Opción B (dos archivos): SSL_CERT + SSL_KEY   (opcional SSL_CA para la cadena)
function opcionesSSL() {
  const { SSL_PFX, SSL_PASSPHRASE, SSL_CERT, SSL_KEY, SSL_CA } = process.env;
  if (SSL_PFX) {
    return { pfx: fs.readFileSync(SSL_PFX), passphrase: SSL_PASSPHRASE };
  }
  if (SSL_CERT && SSL_KEY) {
    const opt = { cert: fs.readFileSync(SSL_CERT), key: fs.readFileSync(SSL_KEY) };
    if (SSL_CA) opt.ca = fs.readFileSync(SSL_CA);
    return opt;
  }
  return null;
}

const ssl = opcionesSSL();
if (ssl) {
  https.createServer(ssl, app).listen(PORT, () => {
    console.log(`Banco de imágenes (HTTPS) escuchando en el puerto ${PORT}`);
  });
} else {
  http.createServer(app).listen(PORT, () => {
    console.log(`Banco de imágenes (HTTP) escuchando en http://localhost:${PORT}`);
  });
}
