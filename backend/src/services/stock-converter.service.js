import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { extraerDefinedNames, reescribirFormulasConDefinedNames } from "../lib/definedNames.js";

// ============================================================================
// Sinónimos para detectar columnas del archivo STOCK (normalizados).
// ============================================================================
const SINONIMOS_STOCK = {
  codigo: ["codigo barra principal", "codigo de barras", "codigo barra", "codigo barras", "codigobarra", "codigobarras", "codigo", "cod barra", "cod barras", "barcode", "ean", "upc", "plu", "codigo alterno", "cod alterno", "codigo de barra"],
  referencia: ["referencia", "ref", "ref producto", "codigo referencia", "referenciaproveedor", "referencia proveedor"],
  item: ["item", "codigo item", "cod item", "id item", "item producto", "idarticulo", "id articulo", "codigo articulo", "codigo de articulo", "cod articulo", "codigo producto", "sku", "id articulo"],
  desc: ["desc item", "descripcion", "descripcion item", "descripcion producto", "desc producto", "nombre articulo", "nombre del articulo", "nombre producto", "nombre", "producto", "detalle", "detalle producto", "descripcion articulo", "descrip corta", "descripcion corta", "desc corta", "descripcioncorta", "descripcion corta"],
  detalle1: ["detalle ext 2", "detalle ext. 2", "talla", "size", "medida", "desc detalle ext 2", "detalle ext2"],
  detalle2: ["detalle ext 1", "detalle ext. 1", "color", "colour", "desc detalle ext 1", "detalle ext1"],
  tipo: ["tipo", "tipo producto", "linea", "familia", "categoria", "departamento", "descripcion linea", "descripcion_linea", "grupolinea", "grupo linea", "idlinea", "id linea", "tipos de prenda", "categorias"],
  genero: ["genero", "sexo", "subfamilia"],
  marca: ["marca", "brand", "descripcion linea", "descripcion_linea", "idlinea", "departamento", "subfamilia"],
  estado: ["estado", "status", "estado del item"],
  existencia: ["existencia", "cant disponible", "cantidad disponible", "stock", "cantidad", "cant", "exist", "disponible", "saldo", "unidades", "fisica", "fisico", "disponibles", "total existencia", "total_existencia"],
  centroCosto: ["centro costo", "centro de costo", "centrocosto", "id unidad negocio", "id_unidad_negocio", "unidad negocio"],
  grupoLinea: ["grupo linea", "grupolinea", "grupo de linea", "id grupo linea", "id_grupo_linea", "grupolinea"],
  precio: ["precio lista", "precio_lista", "precio sin iva", "precio_sin_iva", "precio unitario", "precio", "valor", "costo"],
  iva: ["iva venta", "iva_venta", "iva"],
};

const ALIAS_MAESTRA_A_STOCK = {
  "codigo barra articulo": ["codigobarra", "codigo barra", "codigo barras"],
  "codigo barras articulo": ["codigobarra", "codigo barra", "codigo barras"],
  "cod barras 3": ["codigobarra", "codigo barra", "codigo barras"],
  "id articulo": ["idarticulo", "id articulo", "item"],
  "referencia proveedor": ["referenciaproveedor", "referencia proveedor", "referencia"],
  "descrip corta": ["descripcioncorta", "descripcion corta", "desc item", "descripcion item", "nombre articulo"],
  "id linea": ["idlinea", "id linea"],
  "id unidad negocio": ["centrocosto", "centro costo", "id bodega", "id_bodega"],
  "id grupo linea": ["grupolinea", "grupo linea", "grupo de linea"],
  "precio sin iva": ["precio lista", "precio_lista", "precio", "precio unitario"],
  "total existencia": ["existencia", "existencias", "stock", "cantidad"],
  "cod barras": ["codigobarra", "codigo barra", "codigo barras"],
  "codigo de barras": ["codigobarra", "codigo barra", "codigo barras"],
  "codigo alterno": ["codigo barra principal", "codigo alterno", "cod alterno", "codigobarra"],
  "disponibles": ["existencia", "existencias", "stock", "cantidad", "disponibles"],
};

function normalizar(v) {
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

function detectarHeaderStock(allRows) {
  const KEYWORDS = ["codigo", "barras", "barcode", "existencia", "stock", "referencia", "item", "descripcion", "cantidad", "cant", "ean", "upc", "plu", "centro", "idarticulo"];
  let headerIdx = 0;
  for (let i = 0; i < Math.min(allRows.length, 20); i++) {
    const row = allRows[i];
    if (!Array.isArray(row)) continue;
    const cells = row.map((c) => String(c ?? "").toLowerCase());
    const hits = KEYWORDS.filter((kw) => cells.some((c) => c.includes(kw))).length;
    if (hits >= 2) { headerIdx = i; break; }
  }
  return headerIdx;
}

function detectarColumnasStock(headers) {
  const porNorm = new Map();
  headers.forEach((h, idx) => { if (h) porNorm.set(normalizar(h), idx); });
  const mapeo = {};
  for (const campo of Object.keys(SINONIMOS_STOCK)) {
    for (const nombre of SINONIMOS_STOCK[campo]) {
      const hit = porNorm.get(normalizar(nombre));
      if (hit !== undefined) { mapeo[campo] = hit; break; }
    }
  }
  if (mapeo.existencia === undefined) {
    for (let i = 0; i < headers.length; i++) {
      if (i === mapeo.codigo) continue;
      const h = normalizar(headers[i]);
      if (/exist|stock|cant|fisic|dispon|saldo|unid/.test(h)) { mapeo.existencia = i; break; }
    }
  }
  return mapeo;
}

function headerToCanonicalStock(header) {
  const n = normalizar(header);
  for (const campo of Object.keys(SINONIMOS_STOCK)) {
    for (const nombre of SINONIMOS_STOCK[campo]) {
      if (normalizar(nombre) === n) return campo;
    }
  }
  for (const campo of Object.keys(SINONIMOS_STOCK)) {
    for (const nombre of SINONIMOS_STOCK[campo]) {
      const sn = normalizar(nombre);
      if (n.includes(sn) || sn.includes(n)) return campo;
    }
  }
  return null;
}

function headerToCanonicalMaestra(header) {
  const n = normalizar(header);
  if (ALIAS_MAESTRA_A_STOCK[n]) return null; // handled via alias path
  const checks = [
    ["codigo", ["codigo barra", "codigo barras", "codigo de barras", "codigo de barra", "codigo alterno", "cod alterno", "plu", "barcode", "ean", "upc", "cod barras", "barras", "codigo barras articulo", "codigo barra articulo", "codigo de barras ean"]],
    ["item", ["item", "codigo articulo", "codigo de articulo", "cod articulo", "codigo producto", "id articulo", "sku", "plu"]],
    ["desc", ["desc item", "descripcion", "descripcion item", "nombre articulo", "nombre del articulo", "nombre producto", "nombre", "producto", "detalle", "descrip corta", "descripcion corta", "desc corta"]],
    ["existencia", ["existencia", "fisica", "fisico", "disponibles", "disponible", "stock", "unidades", "total existencia", "cantidad"]],
    ["estilo", ["estilo", "linea", "familia", "tipo", "tipos de prenda", "categoria", "categorias", "id linea", "departamento"]],
    ["referencia", ["referencia", "referencia producto", "ref producto", "ref", "referencia proveedor"]],
    ["genero", ["genero", "sexo", "subfamilia", "gdi libelle 1"]],
    ["subgrupo", ["sub grupo", "subgrupo", "marca", "departamento", "subfamilia", "categorias", "categoria", "segmento", "grupo", "id grupo linea"]],
    ["detalle1", ["talla", "talla 1", "medida", "size", "detalle ext 2", "desc detalle ext 2", "detalle ext. 2"]],
    ["detalle2", ["color", "colour", "desc color", "detalle ext 1", "desc detalle ext 1", "detalle ext. 1", "gdi libelle 1"]],
    ["precio", ["precio unitario", "precio", "precio lista", "precio sin iva", "valor", "costo"]],
    ["estado", ["estado", "status"]],
    ["centroCosto", ["centro costo", "centro de costo", "id unidad negocio", "unidad negocio"]],
    ["grupoLinea", ["grupo linea", "grupo de linea", "id grupo linea"]],
    ["iva", ["iva venta", "iva"]],
  ];
  for (const [campo, lista] of checks) {
    for (const nombre of lista) {
      if (normalizar(nombre) === n) return campo;
    }
  }
  for (const [campo, lista] of checks) {
    for (const nombre of lista) {
      const sn = normalizar(nombre);
      if (n.includes(sn) || sn.includes(n)) return campo;
    }
  }
  return null;
}

function detectarHeaderMaestra(ws) {
  const range = XLSX.utils.decode_range(ws["!ref"] || "A1");
  const KW = ["codigo", "barras", "barcode", "existencia", "stock", "referencia", "item", "descripcion", "cantidad", "cant", "ean", "upc", "plu", "fisica", "disponibles", "zona", "conteo", "escaneo", "diferencia", "cedula", "nombre"];
  const maxR = Math.min(range.e.r + 1, range.s.r + 20);
  for (let r = range.s.r + 1; r <= maxR; r++) {
    const cells = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
      cells.push(String(cell?.v ?? "").toLowerCase());
    }
    const hits = KW.filter((kw) => cells.some((cc) => cc.includes(kw))).length;
    if (hits >= 2) return r;
  }
  return range.s.r + 1;
}

function mapearColumnasMaestraAStock(maestraHeaders, stockHeaders) {
  const mCols = maestraHeaders.map((h, i) => ({ idx: i, header: String(h ?? "").trim(), norm: normalizar(h) })).filter((c) => c.header !== "");
  const sCols = stockHeaders.map((h, i) => ({ idx: i, header: String(h ?? "").trim(), norm: normalizar(h) })).filter((c) => c.header !== "");

  const asignacion = new Map();
  const stockUsado = new Set();

  // 1) Alias directos
  for (const mc of mCols) {
    const aliasTargets = ALIAS_MAESTRA_A_STOCK[mc.norm];
    if (!aliasTargets) continue;
    for (const target of aliasTargets) {
      const sc = sCols.find((s) => !stockUsado.has(s.idx) && (s.norm === target || s.norm.includes(target) || target.includes(s.norm)));
      if (sc) {
        asignacion.set(mc.idx, sc.idx);
        stockUsado.add(sc.idx);
        break;
      }
    }
  }

  // 2) Canonical matching
  const stockPorCanonical = new Map();
  for (const sc of sCols) {
    if (stockUsado.has(sc.idx)) continue;
    const c = headerToCanonicalStock(sc.header);
    if (c) {
      if (!stockPorCanonical.has(c)) stockPorCanonical.set(c, []);
      stockPorCanonical.get(c).push(sc);
    }
  }
  for (const mc of mCols) {
    if (asignacion.has(mc.idx)) continue;
    // canonical via alias or checks
    let canon = null;
    if (ALIAS_MAESTRA_A_STOCK[mc.norm]) canon = null; // alias already tried
    else canon = headerToCanonicalMaestra(mc.header);
    if (!canon) continue;
    const candidatos = stockPorCanonical.get(canon);
    if (candidatos && candidatos.length) {
      const sc = candidatos.find((s) => !stockUsado.has(s.idx));
      if (sc) {
        asignacion.set(mc.idx, sc.idx);
        stockUsado.add(sc.idx);
      }
    }
  }

  // 3) Direct normalized match
  for (const mc of mCols) {
    if (asignacion.has(mc.idx)) continue;
    const sc = sCols.find((s) => !stockUsado.has(s.idx) && s.norm === mc.norm);
    if (sc) {
      asignacion.set(mc.idx, sc.idx);
      stockUsado.add(sc.idx);
    }
  }

  return { asignacion, mCols };
}

export async function convertirStockAMaestra(archivo, localId) {
  if (!localId) throw new Error("Debes seleccionar el local para convertir el stock.");
  const plantilla = await prisma.maestraPlantilla.findUnique({ where: { localId: Number(localId) } });
  if (!plantilla) throw new Error("No hay plantilla de maestra para este local. Sube una primero.");

  const local = await prisma.local.findUnique({ where: { id: Number(localId) }, select: { nombre: true } });

  const tplWb = new ExcelJS.Workbook();
  await tplWb.xlsx.load(plantilla.contenido);

  const stockWb = XLSX.read(archivo.data, { type: "buffer" });
  const stockSheetName = stockWb.SheetNames[0];
  const stockWs = stockWb.Sheets[stockSheetName];
  const allRows = XLSX.utils.sheet_to_json(stockWs, { header: 1, defval: "" });
  if (!allRows.length) throw new Error("El archivo STOCK está vacío.");

  const headerIdxStock = detectarHeaderStock(allRows);
  const stockHeaders = allRows[headerIdxStock].map((h) => String(h ?? "").trim());
  const mapeoStock = detectarColumnasStock(stockHeaders);

  if (mapeoStock.codigo === undefined) throw new Error("No se detectó la columna de Código de barras en el STOCK.");
  if (mapeoStock.existencia === undefined) {
    let mejor = { idx: -1, p: 0 };
    for (let i = 0; i < stockHeaders.length; i++) {
      if (i === mapeoStock.codigo) continue;
      const vals = allRows.slice(headerIdxStock + 1).map((r) => r[i]).filter((v) => v !== "" && v != null);
      const enteros = vals.filter((v) => /^-?\d+$/.test(String(v).trim())).length;
      const p = vals.length ? enteros / vals.length : 0;
      if (p > mejor.p && p >= 0.6) { mejor = { idx: i, p }; }
    }
    if (mejor.idx >= 0) mapeoStock.existencia = mejor.idx;
    else throw new Error("No se detectó la columna de Existencia/Stock en el STOCK.");
  }

  const rows = allRows.slice(headerIdxStock);
  const headers = rows[0].map((h) => String(h ?? "").trim());

  const productos = [];
  const vistos = new Set();
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rawCodigo = row[mapeoStock.codigo];
    if (rawCodigo === null || rawCodigo === undefined || String(rawCodigo).trim() === "") continue;
    const codigoBarras = String(rawCodigo).trim().replace(/\.0$/, "");
    if (!/^\d{4,20}$/.test(codigoBarras)) continue;
    const existencia = Number(row[mapeoStock.existencia] ?? 0);
    if (!Number.isFinite(existencia)) continue;

    const texto = (idx) => {
      if (idx === undefined || idx === null) return null;
      const raw = row[idx];
      if (raw === null || raw === undefined) return null;
      const str = String(raw);
      if (str.trim() === "") return null;
      // Conservar espacios originales (incluidos los finales) para fidelidad con la maestra.
      return str;
    };

    const itemRaw = texto(mapeoStock.item);
    const item = itemRaw ? (Number(itemRaw) || itemRaw) : codigoBarras;
    const desc = texto(mapeoStock.desc);
    const detalle2 = texto(mapeoStock.detalle2);
    const detalle1 = texto(mapeoStock.detalle1);
    const tipo = texto(mapeoStock.tipo);
    const genero = texto(mapeoStock.genero);
    const marca = texto(mapeoStock.marca);
    const estado = texto(mapeoStock.estado);
    const referencia = texto(mapeoStock.referencia) || item;
    const centroCosto = texto(mapeoStock.centroCosto);
    const grupoLinea = texto(mapeoStock.grupoLinea);
    const precio = texto(mapeoStock.precio);
    const iva = texto(mapeoStock.iva);

    if (vistos.has(codigoBarras)) {
      const prev = productos.find((p) => p.codigoBarras === codigoBarras);
      if (prev) prev.existencia += existencia;
      continue;
    }
    vistos.add(codigoBarras);
    productos.push({
      codigoBarras, item, desc, detalle1, detalle2, tipo, genero, marca,
      estado: estado || " ", referencia, existencia, centroCosto, grupoLinea, precio, iva,
      stockVals: [...row],
    });
  }

  if (productos.length === 0) throw new Error("No se encontraron productos válidos en el STOCK.");

  const invSheetName = tplWb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario");
  if (!invSheetName) throw new Error("La plantilla no tiene hoja INVENTARIO.");
  const wsInv = tplWb.getWorksheet(invSheetName);

  const headerRowNum = detectarHeaderMaestra(wsInv);
  const headerRow = wsInv.getRow(headerRowNum);
  const invHeaders = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    invHeaders[colNumber - 1] = String(cell.value ?? "").trim();
  });

  const esHeaderReal = (h) => h !== "" && !/^-?\d+(\.\d+)?$/.test(h);
  const realIndices = invHeaders.map((h, i) => (esHeaderReal(h) ? i : -1)).filter((i) => i >= 0);
  const realHeaders = realIndices.map((i) => invHeaders[i]);

  const stockHeaderList = headers;
  const { asignacion: asignacionReal, mCols: mColsReal } = mapearColumnasMaestraAStock(realHeaders, stockHeaderList);

  const asignacion = new Map();
  for (const [ri, si] of asignacionReal.entries()) {
    asignacion.set(realIndices[ri], si);
  }
  const mCols = mColsReal.map((mc) => ({ idx: realIndices[mc.idx], header: mc.header }));

  const camposNoMapeados = [];
  for (const mc of mCols) {
    if (!asignacion.has(mc.idx)) camposNoMapeados.push(mc.header);
  }

  // Limpiar filas de datos existentes de INVENTARIO
  const lastRow = wsInv.rowCount;
  if (lastRow > headerRowNum) {
    for (let r = lastRow; r >= headerRowNum + 1; r--) {
      wsInv.spliceRows(r, 1);
    }
  }

  // Invertir mapeoStock: stock col idx -> canonical
  const stockIdxToCanonical = new Map();
  for (const [canon, si] of Object.entries(mapeoStock)) {
    stockIdxToCanonical.set(si, canon);
  }

  const valorParaColumna = (mc, p) => {
    const stockIdx = asignacion.get(mc.idx);
    if (stockIdx === undefined) {
      if (normalizar(mc.header) === "estado") return p.estado;
      return null;
    }
    const raw = p.stockVals?.[stockIdx];
    if (raw === null || raw === undefined || String(raw).trim() === "") {
      // fallback a valores ya normalizados para campos conocidos
      const canon = stockIdxToCanonical.get(stockIdx) || headerToCanonicalStock(stockHeaders[stockIdx]);
      switch (canon) {
        case "codigo": return p.codigoBarras;
        case "item": return p.item;
        case "desc": return p.desc;
        case "existencia": return p.existencia;
        case "estilo": return p.tipo;
        case "referencia": return p.referencia;
        case "genero": return p.genero;
        case "subgrupo": return p.marca;
        case "detalle1": return p.detalle1;
        case "detalle2": return p.detalle2;
        case "estado": return p.estado;
        case "precio": return p.precio;
        case "centroCosto": return p.centroCosto;
        case "grupoLinea": return p.grupoLinea;
        case "iva": return p.iva;
        default: return null;
      }
    }
    // Convertir a número si el valor original era numérico y el campo lo requiere
    const canon = stockIdxToCanonical.get(stockIdx) || headerToCanonicalStock(stockHeaders[stockIdx]);
    if (canon === "existencia" || canon === "precio" || canon === "iva" || canon === "centroCosto" || canon === "grupoLinea") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    if (canon === "item") {
      const n = Number(raw);
      if (Number.isFinite(n)) return n;
    }
    if (canon === "codigo") return String(raw).trim().replace(/\.0$/, "");
    return String(raw);
  };

  const fontBase = { name: "Verdana", size: 10, family: 2, color: { indexed: 8 } };
  const maxCol = Math.max(...realIndices, 0);
  for (const p of productos) {
    const values = new Array(maxCol + 1).fill(null);
    for (const mc of mCols) {
      values[mc.idx] = valorParaColumna(mc, p);
    }
    const row = wsInv.addRow(values);
    row.font = fontBase;
    // numFmt para código de barras (primera columna real)
    row.getCell(1).numFmt = "@";
  }

  // Hoja1: regenerar solo si es lookup Item -> Código barra
  const hoja1Name = tplWb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "hoja1");
  if (hoja1Name) {
    const ws1 = tplWb.getWorksheet(hoja1Name);
    const hr = detectarHeaderMaestra(ws1);
    const hRow = ws1.getRow(hr);
    const h1Headers = [];
    hRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      h1Headers[colNumber - 1] = String(cell.value ?? "").trim();
    });
    const hasItem = h1Headers.some((h) => normalizar(h) === "item");
    const hasCodigo = h1Headers.some((h) => /codigo|barras|plu/.test(normalizar(h)));
    if (hasItem && hasCodigo) {
      const last = ws1.rowCount;
      if (last > hr) {
        for (let r = last; r >= hr + 1; r--) ws1.spliceRows(r, 1);
      }
      const itemColIdx = h1Headers.findIndex((h) => normalizar(h) === "item") + 1;
      const codigoColIdx = h1Headers.findIndex((h) => /codigo|barras|plu/.test(normalizar(h))) + 1;
      for (const p of productos) {
        if (p.item && p.codigoBarras) {
          const r = ws1.addRow([]);
          if (itemColIdx > 0) r.getCell(itemColIdx).value = p.item;
          if (codigoColIdx > 0) r.getCell(codigoColIdx).value = p.codigoBarras;
          r.font = fontBase;
          if (itemColIdx > 0) r.getCell(itemColIdx).numFmt = "0";
          if (codigoColIdx > 0) r.getCell(codigoColIdx).numFmt = "@";
        }
      }
    }
  }

  // LECTURA/escaneo: limpiar filas de datos solo si no tienen fórmulas
  for (const ws of tplWb.worksheets) {
    const n = normalizar(ws.name);
    if (n !== "lectura" && n !== "escaneo") continue;
    if (ws.name === invSheetName) continue;
    const hr = detectarHeaderMaestra(ws);
    let tieneFormulas = false;
    for (let r = hr + 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      row.eachCell({ includeEmpty: false }, (cell) => {
        if (cell.value && typeof cell.value === "object" && cell.value.formula) tieneFormulas = true;
      });
      if (tieneFormulas) break;
    }
    if (tieneFormulas) continue;
    const last = ws.rowCount;
    if (last > hr) {
      for (let r = last; r >= hr + 1; r--) ws.spliceRows(r, 1);
    }
  }

  const camposNoMapeadosFinal = camposNoMapeados;

  // Reconstruir la hoja LECTURA/escaneo desde cero para evitar problemas con
  // fórmulas compartidas (shared formulas) que ExcelJS no escribe correctamente.
  const scanSheetName = tplWb.worksheets.map((w) => w.name).find((n) => {
    const nl = normalizar(n);
    return nl === "lectura" || nl === "escaneo" || nl === "esacneo";
  });
  if (scanSheetName) {
    const tplWs = tplWb.getWorksheet(scanSheetName);
    const isLectura = normalizar(scanSheetName) === "lectura";
    const definedNames = await extraerDefinedNames(plantilla.contenido);

    // Crear nueva hoja con el mismo nombre (reemplazar la vieja)
    const oldId = tplWs.id;
    tplWb.removeWorksheet(oldId);
    const newWs = tplWb.addWorksheet(scanSheetName, { properties: tplWs.properties, pageSetup: tplWs.pageSetup });

    // Copiar anchos de columna
    tplWs.columns.forEach((col, i) => {
      if (col.width) newWs.getColumn(i + 1).width = col.width;
    });

    // Código de barras como texto (preservar ceros iniciales)
    newWs.getColumn(2).numFmt = "@";

    // Copiar encabezado (fila 1)
    const tplHeaderRow = tplWs.getRow(1);
    const newHeaderRow = newWs.getRow(1);
    tplHeaderRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const nc = newHeaderRow.getCell(colNumber);
      nc.value = cell.value;
      if (cell.style) nc.style = JSON.parse(JSON.stringify(cell.style));
      if (cell.font) nc.font = JSON.parse(JSON.stringify(cell.font));
      if (cell.fill) nc.fill = JSON.parse(JSON.stringify(cell.fill));
      if (cell.border) nc.border = JSON.parse(JSON.stringify(cell.border));
      if (cell.alignment) nc.alignment = JSON.parse(JSON.stringify(cell.alignment));
    });
    newHeaderRow.height = tplHeaderRow.height;

    // Detectar headers
    const headers = [];
    tplHeaderRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = String(cell.value ?? "").trim();
      if (v) headers[colNumber - 1] = v;
    });
    const realHeaders = headers.filter((h) => h);

    if (isLectura) {
      // Escribir fórmulas VLOOKUP (regulares, no compartidas) para filas 2..N
      // N = número de productos del INVENTARIO + 1 (para dejar margen)
      const invSheet = tplWb.getWorksheet(tplWb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario"));
      const invLastRow = invSheet ? invSheet.rowCount : 2;
      const invColCount = invSheet ? invSheet.columnCount : 10;
      const lastCol = String.fromCharCode(64 + (invColCount > 26 ? 26 : invColCount));
      // Detectar headers de INVENTARIO
      const invHeaders = [];
      if (invSheet) {
        const invHeaderRow = invSheet.getRow(1);
        invHeaderRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
          const v = String(cell.value ?? "").trim();
          if (v) invHeaders[colNumber - 1] = v;
        });
      }

      // Mapeo de columna LECTURA -> columna INVENTARIO (por encabezado normalizado)
      const lecturaToInvCol = realHeaders.map((h) => {
        const nh = normalizar(h);
        for (let j = 0; j < invHeaders.length; j++) {
          if (normalizar(invHeaders[j]) === nh) return j + 1;
        }
        return null;
      });

      const numRows = Math.max(tplWs.rowCount, 100);
      for (let r = 2; r <= numRows; r++) {
        const row = newWs.getRow(r);
        for (let c = 1; c <= realHeaders.length; c++) {
          const invCol = lecturaToInvCol[c - 1];
          if (invCol === null || invCol === undefined) continue;
          if (c === 1 || c === 2) continue; // zona y código son inputs
          const sheetRef = invSheetName.includes(" ") ? `'${invSheetName}'` : invSheetName;
          const formula = `VLOOKUP($B${r},${sheetRef}!$A$2:$${lastCol}$${invLastRow},${invCol},0)`;
          row.getCell(c).value = { formula };
        }
      }
    }
    // Para escaneo (plano): no escribir fórmulas, solo headers (las filas se llenan al escanear)

    // Forzar recálculo
    tplWb.calcProperties = { fullCalcOnLoad: true };
  }

  // Forzar recálculo al abrir en Excel
  tplWb.calcProperties = { fullCalcOnLoad: true };

  const buffer = await tplWb.xlsx.writeBuffer();
  return {
    buffer: Buffer.from(buffer),
    productos: productos.length,
    camposNoMapeados: camposNoMapeadosFinal,
    validacion: {
      hojas: tplWb.worksheets.map((w) => w.name),
      headersInventario: invHeaders,
      filasEscritas: productos.length,
      camposNoMapeados: camposNoMapeadosFinal,
      ok: camposNoMapeadosFinal.length === 0,
    },
    localNombre: local?.nombre || "",
  };
}