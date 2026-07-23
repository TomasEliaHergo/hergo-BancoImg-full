import { createContext, useContext, useState, useCallback, useRef, useEffect } from "react";

const ConfirmContext = createContext(null);

// Hook para pedir confirmacion: const confirmar = useConfirm(); await confirmar({...})
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }) {
  const [estado, setEstado] = useState(null);
  const resolver = useRef(null);

  const confirmar = useCallback((opts = {}) => {
    return new Promise((resolve) => {
      resolver.current = resolve;
      setEstado({
        titulo: opts.titulo || "Confirmar acción",
        mensaje: opts.mensaje || "",
        textoConfirmar: opts.textoConfirmar || "Confirmar",
        textoCancelar: opts.textoCancelar || "Cancelar",
        peligro: opts.peligro !== false,
      });
    });
  }, []);

  const cerrar = useCallback((valor) => {
    setEstado(null);
    if (resolver.current) {
      resolver.current(valor);
      resolver.current = null;
    }
  }, []);

  useEffect(() => {
    if (!estado) return;
    const onKey = (e) => {
      if (e.key === "Escape") cerrar(false);
      if (e.key === "Enter") cerrar(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [estado, cerrar]);

  return (
    <ConfirmContext.Provider value={confirmar}>
      {children}
      {estado && (
        <div className="modal-overlay" onClick={() => cerrar(false)}>
          <div className="modal" role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-titulo">{estado.titulo}</h3>
            {estado.mensaje && <p className="modal-mensaje">{estado.mensaje}</p>}
            <div className="modal-acciones">
              <button className="btn" onClick={() => cerrar(false)}>
                {estado.textoCancelar}
              </button>
              <button
                className={`btn ${estado.peligro ? "peligro-solido" : "primario"}`}
                onClick={() => cerrar(true)}
                autoFocus
              >
                {estado.textoConfirmar}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
