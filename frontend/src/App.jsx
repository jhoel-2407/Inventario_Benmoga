import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { api, clearSession, getLocal, getToken, getUser, setLocal } from './lib/api.js';
import { conectarRealtime } from './lib/realtime.js';
import Shell from './components/Shell.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import ToastNotificacion from './components/ToastNotificacion.jsx';
import Login from './pages/Login.jsx';
import LocalPicker from './pages/LocalPicker.jsx';
import Dashboard from './pages/Dashboard.jsx';
import EmployeeHome from './pages/EmployeeHome.jsx';
import Inventories from './pages/Inventories.jsx';
import ScanPage from './pages/ScanPage.jsx';
import Zones from './pages/Zones.jsx';
import MonitoreoZonas from './pages/MonitoreoZonas.jsx';
import Comparativo from './pages/Comparativo.jsx';
import Locales from './pages/Locales.jsx';
import UsersPage from './pages/UsersPage.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  const [user,setUser]=useState(getUser);const [local,setLocalState]=useState(getLocal);const [ready,setReady]=useState(false);const [notificaciones,setNotificaciones]=useState([]);const [toast,setToast]=useState(null);const navigate=useNavigate();
  useEffect(()=>{let active=true;async function check(){if(!getToken()){setReady(true);return;}try{const d=await api('/api/auth/me');if(active){setUser(d.usuario);localStorage.setItem('levis_user',JSON.stringify(d.usuario));}}catch{if(active){clearSession();setUser(null);}}finally{if(active)setReady(true);}}check();const logout=()=>{setUser(null);setLocalState(null);navigate('/login');};window.addEventListener('levis:logout',logout);return()=>{active=false;window.removeEventListener('levis:logout',logout);};},[navigate]);
  // Tiempo real: el backend avisa de cada lectura y de cada zona terminada.
  useEffect(()=>{
    if(!user||!local)return;
    const soltar=conectarRealtime({ localId: local.id, onEvento: (ev)=>{
      window.dispatchEvent(new CustomEvent('levis:realtime',{detail:ev}));
      if(ev.tipo==='zona_finalizada'&&user.rol==='ADMINISTRADORA'){
        const n={ id:`${Date.now()}-${Math.random().toString(16).slice(2)}`, zona: ev.zona?.nombre||`Zona ${ev.zona?.numero}`, empleado: ev.empleado?.nombre||'Empleado', unidades: ev.unidades||0, lecturas: ev.lecturas||0, hora: ev.hora||new Date().toISOString(), leida:false };
        setNotificaciones(prev=>[n,...prev].slice(0,30));
        setToast(n);
      }
    }});
    return soltar;
  },[user,local]);
  useEffect(()=>{ if(!toast)return; const t=setTimeout(()=>setToast(null),7000); return ()=>clearTimeout(t); },[toast]);
  const logout=async()=>{try{await api('/api/auth/logout',{method:'POST'});}catch{ /* ignora */ } clearSession();setUser(null);setLocalState(null);setNotificaciones([]);navigate('/login');};
  const pickLocal=(l)=>{setLocal(l);setLocalState({id:l.id,nombre:l.nombre});localStorage.removeItem('levis_zone');navigate('/');};
  if(!ready)return <div className="loading-screen"><img className="brand-logo big" src="/logo-blesscard.png" alt="BLESSCARD"/><span className="spinner"/>Cargando aplicación…</div>;
  if(!user)return <Routes><Route path="/login" element={<Login onLogin={u=>{setUser(u);navigate('/');}}/>}/><Route path="*" element={<Navigate to="/login" replace/>}/></Routes>;
  if(!local)return <LocalPicker user={user} onPick={pickLocal} onLogout={logout}/>;
  return <ErrorBoundary><ToastNotificacion noti={toast} onClose={()=>setToast(null)}/><Shell user={user} local={local} onChangeLocal={()=>setLocalState(null)} onLogout={logout} notificaciones={notificaciones} sinLeer={notificaciones.filter(n=>!n.leida).length} onMarcarLeidas={()=>setNotificaciones(prev=>prev.map(n=>n.leida?n:{...n,leida:true}))}><Routes><Route path="/" element={user.rol==='ADMINISTRADORA'?<Dashboard local={local}/>:<EmployeeHome user={user} local={local}/>}/><Route path="/inventarios" element={user.rol==='ADMINISTRADORA'?<Inventories local={local}/>:<Navigate to="/conteo" replace/>}/><Route path="/conteo" element={<ScanPage local={local} user={user}/>}/><Route path="/zonas" element={<Zones local={local}/>}/><Route path="/monitoreo" element={user.rol==='ADMINISTRADORA'?<MonitoreoZonas local={local}/>:<Navigate to="/conteo" replace/>}/><Route path="/comparativo" element={user.rol==='ADMINISTRADORA'?<Comparativo local={local}/>:<Navigate to="/conteo" replace/>}/><Route path="/locales" element={user.rol==='ADMINISTRADORA'?<Locales/>:<Navigate to="/conteo" replace/>}/><Route path="/usuarios" element={user.rol==='ADMINISTRADORA'?<UsersPage/>:<Navigate to="/conteo" replace/>}/><Route path="*" element={<NotFound/>}/></Routes></Shell></ErrorBoundary>;
}
