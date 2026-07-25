import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "./api";
import Toast from "./Toast.jsx";
import { useConfirm } from "./Confirm.jsx";

const TZ = "America/Argentina/Buenos_Aires";
function fmt(ms) {
  return new Date(ms).toLocaleString("es-AR", { timeZone: TZ, dateStyle: "short", timeStyle: "short" });
}
const ESTADO_LABEL = {
  pendiente: "Pendiente",
  ejecutando: "Ejecutando",
  hecha: "Hecha",
  error: "Error",
  cancelada: "Cancelada",
};

export default function Programadas() {
  const confirmar = useConfirm();
  const [config, setConfig] = useState(null);
  const [lista, setLista] = useState([]);
  const [mensaje, setMensaje] = useState(null);
  const [cargando, setCargando] = useState(false);

  // Formulario
  const [secIdx, setSecIdx] = useState("");
  const [modo, setModo] = useState("publicar"); // publicar | baja
  const [fechaAlta, setFechaAlta] = useState("");
  const [conBaja, setConBaja] = useState(false);
  const [fechaBaja, setFechaBaja] = useState("");
  const [existentes, setExistentes] = useState([]);
  const [archivoSel, setArchivoSel] = useState("");
  const [fechaBajaEx, setFechaBajaEx] = useState("");
  const inputFile = useRef(null);

  useEffect(() => {
    api.getConfig().then(setConfig).catch((e) => setMensaje({ tipo: "error", texto: e.message }));
    refrescar();
  }, []);

  async function refrescar() {
    try {
      setLista(await api.listarProgramaciones());
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    }
  }

  const secciones = useMemo(
    () =>
      config
        ? config.apps.flatMap((a) =>
            a.paginas.flatMap((p) => p.secciones.map((s) => ({ ...s, appNombre: a.nombre })))
          )
        : [],
    [config]
  );
  const seccion = secciones[secIdx];

  // Cargar imágenes existentes cuando se programa una baja.
  useEffect(() => {
    setArchivoSel("");
    if (modo !== "baja" || !seccion) {
      setExistentes([]);
      return;
    }
    (async () => {
      try {
        if (seccion.tipo === "banners") {
          const r = await api.listBanners(seccion.carpeta);
          setExistentes(r.banners.map((b) => ({ nombre: b.archivo, label: `banner-${b.numero}` })));
        } else {
          const r = await api.listImages(seccion.carpeta);
          setExistentes(r.imagenes.map((i) => ({ nombre: i.nombre, label: i.nombre })));
        }
      } catch (e) {
        setMensaje({ tipo: "error", texto: e.message });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modo, secIdx]);

  function resetForm() {
    setFechaAlta("");
    setConBaja(false);
    setFechaBaja("");
    setFechaBajaEx("");
    setArchivoSel("");
    if (inputFile.current) inputFile.current.value = "";
  }

  async function programar() {
    if (!seccion) return setMensaje({ tipo: "error", texto: "Elegí una sección." });
    setCargando(true);
    try {
      if (modo === "publicar") {
        const file = inputFile.current?.files?.[0];
        if (!file) throw new Error("Elegí una imagen.");
        if (!fechaAlta) throw new Error("Elegí la fecha de publicación.");
        const alta = new Date(fechaAlta).getTime();
        const baja = conBaja && fechaBaja ? new Date(fechaBaja).getTime() : null;
        if (conBaja && !fechaBaja) throw new Error("Elegí la fecha de baja.");
        await api.programarPublicacion({ carpeta: seccion.carpeta, tipo: seccion.tipo, fechaAlta: alta, fechaBaja: baja, file });
        setMensaje({ tipo: "ok", texto: "Publicación programada." });
      } else {
        if (!archivoSel) throw new Error("Elegí la imagen a dar de baja.");
        if (!fechaBajaEx) throw new Error("Elegí la fecha de baja.");
        const fecha = new Date(fechaBajaEx).getTime();
        await api.programarBaja({ carpeta: seccion.carpeta, tipo: seccion.tipo, archivo: archivoSel, fecha });
        setMensaje({ tipo: "ok", texto: "Baja programada." });
      }
      resetForm();
      await refrescar();
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    } finally {
      setCargando(false);
    }
  }

  async function cancelar(t) {
    const ok = await confirmar({
      titulo: "Cancelar programación",
      mensaje: "¿Cancelar esta programación pendiente?",
      textoConfirmar: "Cancelar programación",
    });
    if (!ok) return;
    try {
      await api.cancelarProgramacion(t.id);
      setMensaje({ tipo: "ok", texto: "Programación cancelada." });
      await refrescar();
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    }
  }

  const ahoraLocal = new Date(Date.now() + 60000).toISOString().slice(0, 16); // mín: dentro de 1 min

  return (
    <div className="admin">
      <Toast mensaje={mensaje} onClose={() => setMensaje(null)} />

      <div className="bloque">
        <div className="secciones-titulo">Nueva programación</div>

        <div className="seccion-grid">
          <label className="mini-campo">
            <span>Sección</span>
            <select value={secIdx} onChange={(e) => setSecIdx(e.target.value)}>
              <option value="">Elegí…</option>
              {secciones.map((s, i) => (
                <option key={`${s.carpeta}-${i}`} value={i}>
                  {s.appNombre} · {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="mini-campo">
            <span>Acción</span>
            <select value={modo} onChange={(e) => setModo(e.target.value)}>
              <option value="publicar">Publicar una imagen</option>
              <option value="baja">Dar de baja una imagen</option>
            </select>
          </label>
        </div>

        {modo === "publicar" ? (
          <div className="prog-form">
            <label className="mini-campo">
              <span>Imagen a publicar</span>
              <input ref={inputFile} type="file" accept=".png,.jpg,.jpeg,.webp" />
            </label>
            <div className="seccion-grid">
              <label className="mini-campo">
                <span>Fecha y hora de publicación</span>
                <input type="datetime-local" min={ahoraLocal} value={fechaAlta} onChange={(e) => setFechaAlta(e.target.value)} />
              </label>
              <label className="mini-campo">
                <span>&nbsp;</span>
                <label className="check-inline">
                  <input type="checkbox" checked={conBaja} onChange={(e) => setConBaja(e.target.checked)} />
                  Programar también su baja
                </label>
              </label>
            </div>
            {conBaja && (
              <label className="mini-campo">
                <span>Fecha y hora de baja</span>
                <input type="datetime-local" min={fechaAlta || ahoraLocal} value={fechaBaja} onChange={(e) => setFechaBaja(e.target.value)} />
              </label>
            )}
          </div>
        ) : (
          <div className="prog-form">
            <label className="mini-campo">
              <span>Imagen a dar de baja</span>
              <select value={archivoSel} onChange={(e) => setArchivoSel(e.target.value)} disabled={!seccion}>
                <option value="">{seccion ? "Elegí…" : "Elegí una sección primero"}</option>
                {existentes.map((x) => (
                  <option key={x.nombre} value={x.nombre}>{x.label}</option>
                ))}
              </select>
            </label>
            <label className="mini-campo">
              <span>Fecha y hora de baja</span>
              <input type="datetime-local" min={ahoraLocal} value={fechaBajaEx} onChange={(e) => setFechaBajaEx(e.target.value)} />
            </label>
          </div>
        )}

        <div className="prog-acciones">
          <button className="btn primario" onClick={programar} disabled={cargando}>
            {cargando ? "Programando…" : "Programar"}
          </button>
        </div>
      </div>

      <div className="secciones-titulo">Programaciones</div>
      {lista.length === 0 ? (
        <div className="vacio">
          <p>No hay programaciones todavía.</p>
        </div>
      ) : (
        <div className="tabla-usuarios">
          {lista.map((t) => (
            <div className="fila-usuario prog-fila" key={t.id}>
              <div className="prog-datos">
                <span className={`chip-accion ${t.accion === "publicar" ? "acc-pub" : "acc-baja"}`}>
                  {t.accion === "publicar" ? "Publicar" : "Baja"}
                </span>
                <span className="prog-ref">{t.referencia || t.carpeta}</span>
                <span className="prog-carpeta">{t.carpeta}</span>
                <span className="prog-fecha">{fmt(t.ejecutarEn)}</span>
                <span className={`chip-estado est-${t.estado}`}>{ESTADO_LABEL[t.estado] || t.estado}</span>
                {t.estado === "error" && t.error && <span className="prog-error">{t.error}</span>}
              </div>
              {t.estado === "pendiente" && (
                <button className="btn mini peligro" onClick={() => cancelar(t)}>
                  Cancelar
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
