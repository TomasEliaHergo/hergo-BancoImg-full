// Cola de tareas programadas (una sola vez) con almacenamiento JSON atómico + motor por setInterval.
// Desacoplado de las operaciones de archivo: recibe un `ejecutar(tarea)` por inyección.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const TAREAS_PATH = path.join(__dirname, "tareas.json");

// ---------- Persistencia atómica ----------
function leer() {
  if (!fs.existsSync(TAREAS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(TAREAS_PATH, "utf-8"));
  } catch {
    return [];
  }
}
function guardar(tareas) {
  const tmp = `${TAREAS_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(tareas, null, 2), "utf-8");
  fs.renameSync(tmp, TAREAS_PATH); // rename = operación atómica en el mismo FS
}

// ---------- Utilidades ----------
function uuid() {
  return crypto.randomUUID();
}
function hashBuffer(buf) {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
function hashArchivo(ruta) {
  return hashBuffer(fs.readFileSync(ruta));
}

// ---------- CRUD ----------
function listar(filtro = {}) {
  let t = leer();
  if (filtro.estado) t = t.filter((x) => x.estado === filtro.estado);
  if (filtro.carpeta) t = t.filter((x) => x.carpeta === filtro.carpeta);
  return t.sort((a, b) => a.ejecutarEn - b.ejecutarEn);
}
function obtener(id) {
  return leer().find((t) => t.id === id) || null;
}
function crear(tarea) {
  const tareas = leer();
  const nueva = {
    id: uuid(),
    estado: "pendiente",
    creadoEn: Date.now(),
    ejecutadoEn: null,
    error: null,
    ...tarea, // permite pasar un id propio (para ligar con el staging)
  };
  tareas.push(nueva);
  guardar(tareas);
  return nueva;
}
function actualizar(id, cambios) {
  const tareas = leer();
  const i = tareas.findIndex((t) => t.id === id);
  if (i === -1) return null;
  tareas[i] = { ...tareas[i], ...cambios };
  guardar(tareas);
  return tareas[i];
}
function eliminar(id) {
  const tareas = leer();
  const restantes = tareas.filter((t) => t.id !== id);
  if (restantes.length === tareas.length) return false;
  guardar(restantes);
  return true;
}

// ---------- Motor ----------
let corriendo = false;
async function tick(ejecutar) {
  if (corriendo) return; // evita solapamiento de ticks
  corriendo = true;
  try {
    const ahora = Date.now();
    const vencidas = leer()
      .filter((t) => t.estado === "pendiente" && t.ejecutarEn <= ahora)
      .sort((a, b) => a.ejecutarEn - b.ejecutarEn);
    for (const t of vencidas) {
      actualizar(t.id, { estado: "ejecutando" });
      try {
        await ejecutar(t);
        actualizar(t.id, { estado: "hecha", ejecutadoEn: Date.now(), error: null });
      } catch (e) {
        actualizar(t.id, { estado: "error", ejecutadoEn: Date.now(), error: e.message });
      }
    }
  } finally {
    corriendo = false;
  }
}

// Arranca el scheduler: recupera tareas colgadas, ejecuta las vencidas y programa el poller.
function arrancarScheduler(ejecutar, cadaMs = 30000) {
  // Recuperación: si el server se cayó a mitad de una ejecución, la deja pendiente de nuevo.
  const tareas = leer();
  let cambio = false;
  for (const t of tareas) {
    if (t.estado === "ejecutando") {
      t.estado = "pendiente";
      cambio = true;
    }
  }
  if (cambio) guardar(tareas);

  tick(ejecutar).catch(() => {}); // barrido inicial (ejecuta lo vencido mientras estuvo caído)
  return setInterval(() => tick(ejecutar).catch(() => {}), cadaMs);
}

module.exports = {
  TAREAS_PATH,
  uuid,
  hashBuffer,
  hashArchivo,
  listar,
  obtener,
  crear,
  actualizar,
  eliminar,
  arrancarScheduler,
};
