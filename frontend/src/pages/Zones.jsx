import { useCallback, useEffect, useState } from 'react';
import { CircleHelp, PackageSearch, Plus, RefreshCw, Trash2, Warehouse } from 'lucide-react';
import { api, getUser } from '../lib/api.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Empty from '../components/Empty.jsx';

function Zones({ local }) {
  const user = getUser();
  const admin = user?.rol === 'ADMINISTRADORA';
  const [zones, setZones] = useState([]);
  const [locales, setLocales] = useState([]);
  const [localId, setLocalId] = useState(local?.id ? String(local.id) : '');
  const [q, setQ] = useState('');
  const [numero, setNumero] = useState('');
  const [nombre, setNombre] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [tipoLote, setTipoLote] = useState('PDV');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      let lid = localId;
      if (admin) {
        const l = await api('/api/locales');
        const lista = l.locales || [];
        setLocales(lista);
        if (!lid && lista.length) { lid = String(lista[0].id); setLocalId(lid); }
      }
      const d = await api(lid ? `/api/zonas?localId=${lid}` : '/api/zonas');
      setZones(d.zonas || []);
      setError('');
    } catch (e) { setError(e.message); }
  }, [admin, localId]);
  useEffect(() => { load(); }, [load]);
  const [tipo, setTipo] = useState('PDV');
  async function crear(e) {
    e.preventDefault();
    const n = Number(numero);
    if (!Number.isInteger(n) || n <= 0) return setError('Escribe un número de zona válido.');
    setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/zonas', { method: 'POST', body: JSON.stringify({ localId: Number(localId), numero: n, nombre: nombre.trim() || undefined, tipo }) });
      setNotice(`Zona ${n} creada.`); setNumero(''); setNombre(''); setTipo('PDV'); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function eliminarZona(z) {
    if (!confirm(`¿Eliminar la zona ${z.numero}${z.nombre ? ' - ' + z.nombre : ''}? Esta acción no se puede deshacer.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/zonas/${z.id}`, { method: 'DELETE' });
      setNotice(`Zona ${z.numero} eliminada.`); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function crearLote(e) {
    e.preventDefault();
    const d = Number(desde), h = Number(hasta);
    if (!Number.isInteger(d) || !Number.isInteger(h) || d <= 0 || h < d) return setError('Rango inválido: revisa desde/hasta.');
    setBusy(true); setError(''); setNotice('');
    try {
      const r = await api('/api/zonas/lote', { method: 'POST', body: JSON.stringify({ localId: Number(localId), desde: d, hasta: h, tipo: tipoLote }) });
      setNotice(`${r.mensaje} Tipo: ${tipoLote === 'BODEGA' ? 'Bodega / Almacén' : 'Punto de Venta (PDV)'}.`);
      setDesde(''); setHasta(''); setTipoLote('PDV'); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const filtro = q.trim().toLowerCase();
  const visibles = filtro ? zones.filter(z => String(z.numero).includes(filtro) || (z.nombre || '').toLowerCase().includes(filtro)) : zones;
  const localActual = locales.find(l => String(l.id) === String(localId));
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">ORGANIZACIÓN</p><h1>Zonas</h1><p className="muted">Las zonas (estantes) se definen por local y no vienen en el Excel.</p></div><button className="btn secondary" onClick={load}><RefreshCw size={16}/> Actualizar</button></div>
    {error && <Notice type="error" message={error} onClose={() => setError('')}/>}
    {notice && <Notice message={notice} onClose={() => setNotice('')}/>}
    {admin && <Card>
      <div className="card-heading"><div><h2>Agregar zonas</h2><p className="muted">{localActual ? `Local: ${localActual.nombre}` : 'Selecciona un local'}</p></div><div className="heading-icon"><Warehouse/></div></div>
      <div className="two-column">
        <form className="form-stack" onSubmit={crear}>
          <label>Número de zona<input data-testid="zona-numero" type="number" min="1" value={numero} onChange={e => setNumero(e.target.value)} placeholder="Ej. 5" required/></label>
          <label>Nombre <span className="optional">(opcional)</span><input data-testid="zona-nombre" value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej. Estante pasillo 2" maxLength={100}/></label>
          <label>Tipo de zona
            <select data-testid="zona-tipo" value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="PDV">Punto de Venta (PDV)</option>
              <option value="BODEGA">Bodega / Almacén</option>
            </select>
          </label>
          <button className="btn primary full" data-testid="crear-zona" disabled={busy || !localId}><Plus size={17}/> Agregar una zona</button>
        </form>
        <form className="form-stack" onSubmit={crearLote}>
          <div className="field-row"><label>Desde<input data-testid="rango-desde" type="number" min="1" value={desde} onChange={e => setDesde(e.target.value)} placeholder="1" required/></label><label>Hasta<input data-testid="rango-hasta" type="number" min="1" value={hasta} onChange={e => setHasta(e.target.value)} placeholder="390" required/></label></div>
          <label>Tipo de zona para el rango
            <select data-testid="rango-tipo" value={tipoLote} onChange={e => setTipoLote(e.target.value)}>
              <option value="PDV">Punto de Venta (PDV)</option>
              <option value="BODEGA">Bodega / Almacén</option>
            </select>
          </label>
          <div className="hint-box"><CircleHelp size={17}/><span>Útil para crear muchas zonas de una vez (ej. 1 a 390) todas con el mismo tipo. No duplica las que ya existen.</span></div>
          <button className="btn secondary full" data-testid="crear-rango" disabled={busy || !localId}><Plus size={17}/> Agregar por rango</button>
        </form>
      </div>
    </Card>}
    <Card>
      <div className="card-heading"><div><h2>Zonas {localActual ? `de ${localActual.nombre}` : 'del local activo'}</h2><p className="muted">{zones.length} zonas registradas.</p></div></div>
      {zones.length > 8 && <div className="search-box"><PackageSearch size={17}/><input data-testid="buscar-zona" value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar zona por número o nombre…" inputMode="numeric"/><span className="search-count">{visibles.length}</span></div>}
      {zones.length ? (visibles.length ? <div className="zone-grid">{visibles.map(z => <div className="zone-card" data-testid="zona-card" data-numero={z.numero} data-tipo={(z.tipo||'PDV')} key={z.id}><div className="zone-card-top"><div className="zone-number" style={{ background: (z.tipo||'PDV') === 'BODEGA' ? '#075985' : undefined }}>{String(z.numero).padStart(2,'0')}</div><div><b>{`Zona ${z.numero}`}</b><span>Zona #{z.numero} · {(z.tipo||'PDV') === 'BODEGA' ? 'BODEGA' : 'PDV'}</span></div></div>{admin && <div className="zone-actions"><button className="icon-btn danger" data-testid="eliminar-zona" title="Eliminar zona" onClick={() => eliminarZona(z)}><Trash2 size={16}/></button></div>}</div>)}</div> : <p className="empty-inline">No hay zonas que coincidan con "{q}".</p>) : <Empty icon={Warehouse} title="Sin zonas en este local" text={admin ? 'Agrega la primera zona arriba.' : 'Pide a la administradora que cree las zonas del local.'}/>}
    </Card>
  </div>;
}

export default Zones;
