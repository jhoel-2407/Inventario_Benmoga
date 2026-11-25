import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Boxes, CheckCircle2, ChevronRight, FileSpreadsheet, PackageSearch, RefreshCw, ScanLine, Warehouse } from 'lucide-react';
import { api } from '../lib/api.js';
import { colorForUser, initials } from '../lib/avatar.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Stat from '../components/Stat.jsx';
import Empty from '../components/Empty.jsx';

function EmployeeHome({ user, local }) {
  const navigate = useNavigate();
  const color = colorForUser(user);
  const [zones, setZones] = useState([]);
  const [summary, setSummary] = useState({ unidades: 0, productosDistintos: 0, zonaActiva: null, inventario: null });
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyZone, setBusyZone] = useState(null);
  const load = useCallback(async () => {
    try {
      const q = local?.id ? `?localId=${local.id}` : '';
      const [z, s] = await Promise.all([api(`/api/zonas${q}`), api(`/api/escaneos/resumen-mio${q}`)]);
      setZones(z.zonas || []);
      setSummary(s || {});
      if (s?.zonaActiva?.id) localStorage.setItem('levis_zone', String(s.zonaActiva.id));
      else localStorage.removeItem('levis_zone');
      setError('');
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [local?.id]);
  useEffect(() => { load(); }, [load]);
  function enterZone(zona) {
    setBusyZone(zona.id);
    localStorage.setItem('levis_zone', String(zona.id));
    navigate('/conteo');
  }
  const zona = summary.zonaActiva;
  const filtro = q.trim().toLowerCase();
  const visibles = filtro ? zones.filter(z => String(z.numero).includes(filtro) || (z.nombre || '').toLowerCase().includes(filtro)) : zones;
  return <div className="page-stack">
    <div className="page-heading">
      <div><p className="eyebrow">MI CONTEO</p><h1>Hola, {(user?.nombre || '').split(' ')[0] || 'empleado'}</h1><p className="muted">Este es tu panel. Elige la zona donde vas a contar y empieza a escanear.</p></div>
      <button className="btn secondary" onClick={load}><RefreshCw size={16}/> Actualizar</button>
    </div>
    {error && <Notice type="error" message={error} onClose={() => setError('')}/>}
    <Card className="profile-card">
      <div className="profile-main">
        <div className="avatar profile-avatar" style={{ background: color.bg, color: color.fg }}>{initials(user?.nombre)}</div>
        <div className="profile-info"><b>{user?.nombre}</b><span>{user?.correo}</span><span className="profile-role">Empleado · conteo de tienda</span></div>
      </div>
      <span className="profile-badge" style={{ background: color.bg, color: color.fg }}>Tu color de identificación</span>
    </Card>
    <div className="stats-grid">
      <Stat icon={ScanLine} label="Unidades escaneadas" value={loading ? '—' : (summary.unidades || 0).toLocaleString('es-CO')} sub="En el inventario activo"/>
      <Stat icon={Boxes} label="Códigos distintos" value={loading ? '—' : (summary.productosDistintos || 0).toLocaleString('es-CO')} sub="Referencias que has contado"/>
      <Stat icon={Warehouse} label="Zona actual" value={zona ? `Zona ${zona.numero}` : 'Sin zona'} sub={zona?.nombre || 'Selecciona una zona abajo'}/>
      <Stat icon={FileSpreadsheet} label="Inventario activo" value={summary.inventario ? 'En curso' : 'Ninguno'} sub={summary.inventario?.nombre || 'Sin inventario activo'}/>
    </div>
    {zona && <div className="selected-zone big-zone">
      <CheckCircle2 size={18}/>
      <span>Estás contando en <b>{zona.nombre || `Zona ${zona.numero}`}</b>.</span>
      <button className="btn primary" onClick={() => navigate('/conteo')}><ScanLine size={16}/> Continuar escaneando</button>
    </div>}
    <Card>
      <div className="card-heading"><div><h2>Zonas de trabajo</h2><p className="muted">{local?.nombre || 'Local'} · {zones.length} zonas. Toca una para entrar a escanear.</p></div><div className="heading-icon"><Warehouse/></div></div>
      {zones.length > 8 && <div className="search-box"><PackageSearch size={17}/><input value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar zona por número o nombre…" inputMode="numeric"/></div>}
      {zones.length ? (visibles.length ? <div className="zone-grid">{visibles.map(z => <button key={z.id} type="button" className={`zone-card zone-pick ${zona?.id === z.id ? 'active' : ''}`} onClick={() => enterZone(z)} disabled={busyZone === z.id}>
        <div className="zone-card-top"><div className="zone-number" style={{ background: color.bg, color: color.fg }}>{String(z.numero).padStart(2, '0')}</div><div><b>{`Zona ${z.numero}`}</b><span>{zona?.id === z.id ? 'Zona en uso' : 'Entrar a contar'}</span></div></div>
        <span className="zone-go">{busyZone === z.id ? <span className="spinner"/> : <ChevronRight size={17}/>}</span>
      </button>)}</div> : <p className="empty-inline">No hay zonas que coincidan con "{q}".</p>) : <Empty icon={Warehouse} title="Sin zonas en este local" text="Pide a la administradora que cree las zonas del local."/>}
    </Card>
  </div>;
}

export default EmployeeHome;
