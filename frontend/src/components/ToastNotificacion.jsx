import { BellRing, X } from 'lucide-react';

function ToastNotificacion({ noti, onClose }) {
  if (!noti) return null;
  return <div className="toast-notify" role="alert">
    <div className="toast-icon"><BellRing size={18}/></div>
    <div className="toast-body"><b>Zona terminada: {noti.zona}</b><span>{noti.empleado} · {noti.unidades} unidades · {noti.lecturas} lecturas</span></div>
    <button type="button" className="icon-btn" onClick={onClose} aria-label="Cerrar"><X size={15}/></button>
  </div>;
}

export default ToastNotificacion;
