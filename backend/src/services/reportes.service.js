import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { argb, colorDeUsuario, tinteSuave } from "../lib/colores.js";
import { extraerDefinedNames, reescribirFormulasConDefinedNames } from "../lib/definedNames.js";
import { colLetter, codeText, codeKeys, safeResult, formulaVLOOKUP } from "../lib/xlsxRefs.js";
import { leerSpecScan } from "../lib/scanSpec.js";
import { leerPlantillaLigera } from "../lib/plantillaLigera.js";

function errorConEstado(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

function normalizar(v) {
  return String(v ?? "")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
}

const headerToField = (h) => {
  const n = normalizar(h);
  if (/^zona/.test(n)) return "zona";
  if (/codigo.*barr|cod.*barr|barcode|plu|barras?/.test(n)) return "codigo";
  if (/talla|medida|size|detalle ext 2|detalle ext. 2/.test(n)) return "talla";
  if (/color|colour|detalle ext 1|detalle ext. 1/.test(n) && !/empleado/.test(n)) return "colorProd";
  if (/descripcion|desc|nombre.*articulo|nombre producto/.test(n)) return "desc";
  if (/codigo.*articulo|id.*articulo|item/.test(n)) return "item";
  if (/genero|sexo/.test(n)) return "genero";
  if (/linea|estilo|familia|tipo/.test(n)) return "linea";
  if (/referencia|ref\b|^ref/.test(n)) return "referencia";
  if (/sub grupo|subgrupo|marca|departamento/.test(n)) return "subGrupo";
  if (/precio/.test(n)) return "precio";
  if (/iva/.test(n)) return "iva";
  if (/estado/.test(n)) return "estado";
  if (/empleado/.test(n)) return "empleado";
  if (/fecha/.test(n)) return "fecha";
  return null;
};

const headerToProductField = (h) => {
  const n = normalizar(h);
  if (/codigo.*barr|cod.*barr|barcode|plu|barras?/.test(n)) return "codigoBarras";
  if (/talla|medida|size|detalle ext 2|detalle ext. 2/.test(n)) return "detalle1";
  if (/color|colour|detalle ext 1|detalle ext. 1/.test(n)) return "detalle2";
  if (/descripcion|desc|nombre.*articulo|nombre producto/.test(n)) return "descripcion";
  if (/codigo.*articulo|id.*articulo|item/.test(n)) return "item";
  if (/existencia|fisica|stock|cantidad|dispon/.test(n)) return "existenciaInicial";
  if (/linea|estilo|familia|tipo/.test(n)) return "estilo";
  if (/referencia/.test(n)) return "referencia";
  if (/genero|sexo/.test(n)) return "genero";
  if (/marca|departamento|subgrupo|sub grupo|grupo/.test(n)) return "subGrupo";
  return null;
};

export async function generarReporteExcel(id) {
  const inventario = await prisma.inventario.findUnique({
    where: { id },
    include: { local: true },
  });
  if (!inventario) throw errorConEstado("Inventario no encontrado.", 404);

  const [escaneos, novedades] = await Promise.all([
    prisma.escaneo.findMany({
      where: { inventarioId: id },
      orderBy: [{ zonaId: "asc" }, { leidoEn: "asc" }],
      include: {
        zona: { select: { numero: true, nombre: true, tipo: true } },
        usuario: { select: { nombre: true, color: true } },
        inventarioProducto: { include: { producto: true } },
      },
    }),
    prisma.escaneoNovedad.findMany({
      where: { inventarioId: id },
      orderBy: [{ zonaId: "asc" }, { leidoEn: "asc" }],
      include: {
        zona: { select: { numero: true, nombre: true, tipo: true } },
        usuario: { select: { nombre: true, color: true } },
      },
    }),
  ]);

  const sinDesc = novedades.filter((n) => !n.descripcion).map((n) => n.codigoLeido);
  const globales = sinDesc.length
    ? await prisma.producto.findMany({ where: { codigoBarras: { in: sinDesc } }, select: { codigoBarras: true, descripcion: true, item: true } })
    : [];
  const gMap = new Map(globales.map((p) => [p.codigoBarras, p]));
  for (const n of novedades) {
    if (!n.descripcion) {
      const g = gMap.get(n.codigoLeido);
      n.descripcion = g?.descripcion || g?.item || null;
    }
  }

  const lecturas = [
    ...escaneos.map((e) => ({ tipo: "OK", e, esNovedad: false })),
    ...novedades.map((n) => ({ tipo: "N/A", n, esNovedad: true })),
  ].sort((a, b) => {
    const za = a.esNovedad ? a.n.zonaId : a.e.zonaId;
    const zb = b.esNovedad ? b.n.zonaId : b.e.zonaId;
    if (za !== zb) return za - zb;
    const ta = a.esNovedad ? new Date(a.n.leidoEn) : new Date(a.e.leidoEn);
    const tb = b.esNovedad ? new Date(b.n.leidoEn) : new Date(b.e.leidoEn);
    return ta - tb;
  });

  const plantilla = await prisma.maestraPlantilla.findUnique({ where: { localId: inventario.localId } });

  const wb = new ExcelJS.Workbook();
  wb.creator = "BENMOGA Inventario";
  wb.calcProperties = { fullCalcOnLoad: true };

  // =====================================================================
  // Hoja INVENTARIO (desde plantilla, con productos del inventario activo)
  // =====================================================================
  let invSheetName = "INVENTARIO";
  let tplWb = null;
  if (plantilla) {
    // Solo se necesitan encabezados y algunos valores de la plantilla: cargarla
    // completa con ExcelJS agotaba la memoria en maestras con 100k fórmulas.
    tplWb = await leerPlantillaLigera(plantilla.contenido);
    const found = tplWb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario");
    if (found) invSheetName = found;
  }

  const newInv = wb.addWorksheet(invSheetName);
  let invHeaders = [];
  if (plantilla && tplWb) {
    const tplInv = tplWb.getWorksheet(invSheetName);
    if (tplInv) {
      if (tplInv.columns) tplInv.columns.forEach((col, i) => { if (col.width) newInv.getColumn(i + 1).width = col.width; });
      const tplHeaderRow = tplInv.getRow(1);
      const newHeaderRow = newInv.getRow(1);
      tplHeaderRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        invHeaders[colNumber - 1] = String(cell.value ?? "").trim();
        const nc = newHeaderRow.getCell(colNumber);
        nc.value = cell.value;
        if (cell.style) nc.style = JSON.parse(JSON.stringify(cell.style));
        if (cell.font) nc.font = JSON.parse(JSON.stringify(cell.font));
        if (cell.fill) nc.fill = JSON.parse(JSON.stringify(cell.fill));
        if (cell.border) nc.border = JSON.parse(JSON.stringify(cell.border));
        if (cell.alignment) nc.alignment = JSON.parse(JSON.stringify(cell.alignment));
      });
      newHeaderRow.height = tplHeaderRow.height;
    }
  }
  if (!invHeaders.length) {
    invHeaders = ["Código barra", "Item", "Desc. item", "Detalle ext. 1", "Desc. detalle ext. 2", "GENERO", "ESTILO", "SUB GRUPO", "Existencia"];
    invHeaders.forEach((h, i) => { newInv.getColumn(i + 1).width = 14; newInv.getRow(1).getCell(i + 1).value = h; });
  }

  const invProds = await prisma.inventarioProducto.findMany({
    where: { inventarioId: id },
    include: { producto: true },
  });

  // Mapa de código -> fila de la plantilla (para completar campos no almacenados en BD, ej. precio)
  const tplInvMap = new Map();
  if (plantilla && tplWb) {
    const tplInv = tplWb.getWorksheet(invSheetName);
    if (tplInv) {
      for (let r = 2; r <= tplInv.rowCount; r++) {
        const code = tplInv.getRow(r).getCell(1).value;
        for (const key of codeKeys(code)) tplInvMap.set(key, tplInv.getRow(r));
      }
    }
  }

  const fontBase = { name: "Verdana", size: 10, family: 2, color: { indexed: 8 } };
  // Código de barras principal = primera columna con encabezado de barras.
  // Las demás columnas de barras (p. ej. "Cód. Barras", "Cód. Barras 2") son
  // atributos independientes: se copian de esa misma columna de la maestra y
  // nunca se rellenan con el código principal.
  const codigoColIdx = invHeaders.findIndex((h) => headerToProductField(h) === "codigoBarras");
  for (const ip of invProds) {
    const prod = ip.producto;
    const code = codeText(prod?.codigoBarras);
    const tplRow = codeKeys(code).map((k) => tplInvMap.get(k)).find(Boolean);
    const values = invHeaders.map((h, colIdx) => {
      const field = headerToProductField(h);
      if (field === "codigoBarras") {
        if (colIdx === codigoColIdx) return null; // se asigna abajo
        // Barras secundarias: solo el valor de esta misma columna en la maestra.
        if (tplRow) {
          const tplVal = tplRow.getCell(colIdx + 1).value;
          if (tplVal !== null && tplVal !== undefined && String(tplVal).trim() !== "") return tplVal;
        }
        return null;
      }
      if (field) {
        const v = ip[field] ?? prod?.[field] ?? null;
        if (v !== null && v !== undefined && String(v).trim() !== "") return v;
      }
      // Completar desde la plantilla si el campo no está en BD
      if (tplRow) {
        const tplVal = tplRow.getCell(colIdx + 1).value;
        if (tplVal !== null && tplVal !== undefined && String(tplVal).trim() !== "") return tplVal;
      }
      return null;
    });
    const row = newInv.addRow(values);
    row.font = fontBase;
    if (codigoColIdx >= 0) {
      const code = prod?.codigoBarras || "";
      row.getCell(codigoColIdx + 1).value = codeText(code);
      row.getCell(codigoColIdx + 1).numFmt = "@";
    }
    // Preservar el formato de texto en las barras secundarias (ceros iniciales).
    invHeaders.forEach((h, colIdx) => {
      if (colIdx !== codigoColIdx && headerToProductField(h) === "codigoBarras") {
        row.getCell(colIdx + 1).numFmt = "@";
      }
    });
  }

  // =====================================================================
  // Hoja Lectura: usar plantilla si existe
  // =====================================================================
  let hojaLecturas;
  let lecturaHeaders = [];
  let isLecturaTemplate = false;
  let tplScanWs = null;
  if (plantilla && tplWb) {
    const scanSheetName = tplWb.worksheets.map((w) => w.name).find((n) => {
      const nl = normalizar(n);
      return nl === "lectura" || nl === "escaneo" || nl === "esacneo";
    });
    if (scanSheetName) {
      tplScanWs = tplWb.getWorksheet(scanSheetName);
      isLecturaTemplate = normalizar(scanSheetName) === "lectura";
      hojaLecturas = wb.addWorksheet(scanSheetName, { properties: tplScanWs.properties, pageSetup: tplScanWs.pageSetup });
      if (tplScanWs.columns) tplScanWs.columns.forEach((col, i) => { if (col.width) hojaLecturas.getColumn(i + 1).width = col.width; });
      // Copiar solo el encabezado (fila 1) con estilos
      const tplHeaderRow = tplScanWs.getRow(1);
      const headerRow = hojaLecturas.getRow(1);
      tplHeaderRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const newCell = headerRow.getCell(colNumber);
        newCell.value = cell.value;
        if (cell.style) newCell.style = JSON.parse(JSON.stringify(cell.style));
        if (cell.font) newCell.font = JSON.parse(JSON.stringify(cell.font));
        if (cell.fill) newCell.fill = JSON.parse(JSON.stringify(cell.fill));
        if (cell.border) newCell.border = JSON.parse(JSON.stringify(cell.border));
        if (cell.alignment) newCell.alignment = JSON.parse(JSON.stringify(cell.alignment));
      });
      headerRow.height = tplHeaderRow.height;
      tplHeaderRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const v = String(cell.value ?? "").trim();
        if (v) lecturaHeaders[colNumber - 1] = v;
      });
      lecturaHeaders = lecturaHeaders.filter((h) => h);
    }
  }
  // Código de barras como texto (preservar ceros iniciales) en LECTURA
  if (hojaLecturas && hojaLecturas.getColumn(2)) hojaLecturas.getColumn(2).numFmt = "@";

  if (!hojaLecturas) {
    hojaLecturas = wb.addWorksheet("Lectura");
    lecturaHeaders = ["Zona", "Código de barras", "Código artículo", "Género", "Línea", "Talla", "Color"];
    hojaLecturas.columns = [
      { header: "Zona", key: "zona", width: 8 },
      { header: "Código de barras", key: "codigo", width: 18 },
      { header: "Código artículo", key: "item", width: 14 },
      { header: "Género", key: "genero", width: 14 },
      { header: "Línea", key: "linea", width: 14 },
      { header: "Talla", key: "talla", width: 10 },
      { header: "Color", key: "colorProd", width: 12 },
    ];
    hojaLecturas.getRow(1).font = { bold: true };
    hojaLecturas.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFF3" } };
  }
  // Código de barras como texto (preservar ceros iniciales)
  if (hojaLecturas.getColumn(2)) hojaLecturas.getColumn(2).numFmt = "@";

  const posicionPorZona = new Map();
  const esBodega = (entry) => {
    const zona = entry.esNovedad ? entry.n.zona : entry.e.zona;
    return (zona?.tipo || "").toUpperCase() === "BODEGA";
  };

  const scanSheetName = hojaLecturas.name;

  // Estructura real de la plantilla: columna de código, columna de inicio de la
  // tabla de búsqueda y columnas que deben llevar VLOOKUP.
  const spec = tplWb ? leerSpecScan(tplWb, invSheetName, 1, invHeaders) : null;
  const codeCol = spec?.codeCol || 2;
  const zonaCol = spec?.zonaCol || 1;
  if (hojaLecturas.getColumn(codeCol)) hojaLecturas.getColumn(codeCol).numFmt = "@";

  const invSheet = wb.getWorksheet(invSheetName);
  const invRowMap = new Map();
  if (invSheet) {
    const lookupCol = spec?.lookupCol || 1;
    for (let r = 2; r <= invSheet.rowCount; r++) {
      const code = invSheet.getRow(r).getCell(lookupCol).value;
      for (const key of codeKeys(code)) invRowMap.set(key, r);
    }
  }
  const invLastRow = invSheet?.rowCount || 2;
  const columnas = spec?.columnas || new Map();

  // Columnas de la hoja de escaneo sin mapeo a la INVENTARIO (p. ej. "Ref." en
  // Naf Naf, cuando el inventario no tiene columna "Referencia" sino "Código
  // artículo"). En esos casos el dato referencial ES el código buscado, así que se
  // mapea contra la columna canónica `item` ("Código artículo") disponible.
  const columnasExtra = new Map();
  if (spec) {
    const usados = new Set([spec.lookupCol, ...spec.columnas.values()]);
    for (let i = 0; i < spec.headers.length; i++) {
      const col = i + 1;
      if (col === spec.zonaCol || col === spec.codeCol || spec.columnas.has(col)) continue;
      const campo = headerToField(spec.headers[i]);
      if (campo !== "referencia") continue;
      const invCol = invHeaders.findIndex((h, j) => !usados.has(j + 1) && headerToProductField(h) === "item") + 1;
      if (invCol) { usados.add(invCol); columnasExtra.set(col, invCol); }
    }
  }
  const columnasManuales = new Map(columnas);
  for (const [colScan, colInv] of columnasExtra) if (!columnasManuales.has(colScan)) columnasManuales.set(colScan, colInv);

  let rowIndex = 2;
  for (const entry of lecturas) {
    const esNov = entry.esNovedad;
    const zona = esNov ? entry.n.zona : entry.e.zona;
    const usuario = esNov ? entry.n.usuario : entry.e.usuario;
    const codigo = esNov ? entry.n.codigoLeido : entry.e.codigoLeido;
    const hex = colorDeUsuario(usuario);

    let genero = "", linea = "", talla = "", colorProd = "", item = "", desc = "", referencia = "", subGrupo = "";
    if (esNov) {
      desc = "N/A"; genero = "N/A"; linea = "N/A"; talla = "N/A"; colorProd = "N/A"; item = "N/A";
      referencia = "N/A"; subGrupo = "N/A";
    } else {
      const ip = entry.e.inventarioProducto;
      const prod = ip?.producto;
      item = (ip?.descriptoresCargados ? ip.item : prod?.item ?? ip?.item) || "";
      desc = (ip?.descriptoresCargados ? ip.descripcion : prod?.descripcion ?? ip?.descripcion) || "";
      genero = (ip?.descriptoresCargados ? ip.genero : prod?.genero ?? ip?.genero) || "";
      linea = (ip?.descriptoresCargados ? ip.estilo : prod?.estilo ?? ip?.estilo) || "";
      talla = (ip?.descriptoresCargados ? ip.detalle1 : prod?.detalle1 ?? ip?.detalle1) || "";
      colorProd = (ip?.descriptoresCargados ? ip.detalle2 : prod?.detalle2 ?? ip?.detalle2) || "";
      referencia = (ip?.descriptoresCargados ? ip.referencia : prod?.referencia ?? ip?.referencia) || "";
      subGrupo = (ip?.descriptoresCargados ? ip.subGrupo : prod?.subGrupo ?? ip?.subGrupo) || "";
    }
    const zid = esNov ? entry.n.zonaId : entry.e.zonaId;
    const pos = (posicionPorZona.get(zid) || 0) + 1;
    posicionPorZona.set(zid, pos);

    const fila = hojaLecturas.getRow(rowIndex);
    // Zona y código siempre son entrada del usuario (posiciones reales de la plantilla).
    // Algunas plantillas (Toysmart) no tienen columna ZONA: zonaCol queda en 0.
    if (zonaCol > 0) fila.getCell(zonaCol).value = zona.numero;
    const celdaCodigo = fila.getCell(codeCol);
    celdaCodigo.value = codeText(codigo); // como texto: sin Number() para códigos de 20 dígitos
    celdaCodigo.numFmt = "@";

    const invFila = codeKeys(codigo).map((k) => invRowMap.get(k)).find(Boolean);
    for (const [colScan, colInv] of columnas) {
      const cell = fila.getCell(colScan);
      if (esNov) { cell.value = "N/A"; continue; }
      const resultado = invFila ? safeResult(invSheet.getRow(invFila).getCell(colInv).value) : null;
      const formula = formulaVLOOKUP({
        codeCol,
        row: rowIndex,
        sheet: invSheetName,
        tableStartCol: spec?.tableStartCol || 1,
        tableEndCol: spec?.tableEndCol || invHeaders.length,
        tableLastRow: invLastRow,
        sourceCol: colInv,
      });
      cell.value = resultado !== null ? { formula, result: resultado } : { formula };
    }

    // Columnas sin VLOOKUP (entrada manual o sin equivalente en INVENTARIO):
    // conservar datos planos del escaneo, incluida la descripción.
    const valores = {
      zona: zona.numero,
      codigo: codeText(codigo),
      item, desc, genero, linea, talla, colorProd, referencia, subGrupo,
    };
    lecturaHeaders.forEach((h, i) => {
      const col = i + 1;
      if (col === zonaCol || col === codeCol || columnas.has(col)) return;
      const field = headerToField(h);
      const v = field ? valores[field] : undefined;
      if (v !== undefined && v !== null && v !== "") fila.getCell(col).value = v;
    });

    fila.font = fila.font || { name: "Calibri", size: 11 };
    // Toda la fila con el color del empleado
    const rowFill = argb(tinteSuave(hex));
    for (let c = 1; c <= hojaLecturas.columnCount; c++) {
      const cell = fila.getCell(c);
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: rowFill } };
    }
    if (esNov) {
      for (let c = 1; c <= hojaLecturas.columnCount; c++) {
        const cell = fila.getCell(c);
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFEB9C" } };
        cell.font = { ...cell.font, italic: true, color: { argb: "FF9C6500" } };
      }
    }
    rowIndex++;
  }

  // Filas listas para lectura manual: mismo mapeo y mismas posiciones que la plantilla.
  // La fórmula incluye IF(codigo="","",...) para que las filas vacías no muestren #N/A.
  const totalRows = Math.max(rowIndex - 1 + 50, 100);
  for (let r = rowIndex; r <= totalRows; r++) {
    const fila = hojaLecturas.getRow(r);
    for (const [colScan, colInv] of columnasManuales) {
      fila.getCell(colScan).value = {
        formula: formulaVLOOKUP({
          codeCol,
          row: r,
          sheet: invSheetName,
          tableStartCol: spec?.tableStartCol || 1,
          tableEndCol: spec?.tableEndCol || invHeaders.length,
          tableLastRow: invLastRow,
          sourceCol: colInv,
        }),
      };
    }
  }

  hojaLecturas.getRow(1).font = { bold: true };

  // =====================================================================
  // Hoja de Zonas (se mantiene la lógica actual, con resaltado Bodega)
  // =====================================================================
  const hojaZonasCtrl = wb.addWorksheet("Hoja de Zonas");

  const zonasLocal = await prisma.zona.findMany({
    where: { localId: inventario.localId, OR: [{ inventarioId: id }, { inventarioId: null }] },
    orderBy: { numero: "asc" },
  });
  const escaneosPorZona = await prisma.escaneo.groupBy({
    by: ["zonaId", "usuarioId"],
    where: { inventarioId: id },
    _sum: { cantidad: true },
  });
  const responsablePorZona = new Map();
  const escaneadoPorZona = new Map();
  for (const e of escaneosPorZona) {
    const u = await prisma.usuario.findUnique({ where: { id: e.usuarioId }, select: { nombre: true, color: true } });
    const prev = escaneadoPorZona.get(e.zonaId) || 0;
    escaneadoPorZona.set(e.zonaId, prev + (e._sum.cantidad || 0));
    const cur = responsablePorZona.get(e.zonaId);
    if (!cur || (e._sum.cantidad || 0) > cur.unidades) {
      responsablePorZona.set(e.zonaId, { nombre: u?.nombre || `Usuario ${e.usuarioId}`, color: u?.color, unidades: e._sum.cantidad || 0 });
    }
  }

  hojaZonasCtrl.mergeCells("A1:H1");
  const titulo = hojaZonasCtrl.getCell("A1");
  titulo.value = "HOJA DE ZONAS - CONTROL DE CONTEOS";
  titulo.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
  titulo.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  titulo.alignment = { horizontal: "center", vertical: "center" };
  hojaZonasCtrl.getRow(1).height = 24;

  const headers = ["Nº Zona", "Tipo de zona", "Responsable", "Conteo manual", "Prendas escaneadas", "Diferencia", "% Diferencia", "Estado"];
  const headerRow = 3;
  headers.forEach((h, i) => {
    const cell = hojaZonasCtrl.getCell(headerRow, i + 1);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE11D48" } };
    cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
  hojaZonasCtrl.getRow(headerRow).height = 30;

  const primeraFila = headerRow + 1;
  const ultimaFila = primeraFila + zonasLocal.length - 1;

  zonasLocal.forEach((z, idx) => {
    const r = primeraFila + idx;
    const tipo = z.tipo === "BODEGA" ? "Bodega" : "Punto de venta";
    const resp = responsablePorZona.get(z.id);
    const bodega = z.tipo === "BODEGA";
    hojaZonasCtrl.getCell(r, 1).value = z.numero;
    hojaZonasCtrl.getCell(r, 2).value = tipo;
    hojaZonasCtrl.getCell(r, 3).value = resp?.nombre || "";
    const cellD = hojaZonasCtrl.getCell(r, 4);
    cellD.value = null;
    cellD.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFFCC" } };
    hojaZonasCtrl.getCell(r, 5).value = escaneadoPorZona.get(z.id) || 0;
    hojaZonasCtrl.getCell(r, 6).value = { formula: `E${r}-D${r}` };
    hojaZonasCtrl.getCell(r, 7).value = { formula: `IF(D${r}=0,"",F${r}/D${r})` };
    hojaZonasCtrl.getCell(r, 7).numFmt = "0.0%";
    hojaZonasCtrl.getCell(r, 8).value = { formula: `IF(F${r}=0,"OK",IF(F${r}>0,"Sobrante","Faltante"))` };
    for (let c = 1; c <= 8; c++) {
      hojaZonasCtrl.getCell(r, c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }
    if (resp?.color) {
      const celda = hojaZonasCtrl.getCell(r, 3);
      celda.font = { bold: true, color: { argb: argb(resp.color) } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(tinteSuave(resp.color)) } };
    }
    if (bodega) {
      for (let c = 1; c <= 8; c++) {
        const cell = hojaZonasCtrl.getCell(r, c);
        if (!resp?.color || c !== 3) {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E2F3" } };
        }
      }
    }
  });

  const filaTotales = ultimaFila + 1;
  hojaZonasCtrl.getCell(filaTotales, 1).value = "TOTAL";
  hojaZonasCtrl.getCell(filaTotales, 1).font = { bold: true };
  hojaZonasCtrl.getCell(filaTotales, 4).value = { formula: `SUM(D${primeraFila}:D${ultimaFila})` };
  hojaZonasCtrl.getCell(filaTotales, 5).value = { formula: `SUM(E${primeraFila}:E${ultimaFila})` };
  hojaZonasCtrl.getCell(filaTotales, 6).value = { formula: `SUM(F${primeraFila}:F${ultimaFila})` };
  hojaZonasCtrl.getCell(filaTotales, 7).value = { formula: `IF(D${filaTotales}=0,"",F${filaTotales}/D${filaTotales})` };
  hojaZonasCtrl.getCell(filaTotales, 7).numFmt = "0.0%";
  hojaZonasCtrl.getCell(filaTotales, 8).value = { formula: `IF(F${filaTotales}=0,"OK",IF(F${filaTotales}>0,"Sobrante","Faltante"))` };
  for (let c = 1; c <= 8; c++) {
    const cell = hojaZonasCtrl.getCell(filaTotales, c);
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFF3" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  }

  hojaZonasCtrl.columns = [
    { width: 9 }, { width: 16 }, { width: 24 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 13 }, { width: 12 },
  ];

  hojaZonasCtrl.addConditionalFormatting({
    ref: `F${primeraFila}:F${ultimaFila}`,
    rules: [
      { type: "cellIs", operator: "equal", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } }, font: { color: { argb: "FF006100" }, bold: true } } },
      { type: "cellIs", operator: "lessThan", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" }, bold: true } } },
      { type: "cellIs", operator: "greaterThan", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEB9C" } }, font: { color: { argb: "FF9C6500" }, bold: true } } },
    ],
  });
  hojaZonasCtrl.addConditionalFormatting({
    ref: `H${primeraFila}:H${ultimaFila}`,
    rules: [
      { type: "cellIs", operator: "equal", formulae: ['"OK"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } }, font: { color: { argb: "FF006100" }, bold: true } } },
      { type: "cellIs", operator: "equal", formulae: ['"Faltante"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" }, bold: true } } },
      { type: "cellIs", operator: "equal", formulae: ['"Sobrante"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEB9C" } }, font: { color: { argb: "FF9C6500" }, bold: true } } },
    ],
  });

  const colResumen = 10;
  hojaZonasCtrl.mergeCells({ top: 1, left: colResumen, bottom: 1, right: colResumen + 3 });
  const titResumen = hojaZonasCtrl.getCell(1, colResumen);
  titResumen.value = "RESUMEN POR PERSONA";
  titResumen.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  titResumen.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  titResumen.alignment = { horizontal: "left", vertical: "center" };

  const headerResumen = 2;
  const headersResumen = ["Persona", "Zonas escaneadas", "Total prendas escaneadas", "Total diferencias"];
  headersResumen.forEach((h, i) => {
    const cell = hojaZonasCtrl.getCell(headerResumen, colResumen + i);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE11D48" } };
    cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });

  const personasUnicas = [...new Set(escaneosPorZona.map((e) => e.usuarioId))];
  const personasInfo = await Promise.all(personasUnicas.map(async (uid) => {
    const u = await prisma.usuario.findUnique({ where: { id: uid }, select: { nombre: true, color: true } });
    return { uid, nombre: u?.nombre || `Usuario ${uid}`, color: u?.color };
  }));

  let filaP = headerResumen + 1;
  for (const p of personasInfo) {
    hojaZonasCtrl.getCell(filaP, colResumen).value = p.nombre;
    hojaZonasCtrl.getCell(filaP, colResumen + 1).value = { formula: `COUNTIF($C$${primeraFila}:$C$${ultimaFila},J${filaP})` };
    hojaZonasCtrl.getCell(filaP, colResumen + 2).value = { formula: `SUMIF($C$${primeraFila}:$C$${ultimaFila},J${filaP},$E$${primeraFila}:$E$${ultimaFila})` };
    hojaZonasCtrl.getCell(filaP, colResumen + 3).value = { formula: `SUMIF($C$${primeraFila}:$C$${ultimaFila},J${filaP},$F$${primeraFila}:$F$${ultimaFila})` };
    if (p.color) {
      const celda = hojaZonasCtrl.getCell(filaP, colResumen);
      celda.font = { bold: true, color: { argb: argb(p.color) } };
      celda.fill = { type: "pattern", pattern: "solid", fgColor: { argb: argb(tinteSuave(p.color)) } };
    }
    for (let c = 0; c < 4; c++) {
      hojaZonasCtrl.getCell(filaP, colResumen + c).border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    }
    filaP++;
  }
  hojaZonasCtrl.getCell(filaP, colResumen).value = "TOTAL";
  hojaZonasCtrl.getCell(filaP, colResumen).font = { bold: true };
  hojaZonasCtrl.getCell(filaP, colResumen + 1).value = { formula: `SUM(J${headerResumen + 1}:J${filaP - 1})` };
  hojaZonasCtrl.getCell(filaP, colResumen + 1).font = { bold: true };
  hojaZonasCtrl.getCell(filaP, colResumen + 2).value = { formula: `SUM(K${headerResumen + 1}:K${filaP - 1})` };
  hojaZonasCtrl.getCell(filaP, colResumen + 2).font = { bold: true };
  hojaZonasCtrl.getCell(filaP, colResumen + 3).value = { formula: `SUM(L${headerResumen + 1}:L${filaP - 1})` };
  hojaZonasCtrl.getCell(filaP, colResumen + 3).font = { bold: true };
  for (let c = 0; c < 4; c++) {
    const cell = hojaZonasCtrl.getCell(filaP, colResumen + c);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFF3" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  }

  const filaPV = filaP + 2;
  hojaZonasCtrl.mergeCells({ top: filaPV, left: colResumen, bottom: filaPV, right: colResumen + 2 });
  const titPV = hojaZonasCtrl.getCell(filaPV, colResumen);
  titPV.value = "RESUMEN: PUNTOS DE VENTA VS BODEGA";
  titPV.font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
  titPV.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F3864" } };
  titPV.alignment = { horizontal: "left", vertical: "center" };

  const headerPV = filaPV + 1;
  const headersPV = ["Tipo", "Total escaneado (unidades)", "% del total"];
  headersPV.forEach((h, i) => {
    const cell = hojaZonasCtrl.getCell(headerPV, colResumen + i);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE11D48" } };
    cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });

  const filaPDV = headerPV + 1;
  const filaBod = filaPDV + 1;
  const filaTotPV = filaBod + 1;
  hojaZonasCtrl.getCell(filaPDV, colResumen).value = "Punto de venta";
  hojaZonasCtrl.getCell(filaPDV, colResumen + 1).value = { formula: `SUMIF($B$${primeraFila}:$B$${ultimaFila},"Punto de venta",$E$${primeraFila}:$E$${ultimaFila})` };
  hojaZonasCtrl.getCell(filaPDV, colResumen + 2).value = { formula: `IF($K$${filaTotPV}=0,"",K${filaPDV}/$K$${filaTotPV})` };
  hojaZonasCtrl.getCell(filaPDV, colResumen + 2).numFmt = "0.0%";

  hojaZonasCtrl.getCell(filaBod, colResumen).value = "Bodega";
  hojaZonasCtrl.getCell(filaBod, colResumen + 1).value = { formula: `SUMIF($B$${primeraFila}:$B$${ultimaFila},"Bodega",$E$${primeraFila}:$E$${ultimaFila})` };
  hojaZonasCtrl.getCell(filaBod, colResumen + 2).value = { formula: `IF($K$${filaTotPV}=0,"",K${filaBod}/$K$${filaTotPV})` };
  hojaZonasCtrl.getCell(filaBod, colResumen + 2).numFmt = "0.0%";

  hojaZonasCtrl.getCell(filaTotPV, colResumen).value = "TOTAL GENERAL";
  hojaZonasCtrl.getCell(filaTotPV, colResumen).font = { bold: true };
  hojaZonasCtrl.getCell(filaTotPV, colResumen + 1).value = { formula: `SUM(K${filaPDV}:K${filaBod})` };
  hojaZonasCtrl.getCell(filaTotPV, colResumen + 1).font = { bold: true };
  hojaZonasCtrl.getCell(filaTotPV, colResumen + 2).value = { formula: `IF($K$${filaTotPV}=0,"",K${filaTotPV}/$K$${filaTotPV})` };
  hojaZonasCtrl.getCell(filaTotPV, colResumen + 2).numFmt = "0.0%";
  hojaZonasCtrl.getCell(filaTotPV, colResumen + 2).font = { bold: true };
  for (let r = filaPDV; r <= filaTotPV; r++) {
    for (let c = 0; c < 3; c++) {
      const cell = hojaZonasCtrl.getCell(r, colResumen + c);
      cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
      if (r === filaTotPV) {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFEFF3" } };
      }
    }
  }

  hojaZonasCtrl.columns = [
    { width: 9 }, { width: 16 }, { width: 24 }, { width: 14 }, { width: 16 }, { width: 12 }, { width: 13 }, { width: 12 },
  ];

  hojaZonasCtrl.addConditionalFormatting({
    ref: `F${primeraFila}:F${ultimaFila}`,
    rules: [
      { type: "cellIs", operator: "equal", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } }, font: { color: { argb: "FF006100" }, bold: true } } },
      { type: "cellIs", operator: "lessThan", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" }, bold: true } } },
      { type: "cellIs", operator: "greaterThan", formulae: [0], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEB9C" } }, font: { color: { argb: "FF9C6500" }, bold: true } } },
    ],
  });
  hojaZonasCtrl.addConditionalFormatting({
    ref: `H${primeraFila}:H${ultimaFila}`,
    rules: [
      { type: "cellIs", operator: "equal", formulae: ['"OK"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFC6EFCE" } }, font: { color: { argb: "FF006100" }, bold: true } } },
      { type: "cellIs", operator: "equal", formulae: ['"Faltante"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFC7CE" } }, font: { color: { argb: "FF9C0006" }, bold: true } } },
      { type: "cellIs", operator: "equal", formulae: ['"Sobrante"'], style: { fill: { type: "pattern", pattern: "solid", bgColor: { argb: "FFFFEB9C" } }, font: { color: { argb: "FF9C6500" }, bold: true } } },
    ],
  });

  // Reescribir fórmulas que usan nombres definidos (COMPARATIVO, INVENTARIO, LEVIS, etc.)
  if (plantilla) {
    const definedNames = await extraerDefinedNames(plantilla.contenido);
    reescribirFormulasConDefinedNames(hojaLecturas, definedNames);
  }
  // Nota: las fórmulas se generan directamente con rangos acotados y nombres de
  // hoja entre comillas cuando hace falta; no se reescriben después (eso antes
  // producía referencias corruptas como INVENTARIO!$A:$D!$A$2:$D$N).

  return {
    nombre: `lecturas-${inventario.localId}-${id}.xlsx`,
    buffer: Buffer.from(await wb.xlsx.writeBuffer()),
  };
}

export async function generarReporteCsv(id) {
  const filas = await comparativoDeInventario(id);
  const csvCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [
    [
      "Código barras", "Item", "Descripción", "Género", "Estilo",
      "Existencia inicial", "Conteo físico", "Diferencia",
    ].map(csvCell).join(","),
  ];
  for (const f of filas) {
    const inicial = Number(f.existenciaInicial);
    const contado = Number(f.contado);
    lines.push(
      [f.codigoBarras, f.item, f.descripcion, f.genero, f.estilo, inicial, contado, contado - inicial]
        .map(csvCell).join(","),
    );
  }
  return {
    nombre: `reporte-inventario-${id}.csv`,
    contenido: "\uFEFF" + lines.join("\r\n"),
  };
}