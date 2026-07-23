import { useEffect, useState } from "react";
import { api } from "./api";
import Toast from "./Toast.jsx";

// Genera un id simple a partir de un nombre
function slug(txt) {
  return (txt || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "item-" + Math.floor(Math.random() * 10000);
}

export default function Administrador() {
  const [config, setConfig] = useState(null);
  const [mensaje, setMensaje] = useState(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    api.getConfig().then(setConfig).catch((e) => setMensaje({ tipo: "error", texto: e.message }));
  }, []);

  function actualizar(mut) {
    setConfig((prev) => {
      const copia = structuredClone(prev);
      mut(copia);
      return copia;
    });
  }

  async function guardar() {
    setGuardando(true);
    try {
      await api.saveConfig(config);
      setMensaje({ tipo: "ok", texto: "Configuración guardada." });
    } catch (e) {
      setMensaje({ tipo: "error", texto: e.message });
    } finally {
      setGuardando(false);
    }
  }

  if (!config) return <p className="aviso">Cargando…</p>;

  return (
    <div className="admin">
      <div className="alerta alerta-info">
        Definí acá las <b>secciones</b> de cada aplicación y su carpeta destino. Cada sección es una carpeta
        independiente: elegí el tipo <b>Banners numerados</b> (archivos <code>banner-1</code>, <code>banner-2</code>…)
        o <b>Libre</b> (nombre a elección, como el popup). Los usuarios solo eligen de estas opciones.
      </div>

      <Toast mensaje={mensaje} onClose={() => setMensaje(null)} />

      <label className="campo-base">
        Directorio base del banco (en el servidor)
        <input
          type="text"
          value={config.baseDir}
          onChange={(e) => actualizar((c) => (c.baseDir = e.target.value))}
        />
        <small>Ruta en el servidor donde se escriben los archivos (ej. \\iis\www). Las carpetas de cada sección son relativas a esta ruta.</small>
      </label>

      <label className="campo-base">
        URL pública del dominio
        <input
          type="text"
          value={config.publicBaseUrl || ""}
          onChange={(e) => actualizar((c) => (c.publicBaseUrl = e.target.value))}
        />
        <small>Base con la que se arma el enlace público de cada imagen (ej. https://portal.hergo.com.ar:8099/Imagenes/www/).</small>
      </label>

      {config.apps.map((app, ai) => (
        <div className="bloque app-bloque" key={app.id}>
          <div className="bloque-header">
            <label className="mini-campo flex-1">
              <span>Aplicación</span>
              <input
                value={app.nombre}
                placeholder="Nombre de la aplicación"
                onChange={(e) =>
                  actualizar((c) => {
                    c.apps[ai].nombre = e.target.value;
                    c.apps[ai].id = slug(e.target.value);
                  })
                }
              />
            </label>
            <button className="btn mini peligro" onClick={() => actualizar((c) => c.apps.splice(ai, 1))}>
              Quitar app
            </button>
          </div>

          {app.paginas.map((pag, pi) => (
            <div className="pagina-bloque" key={pag.id}>
              <div className="bloque-header">
                <label className="mini-campo flex-1">
                  <span>Página</span>
                  <input
                    value={pag.nombre}
                    placeholder="Nombre de la página"
                    onChange={(e) =>
                      actualizar((c) => {
                        c.apps[ai].paginas[pi].nombre = e.target.value;
                        c.apps[ai].paginas[pi].id = slug(e.target.value);
                      })
                    }
                  />
                </label>
                <button
                  className="btn mini peligro"
                  onClick={() => actualizar((c) => c.apps[ai].paginas.splice(pi, 1))}
                >
                  Quitar página
                </button>
              </div>

              <div className="secciones-titulo">Secciones</div>

              {pag.secciones.map((sec, si) => (
                <div className="seccion-card" key={sec.id}>
                  <div className="seccion-grid">
                    <label className="mini-campo">
                      <span>Nombre</span>
                      <input
                        value={sec.nombre}
                        placeholder="Ej. Banner PC"
                        onChange={(e) =>
                          actualizar((c) => {
                            c.apps[ai].paginas[pi].secciones[si].nombre = e.target.value;
                            c.apps[ai].paginas[pi].secciones[si].id = slug(e.target.value);
                          })
                        }
                      />
                    </label>
                    <label className="mini-campo">
                      <span>Tipo</span>
                      <select
                        value={sec.tipo || "libre"}
                        onChange={(e) =>
                          actualizar((c) => (c.apps[ai].paginas[pi].secciones[si].tipo = e.target.value))
                        }
                      >
                        <option value="libre">Libre (nombre a elección)</option>
                        <option value="banners">Banners numerados (banner-N)</option>
                      </select>
                    </label>
                    <label className="mini-campo campo-carpeta">
                      <span>Carpeta destino</span>
                      <input
                        value={sec.carpeta || ""}
                        placeholder={(sec.tipo || "libre") === "banners" ? "banners/pc" : "popup"}
                        onChange={(e) =>
                          actualizar((c) => (c.apps[ai].paginas[pi].secciones[si].carpeta = e.target.value))
                        }
                      />
                    </label>
                  </div>
                  <button
                    className="btn mini peligro seccion-quitar"
                    onClick={() => actualizar((c) => c.apps[ai].paginas[pi].secciones.splice(si, 1))}
                  >
                    Quitar sección
                  </button>
                </div>
              ))}

              <button
                className="btn mini"
                onClick={() =>
                  actualizar((c) =>
                    c.apps[ai].paginas[pi].secciones.push({
                      id: "sec-" + Math.floor(Math.random() * 100000),
                      nombre: "",
                      tipo: "libre",
                      carpeta: "",
                    })
                  )
                }
              >
                + Agregar sección
              </button>
            </div>
          ))}

          <button
            className="btn mini agregar-pagina"
            onClick={() =>
              actualizar((c) =>
                c.apps[ai].paginas.push({
                  id: "pag-" + Math.floor(Math.random() * 100000),
                  nombre: "",
                  secciones: [],
                })
              )
            }
          >
            + Agregar página
          </button>
        </div>
      ))}

      <button
        className="btn"
        onClick={() =>
          actualizar((c) =>
            c.apps.push({
              id: "app-" + Math.floor(Math.random() * 100000),
              nombre: "",
              paginas: [],
            })
          )
        }
      >
        + Agregar aplicación
      </button>

      <div className="barra-guardar">
        <button className="btn primario" onClick={guardar} disabled={guardando}>
          {guardando ? "Guardando…" : "Guardar configuración"}
        </button>
      </div>
    </div>
  );
}
