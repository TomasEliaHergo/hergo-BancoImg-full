import { useEffect, useRef, useState } from "react";
import { api } from "./api";
import { useConfirm } from "./Confirm.jsx";
import { IconSubir } from "./icons.jsx";

function urlPublica(base, carpeta, nombre) {
  if (!base || !nombre) return null;
  const limpio = base.replace(/\/+$/, "");
  const rel = `${carpeta}/${nombre}`.replace(/\\/g, "/");
  return `${limpio}/${rel}`;
}

export default function Banners({ seccion, config, onMensaje }) {
  const confirmar = useConfirm();
  const carpeta = seccion.carpeta;
  const [banners, setBanners] = useState([]); // orden guardado (verdad del server)
  const [orden, setOrden] = useState([]); // orden local editable (drag & drop)
  const [primerHueco, setPrimerHueco] = useState(null);
  const [cargando, setCargando] = useState(false);
  const inputNuevo = useRef(null);
  const arrastrando = useRef(null);

  useEffect(() => {
    refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpeta]);

  async function refrescar() {
    setCargando(true);
    try {
      const r = await api.listBanners(carpeta);
      setBanners(r.banners);
      setOrden(r.banners);
      setPrimerHueco(r.primerHueco);
    } catch (e) {
      onMensaje({ tipo: "error", texto: e.message });
    } finally {
      setCargando(false);
    }
  }

  const hayCambios = orden.some((b, i) => b.archivo !== banners[i]?.archivo);

  // ---------- Drag & drop ----------
  function onDragStart(i) {
    arrastrando.current = i;
  }
  function onDragEnter(i) {
    const desde = arrastrando.current;
    if (desde === null || desde === i) return;
    setOrden((prev) => {
      const arr = [...prev];
      const [item] = arr.splice(desde, 1);
      arr.splice(i, 0, item);
      return arr;
    });
    arrastrando.current = i;
  }
  function onDragEnd() {
    arrastrando.current = null;
  }

  async function guardarOrden() {
    setCargando(true);
    try {
      await api.reordenarBanners(carpeta, orden.map((b) => b.archivo));
      onMensaje({ tipo: "ok", texto: "Orden guardado." });
      await refrescar();
    } catch (err) {
      onMensaje({ tipo: "error", texto: err.message });
      await refrescar();
    } finally {
      setCargando(false);
    }
  }
  function descartar() {
    setOrden(banners);
  }

  // ---------- Alta / reemplazo / baja ----------
  async function agregar(e) {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setCargando(true);
    try {
      let ultimo;
      for (const f of files) ultimo = (await api.addBanner(carpeta, f)).numero;
      onMensaje({
        tipo: "ok",
        texto: files.length === 1 ? `Banner ${ultimo} agregado.` : `${files.length} banners agregados.`,
      });
      await refrescar();
    } catch (err) {
      onMensaje({ tipo: "error", texto: err.message });
    } finally {
      setCargando(false);
      if (inputNuevo.current) inputNuevo.current.value = "";
    }
  }

  async function reemplazar(numero, file) {
    if (!file) return;
    setCargando(true);
    try {
      await api.replaceBanner(carpeta, numero, file);
      onMensaje({ tipo: "ok", texto: `Banner ${numero} reemplazado.` });
      await refrescar();
    } catch (err) {
      onMensaje({ tipo: "error", texto: err.message });
    } finally {
      setCargando(false);
    }
  }

  async function eliminar(numero) {
    const ok = await confirmar({
      titulo: `Eliminar banner ${numero}`,
      mensaje:
        "Los banners siguientes se renumeran automáticamente para no dejar huecos en el carrusel. Esta acción no se puede deshacer.",
      textoConfirmar: "Eliminar",
    });
    if (!ok) return;
    setCargando(true);
    try {
      await api.removeBanner(carpeta, numero);
      onMensaje({ tipo: "ok", texto: `Banner ${numero} eliminado y numeración reordenada.` });
      await refrescar();
    } catch (err) {
      onMensaje({ tipo: "error", texto: err.message });
    } finally {
      setCargando(false);
    }
  }

  const puedeReordenar = orden.length > 1;

  return (
    <div className="banners">
      <div className="barra-accion">
        <div className="barra-info">
          <span className="etiqueta-carpeta">{carpeta}</span>
          <span className="barra-nota">
            {puedeReordenar ? "Arrastrá las tarjetas para reordenar." : "Se numeran solos y de forma consecutiva."}
          </span>
        </div>
        <div className="barra-botones">
          {cargando && <span className="spinner">Procesando…</span>}
          <input
            ref={inputNuevo}
            type="file"
            accept=".png,.jpg,.jpeg,.webp"
            multiple
            hidden
            id="nuevo-banner"
            onChange={agregar}
            disabled={hayCambios}
          />
          <label htmlFor="nuevo-banner" className={`btn primario ${hayCambios ? "deshabilitado" : ""}`}>
            <IconSubir width={16} height={16} /> Agregar banner
          </label>
        </div>
      </div>

      {hayCambios && (
        <div className="alerta alerta-info barra-orden">
          <span>Cambiaste el orden. Guardá para aplicarlo en el sitio.</span>
          <div className="barra-orden-btns">
            <button className="btn mini" onClick={descartar} disabled={cargando}>
              Descartar
            </button>
            <button className="btn mini primario" onClick={guardarOrden} disabled={cargando}>
              Guardar orden
            </button>
          </div>
        </div>
      )}

      {primerHueco && !hayCambios && (
        <div className="alerta alerta-warn">
          <strong>Atención:</strong> hay un hueco en la numeración (falta el banner {primerHueco}). En la web,
          el carrusel se cortaría antes de ese número. Al eliminar desde acá la numeración se corrige sola.
        </div>
      )}

      {orden.length === 0 ? (
        <div className="vacio">
          <p>Todavía no hay banners cargados en esta sección.</p>
        </div>
      ) : (
        <div className="grid">
          {orden.map((b, i) => (
            <div
              className={`card ${puedeReordenar ? "arrastrable" : ""} ${hayCambios ? "reordenando" : ""}`}
              key={b.archivo}
              draggable={puedeReordenar}
              onDragStart={() => onDragStart(i)}
              onDragEnter={() => onDragEnter(i)}
              onDragOver={(e) => e.preventDefault()}
              onDragEnd={onDragEnd}
            >
              <div className="card-encabezado card-encabezado-orden">
                <span className="chip-num">#{i + 1}</span>
                {puedeReordenar && <span className="agarre" title="Arrastrar para reordenar">⣿</span>}
              </div>
              <div className="thumb">
                <img src={api.fileUrl(carpeta, b.archivo)} alt={`banner ${i + 1}`} loading="lazy" />
              </div>
              {!hayCambios && (
                <div className="acciones">
                  <label className="btn mini">
                    Reemplazar
                    <input
                      type="file"
                      accept=".png,.jpg,.jpeg,.webp"
                      hidden
                      onChange={(e) => reemplazar(b.numero, e.target.files?.[0])}
                    />
                  </label>
                  {config.publicBaseUrl && (
                    <a
                      className="btn mini"
                      href={urlPublica(config.publicBaseUrl, carpeta, b.archivo)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Ver
                    </a>
                  )}
                  <button className="btn mini peligro" onClick={() => eliminar(b.numero)}>
                    Eliminar
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
