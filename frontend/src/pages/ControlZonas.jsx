import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, Barcode, Boxes, CheckCircle2, ChevronLeft, FileSpreadsheet, PackageSearch, RefreshCw, Search, Store, Users, Warehouse } from 'lucide-react';
import { api } from '../lib/api.js';
import { colorForUser } from '../lib/avatar.js';
import { tiempoHace } from '../lib/fechas.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Stat from '../components/Stat.jsx';
import Empty from '../components/Empty.jsx';

function NombreColor({ usuario, nombre, color }) {
  const c = colorForUser(usuario || { nombre, color });
  return <span className="nombre-color" style={{ background: c.bg, color: c.fg }}>{nombre || usuario?.nombre || '—'}</span>;
}

const TIPO_LABEL = (t) => (t === 'BODEGA' ? 'Bodega' : 'PDV');

export default function ControlZonas({ local }) {
  const [zonas, setZonas] = useState([]);          // basicas
  const [avance, setAvance] = useState([]);        // con conteos
  const [porZona, setPorZona] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [zonaSel, setZonaSel] = useState(null);     // zona seleccionada (obj completo)
  const [busquedaZona, setBusquedaZona] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todas');   // todas|pdv|bodega|con|sin
  const [tab, setTab] = useState('lecturas');       // lecturas|empleados
  // detalle
  const [resumen, setResumen] = useState(null);      // { totalUnidades, totalLecturas, empleados }
  const [lecturas, setLecturas] = useState([]);     // pagina actual
  const [totalLecturas, setTotalLecturas] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [busquedaLectura, setBusquedaLectura] = useState('');
  const [filtroEmpleado, setFiltroEmpleado] = useState('');
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [detalleError, setDetalleError] = useState('');
  const [vistaMobile, setVistaMobile] = useState('lista'); // lista|detalle
  const [isDesktop, setIsDesktop] = useState(typeof window !== 'undefined' && window.innerWidth >= 900);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const handler = () => setIsDesktop(window.innerWidth >= 900);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const cargarZonas = useCallback(async () => {
    if (!local?.id) return;
    try {
      const [z, a] = await Promise.all([
        api(`/api/zonas?localId=${local.id}`),
        api(`/api/zonas/actividad?localId=${local.id}`),
      ]);
      setZonas(z.zonas || []);
      setAvance(a.zonas || []);
      setPorZona(a.porZona || []);
      setError('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }, [local?.id]);

  useEffect(() => { cargarZonas(); }, [cargarZonas]);
  // Auto-selección por parámetro de URL (navegación desde el comparativo).
  useEffect(() => {
    const zonaIdParam = searchParams.get('zonaId');
    if (zonaIdParam && zonas.length > 0 && !zonaSel) {
      const z = zonas.find((x) => String(x.id) === String(zonaIdParam));
      if (z) abrirZona(z);
    }
    const refParam = searchParams.get('ref') || searchParams.get('q') || searchParams.get('codigo');
    if (refParam) setBusquedaLectura(refParam);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zonas, searchParams]);
  // refresco periódico ligero
  useEffect(() => { const t = setInterval(cargarZonas, 30000); return () => clearInterval(t); }, [cargarZonas]);

  // Realtime: al escanear/eliminar, refrescar la zona afectada.
  useEffect(() => {
    const handler = (e) => {
      const ev = e.detail;
      if (!ev || (ev.tipo !== 'escaneo' && ev.tipo !== 'escaneo_eliminado' && ev.tipo !== 'novedad')) return;
      if (local?.id && ev.localId && ev.localId !== local.id) return;
      // refrescar listado de zonas (conteos)
      cargarZonas();
      // si la zona seleccionada es la afectada, refrescar detalle
      if (zonaSel && ((ev.zonaId && ev.zonaId === zonaSel.id) || (ev.zonaNumero && ev.zonaNumero === zonaSel.numero))) {
        cargarDetalle(zonaSel.id, page, busquedaLectura, filtroEmpleado);
        cargarResumen(zonaSel.id);
      }
    };
    window.addEventListener('levis:realtime', handler);
    return () => window.removeEventListener('levis:realtime', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [local?.id, zonaSel?.id, zonaSel?.numero, page, busquedaLectura, filtroEmpleado]);

  const cargarResumen = useCallback(async (zonaId) => {
    if (!local) return;
    // inventario activo del local: lo resolvemos vía zonas? usamos el primer inventario activo consultando actividad no lo trae.
    // Usamos comparativo para obtener inventario activo.
    try {
      const c = await api(`/api/inventarios/comparativo?localId=${local.id}`);
      const invId = c?.inventario?.id;
      if (!invId) return;
      const r = await api(`/api/escaneos/zona-resumen?inventarioId=${invId}&zonaId=${zonaId}`);
      setResumen(r);
    } catch (e) { /* silencioso */ }
  }, [local]);

  const cargarDetalle = useCallback(async (zonaId, pg = 1, q = '', empleado = '') => {
    if (!local) return;
    setCargandoDetalle(true);
    setDetalleError('');
    try {
      const c = await api(`/api/inventarios/comparativo?localId=${local.id}`);
      const invId = c?.inventario?.id;
      if (!invId) { setDetalleError('Sin inventario activo.'); return; }
      const params = new URLSearchParams({ inventarioId: invId, zonaId, page: pg, pageSize });
      if (q) params.set('q', q);
      if (empleado) params.set('usuarioId', empleado);
      const d = await api(`/api/escaneos/zona?${params.toString()}`);
      setLecturas(d.items || []);
      setTotalLecturas(d.total || 0);
      setPage(d.page || pg);
    } catch (e) { setDetalleError(e.message); }
    finally { setCargandoDetalle(false); }
  }, [local, pageSize]);

  const abrirZona = useCallback((z) => {
    setZonaSel(z);
    setVistaMobile('detalle');
    setTab('lecturas');
    setPage(1);
    setBusquedaLectura('');
    setFiltroEmpleado('');
    cargarResumen(z.id);
    cargarDetalle(z.id, 1, '', '');
  }, [cargarResumen, cargarDetalle]);

  // zonas enriquecidas con conteo
  const zonasEnriquecidas = useMemo(() => {
    const avMap = new Map(avance.map((a) => [a.id, a]));
    return (zonas || []).map((z) => {
      const a = avMap.get(z.id) || {};
      const unidades = a.unidades ?? a.totalUnidades ?? 0;
      return { ...z, unidades, tieneLecturas: (unidades || 0) > 0, enConteo: !!a.enConteo, terminada: !!a.terminada };
    });
  }, [zonas, avance]);

  // filtros + búsqueda + orden numérico
  const zonasFiltradas = useMemo(() => {
    const t = busquedaZona.trim().toLowerCase();
    let list = zonasEnriquecidas;
    if (filtroTipo === 'pdv') list = list.filter((z) => (z.tipo || 'PDV') !== 'BODEGA');
    else if (filtroTipo === 'bodega') list = list.filter((z) => (z.tipo || 'PDV') === 'BODEGA');
    else if (filtroTipo === 'con') list = list.filter((z) => z.tieneLecturas);
    else if (filtroTipo === 'sin') list = list.filter((z) => !z.tieneLecturas);
    if (t) list = list.filter((z) => String(z.numero).includes(t) || (z.nombre || '').toLowerCase().includes(t));
    return [...list].sort((a, b) => Number(a.numero) - Number(b.numero));
  }, [zonasEnriquecidas, busquedaZona, filtroTipo]);

  // resumen superior
  const resumenSuperior = useMemo(() => {
    const total = zonasEnriquecidas.length;
    const conLecturas = zonasEnriquecidas.filter((z) => z.tieneLecturas).length;
    const sinLecturas = total - conLecturas;
    const totalUnidades = zonasEnriquecidas.reduce((s, z) => s + (z.unidades || 0), 0);
    const totalPdv = zonasEnriquecidas.filter((z) => (z.tipo || 'PDV') !== 'BODEGA').length;
    const totalBodega = zonasEnriquecidas.filter((z) => (z.tipo || 'PDV') === 'BODEGA').length;
    return { total, conLecturas, sinLecturas, totalUnidades, totalPdv, totalBodega };
  }, [zonasEnriquecidas]);

  const empleados = resumen?.empleados || [];

  // realtime reload del detalle cuando cambian filtros/búsqueda
  useEffect(() => {
    if (!zonaSel) return;
    const t = setTimeout(() => {
      cargarDetalle(zonaSel.id, 1, busquedaLectura, filtroEmpleado);
    }, 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busquedaLectura, filtroEmpleado]);

  const totalPages = Math.max(1, Math.ceil(totalLecturas / pageSize));

  if (loading) return <Card><div className="loading-inline"><span className="spinner"/> Cargando zonas…</div></Card>;

  // Mobile: vista lista o detalle
  const mostrarLista = isDesktop || vistaMobile === 'lista';
  const mostrarDetalle = isDesktop || vistaMobile === 'detalle';

  return <div className="page-stack">
    <div className="page-heading">
      <div><p className="eyebrow">CONTROL DE ZONAS</p><h1>Control de zonas del inventario</h1><p className="muted">Consulta el conteo por zona, empleados y lecturas. Se actualiza en tiempo real.</p></div>
      <div className="heading-actions"><button className="btn ghost small-btn" onClick={() => navigate('/comparativo')}><PackageSearch size={16}/> Volver al comparativo</button><button className="btn secondary" onClick={cargarZonas}><RefreshCw size={16}/> Actualizar</button></div>
    </div>
    {error && <Notice type="error" message={error} onClose={() => setError('')} />}

    {/* Resumen superior compacto */}
    <div className="stats-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
      <Stat icon={Warehouse} label="Total zonas" value={resumenSuperior.total.toLocaleString('es-CO')} sub="Del local" />
      <Stat icon={CheckCircle2} label="Con lecturas" value={resumenSuperior.conLecturas.toLocaleString('es-CO')} sub="Zonas con conteo" />
      <Stat icon={AlertCircle} label="Sin lecturas" value={resumenSuperior.sinLecturas.toLocaleString('es-CO')} sub="Pendientes" />
      <Stat icon={Barcode} label="Unidades" value={resumenSuperior.totalUnidades.toLocaleString('es-CO')} sub="Registradas" />
      <Stat icon={Store} label="Total PDV" value={resumenSuperior.totalPdv.toLocaleString('es-CO')} sub="Puntos de venta" />
      <Stat icon={Warehouse} label="Total Bodega" value={resumenSuperior.totalBodega.toLocaleString('es-CO')} sub="Bodegas" />
    </div>

    <div className="control-zonas-layout">
      {/* Panel izquierdo: zonas */}
      {mostrarLista && <div className="cz-left">
        <Card className="cz-left-card">
          <div className="cz-search-row">
            <Search size={16} />
            <input value={busquedaZona} onChange={(e) => setBusquedaZona(e.target.value)} placeholder="Buscar zona por número o nombre…" inputMode="numeric" />
          </div>
          <div className="cz-filtros">
            {[
              { key: 'todas', label: 'Todas' },
              { key: 'pdv', label: 'PDV' },
              { key: 'bodega', label: 'Bodega' },
              { key: 'con', label: 'Con lecturas' },
              { key: 'sin', label: 'Sin lecturas' },
            ].map((f) => (
              <button key={f.key} type="button" className={`cz-filtro ${filtroTipo === f.key ? 'active' : ''}`} onClick={() => setFiltroTipo(f.key)}>{f.label}</button>
            ))}
          </div>
          <div className="cz-list">
            {zonasFiltradas.length === 0 ? (
              <p className="empty-inline">No hay zonas que coincidan.</p>
            ) : zonasFiltradas.map((z) => (
              <button
                key={z.id}
                type="button"
                className={`cz-row ${zonaSel?.id === z.id ? 'active' : ''} ${z.tieneLecturas ? 'has' : 'empty'}`}
                onClick={() => abrirZona(z)}
              >
                <span className="cz-row-num">{String(z.numero).padStart(3, '0')}</span>
                <span className="cz-row-info">
                  <b>{z.nombre || `Zona ${z.numero}`}</b>
                  <span className="cz-row-meta">{TIPO_LABEL(z.tipo)}{z.tieneLecturas ? ` · ${z.unidades} u` : ' · sin lecturas'}</span>
                </span>
                <span className={`cz-dot ${z.tieneLecturas ? 'on' : 'off'}`} />
              </button>
            ))}
          </div>
        </Card>
      </div>}

      {/* Panel derecho: detalle */}
      {mostrarDetalle && <div className="cz-right">
        {!zonaSel ? (
          <Card><Empty icon={Warehouse} title="Selecciona una zona" text="Elige una zona del panel izquierdo para ver su detalle." /></Card>
        ) : (
          <>
            {!isDesktop && vistaMobile === 'detalle' && (
              <button type="button" className="btn ghost small-btn" onClick={() => setVistaMobile('lista')} style={{ marginBottom: 8 }}>
                <ChevronLeft size={16} /> Volver al listado
              </button>
            )}
            <Card>
              <div className="card-heading">
                <div>
                  <h2>Zona {zonaSel.numero} · {zonaSel.nombre || `Zona ${zonaSel.numero}`}</h2>
                  <p className="muted">{TIPO_LABEL(zonaSel.tipo)} · {resumen ? `${resumen.totalUnidades} unidades · ${resumen.totalLecturas} lecturas · ${resumen.empleados.length} empleado(s)` : 'Cargando…'}</p>
                </div>
                <span className={`estado-badge ${resumen && resumen.totalLecturas > 0 ? 'ok' : 'gray'}`}>{resumen && resumen.totalLecturas > 0 ? 'Con lecturas' : 'Sin lecturas'}</span>
              </div>

              <div className="tabs">
                <button type="button" className={tab === 'lecturas' ? 'active' : ''} onClick={() => setTab('lecturas')}><FileSpreadsheet size={16}/> Lecturas</button>
                <button type="button" className={tab === 'empleados' ? 'active' : ''} onClick={() => setTab('empleados')}><Users size={16}/> Empleados</button>
              </div>

              {tab === 'empleados' && (
                resumen && resumen.empleados.length === 0 ? (
                  <Empty icon={Users} title="Sin empleados" text="Nadie ha registrado lecturas en esta zona." />
                ) : (
                  <div className="cz-empleados">
                    {empleados.map((e) => {
                      const pct = resumen.totalUnidades > 0 ? Math.round((e.unidades / resumen.totalUnidades) * 100) : 0;
                      return <div key={e.usuarioId} className="cz-empleado">
                        <NombreColor usuario={{ id: e.usuarioId, nombre: e.nombre, color: e.color }} />
                        <div className="cz-empleado-stats">
                          <span><b>{e.unidades}</b> unidades</span>
                          <span className="muted">{e.lecturas} lecturas</span>
                        </div>
                        <div className="cz-bar"><div className="cz-bar-fill" style={{ width: `${pct}%`, background: colorForUser({ nombre: e.nombre, color: e.color }).bg }} /></div>
                        <span className="cz-pct">{pct}%</span>
                      </div>;
                    })}
                  </div>
                )
              )}

              {tab === 'lecturas' && (
                <>
                  <div className="cz-lecturas-tools">
                    <div className="search-box">
                      <PackageSearch size={17} />
                      <input value={busquedaLectura} onChange={(e) => setBusquedaLectura(e.target.value)} placeholder="Buscar por código, referencia o descripción…" />
                    </div>
                    <select value={filtroEmpleado} onChange={(e) => setFiltroEmpleado(e.target.value)} className="cz-select">
                      <option value="">Todos los empleados</option>
                      {empleados.map((e) => <option key={e.usuarioId} value={String(e.usuarioId)}>{e.nombre}</option>)}
                    </select>
                    <span className="muted small">Total: {totalLecturas}</span>
                  </div>
                  {cargandoDetalle ? (
                    <p className="muted">Cargando lecturas…</p>
                  ) : detalleError ? (
                    <Notice type="error" message={detalleError} onClose={() => setDetalleError('')} />
                  ) : lecturas.length === 0 ? (
                    <Empty icon={FileSpreadsheet} title="Sin lecturas" text="Esta zona no tiene lecturas registradas." />
                  ) : (
                    <>
                      <div className="table-wrap cz-table">
                        <table>
                          <thead><tr>
                            <th>N°</th><th>Código</th><th>Referencia</th><th>Descripción</th><th>Talla</th><th>Color</th><th>Género</th><th>Estilo</th><th>Subgrupo</th><th>Empleado</th><th>Fecha/Hora</th>
                          </tr></thead>
                          <tbody>
                            {lecturas.map((it) => (
                              <tr key={`${it.id}-${it.posicion}`}>
                                <td>{it.posicion}</td>
                                <td className="mono">{it.codigoBarras}</td>
                                <td>{it.referencia || it.item || ''}</td>
                                <td>{it.descripcion || ''}</td>
                                <td>{it.talla || ''}</td>
                                <td>{it.color || ''}</td>
                                <td>{it.genero || ''}</td>
                                <td>{it.estilo || ''}</td>
                                <td>{it.subGrupo || ''}</td>
                                <td><NombreColor usuario={{ id: it.usuarioId, nombre: it.usuarioNombre, color: it.usuarioColor }} /></td>
                                <td>{it.leidoEn ? new Date(it.leidoEn).toLocaleString('es-CO') : ''}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {totalPages > 1 && (
                        <div className="cz-paginacion">
                          <button type="button" className="btn ghost small-btn" disabled={page <= 1} onClick={() => { const p = page - 1; setPage(p); cargarDetalle(zonaSel.id, p, busquedaLectura, filtroEmpleado); }}>Anterior</button>
                          <span className="muted small">Página {page} de {totalPages}</span>
                          <button type="button" className="btn ghost small-btn" disabled={page >= totalPages} onClick={() => { const p = page + 1; setPage(p); cargarDetalle(zonaSel.id, p, busquedaLectura, filtroEmpleado); }}>Siguiente</button>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </Card>
          </>
        )}
      </div>}
    </div>
  </div>;
}
