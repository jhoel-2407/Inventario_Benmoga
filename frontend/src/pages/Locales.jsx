import { useCallback, useEffect, useState } from 'react';
import { Plus, RefreshCw, Warehouse } from 'lucide-react';
import { api } from '../lib/api.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Empty from '../components/Empty.jsx';

function Locales() {
  const [locales, setLocales] = useState([]);
  const [nombre, setNombre] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try { const d = await api('/api/locales'); setLocales(d.locales || []); setError(''); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  async function crear(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/locales', { method: 'POST', body: JSON.stringify({ nombre: nombre.trim() }) });
      setNotice('Local creado correctamente.'); setNombre(''); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="page-stack">
    <div className="page-heading">
      <div><p className="eyebrow">TIENDAS</p><h1>Locales</h1><p className="muted">Administra los locales. Cada jornada se hace el inventario de un local y sus zonas.</p></div>
      <button className="btn secondary" onClick={load}><RefreshCw size={16}/> Actualizar</button>
    </div>
    {error && <Notice type="error" message={error} onClose={() => setError('')}/>}
    {notice && <Notice message={notice} onClose={() => setNotice('')}/>}
    <div className="two-column">
      <Card>
        <div className="card-heading"><div><h2>Crear local</h2><p className="muted">Usa el nombre con el que identifican la tienda.</p></div><div className="heading-icon"><Warehouse/></div></div>
        <form className="form-stack" onSubmit={crear}>
          <label>Nombre del local<input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Local Centro" minLength={2} maxLength={120} required/></label>
          <button className="btn primary full" disabled={busy}>{busy ? <span className="spinner"/> : <Plus size={17}/>} Crear local</button>
        </form>
      </Card>
      <Card>
        <div className="card-heading"><div><h2>Locales registrados</h2><p className="muted">{locales.length} locales configurados.</p></div><button className="btn secondary small-btn" onClick={load}><RefreshCw size={15}/></button></div>
        {locales.length ? <div className="user-list">{locales.map(l => <div className="user-row" key={l.id}><div className="avatar">{String(l.id).padStart(2,'0')}</div><div className="user-row-info"><b>{l.nombre}</b><span>{l._count?.zonas || 0} zonas · {l._count?.inventarios || 0} inventarios</span></div></div>)}</div> : <Empty icon={Warehouse} title="Sin locales" text="Crea el primer local para empezar a organizar el inventario."/>}
      </Card>
    </div>
  </div>;
}

export default Locales;
