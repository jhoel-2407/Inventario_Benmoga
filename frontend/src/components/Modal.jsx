import { X } from 'lucide-react';

// Diálogo reutilizable. Usa estilos en línea para no depender de más CSS.
const fondo = { position: 'fixed', inset: 0, background: 'rgba(17,24,39,.5)', display: 'grid', placeItems: 'center', padding: '18px', zIndex: 120 };
const caja = { background: '#fff', borderRadius: 16, padding: '22px', width: 'min(620px, 100%)', maxHeight: '88vh', overflowY: 'auto', boxShadow: '0 18px 50px rgba(17,24,39,.28)' };

function Modal({ title, subtitle, onClose, children, footer }) {
  return <div style={fondo} role="dialog" aria-modal="true" onClick={onClose}>
    <div style={caja} onClick={(e) => e.stopPropagation()}>
      <div className="card-heading"><div><h2>{title}</h2>{subtitle ? <p className="muted">{subtitle}</p> : null}</div><button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={18}/></button></div>
      {children}
      {footer ? <div className="action-row" style={{ marginTop: 18, justifyContent: 'flex-end' }}>{footer}</div> : null}
    </div>
  </div>;
}

export default Modal;
