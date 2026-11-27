import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { Activity, ArrowDownToLine, Barcode, Boxes, ChevronDown, ChevronRight, ClipboardList, FileSpreadsheet, PackageSearch, RefreshCw, Warehouse } from 'lucide-react';
import { api } from '../lib/api.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Stat from '../components/Stat.jsx';
import Empty from '../components/Empty.jsx';
import ReferenciaCodigos from '../components/ReferenciaCodigos.jsx';

function Comparativo({ local }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filtro, setFiltro] = useState('TODOS');
  const [q, setQ] = useState('');
  const [orden, setOrden] = useState('diferencia');
  const [pagina, setPagina] = useState(1);
  const [descargando, setDescargando] = useState(false);
  const [vista, setVista] = useState('REFERENCIA'); // BARRAS | REFERENCIA
  const [refAbierta, setRefAbierta] = useState(null);
  const POR_PAGINA = 50;
  const load = useCallback(async () => {
    try { const d = await api(`/api/inventarios/comparativo${local?.id ? `?localId=${local.id}` : ''}`); setData(d); setError(''); }
    catch (e) { setError(e.message); } finally { setLoading(false); }
  }, [local?.id]);
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [load]);
  useEffect(() => {
    let t = null;
    const handler = (e) => { const ev = e.detail; if (!ev || !['escaneo', 'sesion', 'zona_finalizada', 'escaneo_eliminado'].includes(ev.tipo)) return; if (t) clearTimeout(t); t = setTimeout(load, 500); };
    window.addEventListener('levis:realtime', handler);
    return () => { window.removeEventListener('levis:realtime', handler); if (t) clearTimeout(t); };
  }, [load]);
  useEffect(() => { setPagina(1); }, [filtro, q, orden]);
  const productos = data?.productos || [];
  const productosPorRef = data?.productosPorReferencia || [];
  const resumen = data?.resumen;
  const resumenPorRef = data?.resumenPorReferencia;
  const inventario = data?.inventario;
  const manejaTallas = useMemo(() => (data?.productos || []).some((p) => p.detalle1 || p.detalle2), [data]);
  const visibles = useMemo(() => {
    const texto = q.trim().toLowerCase();
    const base = vista === 'REFERENCIA' ? productosPorRef : productos;
    let arr = base;
    if (filtro === 'SIN STOCK') arr = arr.filter((p) => (Number(p.existencia) || 0) === 0);
    else if (filtro === 'TODOS') arr = arr.filter((p) => (Number(p.existencia) || 0) > 0);
    else if (filtro === 'OK') arr = arr.filter((p) => p.estado === 'OK' && (Number(p.existencia) || 0) > 0 && (Number(p.contado) || 0) > 0);
    else arr = arr.filter((p) => p.estado === filtro);
    if (texto) {
      arr = arr.filter((p) => {
        const ref = p.referencia || p.estilo || '';
        return ref.toLowerCase().includes(texto) ||
               p.codigoBarras?.includes(texto) ||
               `${p.item || ''} ${p.descripcion || ''} ${p.estilo || ''} ${ref}`.toLowerCase().includes(texto);
      });
    }
    return [...arr].sort((a, b) => {
      if (vista === 'REFERENCIA') {
        return (orden === 'contado' ? b.contado - a.contado : a.diferencia - b.diferencia) || (a.referencia || '').localeCompare(b.referencia || '');
      }
      return (orden === 'codigo' ? (a.codigoBarras || '').localeCompare(b.codigoBarras || '') : orden === 'contado' ? b.contado - a.contado : a.diferencia - b.diferencia) || (a.codigoBarras || '').localeCompare(b.codigoBarras || '');
    });
  }, [productos, productosPorRef, filtro, q, orden, vista]);
  const totalPaginas = Math.max(1, Math.ceil(visibles.length / POR_PAGINA));
  const paginaActual = Math.min(pagina, totalPaginas);
  const filas = visibles.slice((paginaActual - 1) * POR_PAGINA, paginaActual * POR_PAGINA);
  async function descargar() {
    if (!inventario?.id) return;
    setDescargando(true);
    try {
      const blob = await api(`/api/inventarios/${inventario.id}/reporte.xlsx`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `comparativo-${inventario.id}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); } finally { setDescargando(false); }
  }
  const resVista = vista === 'REFERENCIA' ? (resumenPorRef || resumen) : resumen;
  const conStock = (vista === 'REFERENCIA' ? productosPorRef : productos).filter((p) => (Number(p.existencia) || 0) > 0);
  const sinStockCount = (vista === 'REFERENCIA' ? productosPorRef : productos).filter((p) => (Number(p.existencia) || 0) === 0).length;
  const exactosEscaneados = conStock.filter((p) => p.estado === 'OK' && (Number(p.contado) || 0) > 0).length;
  const filtros = [
    { k: 'FALTANTE', label: 'Faltantes', n: resVista?.faltantes || 0, cls: 'red' },
    { k: 'SOBRANTE', label: 'Sobrantes', n: resVista?.sobrantes || 0, cls: 'amber' },
    { k: 'OK', label: 'Exactos', n: exactosEscaneados, cls: 'green' },
    { k: 'SIN CONTEO', label: 'Sin conteo', n: resVista?.sinConteo || 0, cls: 'gray' },
    { k: 'SIN STOCK', label: 'Sin stock (0 en maestra)', n: sinStockCount, cls: 'gray' },
  ];
  return <div className="page-stack">
    <div className="page-heading">
      <div><p className="eyebrow">MAESTRA VS. CONTADO</p><h1>Comparativo consolidado</h1><p className="muted">Suma todas las lecturas de todos los usuarios y zonas (por unidad) y las compara con el archivo maestro. Reemplaza el trabajo de unir a mano el Excel de cada empleado.</p></div>
      <div className="heading-actions">
        <button className="btn secondary" onClick={load}><RefreshCw size={16}/> Actualizar</button>
        <button className="btn primary" data-testid="descargar-excel" onClick={descargar} disabled={descargando || !inventario}>{descargando ? <span className="spinner"/> : <ArrowDownToLine size={16}/>} Descargar Excel</button>
      </div>
    </div>
    {error && <Notice type="error" message={error} onClose={() => setError('')}/>}
    {local && <div className="selected-zone big-zone"><Warehouse size={18}/><span>Local: <b>{local.nombre}</b></span><span className={`pill ${inventario ? 'green' : 'gray'}`}>{inventario ? inventario.estado : 'SIN INVENTARIO'}</span></div>}
    {!inventario ? (loading ? <div className="loading-inline"><span className="spinner"/> Cargando comparativo…</div> : <Empty icon={FileSpreadsheet} title="No hay inventario activo" text="Importa y activa el archivo maestro del local desde la sección Inventarios."/>) : <>
      <div className="stats-grid">
        <Stat icon={Boxes} label="Productos en maestra" value={resumen?.productosMaestro?.toLocaleString('es-CO')} sub={`${(resumen?.productosConConteo || 0).toLocaleString('es-CO')} con conteo`}/>
        <Stat icon={Barcode} label="Unidades en maestra" value={resumen?.unidadesMaestro?.toLocaleString('es-CO')} sub="Existencia esperada"/>
        <Stat icon={Activity} label="Unidades contadas" value={resumen?.unidadesContadas?.toLocaleString('es-CO')} sub="Conteo físico total"/>
        <Stat icon={ClipboardList} label="Diferencia de unidades" value={(resumen ? resumen.unidadesContadas - resumen.unidadesMaestro : 0).toLocaleString('es-CO')} sub={`${(resumen?.sinConteo || 0).toLocaleString('es-CO')} productos sin conteo`}/>
      </div>
      <Card>
        <div className="card-heading"><div><h2>Resultado por producto</h2><p className="muted">Filtra por estado o busca un código y compara el conteo contra el maestro. Actualización en vivo.</p></div><span className="live-tag"><span className="status-dot"/> EN VIVO</span></div>
        <div className="filtros-barra">
          {filtros.map((f) => <button key={f.k} type="button" data-testid={`filtro-${f.k.toLowerCase().replace(' ', '-')}`} className={`filtro-chip ${f.cls} ${filtro === f.k ? 'activo' : ''}`} onClick={() => setFiltro(filtro === f.k ? 'TODOS' : f.k)}><b>{f.n.toLocaleString('es-CO')}</b><span>{f.label}</span></button>)}
          <button type="button" data-testid="filtro-todos" className={`filtro-chip neutral ${filtro === 'TODOS' ? 'activo' : ''}`} onClick={() => setFiltro('TODOS')}><b>{(resVista?.productosMaestro || 0).toLocaleString('es-CO')}</b><span>Todos</span></button>
        </div>
        <div className="tabla-tools">
          <div style={{display:'flex',gap:10,alignItems:'center'}}>
            <div className="search-box compact"><PackageSearch size={16}/><input data-testid="buscar-producto" value={q} onChange={(e) => setQ(e.target.value)} placeholder={vista === 'REFERENCIA' ? "Buscar por referencia, descripción o estilo…" : "Buscar por código, item, descripción o estilo…"}/><span className="search-count">{visibles.length.toLocaleString('es-CO')}</span></div>
            <div className="filtros-barra" style={{padding:0}}>
              <button type="button" data-testid="vista-barras" className={`filtro-chip neutral ${vista==='BARRAS'?'activo':''}`} onClick={()=>{ setVista('BARRAS'); setRefAbierta(null); }}><span>Por Código de Barras</span></button>
              <button type="button" data-testid="vista-referencia" className={`filtro-chip neutral ${vista==='REFERENCIA'?'activo':''}`} onClick={()=>{ setVista('REFERENCIA'); setRefAbierta(null); }}><span>Por Referencia</span></button>
            </div>
          </div>
          <label className="orden-select">Ordenar por<select value={orden} onChange={(e) => setOrden(e.target.value)}><option value="diferencia">Mayor faltante primero</option><option value="contado">Más contado primero</option>{vista==='BARRAS' && <option value="codigo">Código de barras</option>}</select></label>
        </div>
        {filas.length ? <>
          <div className="table-wrap"><table><thead>
            {vista==='BARRAS' ? <tr><th>Código</th><th>Producto</th><th className="num">Maestra</th><th className="num">Contado</th><th className="num">Diferencia</th><th>Estado</th></tr> : <tr><th>Referencia</th><th>Descripción</th><th className="num">Maestra</th><th className="num">Contado</th><th className="num">Diferencia</th><th>Estado</th></tr>}
          </thead><tbody>
            {vista==='BARRAS' ? filas.map((p) => <tr key={p.codigoBarras} data-testid="fila-producto">
              <td className="mono">{p.codigoBarras}</td>
              <td><b>{p.item || '—'}</b><span className="table-sub">{p.descripcion || 'Sin descripción'}{p.estilo ? ` · ${p.estilo}` : ''}{p.referencia ? ` · REF: ${p.referencia}` : ''}</span></td>
              <td className="num">{p.existencia.toLocaleString('es-CO')}</td>
              <td className="num">{p.contado.toLocaleString('es-CO')}</td>
              <td className={`num ${p.diferencia < 0 ? 'dif-neg' : p.diferencia > 0 ? 'dif-pos' : ''}`}>{p.diferencia > 0 ? `+${p.diferencia.toLocaleString('es-CO')}` : p.diferencia.toLocaleString('es-CO')}</td>
              <td><span className={`estado-badge ${p.estado.toLowerCase().replace(' ', '-')}`}>{p.estado}</span></td>
            </tr>) : filas.map((p) => <Fragment key={p.referencia}>
              <tr data-testid="fila-referencia" style={{ cursor: 'pointer' }} onClick={() => setRefAbierta(refAbierta === p.referencia ? null : p.referencia)}>
              <td><b>{p.referencia || 'SIN REFERENCIA'}</b><span className="table-sub">{p.estilo ? `${p.estilo} · ` : ''}{p.productos} código(s) · {refAbierta === p.referencia ? 'Ocultar detalle' : 'Ver tallas y códigos'}</span></td>
              <td>{p.descripcion || 'Sin descripción'}</td>
              <td className="num">{p.existencia.toLocaleString('es-CO')}</td>
              <td className="num">{p.contado.toLocaleString('es-CO')}</td>
              <td className={`num ${p.diferencia < 0 ? 'dif-neg' : p.diferencia > 0 ? 'dif-pos' : ''}`}>{p.diferencia > 0 ? `+${p.diferencia.toLocaleString('es-CO')}` : p.diferencia.toLocaleString('es-CO')}</td>
              <td><span className={`estado-badge ${p.estado.toLowerCase().replace(' ', '-')}`}>{p.estado}</span></td>
              </tr>
              {refAbierta === p.referencia && <tr><td colSpan={6} style={{ background: '#fafbfc', padding: '12px 14px' }}>
                <ReferenciaCodigos productos={productos} referencia={p.referencia} manejaTallas={manejaTallas} />
              </td></tr>}
            </Fragment>)}
          </tbody></table></div>
          <div className="paginador">
            <span>Página {paginaActual} de {totalPaginas} · {visibles.length.toLocaleString('es-CO')} {vista==='REFERENCIA' ? 'referencias' : 'productos'}</span>
            <div>
              <button className="btn ghost small-btn" disabled={paginaActual <= 1} onClick={() => setPagina(1)}>« Primera</button>
              <button className="btn ghost small-btn" disabled={paginaActual <= 1} onClick={() => setPagina(paginaActual - 1)}>Anterior</button>
              <button className="btn ghost small-btn" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(paginaActual + 1)}>Siguiente</button>
              <button className="btn ghost small-btn" disabled={paginaActual >= totalPaginas} onClick={() => setPagina(totalPaginas)}>Última »</button>
            </div>
          </div>
        </> : <Empty icon={PackageSearch} title="Sin resultados" text={q || filtro !== 'TODOS' ? 'No hay productos que coincidan con el filtro o la búsqueda.' : 'Aún no hay productos en el archivo maestro.'}/>}
      </Card>
    </>}
  </div>;
}

export default Comparativo;
