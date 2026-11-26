// Deriva la estructura real de la hoja de escaneo (LECTURA / ESCANEO / ESACNEO)
// de cada plantilla, en lugar de asumir encabezados en A1, código en B o tabla en A.
// Toda la lógica es de solo lectura sobre un Workbook de ExcelJS ya cargado.

export function normalizar(v) {
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

// Canónicos compartidos entre conversor y comparativo.
export const CANON = {
  zona: ["zona", "zonas"],
  codigo: [
    "codigo barra", "codigo barras", "codigo de barras", "codigo de barra", "cod barras",
    "c de barra", "c de barras", "c barras", "barra", "barras", "barcode", "plu",
    "codigobarra", "codigo barras articulo", "codigo de barras ean", "cod barras 2",
    "cod barras 3", "cod barras3", "codigo barras", "codigo barra articulo",
    "codigo alterno", "cod alterno",
  ],
  referencia: ["referencia", "ref", "referencia producto", "referencia proveedor", "referenciaproveedor"],
  item: ["item", "id articulo", "idarticulo", "codigo articulo", "codigo de articulo", "cod articulo", "codigo producto", "sku"],
  desc: [
    "descripcion", "desc item", "desc. item", "descripcion item", "descripcion producto",
    "descrip corta", "descripcion corta", "descric pcorta", "nombre articulo",
    "nombre del articulo", "nombre producto", "nombre", "producto", "detalle",
  ],
  genero: ["genero", "sexo", "subfamilia", "sub familia"],
  linea: [
    "linea", "familia", "família", "tipo", "tipos de prenda", "estilo", "categoria",
    "categorias", "departamento", "grupo",
  ],
  talla: ["talla", "medida", "size", "detalle ext 2", "detalle ext. 2", "desc detalle ext 2", "desc. detalle ext. 2"],
  colorProd: ["color", "colour", "detalle ext 1", "detalle ext. 1", "desc detalle ext 1", "desc. detalle ext. 1", "gdi libelle 1", "gdi_libelle_1"],
  marca: ["marca", "sub grupo", "subgrupo", "brand"],
  grupoLinea: ["grupo linea", "grupolinea", "id grupo linea", "idgrupolinea"],
  centroCosto: ["centro costo", "centrocosto", "id unidad negocio", "idunidadnegocio"],
  precio: ["precio unitario", "precio lista", "precio sin iva", "precio_lista", "precio_sin_iva", "precio"],
  iva: ["iva venta", "iva_venta", "iva"],
  estado: ["estado", "status"],
  existencia: ["existencia", "fisica", "físico", "fisico", "stock", "disponibles", "disponible", "total existencia", "total_existencia"],
};

export function campoDeHeader(header) {
  const n = normalizar(header);
  if (!n) return null;
  for (const [campo, syns] of Object.entries(CANON)) {
    if (syns.some((s) => normalizar(s) === n)) return campo;
  }
  for (const [campo, syns] of Object.entries(CANON)) {
    if (syns.some((s) => s.length > 3 && (n.includes(normalizar(s)) || normalizar(s).includes(n)))) return campo;
  }
  return null;
}

function headersFisicos(ws, fila) {
  const out = [];
  ws.getRow(fila).eachCell({ includeEmpty: true }, (cell, col) => {
    const v = String(cell.value ?? "").trim();
    if (v) out[col - 1] = v;
  });
  return out;
}

function detectarFilaHeader(ws) {
  const KW = ["codigo", "barras", "barcode", "existencia", "stock", "referencia", "item", "descripcion", "cantidad", "cant", "ean", "plu", "fisica", "disponibles", "zona", "conteo", "escaneo", "diferencia", "cedula", "nombre", "desc"];
  for (let r = 1; r <= Math.min(ws.rowCount, 20); r++) {
    const cells = [];
    ws.getRow(r).eachCell({ includeEmpty: true }, (cell) => {
      const v = String(cell.value ?? "").trim();
      if (v) cells.push(normalizar(v));
    });
    if (cells.length && KW.filter((kw) => cells.some((c) => c.includes(kw))).length >= 2) return r;
  }
  return 1;
}

// Extrae la columna de resultado de una VLOOKUP original (índice absoluto en INVENTARIO).
function columnaOriginal(formula) {
  if (!formula) return null;
  const m = String(formula).match(/VLOOKUP\s*\([^,]+,[^,]+,\s*(\d+)\s*,/i);
  return m ? Number(m[1]) : null;
}

/**
 * @param {import("exceljs").Workbook} wb
 * @param {string} invSheetName
 * @param {number} [invHeaderRow]
 * @param {string[]} [invHeaders]
 */
export function leerSpecScan(wb, invSheetName, invHeaderRow, invHeaders) {
  const scanName = wb.worksheets.map((w) => w.name).find((n) => {
    const v = normalizar(n);
    return v === "lectura" || v === "escaneo" || v === "esacneo";
  });
  if (!scanName) return null;
  const ws = wb.getWorksheet(scanName);
  const tipo = normalizar(scanName) === "lectura" ? "lectura" : "escaneo";
  const headerRow = detectarFilaHeader(ws);
  const headers = headersFisicos(ws, headerRow);

  const invWs = wb.getWorksheet(invSheetName);
  const invRow = invHeaderRow || (invWs ? detectarFilaHeader(invWs) : 1);
  const invH = invHeaders || (invWs ? headersFisicos(invWs, invRow) : []);
  const invCampos = invH.map((h) => campoDeHeader(h));

  // Fórmulas originales en la primera fila de datos (ExcelJS expande shared formulas).
  const originales = new Map();
  if (invWs) {
    const fila = ws.getRow(headerRow + 1);
    fila.eachCell({ includeEmpty: false }, (cell, col) => {
      if (cell.value && typeof cell.value === "object" && cell.value.formula) {
        const idx = columnaOriginal(cell.value.formula);
        if (idx) originales.set(col, idx);
      }
    });
  }

  const zonaCol = headers.findIndex((h) => ["zona", "zonas"].includes(normalizar(h))) + 1;

  // Código de barras: priorizar sinónimos; si no hay, usar Referencia en la 2ª columna.
  let codeCol = headers.findIndex((h, i) => i !== zonaCol - 1 && campoDeHeader(h) === "codigo") + 1;
  if (!codeCol) {
    const candidata = headers.findIndex((h, i) => i !== zonaCol - 1 && ["referencia", "item"].includes(campoDeHeader(h)));
    if (candidata >= 0) codeCol = candidata + 1;
  }
  if (!codeCol) codeCol = zonaCol === 1 ? 2 : 1;

  // Lo que escribe el usuario es siempre el código escaneado (código de barras),
  // aunque el encabezado de la hoja diga "Referencia" (Ambiente Gourmet) o "PLU".
  // Por eso la columna de búsqueda se toma del campo canónico `codigo` del
  // INVENTARIO, no del texto del encabezado de la hoja de escaneo.
  let lookupCol = invCampos.findIndex((c) => c === "codigo") + 1;
  if (!lookupCol) {
    const codeHeader = headers[codeCol - 1] || "";
    lookupCol = invH.findIndex((h) => normalizar(h) === normalizar(codeHeader)) + 1;
    if (!lookupCol) {
      const campo = campoDeHeader(codeHeader);
      lookupCol = invCampos.findIndex((c) => c === campo) + 1;
    }
  }
  if (!lookupCol) lookupCol = 1;

  // Mapeo de columnas LECTURA -> INVENTARIO, respetando posiciones físicas.
  const usados = new Set([lookupCol]);
  const columnas = new Map();
  headers.forEach((h, idx) => {
    const col = idx + 1;
    if (col === zonaCol || col === codeCol) return;
    const orig = originales.get(col);
    const campo = campoDeHeader(h);
    let invCol = null;
    if (tipo === "escaneo" && orig) {
      invCol = orig; // En ESCANEO la plantilla original es la fuente de verdad.
    } else {
      // Exacto primero
      invCol = invH.findIndex((ih, j) => !usados.has(j + 1) && normalizar(ih) === normalizar(h)) + 1 || null;
      if (!invCol && campo) {
        invCol = invCampos.findIndex((c, j) => !usados.has(j + 1) && c === campo) + 1 || null;
      }
      // Las plantillas antiguas pueden tener índices de VLOOKUP que ya no
      // coinciden con el INVENTARIO generado (p. ej. Superdry: K apuntaba a 10
      // = "Precio unitario" en la plantilla, pero hoy 10 es "Precio unitario"
      // y 11 es "Existencia"). Solo se usa el índice original si la columna
      // destino es semánticamente compatible con el encabezado de la hoja.
      if (!invCol && orig && orig <= invH.length && campo) {
        const invCampo = campoDeHeader(invH[orig - 1]);
        if (invCampo === campo || normalizar(invH[orig - 1]) === normalizar(h)) invCol = orig;
      }
    }
    if (invCol) {
      usados.add(invCol);
      columnas.set(col, invCol);
    }
  });

  const invCols = [...columnas.values()];
  return {
    sheetName: scanName,
    tipo,
    headerRow,
    headers,
    zonaCol,
    codeCol,
    lookupCol,
    tableStartCol: lookupCol,
    tableEndCol: Math.max(lookupCol, ...invCols, invH.length ? invH.length : lookupCol),
    invSheetName,
    invHeaders: invH,
    columnas, // Map<colScan, colInv>
    originales,
  };
}
