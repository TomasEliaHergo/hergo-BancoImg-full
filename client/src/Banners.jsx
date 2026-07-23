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
  const [banners, setBanners] = useState([]);
  const [primerHueco, setPrimerHueco] = useState(null);
  const [cargando, setCargando] = useState(false);
  const inputNuevo = useRef(null);

  useEffect(() => {
    refrescar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [carpeta]);

  async function refrescar() {
    setCargando(true);
    try {
      const r = await api.listBanners(carpeta);
      setBanners(r.banners);
      setPrimerHueco(r.primerHueco);
    } catch (e) {
      onMensaje({ tipo: "error", texto: e.message });
    } finally {
      setCargando(false);
    }
  }

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

  return (
    <div className="banners">
      <div className="barra-accion">
        <div className="barra-info">
          <span className="etiqueta-carpeta">{carpeta}</span>
          <span className="barra-nota">Se numeran solos y de forma consecutiva.</span>
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
          />
          <label htmlFor="nuevo-banner" className="btn primario">
            <IconSubir width={16} height={16} /> Agregar banner
          </label>
        </div>
      </div>

      {primerHueco && (
        <div className="alerta alerta-warn">
          <strong>Atención:</strong> hay un hueco en la numeración (falta el banner {primerHueco}). En la web,
          el carrusel se cortaría antes de ese número. Al eliminar desde acá la numeración se corrige sola.
        </div>
      )}

      {banners.length === 0 ? (
        <div className="vacio">
          <p>Todavía no hay banners cargados en esta sección.</p>
        </div>
      ) : (
        <div className="grid">
          {banners.map((b) => (
            <div className="card" key={b.numero}>
              <div className="card-encabezado">
                <span className="chip-num">banner-{b.numero}</span>
              </div>
              <div className="thumb">
                <img src={api.fileUrl(carpeta, b.archivo)} alt={`banner ${b.numero}`} loading="lazy" />
              </div>
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
