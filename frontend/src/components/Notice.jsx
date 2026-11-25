import { X } from 'lucide-react';

function Notice({ message, type = 'success', onClose }) { if (!message) return null; return <div className={`notice ${type}`} role="status" data-testid="notice" data-type={type}><span>{message}</span><button className="icon-btn" onClick={onClose} aria-label="Cerrar" data-testid="cerrar-aviso"><X size={16}/></button></div>; }

export default Notice;
