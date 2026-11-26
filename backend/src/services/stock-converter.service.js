import * as XLSX from "xlsx";
import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { extraerDefinedNames, reescribirFormulasConDefinedNames } from "../lib/definedNames.js";
import { colLetter, codeText, formulaVLOOKUP } from "../lib/xlsxRefs.js";
import { leerSpecScan, campoDeHeader } from "../lib/scanSpec.js";

// ============================================================================
// Sinónimos para detectar columnas del archivo STOCK (normalizados).
// ============================================================================
const SINONIMOS_STOCK = {
  codigo: ["codigo barra principal", "codigo de barras", "codigo barra", "codigo barras", "codigobarra", "codigobarras", "codigo", "cod barra", "cod barras", "cod barras 3", "cod barras3", "cod barras 2", "codigo barras 3", "codigo barras3", "codigo barras 2", "barcode", "ean", "upc", "plu", "codigo alterno", "cod alterno", "codigo de barra"],
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
  // Fallback para variantes no listadas (p. ej. "Cód. Barras 3" o
  // "CODIGO_BARRA_ARTICULO"): la coincidencia canónica ya las reconoce.
  if (mapeo.codigo === undefined) {
    for (let i = 0; i < headers.length; i++) {
      if (headerToCanonicalStock(headers[i]) === "codigo") { mapeo.codigo = i; break; }
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
    // Si el alias directo no encontró columna, se intenta el canónico. Antes se
    // saltaba y una columna como "Cód. Barras 3" quedaba sin asignar, permitiendo
    // que "Cód. Barras 2" se apropiara del código principal.
    const canon = headerToCanonicalMaestra(mc.header);
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
        // Solo la columna primaria puede usar el código normalizado. Las barras
        // secundarias vacías deben quedar vacías: nunca se copia el código
        // principal en "Cód. Barras" / "Cód. Barras 2".
        case "codigo": return stockIdx === mapeoStock.codigo ? p.codigoBarras : null;
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
  // La columna de código de INVENTARIO no se asume en A: se detecta por encabezado.
  const invCodigoCol = mCols.find((mc) => campoDeHeader(mc.header) === "codigo")?.idx || 1;
  for (const p of productos) {
    const values = new Array(maxCol + 1).fill(null);
    for (const mc of mCols) {
      values[mc.idx] = valorParaColumna(mc, p);
    }
    const row = wsInv.addRow(values);
    row.font = fontBase;
    // Código como texto para conservar ceros iniciales (p. ej. Pilatos).
    row.getCell(invCodigoCol).numFmt = "@";
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

  // Reconstruir la hoja de escaneo desde cero para evitar fórmulas compartidas
  // (shared formulas) que ExcelJS no escribe correctamente. La especificación se
  // deriva de la plantilla real: columna de código, columna de inicio de la tabla
  // y columnas que originalmente tenían VLOOKUP (LECTURA vs ESCANEO).
  const spec = leerSpecScan(tplWb, invSheetName, headerRowNum, invHeaders);
  if (spec) {
    const tplWs = tplWb.getWorksheet(spec.sheetName);
    const definedNames = await extraerDefinedNames(plantilla.contenido);

    const oldId = tplWs.id;
    tplWb.removeWorksheet(oldId);
    const newWs = tplWb.addWorksheet(spec.sheetName, { properties: tplWs.properties, pageSetup: tplWs.pageSetup });

    // Copiar anchos y encabezado conservando las posiciones físicas (no filtrar vacíos).
    tplWs.columns.forEach((col, i) => {
      if (col.width) newWs.getColumn(i + 1).width = col.width;
    });
    newWs.getColumn(spec.codeCol).numFmt = "@";

    const tplHeaderRow = tplWs.getRow(spec.headerRow);
    const newHeaderRow = newWs.getRow(spec.headerRow);
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

    // Fórmulas regulares en cada columna mapeada. En ESCANEO solo se escriben
    // donde la plantilla original tenía VLOOKUP (ciertas columnas son entrada manual).
    const invLastRow = wsInv.rowCount;
    const numRows = Math.max(tplWs.rowCount, 100);
    for (let r = spec.headerRow + 1; r <= numRows; r++) {
      const row = newWs.getRow(r);
      for (const [colScan, colInv] of spec.columnas) {
        row.getCell(colScan).value = {
          formula: formulaVLOOKUP({
            codeCol: spec.codeCol,
            row: r,
            sheet: spec.invSheetName,
            tableStartCol: spec.tableStartCol,
            tableEndCol: spec.tableEndCol,
            tableLastRow: invLastRow,
            sourceCol: colInv,
          }),
        };
      }
    }
    // Las fórmulas generadas ya usan referencias directas; no requieren reescritura
    // de nombres definidos. Conservamos los nombres originales del libro intactos.
    void definedNames;
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