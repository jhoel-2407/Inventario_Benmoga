function tiempoHace(fechaIso) {
  if (!fechaIso) return '—';
  const f = new Date(fechaIso);
  if (isNaN(f.getTime())) return '—';
  const diff = Math.max(0, Math.floor((Date.now() - f.getTime()) / 1000));
  if (diff < 5) return 'hace unos segundos';
  if (diff < 60) return `hace ${diff}s`;
  const m = Math.floor(diff / 60);
  if (m < 60) return `hace ${m}m ${diff % 60}s`;
  const h = Math.floor(m / 60);
  return `hace ${h}h ${m % 60}m`;
}

export { tiempoHace };
