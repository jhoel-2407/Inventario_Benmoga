// Color de identificación por persona. La administradora puede asignarle un color
// a cada usuario; si no lo hace, se calcula uno estable a partir de su id para que
// cada persona tenga siempre su tono. El orden de PALETA coincide con el del
// backend (backend/src/lib/colores.js) para que el color se vea igual en la app
// y en el Excel.
export const PALETA = [
  { bg: '#ffe4e9', fg: '#be123c' },
  { bg: '#e0ecff', fg: '#1d4ed8' },
  { bg: '#dcfce7', fg: '#15803d' },
  { bg: '#f3e8ff', fg: '#7e22ce' },
  { bg: '#ffedd5', fg: '#c2410c' },
  { bg: '#cffafe', fg: '#0e7490' },
  { bg: '#fef3c7', fg: '#a16207' },
  { bg: '#fce7f3', fg: '#be185d' },
  { bg: '#e2e8f0', fg: '#334155' },
  { bg: '#ede9fe', fg: '#5b21b6' },
];

// Colores que la administradora puede elegir (el tono "fuerte" de cada pareja).
export const COLORES_DISPONIBLES = PALETA.map((p) => p.fg);

const HEX = /^#[0-9a-f]{6}$/i;

// Mezcla un color con blanco para conseguir un fondo suave (igual que el backend).
export function tinteSuave(hex, factor = 0.88) {
  const h = String(hex).trim().replace(/^#/, '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mezcla = (c) => Math.round(c + (255 - c) * factor);
  const dos = (n) => n.toString(16).padStart(2, '0');
  return `#${dos(mezcla(r))}${dos(mezcla(g))}${dos(mezcla(b))}`;
}

export function colorForUser(user) {
  const elegido = typeof user?.color === 'string' && HEX.test(user.color.trim())
    ? user.color.trim().toLowerCase()
    : null;
  if (elegido) {
    const par = PALETA.find((p) => p.fg.toLowerCase() === elegido);
    return par || { bg: tinteSuave(elegido), fg: elegido };
  }
  const clave = String(user?.id ?? user?.correo ?? user?.nombre ?? 'usuario');
  let hash = 0;
  for (let i = 0; i < clave.length; i++) hash = (hash * 31 + clave.charCodeAt(i)) >>> 0;
  return PALETA[hash % PALETA.length];
}

export function initials(nombre) {
  return (nombre || 'U')
    .split(' ')
    .filter(Boolean)
    .map((s) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();
}
