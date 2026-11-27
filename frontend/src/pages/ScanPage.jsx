import { useCallback, useEffect, useRef, useState } from 'react';
import { Barcode, Boxes, CheckCircle2, HelpCircle, RefreshCw, ScanLine, ShieldCheck, Wrench } from 'lucide-react';
import { api } from '../lib/api.js';
import CameraScanner from '../components/CameraScanner.jsx';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Modal from '../components/Modal.jsx';

function ScanPage({ local, user }) {
  const [zones,setZones]=useState([]); const [zoneId,setZoneId]=useState(localStorage.getItem('levis_zone')||''); const [code,setCode]=useState(''); const [camera,setCamera]=useState(false); const [cameraDisponible,setCameraDisponible]=useState(null); const [busy,setBusy]=useState(false); const [message,setMessage]=useState(''); const [error,setError]=useState(''); const [summary,setSummary]=useState({unidades:0,productosDistintos:0,inventario:null,zonas:[]}); const [recent,setRecent]=useState([]); const [pendientesOffline,setPendientesOffline]=useState(()=>{try{return JSON.parse(localStorage.getItem('levis_offline_queue')||'[]');}catch{return [];}});
function guardarPendientes(lista){localStorage.setItem('levis_offline_queue',JSON.stringify(lista));setPendientesOffline(lista);}
const inputRef=useRef(null); const enviandoRef=useRef(false);
  const [diagAbierto,setDiagAbierto]=useState(false); const [diagLectura,setDiagLectura]=useState(''); const [diagHistorial,setDiagHistorial]=useState([]); const diagTimerRef=useRef(null); const diagUltimaRef=useRef(Date.now());
  const [sinLectura,setSinLectura]=useState(false);
  const [listados, setListados]=useState([]);
  const zonaResumenSel = (summary.zonas || []).find((z) => String(z.zonaId) === String(zoneId));
  const unidadesZonaSel = Number(zonaResumenSel?.unidades || 0);
  const distintosZonaSel = new Set((listados || []).map((it) => it.codigoBarras)).size;
  const [cargandoList, setCargandoList]=useState(false);
  const [listError, setListError]=useState('');
  // Detecta si el dispositivo tiene cámara. El Zebra TC20 (solo lector) no la tiene.
  useEffect(()=>{let vivo=true;(async()=>{try{if(!navigator.mediaDevices?.enumerateDevices){if(vivo)setCameraDisponible(false);return;}const d=await navigator.mediaDevices.enumerateDevices();if(vivo)setCameraDisponible(d.some(x=>x.kind==='videoinput'));}catch{if(vivo)setCameraDisponible(false);}})();return()=>{vivo=false;};},[]);
  const load=useCallback(async()=>{try{const q=local?.id?`?localId=${local.id}`:'';const [z,s]=await Promise.all([api(`/api/zonas${q}`),api(`/api/escaneos/resumen-mio${q}`)]);setZones(z.zonas||[]);setSummary(s||{unidades:0,productosDistintos:0,inventario:null,zonas:[]});}catch(e){setError(e.message);}},[local?.id]);
  const loadList=useCallback(async()=>{
    if(!zoneId || !summary.inventario?.id || !user) { setListados([]); return; }
    setCargandoList(true);
    try{
      const d = await api(`/api/escaneos/usuario-zona?inventarioId=${summary.inventario.id}&usuarioId=${user.id}&zonaId=${zoneId}`);
      setListados(d.productos || []);
    } catch(e) { setListError(e.message); }
    finally { setCargandoList(false); }
  }, [zoneId, summary.inventario?.id, user]);
  useEffect(()=>{ if(!zoneId || !summary.inventario?.id || !user) { setListados([]); return; } void loadList(); }, [zoneId, summary.inventario?.id, user, loadList]);
  useEffect(()=>{load();},[load]);
  const flushPendientes=useCallback(async()=>{
    if(!pendientesOffline.length) return;
    const cola=[...pendientesOffline];
    const restantes=[];
    for(const item of cola){
      try {
        const d=await api('/api/escaneos',{method:'POST',body:JSON.stringify({codigoBarras:item.codigo})});
        setMessage(`${d.mensaje} ${d.escaneo?.producto?.descripcion||item.codigo} (pendiente enviado)`);
        if(d.resumen) setSummary(s=>({...s,unidades:d.resumen.unidades||0,productosDistintos:d.resumen.productosDistintos||0}));
      } catch(e) {
        restantes.push(item);
      }
    }
    guardarPendientes(restantes);
    if(restantes.length===0) setMessage('Todos los pendientes enviados.');
  },[pendientesOffline,load]);
  useEffect(()=>{const h=()=>{if(navigator.onLine) flushPendientes();};window.addEventListener('online',h);return()=>window.removeEventListener('online',h);},[flushPendientes]);
  useEffect(()=>{if(navigator.onLine && pendientesOffline.length) flushPendientes();},[pendientesOffline.length]);
  const restoredZone = useRef(false);
  useEffect(()=>{if(!restoredZone.current && zones.length && zoneId){restoredZone.current=true;if(zones.some(z=>String(z.id)===String(zoneId))){api('/api/zonas/seleccionar',{method:'POST',body:JSON.stringify({zonaId:Number(zoneId)})}).catch(e=>setError(e.message));}else{setZoneId('');localStorage.removeItem('levis_zone');}}},[zones,zoneId]);
  async function chooseZone(id){
    restoredZone.current=true;
    // Si ya hay una zona seleccionada y se cambia a otra, ofrecer finalizar la anterior.
    if (zoneId && String(zoneId) !== String(id)) {
      const ok = window.confirm('¿Deseas finalizar la zona actual antes de cambiar a la nueva?');
      if (ok) {
        try { await api('/api/zonas/finalizar',{method:'POST',body:JSON.stringify({})}); } catch (e) { /* ignora */ }
      }
    }
    setZoneId(String(id));localStorage.setItem('levis_zone',String(id));setMessage('');setError('');
    try{await api('/api/zonas/seleccionar',{method:'POST',body:JSON.stringify({zonaId:Number(id)})});setMessage('Zona seleccionada. Ya puedes escanear.');setTimeout(()=>inputRef.current?.focus(),80);}catch(e){setError(e.message);}
  }
  async function finishZone(){try{await api('/api/zonas/finalizar',{method:'POST',body:JSON.stringify({})});setZoneId('');localStorage.removeItem('levis_zone');setMessage('Turno de zona finalizado.');}catch(e){setError(e.message);}}
  async function registrar(valorRaw){const value=String(valorRaw||'').trim();if(!value)return;if(!esCodigoDeBarrasValido(value)){setError('Solo se aceptan códigos de barras numéricos. Se ignoró el QR o código no válido.');setTimeout(()=>setError(''),2500);return;}if(!zoneId){setError('Selecciona una zona antes de escanear.');return;}if(busy||enviandoRef.current)return;enviandoRef.current=true;setBusy(true);setError('');setMessage('');diagUltimaRef.current=Date.now();setSinLectura(false);try{const d=await api('/api/escaneos',{method:'POST',body:JSON.stringify({codigoBarras:value})});setMessage(`${d.mensaje} ${d.escaneo.producto?.descripcion||d.escaneo.producto?.item||value}`);setRecent(old=>[{id:d.escaneo.id,codigo:value,descripcion:d.escaneo.producto?.descripcion||'Producto registrado',zona:d.escaneo.zona,fecha:d.escaneo.leidoEn},...old].slice(0,8));setCode('');if(d.resumen)setSummary(s=>({...s,unidades:d.resumen.unidades||0,productosDistintos:d.resumen.productosDistintos||0}));void loadList();}catch(e){
  const esRed = !e?.status && /fetch|network|failed/i.test(e?.message || '');
  if (esRed) {
    const cola = [...pendientesOffline, { codigo: value, zonaId: Number(zoneId), fecha: new Date().toISOString() }];
    guardarPendientes(cola);
    setMessage(`Sin conexión: código ${value} guardado. Se enviará al reconectar (${cola.length} pendiente(s)).`);
    setCode('');
  } else {
    setError(e.message);
  }
}finally{enviandoRef.current=false;setBusy(false);setTimeout(()=>inputRef.current?.focus(),50);}}
  async function eliminarLectura(item){
    const ok = window.confirm(`¿Eliminar definitivamente esta lectura?\n\nCódigo: ${item.codigoBarras}\nReferencia: ${item.referencia || item.item || ''}\nDescripción: ${item.descripcion || ''}\nFecha: ${item.leidoEn ? new Date(item.leidoEn).toLocaleString('es-CO') : ''}`);
    if(!ok) return;
    try{
      const d = await api(`/api/escaneos/${item.id}`,{method:'DELETE'});
      setMessage(d.mensaje || 'Lectura eliminada definitivamente.');
      await Promise.all([load(), loadList()]);
    } catch(e) { setError(e.message); }
  }
function scan(e){e?.preventDefault?.();registrar(code||inputRef.current?.value||'');}
// Lector Zebra TC20/TC21 (teclado / keyboard-wedge): captura el código aunque el
// campo no tenga el foco y lo registra solo (por Enter o al terminar la lectura).
useEffect(()=>{let buffer='';let timer=null;const limpiar=()=>{buffer='';if(timer){clearTimeout(timer);timer=null;}};const enviar=()=>{const v=buffer.trim();limpiar();if(v.length>=6){setCode(v);registrar(v);}};const onKey=(ev)=>{const tag=(ev.target?.tagName||'').toLowerCase();const enCampo=tag==='input'||tag==='textarea'||tag==='select'||ev.target?.isContentEditable;if(enCampo)return;if(ev.key==='Enter'){if(buffer.length>=6)enviar();else limpiar();return;}if(ev.key&&ev.key.length===1){buffer+=ev.key;if(timer)clearTimeout(timer);timer=setTimeout(enviar,130);}};document.addEventListener('keydown',onKey,true);return()=>{document.removeEventListener('keydown',onKey,true);if(timer)clearTimeout(timer);};},[zoneId,busy]);
  const esCodigoDeBarrasValido = useCallback((valor) => {
    const v = String(valor || '').trim();
    if (!v) return false;
    // Solo aceptar códigos numéricos (EAN/UPC/Code128 numérico)
    if (!/^[0-9]+$/.test(v)) return false;
    // Longitud típica de códigos de barras de inventario
    if (v.length < 6 || v.length > 18) return false;
    // Ignorar URLs o datos de QR
    if (v.toLowerCase().startsWith('http')) return false;
    return true;
  }, []);

  const handleCameraCode=useCallback((value)=>{
    const limpio = String(value||'').trim();
    if (!esCodigoDeBarrasValido(limpio)) {
      setError('Se ignoró un código no válido (posible QR). Usa el lector de código de barras.');
      setTimeout(()=>setError(''), 2500);
      return;
    }
    setCamera(false);
    setCode(limpio);
    setTimeout(()=>{const form=document.getElementById('scan-form');form?.requestSubmit();},100);
  },[esCodigoDeBarrasValido]);
  return <div className="page-stack"><div className="page-heading"><div><p className="eyebrow">CONTEO FÍSICO</p><h1>Escanear productos</h1><p className="muted">Usa la cámara del dispositivo o el lector físico conectado como teclado.</p></div><span className="live-tag"><span className="status-dot"/> CONTEO ACTIVO</span></div>{error&&<Notice type="error" message={error} onClose={()=>setError('')}/ >}{message&&<Notice message={message} onClose={()=>setMessage('')}/>}
{pendientesOffline.length>0 && <div className="notice" style={{background:'#fff4dc',color:'#9a580c',border:'1px solid #f7e8c9'}}><span>{pendientesOffline.length} escaneo(s) pendiente(s) sin conexión. <button className="text-btn" onClick={flushPendientes}>Enviar ahora</button></span></div>}<div className="scan-layout"><div className="scan-main"><Card className="scan-card"><div className="scan-card-header"><div className="scan-symbol"><ScanLine size={26}/></div><div><h2>Área de escaneo</h2><p className="muted">Cada lectura válida registra una unidad.</p></div></div><label>Zona de trabajo<select data-testid="zona-select" value={zoneId} onChange={e=>chooseZone(e.target.value)}><option value="">Selecciona la zona donde estás contando</option>{(()=>{const pdv=zones.filter(z=>(z.tipo||'PDV')!=='BODEGA').sort((a,b)=>a.numero-b.numero);const bod=zones.filter(z=>(z.tipo||'PDV')==='BODEGA').sort((a,b)=>a.numero-b.numero);return <>{pdv.length>0&&<optgroup label="PUNTO DE VENTA (PDV)">{pdv.map(z=><option value={z.id} key={z.id}>{z.numero} · {z.nombre||`Zona ${z.numero}`}</option>)}</optgroup>}{bod.length>0&&<optgroup label="BODEGA / ALMACÉN">{bod.map(z=><option value={z.id} key={z.id}>{z.numero} · {z.nombre||`Zona ${z.numero}`}</option>)}</optgroup>}</>;})()}</select></label>{zoneId&&<div className="selected-zone" data-testid="zona-seleccionada"><CheckCircle2 size={17}/><span>Zona seleccionada: <b>{`Zona ${zones.find(z=>String(z.id)===String(zoneId))?.numero}`}</b></span><button className="text-btn" data-testid="finalizar-zona" onClick={finishZone}>Finalizar zona</button></div>}<form id="scan-form" className="scan-form" onSubmit={scan}><label htmlFor="barcode">Código de barras</label><div className="scan-input-wrap"><Barcode size={23}/><input id="barcode" data-testid="barcode-input" ref={inputRef} value={code} onChange={e=>setCode(e.target.value)} placeholder="Escanea o escribe el código" autoComplete="off" autoFocus inputMode="numeric"/><button type="submit" data-testid="registrar-escaneo" className="btn primary" disabled={busy||!code.trim()}>{busy?<span className="spinner"/>:<ScanLine size={18}/>}<span>Registrar</span></button></div><p className="muted small">Compatible con el lector Zebra TC21/TC20: apunta al código y se registra solo. También puedes escribirlo.</p></form><div className="scan-tools">{cameraDisponible===false?<span className="scan-camera-hint"><ScanLine size={16}/> Lector Zebra activo: apunta al código con el gatillo y se registra solo.</span>:<button className="btn secondary" onClick={()=>setCamera(!camera)}><ScanLine size={17}/>{camera?'Ocultar cámara':'Escanear con cámara'}</button>}<button className="btn ghost" onClick={()=>{setCode('');inputRef.current?.focus();}}>Limpiar</button></div>{camera&&<CameraScanner onCode={handleCameraCode} onClose={()=>setCamera(false)}/>}</Card><Card><div className="card-heading"><div><h2>Últimas lecturas de esta sesión</h2><p className="muted">Las lecturas se guardan inmediatamente en la base de datos.</p></div></div>{recent.length?<div className="recent-list">{recent.map((r,i)=><div className="recent-row" key={`${r.id}-${i}`}><div className="recent-check"><CheckCircle2 size={18}/></div><div className="recent-desc"><b>{r.descripcion}</b><span className="mono">{r.codigo} · Zona {r.zona}</span></div><time>{new Date(r.fecha).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit',second:'2-digit'})}</time></div>)}</div>:<p className="empty-inline">Tus lecturas recientes aparecerán aquí.</p>}</Card><Card>
  <div className="card-heading"><div><h2>Lecturas de la zona seleccionada</h2><p className="muted">Registro individual por unidad. Puedes eliminar una lectura accidental sin afectar las demás.</p></div><div className="heading-icon"><ScanLine size={18}/></div></div>
  {cargandoList ? <p className="empty-inline">Cargando lecturas…</p> : listError ? <Notice type="error" message={listError} onClose={()=>setListError('')}/> : listados.length ? (
    <div className="table-wrap" data-testid="lista-lecturas"><table>
      <thead><tr><th>N°</th><th>Código</th><th>Referencia</th><th>Descripción</th><th>Talla</th><th>Color</th><th>Género</th><th>Estilo</th><th>Subgrupo</th><th>Fecha/Hora</th><th>Eliminar</th></tr></thead>
      <tbody>{listados.map((it, idx) => (<tr key={`${it.id}-${idx}`}><td>{it.posicion}</td><td className="mono">{it.codigoBarras}</td><td>{it.referencia || it.item || ''}</td><td>{it.descripcion || ''}</td><td>{it.talla || ''}</td><td>{it.color || ''}</td><td>{it.genero || ''}</td><td>{it.estilo || ''}</td><td>{it.subGrupo || ''}</td><td>{it.leidoEn ? new Date(it.leidoEn).toLocaleString('es-CO') : ''}</td><td><button className="btn ghost small-btn" data-testid={`eliminar-lectura-${it.id}`} onClick={()=>eliminarLectura(it)}>Eliminar</button></td></tr>))}</tbody>
    </table></div>
  ) : <p className="empty-inline">Sin lecturas en la zona seleccionada todavía.</p>}
</Card></div><aside className="scan-aside"><Card><div className="card-heading"><div><h2>Tu conteo en esta zona</h2><p className="muted">Lecturas tuyas en la zona seleccionada</p></div></div><div className="personal-stat"><span>Unidades en esta zona</span><b data-testid="resumen-unidades">{(zoneId ? unidadesZonaSel : (summary.unidades || 0)).toLocaleString('es-CO')}</b><div className="personal-stat-icon"><Barcode size={20}/></div></div><div className="personal-stat"><span>Códigos distintos en esta zona</span><b data-testid="resumen-distintos">{(zoneId ? distintosZonaSel : (summary.productosDistintos || 0)).toLocaleString('es-CO')}</b><div className="personal-stat-icon"><Boxes size={20}/></div></div><button className="btn secondary full" onClick={load}><RefreshCw size={16}/> Actualizar conteo</button></Card><Card><div className="card-heading"><div><h2>Total general</h2><p className="muted">Todas tus zonas en el inventario activo</p></div></div><div className="personal-stat"><span>Unidades totales</span><b data-testid="resumen-total">{summary.unidades?.toLocaleString('es-CO')||0}</b><div className="personal-stat-icon"><Barcode size={20}/></div></div><div className="personal-stat"><span>Códigos distintos totales</span><b data-testid="resumen-distintos-total">{summary.productosDistintos?.toLocaleString('es-CO')||0}</b><div className="personal-stat-icon"><Boxes size={20}/></div></div></Card><Card className="tip-card"><div className="tip-icon"><ShieldCheck size={21}/></div><h3>Buenas prácticas</h3><ul><li>Confirma la zona antes de comenzar.</li><li>Escanea cada unidad física una vez.</li><li>Si el código no existe, avisa a administración.</li><li>Finaliza la zona cuando termines.</li></ul></Card></aside></div></div>;
}

export default ScanPage;
