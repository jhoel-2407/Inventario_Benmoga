import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDownToLine, CircleHelp, FileSpreadsheet, RefreshCw, Trash2 } from 'lucide-react';
import { api, API_URL } from '../lib/api.js';
import Notice from '../components/Notice.jsx';
import Modal from '../components/Modal.jsx';
import Card from '../components/Card.jsx';
import Empty from '../components/Empty.jsx';

const CAMPOS_MAPEO_UI = [
  ['codigo', 'Código de barras (lo que lee el escáner)', true],
  ['item', 'Referencia / Item (agrupa las tallas)', true],
  ['existencia', 'Existencia (cantidad en la maestra)', true],
  ['desc', 'Descripción', false],
  ['estilo', 'Estilo / Línea', false],
  ['referencia', 'Referencia (si viene en columna aparte)', false],
  ['genero', 'Género', false],
  ['subgrupo', 'Subgrupo / Categoría', false],
];

function Inventories({ local }) {
  const [items, setItems] = useState([]);
  const [locals, setLocals] = useState([]);
  const [localId, setLocalId] = useState(local?.id ? String(local.id) : '');
  const [file, setFile] = useState(null);
  const [name, setName] = useState('');
  const [actualizarFile, setActualizarFile] = useState(null);
  const [actualizando, setActualizando] = useState(false);
  const [actualizarKey, setActualizarKey] = useState(0);

  const [convertirFile, setConvertirFile] = useState(null);
  const [convertirBusy, setConvertirBusy] = useState(false);
  const [convertirKey, setConvertirKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [mapeoEtapa, setMapeoEtapa] = useState(null);
  const [mapeoModo, setMapeoModo] = useState('importar');
  const [mapeo, setMapeo] = useState({});
  const [fileKey, setFileKey] = useState(0);
  const [erroresImport, setErroresImport] = useState(null);
  const [borrar, setBorrar] = useState(null);
  const [confirmoBorrado, setConfirmoBorrado] = useState(false);
  const load = useCallback(async () => {
    try {
      const q = local?.id ? `?localId=${local.id}` : '';
      const [inv, loc] = await Promise.all([api(`/api/inventarios${q}`), api('/api/locales')]);
      setItems(inv.inventarios || []);
      setLocals(loc.locales || []);
    } catch (e) { setError(e.message); }
  }, [local?.id]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (local?.id) setLocalId(String(local.id)); }, [local?.id]);
  function aplicarMapeo(d) {
    const base = {};
    for (const [k] of CAMPOS_MAPEO_UI) base[k] = d.sugerencia?.[k] || '';
    setMapeo(base);
    setMapeoEtapa({ columnas: d.columnas || [], faltantes: d.faltantes || [], motivo: d.motivo, ambiguo: !!d.ambiguo });
  }
  async function enviarImportacion(mapeoObj) {
    setBusy(true); setError(''); setNotice(''); setErroresImport(null);
    try {
      const fd = new FormData();
      fd.append('archivo', file);
      fd.append('localId', localId);
      if (mapeoObj) fd.append('mapeo', JSON.stringify(mapeoObj));
      if (name.trim()) fd.append('nombre', name.trim());
      const d = await api('/api/inventarios/importar', { method: 'POST', body: fd });
      if (d.requiereMapeo) { setMapeoModo('importar'); aplicarMapeo(d); return; }
      const destinoTxt = locals.find(l => String(l.id) === String(localId))?.nombre || 'el local';
      setNotice(`${d.productosImportados.toLocaleString('es-CO')} productos importados en ${destinoTxt}; ${d.totalErrores} filas omitidas. El inventario queda en BORRADOR.`);
      if (d.totalErrores) setErroresImport({ local: destinoTxt, total: d.totalErrores, lista: d.errores || [] });
      setMapeoEtapa(null); setMapeo({}); setFile(null); setName(''); setFileKey(k => k + 1);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function actualizarMaestro() {
    if (!actualizarFile) return setError('Selecciona el Excel corregido.');
    const activo = items.find((i) => i.estado === 'ACTIVO');
    if (!activo) return setError('No hay un inventario activo para actualizar.');
    setActualizando(true); setError(''); setNotice(''); setErroresImport(null);
    try {
      const fd = new FormData();
      fd.append('archivo', actualizarFile);
      const d = await api(`/api/inventarios/${activo.id}/actualizar-maestro`, { method: 'POST', body: fd });
      if (d.requiereMapeo) { setMapeoModo('actualizar'); aplicarMapeo(d); return; }
      setNotice(`${d.mensaje} (${d.totalErrores || 0} filas omitidas).`);
      if (d.totalErrores) setErroresImport({ local: activo.local?.nombre || '', total: d.totalErrores, lista: d.errores || [] });
      setActualizarFile(null); setActualizarKey((k) => k + 1);
      await load();
    } catch (e) { setError(e.message); } finally { setActualizando(false); }
  }
  async function convertirStockAMaestra() {
    if (!convertirFile) return setError('Selecciona el archivo STOCK.');
    setConvertirBusy(true); setError(''); setNotice('');
    try {
      if (!localId) return setError('Selecciona el local al que pertenece el inventario.');
      const fd = new FormData();
      fd.append('archivo', convertirFile);
      fd.append('localId', localId);
      const response = await fetch(`${API_URL}/api/inventarios/convertir-stock`, { method: 'POST', body: fd, credentials: 'include' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.error || `Error ${response.status}`);
      }
      const estado = response.headers.get('x-importacion-estado') || 'no_intentado';
      const invId = response.headers.get('x-inventario-id');
      const errImp = response.headers.get('x-importacion-error');
      const cd = response.headers.get('content-disposition') || '';
      const m = cd.match(/filename="?([^"]+)"?/i);
      const filename = m ? m[1] : 'maestra-convertida.xlsx';
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
      if (estado === 'activado') {
        setNotice(`Stock convertido, maestra importada y inventario #${invId} activado. Listo para comenzar el conteo.`);
      } else if (estado === 'importado_no_activado') {
        setNotice(`Stock convertido e importado (inventario #${invId}), pero no se pudo activar: ${decodeURIComponent(errImp || '')}. Actívalo manualmente.`);
      } else if (estado === 'requiere_mapeo') {
        setNotice('Stock convertido, pero la maestra requiere mapeo manual. Importa el archivo descargado manualmente.');
      } else if (estado === 'sin_filas') {
        setNotice('Stock convertido, pero no se encontraron filas válidas para importar.');
      } else if (estado === 'error_importacion') {
        setNotice(`Stock convertido y descargado, pero la importación automática falló: ${decodeURIComponent(errImp || '')}. Importa el archivo manualmente.`);
      } else {
        setNotice('Stock convertido a MAESTRA. Revisa el archivo descargado antes de importarlo.');
      }
      setConvertirFile(null); setConvertirKey((k) => k + 1);
    } catch (e) { setError(e.message); } finally { setConvertirBusy(false); }
  }

  function descargarErrores() {
    if (!erroresImport) return;
    const filas = [['Fila', 'Codigo', 'Motivo'], ...erroresImport.lista.map(e => [e.fila, e.codigo || '', e.error])];
    const csv = filas.map(r => r.map(c => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `filas-omitidas-${erroresImport.local.replace(/\s+/g, '-').toLowerCase()}.csv`;
    a.click(); URL.revokeObjectURL(url);
  }
  async function importFile(e) {
    e.preventDefault();
    if (!file) return setError('Selecciona el archivo Excel (.xlsx).');
    if (!localId) return setError('Selecciona el local al que pertenece el inventario.');
    await enviarImportacion(null);
  }
  async function confirmarMapeo() {
    const faltan = CAMPOS_MAPEO_UI.filter(([k, , req]) => req && !mapeo[k]);
    if (faltan.length) return setError(`Asigna estas columnas obligatorias: ${faltan.map(([, l]) => l).join(', ')}.`);
    if (mapeoModo === 'actualizar' || mapeoModo === 'stock') {
      const activo = items.find((i) => i.estado === 'ACTIVO');
      if (!activo) return setError('No hay un inventario activo.');
      setActualizando(true); setError(''); setNotice('');
      try {
        const fd = new FormData();
        fd.append('archivo', actualizarFile);
        fd.append('mapeo', JSON.stringify(mapeo));
        const d = await api(`/api/inventarios/${activo.id}/actualizar-maestro`, { method: 'POST', body: fd });
        if (d.requiereMapeo) { aplicarMapeo(d); return; }
        setNotice(`${d.mensaje} (${d.totalErrores || 0} filas omitidas).`);
        setActualizarFile(null); setActualizarKey((k) => k + 1);
        setMapeoEtapa(null); setMapeo({});
        await load();
      } catch (e) { setError(e.message); } finally { setActualizando(false); }
    } else {
      await enviarImportacion(mapeo);
    }
  }
  function cancelarMapeo() { setMapeoEtapa(null); setMapeo({}); setError(''); }
  async function reiniciarConteo(id) {
    if (!window.confirm('¿Reiniciar el conteo de este inventario? Se borrarán todas las lecturas y novedades (N/A), pero el maestro se conserva.')) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const d = await api(`/api/inventarios/${id}/reiniciar-escaneos`, { method: 'POST' });
      setNotice(d?.mensaje || 'Conteo reiniciado.');
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  async function activate(id) {
    if (!window.confirm('¿Activar este inventario? El inventario activo actual pasará a cerrado.')) return;
    try { await api(`/api/inventarios/${id}/activar`, { method: 'PATCH' }); setNotice('Inventario activado correctamente.'); await load(); }
    catch (e) { setError(e.message); }
  }
  async function report(id) {
    try {
      const blob = await api(`/api/inventarios/${id}/reporte.xlsx`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `inventario-${id}.xlsx`; a.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); }
  }
  async function pedirEliminar(inv) {
    setError(''); setNotice(''); setConfirmoBorrado(false);
    try { const d = await api(`/api/inventarios/${inv.id}/impacto`); setBorrar({ inv, impacto: d }); }
    catch (e) { setError(e.message); }
  }
  async function confirmarEliminar() {
    if (!borrar) return;
    setBusy(true); setError('');
    try {
      const d = await api(`/api/inventarios/${borrar.inv.id}?confirmar=SI`, { method: 'DELETE' });
      setNotice(d?.mensaje || 'Inventario eliminado correctamente.');
      setBorrar(null); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">ARCHIVO MAESTRA</p><h1>Inventarios</h1><p className="muted">Importa el Excel de referencia por local, revisa el estado y exporta el comparativo.</p></div></div>
    {error && <Notice type="error" message={error} onClose={() => setError('')}/>}
    {notice && <Notice message={notice} onClose={() => setNotice('')}/>}
    <div className="two-column">
      <Card>
        <div className="card-heading"><div><h2>Importar Excel</h2><p className="muted">El archivo debe contener la hoja INVENTARIO.</p></div><div className="heading-icon"><FileSpreadsheet/></div></div>
        {mapeoEtapa ? (
          <div className="form-stack">
            <div className="hint-box"><CircleHelp size={17}/><span>El archivo <b>{file?.name}</b> trae encabezados distintos. Indica qué columna corresponde a cada dato; este mapeo se guardará para <b>{locals.find(l => String(l.id) === String(localId))?.nombre || 'este local'}</b> y las próximas importaciones de ese local serán automáticas.</span></div>
            {mapeoEtapa.ambiguo && <div className="hint-box"><AlertTriangle size={17}/><span>Hay más de una columna que podría ser el código de barras. Verifica cuál es la que lee el escáner.</span></div>}
            {mapeoEtapa.faltantes?.length > 0 && <div className="hint-box"><AlertTriangle size={17}/><span>Falta asignar: <b>{mapeoEtapa.faltantes.join(', ')}</b>.</span></div>}
            {CAMPOS_MAPEO_UI.map(([k, label, req]) => {
              const col = mapeoEtapa.columnas.find(c => c.etiqueta === mapeo[k]);
              return <label key={k}>{label} {req ? <span className="muted">* obligatorio</span> : <span className="optional">(opcional)</span>}
                <select value={mapeo[k] || ''} onChange={e => setMapeo(m => ({ ...m, [k]: e.target.value || '' }))}>
                  <option value="">— Sin asignar —</option>
                  {mapeoEtapa.columnas.map(c => <option key={c.col} value={c.etiqueta}>{c.etiqueta}</option>)}
                </select>
                {col?.muestras?.length ? <span className="table-sub">Ejemplos: {col.muestras.join(' · ')}</span> : null}
              </label>;
            })}
            <div className="action-row">
              <button type="button" className="btn primary" disabled={busy} onClick={confirmarMapeo}>{busy ? <><span className="spinner"/> Importando…</> : <><ArrowDownToLine size={17}/> Importar con este mapeo</>}</button>
              <button type="button" className="btn ghost" onClick={cancelarMapeo}>Cancelar</button>
            </div>
          </div>
        ) : (
          <form className="form-stack" onSubmit={importFile}>
            <label>Local del inventario<input list="locales-lista" value={locals.find(l => String(l.id) === String(localId))?.nombre || ''} onChange={e => { const l = locals.find(x => x.nombre === e.target.value); setLocalId(l ? String(l.id) : ''); }} placeholder="Escribe o elige un local" required/></label>
            <datalist id="locales-lista">{locals.map(l => <option key={l.id} value={l.nombre}/>)}</datalist>
            <label>Nombre del inventario <span className="optional">(opcional)</span><input data-testid="nombre-inventario" value={name} onChange={e => setName(e.target.value)} placeholder="Ej. Inventario octubre 2026" maxLength={180}/></label>
            <label className="upload-area"><input key={fileKey} data-testid="archivo-excel" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={e => setFile(e.target.files?.[0] || null)}/><div className="upload-icon"><FileSpreadsheet size={25}/></div><b>{file ? file.name : 'Selecciona el Excel maestro'}</b><span>{file ? `${(file.size/1024/1024).toFixed(2)} MB` : 'Formato .xlsx · máximo 25 MB'}</span><em>Buscar archivo</em></label>
            <div className="hint-box"><CircleHelp size={17}/><span>Se importa a modo borrador. Las zonas se crean aparte en la sección Zonas, porque no vienen en el Excel.</span></div>
            <button className="btn primary full" data-testid="importar-excel" disabled={busy || !file || !localId}>{busy ? <><span className="spinner"/> Procesando Excel…</> : <><ArrowDownToLine size={17}/> Importar archivo</>}</button>
          </form>
        )}
      </Card>
    <Card>
      <div className="card-heading"><div><h2>Convertir STOCK a MAESTRA</h2><p className="muted">Sube el Excel de stock que envía la tienda (en su formato original). El sistema lo convierte automáticamente al formato MAESTRA estándar para que puedas revisarlo y luego importarlo.</p></div><div className="heading-icon"><FileSpreadsheet/></div></div>
      <div className="form-stack">
        <label className="upload-area"><input key={convertirKey} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setConvertirFile(e.target.files?.[0] || null)}/><div className="upload-icon"><FileSpreadsheet size={25}/></div><b>{convertirFile ? convertirFile.name : 'Selecciona el Excel de stock'}</b><span>{convertirFile ? `${(convertirFile.size/1024/1024).toFixed(2)} MB` : 'Formato .xls o .xlsx'}</span><em>Buscar archivo</em></label>
        <button className="btn primary full" disabled={convertirBusy || !convertirFile} onClick={convertirStockAMaestra}>{convertirBusy ? <><span className="spinner"/> Convirtiendo…</> : <><ArrowDownToLine size={17}/> Convertir y descargar MAESTRA</>}</button>
      </div>
    </Card>
    </div>
    <Card>
      <div className="card-heading"><div><h2>Actualizar maestra del inventario activo</h2><p className="muted">Si la auditora corrige el Excel durante el conteo, sube aquí el maestro corregido. Se actualizan las existencias iniciales y se agregan productos nuevos, <b>sin perder los escaneos</b>.</p></div><div className="heading-icon"><RefreshCw/></div></div>
      {items.find((i) => i.estado === 'ACTIVO') ? (
        <div className="form-stack">
          <label className="upload-area"><input key={actualizarKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => setActualizarFile(e.target.files?.[0] || null)}/><div className="upload-icon"><FileSpreadsheet size={25}/></div><b>{actualizarFile ? actualizarFile.name : 'Selecciona el Excel corregido'}</b><span>{actualizarFile ? `${(actualizarFile.size/1024/1024).toFixed(2)} MB` : 'Formato .xlsx'}</span><em>Buscar archivo</em></label>
          <button className="btn primary full" disabled={actualizando || !actualizarFile} onClick={actualizarMaestro}>{actualizando ? <><span className="spinner"/> Actualizando…</> : <><RefreshCw size={17}/> Actualizar maestro</>}</button>
        </div>
      ) : <p className="muted">Activa primero un inventario para poder actualizar su maestra.</p>}
    </Card>
    {erroresImport && <Card>
      <div className="card-heading"><div><h2>Filas omitidas</h2><p className="muted"><b>{erroresImport.total}</b> fila(s) del maestro no se importaron en {erroresImport.local}. Corrige esas filas en el Excel y vuelve a subirlo.</p></div><button className="btn secondary small-btn" onClick={descargarErrores}><ArrowDownToLine size={15}/> Descargar CSV</button></div>
      <div className="table-wrap"><table><thead><tr><th style={{width:'70px'}}>Fila</th><th style={{width:'180px'}}>Código</th><th>Motivo</th></tr></thead><tbody>{erroresImport.lista.map((e, i) => <tr key={i}><td><b>{e.fila}</b></td><td className="mono">{e.codigo || '—'}</td><td>{e.error}</td></tr>)}</tbody></table></div>
      {erroresImport.total > erroresImport.lista.length && <p className="muted small">Mostrando las primeras {erroresImport.lista.length} de {erroresImport.total} filas.</p>}
    </Card>}
    <Card>
      <div className="card-heading"><div><h2>Historial de inventarios</h2><p className="muted">{items.length} inventarios registrados.</p></div><button className="btn secondary small-btn" onClick={load}><RefreshCw size={15}/></button></div>
      {items.length ? <div className="table-wrap"><table><thead><tr><th>Inventario</th><th>Local</th><th>Estado</th><th>Productos</th><th>Lecturas</th><th>Fecha</th><th>Acciones</th></tr></thead><tbody>{items.map(i => <tr key={i.id} data-testid="inventario-fila"><td><b>{i.nombre}</b><span className="table-sub">{i.archivoOrigen || '—'}</span></td><td>{i.local?.nombre || '—'}</td><td><span className={`pill ${i.estado === 'ACTIVO' ? 'green' : 'gray'}`}>{i.estado}</span></td><td>{(i._count?.productos || 0).toLocaleString('es-CO')}</td><td>{(i._count?.escaneos || 0).toLocaleString('es-CO')}</td><td>{new Date(i.fechaInventario).toLocaleDateString('es-CO')}</td><td><div className="action-row">{i.estado !== 'ACTIVO' && <button className="btn secondary tiny-btn" data-testid="activar-inventario" onClick={() => activate(i.id)}>Activar</button>}<button className="btn ghost tiny-btn" data-testid="reiniciar-conteo" onClick={() => reiniciarConteo(i.id)} title="Reiniciar conteo (borra lecturas, conserva maestro)"><RefreshCw size={14}/> Reiniciar</button><button className="btn ghost tiny-btn" data-testid="reporte-inventario" onClick={() => report(i.id)}><ArrowDownToLine size={14}/> Excel</button><button className="btn ghost tiny-btn danger" data-testid="eliminar-inventario" onClick={() => pedirEliminar(i)} title="Eliminar inventario"><Trash2 size={14}/></button></div></td></tr>)}</tbody></table></div> : <Empty icon={FileSpreadsheet} title="Sin inventarios" text="Importa el primer Excel maestro para empezar."/>}
    </Card>

    {borrar && <Modal title="Eliminar inventario" subtitle={`${borrar.inv.nombre} · ${borrar.inv.local?.nombre || ''}`} onClose={() => setBorrar(null)}
      footer={<>
        <button type="button" className="btn ghost" onClick={() => setBorrar(null)} disabled={busy}>Cancelar</button>
        <button type="button" className="btn primary" data-testid="confirmar-eliminar-inventario" onClick={confirmarEliminar} disabled={busy || (borrar.impacto.escaneos > 0 && !confirmoBorrado)}>{busy ? <><span className="spinner"/> Eliminando…</> : <><Trash2 size={16}/> Eliminar definitivamente</>}</button>
      </>}>
      {borrar.impacto.escaneos > 0
        ? <div className="hint-box"><AlertTriangle size={17}/><span>Este inventario <b>ya tiene conteo</b>. Si lo eliminas se pierde <b>para siempre</b>.</span></div>
        : <div className="hint-box"><CircleHelp size={17}/><span>Este inventario todavía no tiene lecturas.</span></div>}
      <div className="table-wrap" style={{ marginTop: 4 }}><table><tbody>
        <tr><td>Productos de la maestra</td><td><b>{(borrar.impacto.productos || 0).toLocaleString('es-CO')}</b></td></tr>
        <tr><td>Lecturas registradas</td><td><b>{(borrar.impacto.escaneos || 0).toLocaleString('es-CO')}</b></td></tr>
        <tr><td>Unidades contadas</td><td><b>{(borrar.impacto.unidades || 0).toLocaleString('es-CO')}</b></td></tr>
        <tr><td>Zonas afectadas</td><td><b>{borrar.impacto.zonas?.length || 0}</b>{borrar.impacto.zonas?.length ? <span className="table-sub">{borrar.impacto.zonas.map(z => `Zona ${z.numero}`).join(' · ')}</span> : null}</td></tr>
        <tr><td>Personas que contaron</td><td><b>{borrar.impacto.usuarios?.length || 0}</b>{borrar.impacto.usuarios?.length ? <span className="table-sub">{borrar.impacto.usuarios.map(u => u.nombre).join(' · ')}</span> : null}</td></tr>
      </tbody></table></div>
      {borrar.impacto.escaneos > 0 && <label style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 14 }}><input type="checkbox" checked={confirmoBorrado} onChange={e => setConfirmoBorrado(e.target.checked)} style={{ width: 'auto', marginTop: 3 }}/><span>Entiendo que se borrarán <b>{(borrar.impacto.escaneos || 0).toLocaleString('es-CO')} lecturas</b> de {borrar.impacto.usuarios?.length || 0} persona(s) y que no se puede deshacer.</span></label>}
    </Modal>}
  </div>;
}

export default Inventories;
