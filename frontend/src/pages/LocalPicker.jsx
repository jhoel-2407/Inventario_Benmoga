import { useEffect, useState } from 'react';
import { ChevronRight, LogOut, PackageSearch, Store } from 'lucide-react';
import { api } from '../lib/api.js';
import { colorForUser, initials } from '../lib/avatar.js';
import Notice from '../components/Notice.jsx';
import Empty from '../components/Empty.jsx';

function LocalPicker({ user, onPick, onLogout }) {
  const [locales, setLocales] = useState([]);
  const [q, setQ] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const d = await api('/api/locales'); setLocales(d.locales || []); }
      catch (e) { setError(e.message); } finally { setLoading(false); }
    })();
  }, []);
  const filtro = q.trim().toLowerCase();
  const visibles = filtro ? locales.filter(l => l.nombre.toLowerCase().includes(filtro)) : locales;
  return <div className="picker-layout">
    <header className="picker-head">
      <div className="picker-brand"><img className="brand-logo" src="/logo-blesscard.png" alt="BLESSCARD"/><div><b>INVENTARIO</b><span>OPERACIÓN DE TIENDA</span></div></div>
      <div className="picker-user"><span>Hola, {user?.nombre}</span><button className="btn ghost small-btn" onClick={onLogout}><LogOut size={15}/> Salir</button></div>
    </header>
    <div className="picker-intro">
      <p className="eyebrow">SELECCIÓN DE LOCAL</p>
      <h1>¿En qué local vas a trabajar?</h1>
      <p className="muted">Elige la tienda donde vas a hacer el inventario. Los {locales.length || 19} locales de BENMOGA están disponibles.</p>
    </div>
    <div className="search-box"><PackageSearch size={17}/><input data-testid="buscar-local" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar local por nombre…"/><span className="search-count">{visibles.length}</span></div>
    {error && <Notice type="error" message={error} onClose={()=>setError('')}/>}
    {loading ? <div className="loading-inline"><span className="spinner"/> Cargando locales…</div> : (visibles.length ? <div className="local-grid">{visibles.map(l => {
      const c = colorForUser({ id: l.id, nombre: l.nombre });
      return <button key={l.id} type="button" className="local-card" data-testid="local-card" data-local={l.nombre} onClick={()=>onPick(l)}>
        <div className="local-card-main">
          <div className="avatar" style={{background:c.bg,color:c.fg}}>{initials(l.nombre)}</div>
          <div className="local-card-info"><b>{l.nombre}</b><span>{l._count?.zonas || 0} zonas · {l._count?.inventarios || 0} inventarios</span></div>
        </div>
        <span className={`pill ${l.inventarioActivo ? 'green' : 'gray'}`}>{l.inventarioActivo ? 'Inventario activo' : 'Sin inventario'}</span>
        <span className="zone-go"><ChevronRight size={17}/></span>
      </button>;
    })}</div> : <Empty icon={Store} title="Sin locales" text="No hay locales que coincidan con la búsqueda."/>)}
    <footer className="picker-foot">BENMOGA Y CÍA S.A.S. · Comercio de prendas de vestir y accesorios · Popayán</footer>
  </div>;
}

export default LocalPicker;
