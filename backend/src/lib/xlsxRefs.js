// Utilidades compartidas para referencias XLSX y normalización de códigos.
// Compatible con columnas AA, AB, ... (sin límite en Z).

export function colLetter(num) {
  let n = Math.max(1, Number(num) || 1);
  let s = "";
  while (n > 0) {
    const rest = (n - 1) % 26;
    s = String.fromCharCode(65 + rest) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function colNumber(letters) {
  let n = 0;
  for (const ch of String(letters || "").toUpperCase()) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}

export function sheetRef(name) {
  const s = String(name ?? "");
  // Excel requiere comillas si el nombre tiene espacios o caracteres no alfanuméricos.
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(s) ? s : `'${s.replace(/'/g, "''")}'`;
}

// Conserva el código como identificador (texto). No altera lo almacenado en BD.
export function codeText(value) {
  if (value === null || value === undefined) return "";
  let s = String(value).trim();
  if (/^-?\d+\.0+$/.test(s)) s = s.replace(/\.0+$/, "");
  return s;
}

// Claves de búsqueda: exacta y variante sin ceros iniciales (solo para emparejar).
export function codeKeys(value) {
  const s = codeText(value);
  if (!s) return [];
  return [s, s.replace(/^0+/, "")].filter((k, i, a) => k && a.indexOf(k) === i);
}

// ExcelJS solo acepta primitivos como `result`. Evita fórmulas anidadas/texto enriquecido.
export function safeResult(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    if (value.result !== undefined && value.result !== null) return safeResult(value.result);
    if (value.text !== undefined && value.text !== null) return String(value.text);
    if (Array.isArray(value.richText)) return value.richText.map((t) => String(t.text ?? "")).join("");
  }
  return null;
}

// Construye VLOOKUP con la columna de inicio real de la tabla (no siempre A).
// `guardarVacio` evita #N/A en filas donde el usuario aún no digitó un código.
export function formulaVLOOKUP({
  codeCol = 2,
  row,
  sheet,
  tableStartCol = 1,
  tableEndCol,
  tableLastRow,
  sourceCol,
  guardarVacio = true,
}) {
  const cell = `$${colLetter(codeCol)}${row}`;
  const start = colLetter(tableStartCol);
  const end = colLetter(Math.max(tableEndCol, sourceCol));
  const rango = `${sheetRef(sheet)}!$${start}$2:$${end}$${Math.max(2, tableLastRow || 2)}`;
  const idx = Math.max(1, Number(sourceCol) - Number(tableStartCol) + 1);
  const vlookup = `VLOOKUP(${cell},${rango},${idx},0)`;
  return guardarVacio ? `IF(${cell}="","",${vlookup})` : vlookup;
}
