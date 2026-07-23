import { useEffect } from "react";

// Alerta flotante, no bloqueante, con auto-cierre. tipo: ok | error | info
export default function Toast({ mensaje, onClose }) {
  useEffect(() => {
    if (!mensaje) return;
    const t = setTimeout(onClose, mensaje.tipo === "error" ? 6000 : 3500);
    return () => clearTimeout(t);
  }, [mensaje, onClose]);

  if (!mensaje) return null;

  return (
    <div className="toast-wrap" role="status" aria-live="polite">
      <div className={`toast toast-${mensaje.tipo}`}>
        <span className="toast-punto" aria-hidden="true" />
        <span className="toast-texto">{mensaje.texto}</span>
        <button className="toast-cerrar" onClick={onClose} aria-label="Cerrar">
          ×
        </button>
      </div>
    </div>
  );
}
