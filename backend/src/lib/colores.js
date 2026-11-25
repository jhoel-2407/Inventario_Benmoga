// Paleta de identificación por persona. El orden y los códigos son los MISMOS
// que los del frontend (frontend/src/lib/avatar.js), así el color que elige la
// administradora se ve igual en la pantalla y en el Excel.
export const PALETA_COLORES = [
  "#be123c",
  "#1d4ed8",
  "#15803d",
  "#7e22ce",
  "#c2410c",
  "#0e7490",
  "#a16207",
  "#be185d",
  "#334155",
  "#5b21b6",
];

// ¿Es un color hex de 6 dígitos tipo "#1d4ed8"?
export function esHexColor(valor) {
  return typeof valor === "string" && /^#[0-9a-f]{6}$/i.test(valor.trim());
}

// Mezcla el color con blanco para sacar un fondo suave. Mismo cálculo que la app.
export function tinteSuave(hex, factor = 0.88) {
  const h = String(hex).trim().replace(/^#/, "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const mezcla = (c) => Math.round(c + (255 - c) * factor);
  const dos = (n) => n.toString(16).padStart(2, "0");
  return `#${dos(mezcla(r))}${dos(mezcla(g))}${dos(mezcla(b))}`;
}

// Color de un usuario: el que escogió la administradora o, si no tiene, uno
// estable derivado de su id (igual que el respaldo de la app).
export function colorDeUsuario(usuario) {
  if (esHexColor(usuario?.color)) return usuario.color.trim().toLowerCase();
  const clave = String(usuario?.id ?? usuario?.correo ?? usuario?.nombre ?? "usuario");
  let hash = 0;
  for (let i = 0; i < clave.length; i++) hash = (hash * 31 + clave.charCodeAt(i)) >>> 0;
  return PALETA_COLORES[hash % PALETA_COLORES.length];
}

// "FFRRGGBB" para ExcelJS (argb).
export function argb(hex) {
  return "FF" + String(hex).trim().replace(/^#/, "").slice(0, 6).toUpperCase();
}
