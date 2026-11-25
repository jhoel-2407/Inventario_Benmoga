import { useEffect, useRef, useState } from 'react';
import { Bell, BellRing } from 'lucide-react';

function NotifBell({ notificaciones, sinLeer, onMarcarLeidas }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    function fuera(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, []);
  const toggle = () => setOpen((v) => { const nv = !v; if (nv) onMarcarLeidas?.(); return nv; });
  return <div className="notif" ref={ref}>
    <button type="button" className="icon-btn notif-btn" onClick={toggle} title="Notificaciones" aria-label="Notificaciones">
      {sinLeer > 0 ? <BellRing size={19}/> : <Bell size={19}/>}
      {sinLeer > 0 && <span className="notif-badge">{sinLeer > 9 ? '9+' : sinLeer}</span>}
    </button>
    {open && <div className="notif-panel">
      <div className="notif-head"><b>Notificaciones</b><span>{notificaciones.length}</span></div>
      {notificaciones.length ? <div className="notif-list">{notificaciones.map(n => <div className="notif-item" key={n.id}>
        <span className="notif-dot"/>
        <div className="notif-text"><b>Zona terminada: {n.zona}</b><span>{n.empleado} · {n.unidades} unidades · {n.lecturas} lecturas</span></div>
        <time>{new Date(n.hora).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</time>
      </div>)}</div> : <p className="empty-inline">Sin notificaciones todavía. Aparecerán cuando un empleado finalice una zona.</p>}
    </div>}
  </div>;
}

export default NotifBell;
