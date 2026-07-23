const express = require("express");
const cors = require("cors");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const { createClient } = require("@supabase/supabase-js");

const app = express();
const PORT = process.env.PORT || 4000;
const CONFIG_PATH = path.join(__dirname, "config.json");

// ---------- Configuracion por entorno ----------
const APP_SLUG = process.env.APP_SLUG || "hergo-imagenes";
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const CORS_ORIGIN = process.env.CORS_ORIGIN; // ej. "https://tuapp.vercel.app" (coma para varios)

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.warn(
    "[ADVERTENCIA] Falta SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY. El login y la gestion de usuarios no funcionaran hasta configurarlas."
  );
}

// Cliente admin (service role): valida tokens y administra usuarios. NUNCA se expone al frontend.
const supabaseAdmin =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
    : null;

// ---------- CORS ----------
const corsOptions = CORS_ORIGIN
  ? { origin: CORS_ORIGIN.split(",").map((s) => s.trim()) }
  : {}; // sin restriccion en desarrollo
app.use(cors(corsOptions));
app.use(express.json());

// ==================== Autenticacion vía Supabase ====================
// Verifica el JWT de Supabase y adjunta req.usuario con su rol en ESTA app.
async function requireAuth(req, res, next) {
  if (!supabaseAdmin) return res.status(500).json({ error: "Servidor sin Supabase configurado." });
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ error: "No autenticado." });
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return res.status(401).json({ error: "Sesión inválida." });
  const roles = data.user.app_metadata?.roles || {};
  req.usuario = { id: data.user.id, email: data.user.email, rol: roles[APP_SLUG] || null };
  next();
}
// Requiere pertenecer a la app (tener rol asignado).
function requireMiembro(req, res, next) {
  requireAuth(req, res, () => {
    if (!req.usuario.rol) return res.status(403).json({ error: "No tenés acceso a esta aplicación." });
    next();
  });
}
function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.usuario.rol !== "administrador") {
      return res.status(403).json({ error: "Requiere rol administrador." });
    }
    next();
  });
}

// ---------- Datos del usuario actual (rol en esta app) ----------
app.get("/api/yo", requireAuth, (req, res) => {
  res.json({ email: req.usuario.email, rol: req.usuario.rol });
});

// ==================== Gestion de usuarios (solo admin, vía Admin API) ====================
// Busca un usuario por email recorriendo listUsers (paginado).
async function buscarPorEmail(email) {
  const objetivo = String(email || "").toLowerCase();
  let page = 1;
  for (;;) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const u = data.users.find((x) => (x.email || "").toLowerCase() === objetivo);
    if (u) return u;
    if (data.users.length < 200) return null;
    page++;
  }
}

// Lista los usuarios que tienen rol en ESTA app.
app.get("/api/usuarios", requireAdmin, async (req, res) => {
  try {
    const miembros = [];
    let page = 1;
    for (;;) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) throw new Error(error.message);
      for (const u of data.users) {
        const rol = u.app_metadata?.roles?.[APP_SLUG];
        if (rol) miembros.push({ id: u.id, email: u.email, rol });
      }
      if (data.users.length < 200) break;
      page++;
    }
    res.json(miembros);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Crea (o suma a esta app) un usuario con su rol.
app.post("/api/usuarios", requireAdmin, async (req, res) => {
  try {
    const { email, password, rol } = req.body || {};
    if (!email) return res.status(400).json({ error: "Falta el email." });
    if (!["usuario", "administrador"].includes(rol)) return res.status(400).json({ error: "Rol inválido." });

    const existente = await buscarPorEmail(email);
    if (existente) {
      // Ya existe (quizás en otra app): le sumamos el rol para esta app.
      const roles = { ...(existente.app_metadata?.roles || {}), [APP_SLUG]: rol };
      const { error } = await supabaseAdmin.auth.admin.updateUserById(existente.id, {
        app_metadata: { roles },
      });
      if (error) throw new Error(error.message);
      return res.json({ ok: true, reutilizado: true });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }
    const { error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { roles: { [APP_SLUG]: rol } },
    });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Restablece la contraseña de un usuario.
app.post("/api/usuarios/:id/password", requireAdmin, async (req, res) => {
  try {
    const { password } = req.body || {};
    if (!password || password.length < 6) {
      return res.status(400).json({ error: "La contraseña debe tener al menos 6 caracteres." });
    }
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { password });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Quita el acceso de un usuario a ESTA app (no borra la cuenta global).
app.delete("/api/usuarios/:id", requireAdmin, async (req, res) => {
  try {
    if (req.params.id === req.usuario.id) {
      return res.status(400).json({ error: "No podés quitarte el acceso a vos mismo." });
    }
    const { data, error: e1 } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
    if (e1 || !data?.user) return res.status(404).json({ error: "Usuario inexistente." });
    const roles = { ...(data.user.app_metadata?.roles || {}) };
    delete roles[APP_SLUG];
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
      app_metadata: { roles },
    });
    if (error) throw new Error(error.message);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
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
app.get("/api/config", requireMiembro, (req, res) => {
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
app.get("/api/images", requireMiembro, (req, res) => {
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

// Preview público (las imágenes ya son públicas en el sitio). Sin auth para poder usarse en <img>.
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

app.post("/api/images", requireMiembro, subir.single("imagen"), (req, res) => {
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

app.delete("/api/images", requireMiembro, (req, res) => {
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
app.get("/api/banners", requireMiembro, (req, res) => {
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

app.post("/api/banners", requireMiembro, subir.single("imagen"), (req, res) => {
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

app.post("/api/banners/reemplazar", requireMiembro, subir.single("imagen"), (req, res) => {
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

app.delete("/api/banners", requireMiembro, (req, res) => {
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

app.use((err, req, res, next) => {
  res.status(400).json({ error: err.message });
});

app.listen(PORT, () => {
  console.log(`Puente del banco de imágenes en http://localhost:${PORT} (app: ${APP_SLUG})`);
});
