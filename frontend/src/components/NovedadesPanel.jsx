import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../lib/api.js';
import Card from './Card.jsx';
import Empty from './Empty.jsx';

export default function NovedadesPanel({ inventarioId, usuarioId, zonaId }) {
  const [novedades, setNovedades] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!inventarioId) { setNovedades([]); return; }
    setLoading(true);
    const qs = new URLSearchParams({ inventarioId });
    if (usuarioId) qs.set('usuarioId', usuarioId);
    if (zonaId) qs.set('zonaId', zonaId);
    api(`/api/escaneos/novedades?${qs.toString()}`)
      .then((d) => setNovedades(d.novedades || []))
      .catch(() => setNovedades([]))
      .finally(() => setLoading(false));
  }, [inventarioId, usuarioId, zonaId]);

  return (
    <Card>
      <div className="card-heading">
        <div><h3>Novedades (N/A)</h3><p className="muted">Productos escaneados que no pertenecen al inventario activo (sobrantes o trocados).</p></div>
        <span className="pill gray">{novedades.length} N/A</span>
      </div>
      {loading ? <p className="muted">Cargando…</p> : novedades.length === 0 ? (
        <Empty icon={AlertTriangle} title="Sin novedades" text="No se han registrado productos N/A." />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table" style={{ width: '100%' }}>
            <thead><tr><th>Zona</th><th>Posición</th><th>Código</th><th>Descripción</th><th>Empleado</th><th>Fecha</th></tr></thead>
            <tbody>
              {novedades.map((n) => (
                <tr key={n.id}>
                  <td>{`Zona ${n.zona}`}</td>
                  <td>{n.posicion}</td>
                  <td>{n.codigoBarras}</td>
                  <td>{n.descripcion || '—'}</td>
                  <td>{n.usuario}</td>
                  <td>{new Date(n.leidoEn).toLocaleString('es-CO')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}