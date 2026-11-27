import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Activity, AlertTriangle, Barcode, Boxes, CheckCircle2, CircleHelp, ClipboardList, FileSpreadsheet, PackageSearch, RefreshCw, Store, Users, Warehouse } from 'lucide-react';
import { api } from '../lib/api.js';
import { colorForUser } from '../lib/avatar.js';
import { tiempoHace } from '../lib/fechas.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Stat from '../components/Stat.jsx';
import Empty from '../components/Empty.jsx';
import ReferenciaCodigos from '../components/ReferenciaCodigos.jsx';
import NovedadesPanel from '../components/NovedadesPanel.jsx';

// Nombre de una persona con su color de identificación (el que le puso la
// administradora, o uno estable derivado de su id).
function NombreColor({ usuario, nombre, color }) {
  const c = colorForUser(usuario || { nombre, color });
  return <span className="nombre-color" style={{ background: c.bg, color: c.fg }}>{nombre || usuario?.nombre || '—'}</span>;
}

function MonitoreoZonas({ local }) {
  const [zonas, setZonas] = useState([]);
  const [zonaSel, setZonaSel] = useState(null);
  const [sesiones, setSesiones] = useState([]);
  const [porZona, setPorZona] = useState([]);
  const [eventos, setEventos] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [, setTick] = useState(0);
  const [zonasAvance, setZonasAvance] = useState([]);
  const [comparativo, setComparativo] = useState(null);
  const [novedades, setNovedades] = useState([]);
  const [qRef, setQRef] = useState('');
  const [refSel, setRefSel] = useState('');
  const historicoCargado = useRef(new Set());
  // Por defecto el cuadro Referencias x Zona solo lista lo que ya se contó;
  // con el botón se puede ver el maestro completo.
  const [soloContadas, setSoloContadas] = useState(true);
  // La sección Monitoreo se divide en tres pestañas para que no todo quede
  // apilado en una sola pantalla: avance general, vivo de una zona y búsqueda.
  const [tab, setTab] = useState('avance');
  const [usuarioSel, setUsuarioSel] = useState('');
  const [detalleUsuario, setDetalleUsuario] = useState(null);
  const [cargandoUsuario, setCargandoUsuario] = useState(false);
  const [usuariosLista, setUsuariosLista] = useState([]);
  const [zonaSelUsuario, setZonaSelUsuario] = useState(null);
  const [productosZonaUsuario, setProductosZonaUsuario] = useState([]);
  const [cargandoZonaUsuario, setCargandoZonaUsuario] = useState(false);
  // Carga rápida: zonas y actividad en vivo (barata). Se repite cada 20 s.
  const loadRapido = useCallback(async () => {
    if (!local?.id) return;
    try {
      const [z, a] = await Promise.all([
        api(`/api/zonas?localId=${local.id}`),
        api(`/api/zonas/actividad?localId=${local.id}`),
      ]);
      setZonas(z.zonas || []);
      setSesiones(a.sesiones || []);
      setPorZona(a.porZona || []);
      setZonasAvance(a.zonas || []);
      setZonaSel((prev) => {
        if (prev) return prev;
        const basicas = z.zonas || [];
        if (!basicas.length) return null;
        const avance = a.zonas || [];
        const enConteo = avance.find((x) => x.enConteo);
        const conActividad = avance
          .filter((x) => x.ultimoEscaneo)
          .sort((x, y) => new Date(y.ultimoEscaneo) - new Date(x.ultimoEscaneo));
        const candidato = enConteo || conActividad[0];
        const elegido = candidato ? basicas.find((b) => b.id === candidato.id) : null;
        return elegido || basicas[0];
      });
      setError('');
    } catch (e) { setError(e.message); }
  }, [local?.id]);
  // Carga pesada: comparativo completo. Solo al montar, al cambiar a "Buscar"
  // y con el botón Actualizar, para no descargar miles de filas cada 20 s.
  const loadComparativo = useCallback(async () => {
    if (!local?.id) return;
    try {
      const c = await api(`/api/inventarios/comparativo?localId=${local.id}`);
      setComparativo(c || null);
      if (c?.inventario?.id) {
        const n = await api(`/api/escaneos/novedades?inventarioId=${c.inventario.id}`);
        setNovedades(n?.novedades || []);
      } else setNovedades([]);
    } catch (e) { setError(e.message); }
  }, [local?.id]);
  const load = useCallback(async () => {
    if (!local?.id) return;
    setLoading(true);
    await Promise.all([loadRapido(), loadComparativo()]);
    setLoading(false);
  }, [loadRapido, loadComparativo]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const t = setInterval(loadRapido, 20000); return () => clearInterval(t); }, [loadRapido]);
  useEffect(() => { if (tab === 'buscar' && !comparativo) loadComparativo(); }, [tab, comparativo, loadComparativo]);
  useEffect(() => { api('/api/auth/usuarios').then((d) => setUsuariosLista(d.usuarios || [])).catch(() => {}); }, []);
  useEffect(() => {
    if (tab !== 'usuario' || !usuarioSel || !comparativo?.inventario?.id) { setDetalleUsuario(null); return; }
    setZonaSelUsuario(null);
    setProductosZonaUsuario([]);
    setCargandoUsuario(true);
    api(`/api/escaneos/usuario?inventarioId=${comparativo.inventario.id}&usuarioId=${usuarioSel}`)
      .then((d) => setDetalleUsuario(d))
      .catch((e) => setError(e.message))
      .finally(() => setCargandoUsuario(false));
  }, [tab, usuarioSel, comparativo?.inventario?.id]);
  useEffect(() => {
    if (!zonaSelUsuario || !comparativo?.inventario?.id || !usuarioSel) { setProductosZonaUsuario([]); return; }
    setCargandoZonaUsuario(true);
    api(`/api/escaneos/usuario-zona?inventarioId=${comparativo.inventario.id}&usuarioId=${usuarioSel}&zonaId=${zonaSelUsuario}`)
      .then((d) => setProductosZonaUsuario(d.productos || []))
      .catch((e) => setError(e.message))
      .finally(() => setCargandoZonaUsuario(false));
  }, [zonaSelUsuario, comparativo?.inventario?.id, usuarioSel]);
  useEffect(() => { const t = setInterval(() => setTick((v) => v + 1), 10000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const handler = (e) => {
      const ev = e.detail;
      if (!ev || (ev.tipo !== 'escaneo' && ev.tipo !== 'escaneo_eliminado')) return;
      if (local?.id && ev.localId && ev.localId !== local.id) return;
      setEventos((prev) => [ev, ...prev].slice(0, 200));
    };
    window.addEventListener('levis:realtime', handler);
    return () => window.removeEventListener('levis:realtime', handler);
  }, [local?.id]);
  // Carga el histórico de escaneos de la zona seleccionada para que el feed
  // "En vivo" no arranque vacío. Solo se trae una vez por zona.
  useEffect(() => {
    if (!zonaSel?.id) return;
    if (historicoCargado.current.has(zonaSel.id)) return;
    historicoCargado.current.add(zonaSel.id);
    api(`/api/escaneos/recientes?zonaId=${zonaSel.id}&limit=50`)
      .then((r) => {
        const items = r?.escaneos || [];
        setEventos((prev) => {
          const seen = new Set(prev.map((e) => `${e.fecha || e.leidoEn}-${e.barcode || e.codigoBarras}`));
          const nuevos = items.filter((e) => !seen.has(`${e.fecha || e.leidoEn}-${e.barcode || e.codigoBarras}`));
          return [...nuevos, ...prev].slice(0, 200);
        });
      })
      .catch(() => {});
  }, [zonaSel?.id]);
  const eventosZona = useMemo(() => {
    if (!zonaSel) return [];
    return eventos.filter((ev) => (ev.zonaId && ev.zonaId === zonaSel.id) || (ev.zonaNumero && ev.zonaNumero === zonaSel.numero));
  }, [eventos, zonaSel]);
  const resumenPorRef = useMemo(() => {
    const map = new Map();
    for (const ev of eventosZona) {
      const key = (ev.referencia || '').trim() || 'SIN REFERENCIA';
      const cur = map.get(key) || { referencia: key, descripcion: ev.descripcion || '', total: 0, unicos: new Set() };
      cur.total += ev.cantidad || 1;
      const cod = ev.barcode || ev.codigoBarras;
      if (cod) cur.unicos.add(cod);
      if (!cur.descripcion && ev.descripcion) cur.descripcion = ev.descripcion;
      map.set(key, cur);
    }
    return Array.from(map.values()).map((x) => ({ ...x, unicos: x.unicos.size })).sort((a, b) => b.total - a.total);
  }, [eventosZona]);
  const ultimo = eventosZona[0] || null;
  const statZona = useMemo(() => porZona.find((p) => p.zonaId === zonaSel?.id) || null, [porZona, zonaSel]);
  const actividadZona = useMemo(() => eventosZona.reduce((s, e) => s + (e.cantidad || 1), 0), [eventosZona]);
  const codigosZona = useMemo(() => new Set(eventosZona.map((e) => e.barcode || e.codigoBarras)), [eventosZona]);
  const totalUnidades = ultimo?.totalEnZona ?? statZona?.unidades ?? actividadZona;
  const totalUnicos = ultimo?.totalUnicosEnZona ?? statZona?.unicos ?? codigosZona.size;
  const sesionesZona = useMemo(() => sesiones.filter((s) => s.zona?.id === zonaSel?.id), [sesiones, zonaSel]);
  // Datos de avance de la zona seleccionada: de ahí salen el primer código
  // escaneado y la hora en que se leyó por primera vez.
  const infoZonaSel = useMemo(() => zonasAvance.find((z) => z.id === zonaSel?.id) || null, [zonasAvance, zonaSel]);

  // Zonas terminadas (la sesión ya se cerró o tienen conteo cerrado), faltantes
  // (todavía sin contar) y las que están en conteo en este momento.
  const zonasTerminadas = useMemo(() => zonasAvance.filter((z) => z.terminada), [zonasAvance]);
  const zonasFaltantes = useMemo(() => zonasAvance.filter((z) => !z.terminada && !z.enConteo), [zonasAvance]);
  const zonasEnConteo = useMemo(() => zonasAvance.filter((z) => z.enConteo), [zonasAvance]);

  // Tocar una zona en la pestaña Avance lleva directo al vivo de esa zona.
  const abrirZona = (z) => {
    const completa = zonas.find((x) => x.id === z.id) || z;
    if (completa) setZonaSel(completa);
    setTab('vivo');
  };

  // Explorador por referencia: agrupa los códigos del maestro bajo su referencia y
  // compara contra el conteo. Muestra la talla (detalle1/detalle2) solo si el maestro la trae,
  // por eso funciona igual en locales con menos columnas.
  const productosComp = comparativo?.productos || [];
  const refsComp = comparativo?.productosPorReferencia || [];
  const manejaTallas = useMemo(() => productosComp.some((p) => p.detalle1 || p.detalle2), [productosComp]);
  const refsFiltradas = useMemo(() => {
    const t = qRef.trim().toLowerCase();
    if (!t) return refsComp;
    const coincide = refsComp.filter((r) => (r.referencia || '').toLowerCase().includes(t) || (r.descripcion || '').toLowerCase().includes(t));
    // El código exacto y los que empiezan igual van primero, así no se cuelan
    // coincidencias por descripción cuando se busca una referencia puntual.
    const rango = (r) => {
      const ref = (r.referencia || '').toLowerCase();
      return ref === t ? 0 : ref.startsWith(t) ? 1 : ref.includes(t) ? 2 : 3;
    };
    return [...coincide].sort((a, b) => rango(a) - rango(b));
  }, [refsComp, qRef]);
  const refSelResumen = useMemo(() => refsComp.find((r) => r.referencia === refSel) || null, [refsComp, refSel]);

  // Cruce referencia x zona: qué zonas escanearon cada referencia y con cuántas
  // unidades, junto con el total del maestro y el total contado.
  const refXZona = useMemo(() => {
    const mapa = comparativo?.zonasPorReferencia || {};
    const filas = refsFiltradas
      .map((r) => ({ ...r, zonas: mapa[r.referencia] || [] }))
      .filter((r) => !soloContadas || r.zonas.length > 0);
    return [...filas].sort((a, b) => (b.contado || 0) - (a.contado || 0));
  }, [refsFiltradas, comparativo, soloContadas]);
  const zonasConConteo = useMemo(() => {
    const set = new Set();
    for (const r of refXZona) for (const z of r.zonas) set.add(z.zonaId);
    return set.size;
  }, [refXZona]);
  const maestroRefXZona = useMemo(() => refXZona.reduce((s, r) => s + (r.existencia || 0), 0), [refXZona]);
  const contadoRefXZona = useMemo(() => refXZona.reduce((s, r) => s + (r.contado || 0), 0), [refXZona]);

  return <div className="page-stack">
    <div className="page-heading">
      <div><p className="eyebrow">MONITOREO EN VIVO</p><h1>Quién está escaneando y qué</h1><p className="muted">Avance del conteo, actividad en vivo por zona y búsqueda por referencia. Se actualiza al instante con cada lectura.</p></div>
      <div className="heading-actions"><button className="btn secondary" onClick={load}><RefreshCw size={16}/> Actualizar</button></div>
    </div>
    {error && <Notice type="error" message={error} onClose={() => setError('')} />}

    <div className="tabs">
      <button type="button" data-testid="tab-avance" className={tab === 'avance' ? 'active' : ''} onClick={() => setTab('avance')}><ClipboardList size={16}/> Avance</button>
      <button type="button" data-testid="tab-vivo" className={tab === 'vivo' ? 'active' : ''} onClick={() => setTab('vivo')}><Activity size={16}/> En vivo</button>
      <button type="button" data-testid="tab-buscar" className={tab === 'buscar' ? 'active' : ''} onClick={() => setTab('buscar')}><PackageSearch size={16}/> Buscar</button>
      <button type="button" data-testid="tab-usuario" className={tab === 'usuario' ? 'active' : ''} onClick={() => setTab('usuario')}><Users size={16}/> Por usuario</button>
      <button type="button" data-testid="tab-na" className={tab === 'na' ? 'active' : ''} onClick={() => setTab('na')}><AlertTriangle size={16}/> N/A</button>
    </div>

    {loading ? <Card><div className="loading-inline"><span className="spinner"/> Cargando zonas…</div></Card> : <>

      {/* ============ PESTAÑA 1: AVANCE ============ */}
      {tab === 'avance' && <>
        {zonasAvance.length === 0 ? <Empty icon={Warehouse} title="No hay zonas" text="Crea zonas para este local en la sección Zonas." /> : <>
          <Card>
            <div className="card-heading">
              <div><h3>Avance del conteo</h3><p className="muted">Zonas terminadas, pendientes y en conteo de este local. Actualización en vivo.</p></div>
              <span className="live-tag"><span className="status-dot"/> EN VIVO</span>
            </div>
            <div className="stats-grid">
              <Stat icon={Warehouse} label="Zonas del local" value={zonasAvance.length.toLocaleString('es-CO')} sub="Total de zonas" />
              <Stat icon={CheckCircle2} label="Terminadas" value={zonasTerminadas.length.toLocaleString('es-CO')} sub="Con conteo registrado" />
              <Stat icon={AlertTriangle} label="Faltantes" value={zonasFaltantes.length.toLocaleString('es-CO')} sub="Sin ninguna lectura" />
              <Stat icon={Activity} label="En conteo ahora" value={zonasEnConteo.length.toLocaleString('es-CO')} sub="Con sesión abierta" />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 18, marginTop: 8 }}>
              <Card>
                <div className="card-heading"><div><h3>Terminadas ({zonasTerminadas.length})</h3><p className="muted">Zonas que ya tienen productos contados.</p></div></div>
                {zonasTerminadas.length === 0 ? <p className="empty-inline">Aún no hay zonas con conteo.</p> : (
                  <div className="zone-grid" style={{ maxHeight: 420, overflowY: 'auto' }}>{zonasTerminadas.map((z) => <button key={z.id} type="button" data-testid="zona-terminada" data-numero={z.numero} className={`zone-card zone-pick ${zonaSel?.id === z.id ? 'active' : ''}`} onClick={() => abrirZona(z)}>
                    <div className="zone-card-top"><div className="zone-number" style={{ background: z.tipo === 'BODEGA' ? '#075985' : 'var(--green, #16804a)', color: '#fff' }}>{String(z.numero).padStart(2, '0')}</div><div><b>{`Zona ${z.numero}`} <span className="badge" style={{ background: z.tipo === 'BODEGA' ? '#e0f2fe' : '#dcfce7', color: z.tipo === 'BODEGA' ? '#075985' : '#166534' }}>{z.tipo === 'BODEGA' ? 'BODEGA' : 'PDV'}</span></b><span>{z.unidades.toLocaleString('es-CO')} unidades · {z.unicos} códigos</span></div></div>
                    {(z.primerCodigo || z.ultimoCodigo) && <div className="zone-codigos">
                      <span title="Primer código escaneado">1º <b className="mono">{z.primerCodigo || '—'}</b></span>
                      <span title="Último código escaneado">Últ. <b className="mono">{z.ultimoCodigo || '—'}</b></span>
                    </div>}
                    {z.enConteo && <span className="live-tag"><span className="status-dot"/> En conteo</span>}
                  </button>)}
                  </div>
                )}
              </Card>
              <Card>
                <div className="card-heading"><div><h3>Faltantes ({zonasFaltantes.length})</h3><p className="muted">Zonas sin ninguna lectura todavía.</p></div></div>
                {zonasFaltantes.length === 0 ? <p className="empty-inline">¡Todas las zonas tienen conteo!</p> : (
                  <div className="zone-grid" style={{ maxHeight: 420, overflowY: 'auto' }}>{zonasFaltantes.map((z) => <button key={z.id} type="button" data-testid="zona-faltante" data-numero={z.numero} className={`zone-card zone-pick ${zonaSel?.id === z.id ? 'active' : ''}`} onClick={() => abrirZona(z)}>
                    <div className="zone-card-top"><div className="zone-number" style={{ background: z.tipo === 'BODEGA' ? '#075985' : 'var(--amber, #a65c0b)', color: '#fff' }}>{String(z.numero).padStart(2, '0')}</div><div><b>{`Zona ${z.numero}`} <span className="badge" style={{ background: z.tipo === 'BODEGA' ? '#e0f2fe' : '#dcfce7', color: z.tipo === 'BODEGA' ? '#075985' : '#166534' }}>{z.tipo === 'BODEGA' ? 'BODEGA' : 'PDV'}</span></b><span>Pendiente de conteo</span></div></div>
                    {z.enConteo && <span className="live-tag"><span className="status-dot"/> En conteo</span>}
                  </button>)}</div>
                )}
              </Card>
            </div>
          </Card>
          <Card>
            <div className="card-heading"><div><h3>Zonas en conteo</h3><p className="muted">Sesiones abiertas en este local. Toca una fila para ver su vivo.</p></div></div>
            {sesiones.length === 0 ? <Empty icon={Warehouse} title="Sin zonas abiertas" text="Ningún empleado ha seleccionado una zona todavía." /> : (
              <div className="table-wrap"><table>
                <thead><tr><th>Zona</th><th>Empleado</th><th>Estado</th><th className="num">Unidades</th><th>Último escaneo</th><th>1º / Últ. código</th></tr></thead>
                <tbody>{sesiones.map((s) => { const p = porZona.find((x) => x.zonaId === s.zona?.id); const av = zonasAvance.find((z) => z.id === s.zona?.id); return <tr key={s.id} data-testid="sesion-fila" style={{ cursor: 'pointer' }} onClick={() => { if (s.zona) abrirZona(s.zona); }}>
                  <td><b>{s.zona?.numero} - {s.zona?.nombre || `Zona ${s.zona?.numero}`}</b> {av?.tipo === 'BODEGA' ? <span className="badge" style={{ marginLeft: 6, background: '#e0f2fe', color: '#075985' }}>BODEGA</span> : <span className="badge" style={{ marginLeft: 6, background: '#dcfce7', color: '#166534' }}>PDV</span>}</td>
                  <td><NombreColor usuario={s.usuario} /></td>
                  <td><span className="live-tag"><span className="status-dot"/> En conteo</span></td>
                  <td className="num">{(p?.unidades || 0).toLocaleString('es-CO')}</td>
                  <td className="muted">{p?.ultimoEscaneo ? tiempoHace(p.ultimoEscaneo) : 'Sin lecturas'}</td>
                  <td>{av?.primerCodigo ? <div className="zone-codigos codigos-stack">
                    <span>1º <b className="mono">{av.primerCodigo}</b></span>
                    <span>Últ. <b className="mono">{av.ultimoCodigo || '—'}</b></span>
                  </div> : <span className="muted">Sin lecturas</span>}</td>
                </tr>; })}</tbody>
              </table></div>
            )}
          </Card>
        </>}
      </>}

      {/* ============ PESTAÑA 2: EN VIVO ============ */}


      {tab === 'usuario' && (
        <Card>
          <div className="card-heading">
            <div><h3>Detalle por usuario</h3><p className="muted">Selecciona un usuario para ver su zona actual, las zonas que escaneo y los productos que registro.</p></div>
          </div>
          {!comparativo?.inventario ? (
            <Empty icon={FileSpreadsheet} title="No hay inventario activo" text="Importa y activa el archivo maestra del local." />
          ) : (
            <>
              <div className="user-chip-list">
                {usuariosLista.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className={`user-chip ${String(usuarioSel) === String(u.id) ? 'active' : ''}`}
                    onClick={() => setUsuarioSel(String(u.id))}
                  >
                    {u.nombre}
                  </button>
                ))}
              </div>
              {cargandoUsuario && <p className="muted">Cargando...</p>}
              {detalleUsuario && (
                <>
                  <div className="stats-grid">
                    <Stat icon={Activity} label="Zona actual" value={detalleUsuario.zonaActiva ? 'Zona ' + detalleUsuario.zonaActiva.numero : 'Sin zona'} sub={detalleUsuario.zonaActiva ? detalleUsuario.zonaActiva.nombre || 'No tiene zona seleccionada' : 'No tiene zona seleccionada'} />
                    <Stat icon={Boxes} label="Unidades" value={detalleUsuario.totales.unidades.toLocaleString('es-CO')} sub="Registradas por este usuario" />
                    <Stat icon={PackageSearch} label="Códigos distintos" value={detalleUsuario.totales.productosDistintos.toLocaleString('es-CO')} sub="Codigos diferentes" />
                  </div>
                  {detalleUsuario.zonas.length > 0 && (
                    <Card>
                      <div className="card-heading"><div><h3>Zonas escaneadas</h3></div></div>
                      <div className="table-wrap">
                        <table>
                          <thead><tr><th>Zona</th><th>Unidades</th><th>Primera lectura</th><th>Ultima lectura</th></tr></thead>
                          <tbody>
                            {detalleUsuario.zonas.map((z) => (
                              <tr key={z.zonaId} style={{ cursor: 'pointer' }} onClick={() => setZonaSelUsuario(z.zonaId)} className={zonaSelUsuario === z.zonaId ? 'row-selected' : ''}>
                                <td><b>{`Zona ${z.zona}`}</b></td>
                                <td>{z.unidades.toLocaleString('es-CO')}</td>
                                <td>{z.primeraLectura ? new Date(z.primeraLectura).toLocaleString('es-CO') : '-'}</td>
                                <td>{z.ultimaLectura ? new Date(z.ultimaLectura).toLocaleString('es-CO') : '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>
                  )}
                  {zonaSelUsuario && (
                    <Card>
                      <div className="card-heading"><div><h3>Productos escaneados en zona {detalleUsuario.zonas.find((z) => z.zonaId === zonaSelUsuario)?.zona}</h3></div></div>
                      {cargandoZonaUsuario ? <p className="muted">Cargando…</p> : productosZonaUsuario.length === 0 ? (
                        <p className="empty-inline">Sin productos escaneados en esta zona.</p>
                      ) : (
                        <>
                          <p className="muted small">Total escaneados en esta zona: <b>{productosZonaUsuario.length}</b></p>
                          <div className="table-wrap">
                            <table>
                              <thead><tr><th>#</th><th>Tipo</th><th>Codigo</th><th>Descripcion</th><th>Item</th><th>Cantidad</th><th>Fecha/Hora</th></tr></thead>
                              <tbody>
                                {productosZonaUsuario.map((p, i) => (
                                  <tr key={i} className={p.esNovedad ? 'row-novedad' : ''}>
                                    <td>{p.posicion}</td>
                                    <td>{p.esNovedad ? <span className="pill gray">N/A</span> : <span className="pill green">OK</span>}</td>
                                    <td className="mono">{p.codigoBarras}</td>
                                    <td>{p.descripcion || '-'}</td>
                                    <td>{p.item || '-'}</td>
                                    <td>{p.cantidad}</td>
                                    <td>{new Date(p.leidoEn).toLocaleString('es-CO')}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </>
                      )}
                    </Card>
                  )}
                  {detalleUsuario.zonas.length === 0 && (
                    <Empty icon={ClipboardList} title="Sin escaneos" text="Este usuario no ha escaneado productos en este inventario." />
                  )}
            {zonaSelUsuario && <NovedadesPanel inventarioId={comparativo?.inventario?.id} usuarioId={usuarioSel} zonaId={zonaSelUsuario} />}
                </>
              )}
            </>
          )}
        </Card>
      )}
      {tab === 'na' && (
        <Card>
          <div className="card-heading">
            <div><h3>Novedades (N/A)</h3><p className="muted">Todos los productos escaneados que no pertenecen al inventario activo (sobrantes o trocados).</p></div>
          </div>
          <NovedadesPanel inventarioId={comparativo?.inventario?.id} />
        </Card>
      )}
      {tab === 'vivo' && <Card>
        <div className="card-heading">
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="muted">Local</span><div className="selected-zone"><Store size={16}/><span>{local?.nombre}</span></div></label>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}><span className="muted">Zona</span>
              <select data-testid="zona-vivo-select" value={zonaSel?.id || ''} onChange={(e) => setZonaSel(zonas.find((z) => z.id === Number(e.target.value)) || null)}>
                {zonas.map((z) => <option key={z.id} value={z.id}>{z.numero} - {`Zona ${z.numero}`}</option>)}
              </select>
            </label>
            {zonaSel && <span className="live-tag"><span className="status-dot"/> EN VIVO</span>}
          </div>
        </div>
        {!zonaSel ? <Empty icon={Warehouse} title="No hay zonas" text="Crea zonas para este local en la sección Zonas." /> : <>
          <div className="stats-grid">
            <Stat icon={Users} label="Usuario escaneando" value={sesionesZona.length ? <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{sesionesZona.map((s) => <NombreColor key={s.id} usuario={s.usuario} />)}</div> : 'Sin actividad'} sub={sesionesZona.length ? (sesionesZona.length === 1 ? (sesionesZona[0].usuario?.rol === 'ADMINISTRADORA' ? 'Administradora' : 'Empleado') : `${sesionesZona.length} empleados en esta zona`) : 'Nadie tiene esta zona abierta'} />
            <Stat icon={Activity} label="Último escaneo" value={ultimo ? tiempoHace(ultimo.fecha || ultimo.leidoEn) : (statZona?.ultimoEscaneo ? tiempoHace(statZona.ultimoEscaneo) : 'Sin escaneos')} sub={ultimo ? (ultimo.barcode || ultimo.codigoBarras) : 'Esperando lectura'} />
            <Stat icon={ClipboardList} label="Primer código" value={<span className="mono" style={{ fontSize: '.92rem' }}>{infoZonaSel?.primerCodigo || 'Sin lecturas'}</span>} sub={infoZonaSel?.primerEscaneo ? `Primera lectura ${tiempoHace(infoZonaSel.primerEscaneo)}` : 'Esta zona todavía no tiene lecturas'} />
            <Stat icon={Barcode} label="Escaneados en zona" value={(totalUnidades || 0).toLocaleString('es-CO')} sub={`${(totalUnicos || 0).toLocaleString('es-CO')} códigos únicos`} />
            <Stat icon={Boxes} label="Referencias distintas" value={resumenPorRef.length.toLocaleString('es-CO')} sub="Agrupadas por referencia" />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginTop: 8 }}>
            <Card>
              <div className="card-heading"><div><h3>Actividad en vivo</h3><p className="muted">Últimos escaneos en esta zona ({eventosZona.length})</p></div></div>
              {eventosZona.length === 0 ? <Empty icon={ClipboardList} title="Sin actividad" text="Aún no se ha escaneado ningún producto en esta zona." /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
                  {eventosZona.map((ev, i) => {
                    const ref = ev.referencia || '';
                    const when = new Date(ev.fecha || ev.leidoEn);
                    return <div key={`${ev.fecha || ev.leidoEn}-${i}`} style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2, rgba(0,0,0,0.03))', border: '1px solid var(--border, #e5e7eb)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <span className="muted" style={{ fontSize: 13 }}>{when.toLocaleTimeString('es-CO')}</span>
                            <NombreColor usuario={{ id: ev.usuarioId, nombre: ev.usuario || 'Empleado', color: ev.usuarioColor }} />
                            <span className="estado-badge ok">+{ev.cantidad || 1}</span>
                          </div>
                          <div style={{ fontSize: 14, lineHeight: 1.35 }}><span className="mono">{ev.barcode || ev.codigoBarras}</span>{ref && <span style={{ marginLeft: 6, color: 'var(--primary)' }}>· REF: {ref}</span>}</div>
                          <div className="muted" style={{ fontSize: 13 }}>{ev.descripcion || 'Sin descripción'}</div>
                        </div>
                        <div className="muted" style={{ textAlign: 'right', fontSize: 12 }}>
                          <div>Total en zona: <b>{ev.totalEnZona?.toLocaleString('es-CO')}</b></div>
                          <div>Únicos: <b>{ev.totalUnicosEnZona?.toLocaleString('es-CO')}</b></div>
                        </div>
                      </div>
                    </div>;
                  })}
                </div>
              )}
            </Card>
            <Card>
              <div className="card-heading"><div><h3>Acumulado por referencia (en vivo)</h3><p className="muted">Lecturas nuevas en esta zona desde que abriste la pantalla; el total global está en la pestaña Buscar.</p></div></div>
              {resumenPorRef.length === 0 ? <Empty icon={PackageSearch} title="Sin datos" text="Esta zona todavía no tiene escaneos registrados." /> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Referencia</th><th>Descripción</th><th className="num">Escaneados</th><th className="num">Únicos</th></tr></thead>
                  <tbody>{resumenPorRef.map((r) => <tr key={r.referencia}>
                    <td><b>{r.referencia}</b></td>
                    <td>{r.descripcion || '—'}</td>
                    <td className="num">{r.total.toLocaleString('es-CO')}</td>
                    <td className="num">{r.unicos.toLocaleString('es-CO')}</td>
                  </tr>)}</tbody>
                </table></div>
              )}
            </Card>
          </div>
        </>}
      </Card>}

      {/* ============ PESTAÑA 3: BUSCAR ============ */}
      {tab === 'buscar' && <Card>
        <div className="card-heading">
          <div><h3>Buscar por referencia</h3><p className="muted">Elige una referencia y revisa el detalle de cada código de barras (maestro vs. contado){manejaTallas ? ', incluida la talla' : ''}.</p></div>
          {comparativo?.inventario ? <span className="pill green">{comparativo.inventario.estado}</span> : <span className="pill gray">SIN INVENTARIO</span>}
        </div>
        {!comparativo?.inventario ? <Empty icon={FileSpreadsheet} title="No hay inventario activo" text="Importa y activa el archivo maestra del local desde la sección Inventarios."/> : <>
          <div className="search-box"><PackageSearch size={17}/><input data-testid="buscar-referencia" value={qRef} onChange={(e) => setQRef(e.target.value)} placeholder="Buscar por referencia o descripción…"/><span className="search-count">{refsFiltradas.length}</span></div>
          {!manejaTallas && <div className="hint-box"><CircleHelp size={17}/><span>Este local no trae columnas de talla en su maestra; se muestra el detalle por código de barras.</span></div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 18, marginTop: 8 }}>
            <Card>
              <div className="card-heading"><div><h3>Referencias ({refsFiltradas.length})</h3><p className="muted">Toca una para ver sus códigos y tallas.</p></div></div>
              {refsFiltradas.length === 0 ? <p className="empty-inline">No hay referencias que coincidan con "{qRef}".</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
                  {refsFiltradas.slice(0, 300).map((r) => <button key={r.referencia} type="button" className="user-row" style={{ textAlign: 'left', cursor: 'pointer', border: r.referencia === refSel ? '1px solid var(--red)' : '1px solid #eceef2', background: r.referencia === refSel ? '#fdf0f3' : '#fff' }} onClick={() => setRefSel(r.referencia)}>
                    <div className="user-row-info"><b>{r.referencia}</b><span>{r.descripcion || 'Sin descripción'}{r.estilo ? ` · ${r.estilo}` : ''}</span></div>
                    <span className={`estado-badge ${(r.estado || '').toLowerCase().replace(' ', '-')}`}>{r.estado}</span>
                  </button>)}
                </div>
              )}
              {refsFiltradas.length > 300 && <p className="muted small">Mostrando las primeras 300 de {refsFiltradas.length} referencias. Usa la búsqueda para acotar.</p>}
            </Card>
            <Card>
              <div className="card-heading"><div><h3>{refSel ? `Códigos de ${refSel}` : 'Detalle por código de barras'}</h3><p className="muted">{refSelResumen ? `${(refSelResumen.contado || 0).toLocaleString('es-CO')} contadas de ${(refSelResumen.existencia || 0).toLocaleString('es-CO')} en la maestra · ${refSelResumen.productos} código(s)` : 'Selecciona una referencia de la lista'}</p></div></div>
              {!refSel ? <Empty icon={PackageSearch} title="Sin referencia seleccionada" text="Elige una referencia para ver el detalle de sus tallas y códigos de barras."/> : <ReferenciaCodigos productos={productosComp} referencia={refSel} manejaTallas={manejaTallas} />}
            </Card>
          </div>

          {/* Cruce referencia x zona: en el maestro hay tantas, en total se
              contaron tantas y en qué zonas se escaneó cada una. */}
          <Card>
            <div className="card-heading">
              <div><h3>Referencias x Zona</h3><p className="muted">Por referencia: cuántas hay en la maestra, cuántas se contaron en total y en qué zonas se escaneó.</p></div>
              <button type="button" className={`btn small-btn ${soloContadas ? 'primary' : 'secondary'}`} onClick={() => setSoloContadas((v) => !v)}>{soloContadas ? 'Solo contadas' : 'Todas las referencias'}</button>
            </div>
            <div className="stats-grid">
              <Stat icon={Boxes} label="En la maestra" value={maestroRefXZona.toLocaleString('es-CO')} sub={`${refXZona.length.toLocaleString('es-CO')} referencias`} />
              <Stat icon={Barcode} label="Contadas en total" value={contadoRefXZona.toLocaleString('es-CO')} sub="Suma de todas las zonas" />
              <Stat icon={Warehouse} label="Zonas con conteo" value={zonasConConteo.toLocaleString('es-CO')} sub={`De ${(comparativo?.zonas || []).length.toLocaleString('es-CO')} del local`} />
            </div>
            {refXZona.length === 0 ? <Empty icon={PackageSearch} title="Sin referencias contadas" text="Todavía no se ha escaneado ninguna referencia en este local." /> : (
              <div className="table-wrap"><table>
                <thead><tr>
                  <th>Referencia</th><th>Descripción</th>
                  <th className="num">En la maestra</th><th className="num">Contado</th><th className="num">Dif.</th>
                  <th>Estado</th><th>Zonas escaneadas</th>
                </tr></thead>
                <tbody>{refXZona.slice(0, 300).map((r) => <tr key={r.referencia} data-testid="ref-zona-fila">
                  <td><b>{r.referencia}</b></td>
                  <td>{r.descripcion || '—'}{r.estilo ? <span className="muted"> · {r.estilo}</span> : null}</td>
                  <td className="num">{(r.existencia || 0).toLocaleString('es-CO')}</td>
                  <td className="num">{(r.contado || 0).toLocaleString('es-CO')}</td>
                  <td className={`num ${(r.diferencia || 0) < 0 ? 'dif-neg' : (r.diferencia || 0) > 0 ? 'dif-pos' : ''}`}>{(r.diferencia || 0) > 0 ? `+${r.diferencia}` : (r.diferencia || 0)}</td>
                  <td><span className={`estado-badge ${(r.estado || '').toLowerCase().replace(' ', '-')}`}>{r.estado}</span></td>
                  <td><div className="zona-chips">
                    {r.zonas.slice(0, 12).map((z) => <span key={z.zonaId} className="zona-chip" title={`Zona ${z.zona}`}>Z{z.zona} <b>{z.unidades.toLocaleString('es-CO')}</b></span>)}
                    {r.zonas.length > 12 && <span className="zona-chip">+{r.zonas.length - 12} más</span>}
                  </div></td>
                </tr>)}</tbody>
              </table></div>
            )}
            {refXZona.length > 300 && <p className="muted small">Mostrando las primeras 300 de {refXZona.length} referencias. Usa la búsqueda para acotar.</p>}
          </Card>
        </>}
      </Card>}
    </>}
  </div>;
}

export default MonitoreoZonas;
