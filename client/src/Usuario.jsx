import { useEffect, useState, useRef } from "react";
import { api } from "./api";
import Banners from "./Banners.jsx";
import Toast from "./Toast.jsx";
import { useConfirm } from "./Confirm.jsx";
import { IconSubir } from "./icons.jsx";

function urlPublica(base, carpeta, nombre) {
  if (!base) return null;
  const limpio = base.replace(/\/+$/, "");
  const rel = `${carpeta}/${nombre}`.replace(/\\/g, "/");
  return `${limpio}/${rel}`;
}

export default function Usuario() {
  const [config, setConfig] = useState(null);
  const [appId, setAppId] = useState("");
  const [seccionId, setSeccionId] = useState("");
  const [mensaje, setMensaje] = useState(null);

  useEffect(() => {
    api
      .getConfig()
      .then((c) => {
        setConfig(c);
        if (c.apps.length === 1) setAppId(c.apps[0].id);
      })
      .catch((e) => setMensaje({ tipo: "error", texto: e.message }));
  }, []);

  const app = config?.apps.find((a) => a.id === appId);
  // Todas las secciones de todas las páginas de la app (aplanado).
  const secciones = app ? app.paginas.flatMap((p) => p.secciones) : [];
  const seccion = secciones.find((s) => s.id === seccionId);

  if (!config) return <p className="aviso">Cargando…</p>;

  const variasApps = config.apps.length > 1;

  return (
    <div className="usuario">
      <Toast mensaje={mensaje} onClose={() => setMensaje(null)} />

      <div className="barra-navegacion">
        {variasApps && (
          <label className="campo campo-app">
            <span>Aplicación</span>
            <select
              value={appId}
              onChange={(e) => {
                setAppId(e.target.value);
                setSeccionId("");
              }}
            >
              <option value="">Seleccionar…</option>
              {config.apps.map((a) => (
                <option key={a.id} value={a.id}>{a.nombre}</option>
              ))}
            </select>
          </label>
        )}

        {app && (
          <div className="pestanas-seccion">
            {secciones.map((s) => (
              <button
                key={s.id}
                className={seccionId === s.id ? "pestana activa" : "pestana"}
                onClick={() => setSeccionId(s.id)}
              >
                {s.nombre}
              </button>
            ))}
          </div>
        )}
      </div>

      {!seccion ? (
        <div className="vacio vacio-inicial">
          <p>Elegí una sección para ver y gestionar sus imágenes.</p>
        </div>
      ) : seccion.tipo === "banners" ? (
        <Banners seccion={seccion} config={config} onMensaje={setMensaje} />
      ) : (
        <SeccionLibre seccion={seccion} config={config} onMensaje={setMensaje} />
      )}
    </div>
  );
}

// ---------- Sección libre (Popup): sin numeración, no pisa ----------
function SeccionLibre({ seccion, config, onMensaje }) {
  const confirmar = useConfirm();
  const carpeta = seccion.carpeta;
  const [imagenes, setImagenes] = useState([]);
  const [cargando, setCargando] = useState(false);
  const inputFile = useRef(null);

  useEffect(() => {
    refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpeta]);

  async function refrescar() {
    setCargando(true);
    try {
      const r = await api.listImages(carpeta);
      setImagenes(r.imagenes);
    } catch (e) {
      onMensaje({ tipo: "error", texto: e.message });
    } finally {
      setCargando(false);
    }
  }

  async function subir(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setCargando(true);
    try {
      for (const f of files) await api.upload(carpeta, f);
      onMensaje({ tipo: "ok", texto: `${files.length} imagen(es) cargada(s).` });
      await refrescar();
    } catch (err) {
      onMensaje({ tipo: "error", texto: err.message });
    } finally {
      setCargando(false);
      if (inputFile.current) inputFile.current.value = "";
    }
  }

  async function eliminar(nombre) {
    const ok = await confirmar({
      titulo: "Eliminar imagen",
      mensaje: `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`,
      textoConfirmar: "Eliminar",
    });
    if (!ok) return;
    setCargando(true);
    try {
      await api.remove(carpeta, nombre);
      onMensaje({ tipo: "ok", texto: `"${nombre}" eliminada.` });
      await refrescar();
    } catch (err) {
      onMensaje({ tipo: "error", texto: err.message });
    } finally {
      setCargando(false);
    }
  }

  async function copiarEnlace(nombre) {
    const url = urlPublica(config.publicBaseUrl, carpeta, nombre);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      onMensaje({ tipo: "ok", texto: "Enlace copiado al portapapeles." });
    } catch {
      onMensaje({ tipo: "info", texto: url });
    }
  }

  return (
    <>
      <div className="barra-accion">
        <div className="barra-info">
          <span className="etiqueta-carpeta">{carpeta}</span>
          <span className="barra-nota">La web muestra la imagen más nueva por fecha.</span>
        </div>
        <div className="barra-botones">
          {cargando && <span className="spinner">Procesando…</span>}
          <input ref={inputFile} type="file" accept=".png,.jpg,.jpeg,.webp" multiple onChange={subir} id="file-input" hidden />
          <label htmlFor="file-input" className="btn primario">
            <IconSubir width={16} height={16} /> Cargar imágenes
          </label>
        </div>
      </div>

      {imagenes.length === 0 ? (
        <div className="vacio">
          <p>No hay imágenes en esta sección todavía.</p>
        </div>
      ) : (
        <div className="grid">
          {imagenes.map((img) => (
            <div className="card" key={img.nombre}>
              <div className="thumb">
                <img src={api.fileUrl(carpeta, img.nombre)} alt={img.nombre} loading="lazy" />
              </div>
              <div className="card-info">
                <span className="nombre" title={img.nombre}>{img.nombre}</span>
                <span className="peso">{(img.tamano / 1024).toFixed(0)} KB</span>
              </div>
              <div className="acciones">
                {config.publicBaseUrl && (
                  <button className="btn mini" onClick={() => copiarEnlace(img.nombre)}>Copiar enlace</button>
                )}
                <button className="btn mini peligro" onClick={() => eliminar(img.nombre)}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
