import { useMemo } from 'react';

// Detalle de los códigos de barras que componen una referencia (talla, color, etc.).
// Se reutiliza en Monitoreo y en el Comparativo. `manejaTallas` decide si se muestra
// la columna del maestro (detalle1/detalle2), para no mostrarla en locales que no la traen.
function ReferenciaCodigos({ productos = [], referencia, manejaTallas = false }) {
  const filas = useMemo(() => {
    if (!referencia) return [];
    return productos
      .filter((p) => (p.referencia || p.item || p.estilo || 'SIN REFERENCIA') === referencia)
      .sort((a, b) => String(a.codigoBarras).localeCompare(String(b.codigoBarras)));
  }, [productos, referencia]);

  if (!filas.length) return <p className="empty-inline">Sin códigos de barras para esta referencia.</p>;

  return <div className="table-wrap"><table>
    <thead><tr><th>Código de barras</th><th>Item</th>{manejaTallas && <th>Talla / Detalle</th>}<th className="num">Maestra</th><th className="num">Contado</th><th className="num">Diferencia</th><th>Estado</th></tr></thead>
    <tbody>{filas.map((p) => <tr key={p.codigoBarras}>
      <td className="mono">{p.codigoBarras}</td>
      <td><b>{p.item || '—'}</b><span className="table-sub">{p.descripcion || 'Sin descripción'}{p.estilo ? ` · ${p.estilo}` : ''}</span></td>
      {manejaTallas && <td>{[p.detalle1, p.detalle2].filter(Boolean).join(' · ') || '—'}</td>}
      <td className="num">{p.existencia.toLocaleString('es-CO')}</td>
      <td className="num">{p.contado.toLocaleString('es-CO')}</td>
      <td className={`num ${p.diferencia < 0 ? 'dif-neg' : p.diferencia > 0 ? 'dif-pos' : ''}`}>{p.diferencia > 0 ? `+${p.diferencia.toLocaleString('es-CO')}` : p.diferencia.toLocaleString('es-CO')}</td>
      <td><span className={`estado-badge ${(p.estado || '').toLowerCase().replace(' ', '-')}`}>{p.estado}</span></td>
    </tr>)}</tbody>
  </table></div>;
}

export default ReferenciaCodigos;
