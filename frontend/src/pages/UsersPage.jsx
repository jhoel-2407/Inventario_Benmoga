import { useCallback, useEffect, useState } from 'react';
import { Check, Palette, Plus, RefreshCw, Trash2, Users } from 'lucide-react';
import { api } from '../lib/api.js';
import { COLORES_DISPONIBLES, colorForUser, initials } from '../lib/avatar.js';
import Notice from '../components/Notice.jsx';
import Card from '../components/Card.jsx';
import Empty from '../components/Empty.jsx';
import Modal from '../components/Modal.jsx';

const COLOR_POR_DEFECTO = COLORES_DISPONIBLES[1];

// Paleta de colores. La administradora elige con cuál se identifica cada persona.
function MuestraColores({ value, onChange }) {
  return <div className="color-picker">
    {COLORES_DISPONIBLES.map((hex) => {
      const activo = (value || '').toLowerCase() === hex.toLowerCase();
      return <button key={hex} type="button" className={`color-swatch ${activo ? 'active' : ''}`} style={{ background: hex }} title={hex} aria-label={`Color ${hex}`} onClick={() => onChange(hex)}>{activo ? <Check size={16} /> : null}</button>;
    })}
  </div>;
}

function UsersPage() {
  const [users, setUsers] = useState([]);
  const [nombre, setNombre] = useState('');
  const [correo, setCorreo] = useState('');
  const [password, setPassword] = useState('');
  const [rol, setRol] = useState('EMPLEADO');
  const [color, setColor] = useState(COLOR_POR_DEFECTO);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [editando, setEditando] = useState(null);
  const [colorEdit, setColorEdit] = useState('');

  const load = useCallback(async () => {
    try { const d = await api('/api/auth/usuarios'); setUsers(d.usuarios || []); }
    catch (e) { setError(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function create(e) {
    e.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      await api('/api/auth/usuarios', { method: 'POST', body: JSON.stringify({ nombre, correo, password, rol, color }) });
      setNotice(`Usuario creado correctamente${nombre ? `: ${nombre}` : ''}.`);
      setNombre(''); setCorreo(''); setPassword(''); setRol('EMPLEADO'); setColor(COLOR_POR_DEFECTO);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  function abrirColor(u) { setError(''); setNotice(''); setEditando(u); setColorEdit(u.color || colorForUser(u).fg); }
  async function eliminarUsuario(u) {
    if (!window.confirm(`¿Desactivar al usuario ${u.nombre}? No podrá iniciar sesión, pero su historial se conserva.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/auth/usuarios/${u.id}`, { method: 'DELETE' });
      setNotice(`Usuario ${u.nombre} desactivado.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function eliminarDefinitivo(u) {
    if (!window.confirm(`¿ELIMINAR DEFINITIVAMENTE a ${u.nombre}? Se borrarán todos sus escaneos, sesiones y datos. Esta acción NO se puede deshacer.`)) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api(`/api/auth/usuarios/${u.id}?definitivo=1`, { method: 'DELETE' });
      setNotice(`Usuario ${u.nombre} eliminado definitivamente.`);
      await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  async function guardarColor() {
    if (!editando) return;
    setBusy(true); setError('');
    try {
      await api(`/api/auth/usuarios/${editando.id}`, { method: 'PATCH', body: JSON.stringify({ color: colorEdit }) });
      setNotice(`Color actualizado para ${editando.nombre}.`);
      setEditando(null); await load();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }

  const previa = colorForUser({ nombre: nombre || 'Nuevo usuario', color });

  return <div className="page-stack">
    <div className="page-heading"><div><p className="eyebrow">EQUIPO DE TRABAJO</p><h1>Usuarios</h1><p className="muted">Administra los accesos de empleados y administradores, y asígnale a cada uno su color de identificación.</p></div></div>
    {error && <Notice type="error" message={error} onClose={() => setError('')} />}
    {notice && <Notice message={notice} onClose={() => setNotice('')} />}
    <div className="two-column">
      <Card>
        <div className="card-heading"><div><h2>Crear usuario</h2><p className="muted">La contraseña debe tener al menos 10 caracteres.</p></div><div className="heading-icon"><Users /></div></div>
        <form className="form-stack" onSubmit={create}>
          <label>Nombre completo<input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre del empleado" minLength={2} maxLength={120} required /></label>
          <label>Correo electrónico<input type="email" value={correo} onChange={e => setCorreo(e.target.value)} placeholder="empleado@empresa.com" required /></label>
          <label>Contraseña inicial<input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Mínimo 10 caracteres" minLength={10} required /></label>
          <label>Rol<select value={rol} onChange={e => setRol(e.target.value)}><option value="EMPLEADO">Empleado</option><option value="ADMINISTRADORA">Administradora</option></select></label>
          <label>Color de identificación <span className="optional">(aparece en el monitoreo y en el Excel)</span>
            <MuestraColores value={color} onChange={setColor} />
          </label>
          <div className="color-preview">
            <div className="avatar" style={{ background: previa.bg, color: previa.fg }}>{initials(nombre || 'Nuevo usuario')}</div>
            <div><b>{nombre || 'Nuevo usuario'}</b><br /><span>Así se verá su nombre en el monitoreo en vivo.</span></div>
          </div>
          <button className="btn primary full" disabled={busy}>{busy ? <span className="spinner" /> : <Plus size={17} />} Crear usuario</button>
        </form>
      </Card>
      <Card>
        <div className="card-heading"><div><h2>Usuarios registrados</h2><p className="muted">Cuentas que pueden acceder al sistema.</p></div><div className="action-row"><button className="btn secondary small-btn" onClick={load}><RefreshCw size={15} /></button><button className="btn ghost tiny-btn danger" onClick={async () => { if (!window.confirm('¿Eliminar definitivamente TODOS los usuarios de prueba (@benmoga.test)?')) return; setBusy(true); try { const d = await api('/api/auth/usuarios/test', { method: 'DELETE' }); setNotice(d.mensaje); await load(); } catch (e) { setError(e.message); } finally { setBusy(false); } }} title="Eliminar usuarios de prueba"><Trash2 size={14} /> Eliminar de prueba</button></div></div>
        {users.length ? <div className="user-list">{users.map(u => {
          const c = colorForUser(u);
          return <div className="user-row" key={u.id}>
            <div className="avatar" style={{ background: c.bg, color: c.fg, opacity: u.activo === false ? 0.4 : 1 }}>{initials(u.nombre)}</div>
            <div className="user-row-info"><b style={{ textDecoration: u.activo === false ? 'line-through' : 'none', opacity: u.activo === false ? 0.5 : 1 }}>{u.nombre}</b><span>{u.correo}</span></div>
            <span className={`pill ${u.rol === 'ADMINISTRADORA' ? 'green' : 'gray'}`}>{u.rol}</span>
            {u.activo === false && <span className="pill gray">INACTIVO</span>}
            {u.activo !== false && <button className="btn ghost tiny-btn" onClick={() => abrirColor(u)} title="Cambiar el color de este usuario"><Palette size={14} /></button>}
            {u.activo !== false && <button className="btn ghost tiny-btn danger" onClick={() => eliminarUsuario(u)} title="Desactivar usuario"><Trash2 size={14} /></button>}
            <button className="btn ghost tiny-btn danger" onClick={() => eliminarDefinitivo(u)} title="Eliminar definitivamente"><Trash2 size={14} /> Definitivo</button>
          </div>;
        })}</div> : <Empty icon={Users} title="Sin usuarios" text="Crea el primer usuario para empezar." />}
      </Card>
    </div>

    {editando && <Modal title="Color de identificación" subtitle={editando.nombre} onClose={() => setEditando(null)}
      footer={<>
        <button type="button" className="btn ghost" onClick={() => setEditando(null)} disabled={busy}>Cancelar</button>
        <button type="button" className="btn primary" onClick={guardarColor} disabled={busy}>{busy ? <><span className="spinner" /> Guardando…</> : <><Check size={16} /> Guardar color</>}</button>
      </>}>
      <p className="muted small">Elige el color con el que esta persona aparecerá en el monitoreo en vivo y en el resumen por zona del Excel.</p>
      <MuestraColores value={colorEdit} onChange={setColorEdit} />
      <div className="color-preview" style={{ marginTop: 14 }}>
        <div className="avatar" style={{ background: colorForUser({ color: colorEdit }).bg, color: colorForUser({ color: colorEdit }).fg }}>{initials(editando.nombre)}</div>
        <div><b>{editando.nombre}</b><br /><span>{colorEdit}</span></div>
      </div>
    </Modal>}
  </div>;
}

export default UsersPage;
