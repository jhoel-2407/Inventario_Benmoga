import { useCallback, useEffect, useState } from 'react';
import { Activity, Barcode, Boxes, FileSpreadsheet, RefreshCw, Warehouse } from 'lucide-react';
import { api } from '../lib/api.js';
import { colorForUser } from '../lib/avatar.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Stat from '../components/Stat.jsx';
import Empty from '../components/Empty.jsx';

function Dashboard({ local }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    try { const d = await api(`/api/dashboard${local?.id ? `?localId=${local.id}` : ''}`); setData(d); setError(''); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [local?.id]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  // Actualización en vivo por WebSocket: cada lectura o cambio de zona recarga el panel.
  useEffect(() => {
    let t = null;
    const handler = (e) => {
      const ev = e.detail;
      if (!ev || !['escaneo', 'sesion', 'zona_finalizada'].includes(ev.tipo)) return;
      if (t) clearTimeout(t);
      t = setTimeout(load, 400);
    };
    window.addEventListener('levis:realtime', handler);
    return () => { window.removeEventListener('levis:realtime', handler); if (t) clearTimeout(t); };
  }, [load]);
  const zonas = data?.zonas || [];
  const active = data?.inventario;
  const zonasConConteo = zonas.filter(z => (z.unidadesContadas || 0) > 0).length;
  return <div className="page-stack">
    <div className="page-heading">
      <div><p className="eyebrow">PANEL DE CONTROL</p><h1>Resumen del inventario</h1><p className="muted">Supervisa en vivo el conteo del local y la actividad del equipo.</p></div>
      <button className="btn secondary" onClick={load}><RefreshCw size={16}/> Actualizar</button>
    </div>
    {error && <Notice type="error" message={error} onClose={() => setError('')}/>}
    {local && <div className="selected-zone big-zone"><Warehouse size={18}/><span>Local en proceso: <b>{local.nombre}</b></span><span className={`pill ${active ? 'green' : 'gray'}`}>{active ? active.estado : 'SIN INVENTARIO'}</span></div>}
    <div className="stats-grid">
      <Stat icon={Boxes} label="Productos en catálogo" value={data?.resumen?.productosEnCatalogo?.toLocaleString('es-CO') ?? '—'} sub="Referencias del inventario activo"/>
      <Stat icon={Barcode} label="Lecturas registradas" value={data?.resumen?.lecturasRegistradas?.toLocaleString('es-CO') ?? '—'} sub="Escaneos realizados"/>
      <Stat icon={Activity} label="Unidades contadas" value={data?.resumen?.unidadesContadas?.toLocaleString('es-CO') ?? '—'} sub="Conteo físico acumulado"/>
      <Stat icon={Warehouse} label="Zonas del local" value={zonas.length} sub={`${zonasConConteo} zonas con conteo`}/>
    </div>
    <Card>
      <div className="card-heading"><div><h2>Inventario en curso</h2><p className="muted">Estado del archivo maestra activo</p></div><span className={`pill ${active ? 'green' : 'gray'}`}>{active?.estado || 'SIN INVENTARIO'}</span></div>
      {active ? <div className="active-inventory"><div className="file-tile"><FileSpreadsheet size={24}/></div><div className="inventory-info"><b>{active.nombre}</b><span>{(local?.nombre || active.archivoOrigen || 'Archivo maestra')} · Creado {new Date(active.fechaInventario).toLocaleDateString('es-CO')}</span></div><div className="inventory-metric"><strong>{data?.resumen?.productosEnCatalogo?.toLocaleString('es-CO') || 0}</strong><span>productos</span></div></div> : <Empty icon={FileSpreadsheet} title="Todavía no hay un inventario activo" text="Importa el Excel maestra desde Inventarios y actívalo para comenzar."/>}
    </Card>
    <Card>
      <div className="card-heading"><div><h2>Avance por zona</h2><p className="muted">Quién escanea cada zona y cuántas unidades. Actualización en vivo.</p></div><span className="live-tag"><span className="status-dot"/> EN VIVO</span></div>
      {zonas.length ? <div className="zone-grid">{zonas.map(z => <div className="zone-card" key={z.id}>
        <div className="zone-card-top"><div className="zone-number">{String(z.numero).padStart(2,'0')}</div><div><b>{`Zona ${z.numero}`}</b><span>{(z.empleadosActivos?.length || 0) > 0 ? `${z.empleadosActivos.length} escaneando ahora` : `${z.empleados?.length || 0} empleado(s) con conteo`}</span></div></div>
        <div className="zone-stats"><div><b>{(z.unidadesContadas || 0).toLocaleString('es-CO')}</b><span>unidades</span></div><div><b>{(z.lecturas || 0).toLocaleString('es-CO')}</b><span>lecturas</span></div></div>
        {(z.empleados?.length > 0) && <div className="employee-tags">{z.empleados.map(e => <span key={e.id} style={{background:colorForUser(e).bg,color:colorForUser(e).fg}}>{e.nombre} · {e.unidades}</span>)}</div>}
      </div>)}</div> : <Empty icon={Warehouse} title="No hay zonas en este local" text="Crea las zonas o estantes del local desde la sección Zonas."/>}
    </Card>
    <Card>
      <div className="card-heading"><div><h2>Actividad reciente</h2><p className="muted">Últimas lecturas realizadas por el equipo.</p></div></div>
      {data?.actividadReciente?.length ? <div className="table-wrap"><table><thead><tr><th>Código</th><th>Producto</th><th>Empleado</th><th>Zona</th><th>Hora</th></tr></thead><tbody>{data.actividadReciente.map(e => <tr key={e.id}><td className="mono">{e.codigoBarras}</td><td><b>{e.item || '—'}</b><span className="table-sub">{e.producto || 'Sin descripción'}</span></td><td>{e.empleado}</td><td><span className="zone-chip">{e.zona}</span></td><td>{new Date(e.fecha).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'})}</td></tr>)}</tbody></table></div> : <p className="empty-inline">{loading ? 'Cargando actividad…' : 'Aún no hay lecturas registradas.'}</p>}
    </Card>
  </div>;
}

export default Dashboard;
