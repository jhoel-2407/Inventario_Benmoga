import ExcelJS from "exceljs";
import { prisma } from "../lib/prisma.js";
import { argb, colorDeUsuario, tinteSuave } from "../lib/colores.js";
import { extraerDefinedNames, reescribirFormulasConDefinedNames } from "../lib/definedNames.js";

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
  if (/descripcion|desc/.test(n)) return "desc";
  if (/codigo.*articulo|id.*articulo|item/.test(n)) return "item";
  if (/genero|sexo/.test(n)) return "genero";
  if (/linea|estilo|familia|tipo/.test(n)) return "linea";
  if (/empleado/.test(n)) return "empleado";
  if (/fecha/.test(n)) return "fecha";
  return null;
};

const headerToProductField = (h) => {
  const n = normalizar(h);
  if (/codigo.*barr|cod.*barr|barcode|plu|barras?/.test(n)) return "codigoBarras";
  if (/talla|medida|size|detalle ext 2|detalle ext. 2/.test(n)) return "detalle1";
  if (/color|colour|detalle ext 1|detalle ext. 1/.test(n)) return "detalle2";
  if (/descripcion|desc/.test(n)) return "descripcion";
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
    tplWb = new ExcelJS.Workbook();
    await tplWb.xlsx.load(plantilla.contenido);
    const found = tplWb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario");
    if (found) invSheetName = found;
  }

  const newInv = wb.addWorksheet(invSheetName);
  let invHeaders = [];
  if (plantilla && tplWb) {
    const tplInv = tplWb.getWorksheet(invSheetName);
    if (tplInv) {
      tplInv.columns.forEach((col, i) => { if (col.width) newInv.getColumn(i + 1).width = col.width; });
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
        const key = String(code ?? "").trim().replace(/^0+/, "");
        if (key) tplInvMap.set(key, tplInv.getRow(r));
      }
    }
  }

  const fontBase = { name: "Verdana", size: 10, family: 2, color: { indexed: 8 } };
  for (const ip of invProds) {
    const prod = ip.producto;
    const code = prod?.codigoBarras || "";
    const codeKey = String(code).trim().replace(/^0+/, "");
    const tplRow = tplInvMap.get(codeKey);
    const values = invHeaders.map((h) => {
      const field = headerToProductField(h);
      if (field === "codigoBarras") return null; // se asigna abajo
      if (field) {
        const v = ip[field] ?? prod?.[field] ?? null;
        if (v !== null && v !== undefined && String(v).trim() !== "") return v;
      }
      // Completar desde la plantilla si el campo no está en BD
      if (tplRow) {
        const colIdx = invHeaders.indexOf(h);
        const tplVal = tplRow.getCell(colIdx + 1).value;
        if (tplVal !== null && tplVal !== undefined && String(tplVal).trim() !== "") return tplVal;
      }
      return null;
    });
    const row = newInv.addRow(values);
    row.font = fontBase;
    const codigoCol = invHeaders.findIndex((h) => headerToProductField(h) === "codigoBarras");
    if (codigoCol >= 0) {
      const code = prod?.codigoBarras || "";
      row.getCell(codigoCol + 1).value = String(code).trim();
      row.getCell(codigoCol + 1).numFmt = "@";
    }
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
      tplScanWs.columns.forEach((col, i) => { if (col.width) hojaLecturas.getColumn(i + 1).width = col.width; });
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
  const isEscaneo = normalizar(scanSheetName) === "escaneo";
  if (isEscaneo) {
    const last = hojaLecturas.rowCount;
    for (let r = last; r >= 2; r--) hojaLecturas.spliceRows(r, 1);
  }

  // Pre-compute INVENTARIO mapping (once, not per scan)
  const invSheet = wb.getWorksheet(invSheetName);
  const invRowMap = new Map();
  if (invSheet) {
    for (let r = 2; r <= invSheet.rowCount; r++) {
      const code = invSheet.getRow(r).getCell(1).value;
      const key = String(code ?? "").trim().replace(/^0+/, "");
      if (key) invRowMap.set(key, r);
    }
  }
  const invLastRow = invSheet?.rowCount || 2;
  const invColCount = invSheet?.columnCount || 10;
  const lastCol = String.fromCharCode(64 + (invColCount > 26 ? 26 : invColCount));

  // Mapeo de columna LECTURA -> columna INVENTARIO (por encabezado normalizado)
  const LEC_TO_INV = {
    "zona": ["zona"],
    "codigo": ["codigo barra", "codigo barras", "codigo de barras", "codigo de barra", "cod barras", "plu", "barcode", "codigo barras articulo", "codigobarra"],
    "item": ["item", "id articulo", "codigo articulo", "codigo de articulo"],
    "desc": ["desc item", "descripcion", "descripcion item", "nombre articulo", "nombre", "producto", "descrip corta", "descripcion corta"],
    "genero": ["genero", "sexo"],
    "linea": ["linea", "estilo", "tipo", "tipos de prenda", "familia", "categoria"],
    "talla": ["talla", "detalle ext 2", "detalle ext. 2", "desc detalle ext 2", "desc. detalle ext. 2", "medida", "size"],
    "colorProd": ["color", "colour", "detalle ext 1", "detalle ext. 1", "desc detalle ext 1", "desc. detalle ext. 1", "gdi libelle 1"],
    "referencia": ["referencia", "ref"],
  };
  const headerToCanonical2 = (h) => {
    const nh = normalizar(h);
    for (const [field, syns] of Object.entries(LEC_TO_INV)) {
      if (syns.some((s) => normalizar(s) === nh)) return field;
    }
    return headerToField(h);
  };

  const lecturaToInvCol = lecturaHeaders.map((h) => {
    const nh = normalizar(h);
    for (let j = 0; j < invHeaders.length; j++) {
      if (normalizar(invHeaders[j]) === nh) return j + 1;
    }
    const lecField = headerToCanonical2(h);
    if (!lecField) return null;
    for (let j = 0; j < invHeaders.length; j++) {
      const invField = headerToCanonical2(invHeaders[j]);
      if (invField === lecField) return j + 1;
    }
    return null;
  });

  let rowIndex = 2;
  for (const entry of lecturas) {
    const esNov = entry.esNovedad;
    const zona = esNov ? entry.n.zona : entry.e.zona;
    const usuario = esNov ? entry.n.usuario : entry.e.usuario;
    const codigo = esNov ? entry.n.codigoLeido : entry.e.codigoLeido;
    const hex = colorDeUsuario(usuario);

    let genero = "", linea = "", talla = "", colorProd = "", item = "", desc = "";
    if (esNov) {
      desc = "N/A"; genero = "N/A"; linea = "N/A"; talla = "N/A"; colorProd = "N/A"; item = "N/A";
    } else {
      const ip = entry.e.inventarioProducto;
      if (ip?.descriptoresCargados) {
        item = ip.item || ""; desc = ip.descripcion || ""; genero = ip.genero || "";
        linea = ip.estilo || ""; talla = ip.detalle1 || ""; colorProd = ip.detalle2 || "";
      } else {
        const prod = ip?.producto;
        item = prod?.item || ip?.item || ""; desc = prod?.descripcion || ip?.descripcion || "";
        genero = prod?.genero || ip?.genero || ""; linea = prod?.estilo || ip?.estilo || "";
        talla = prod?.detalle1 || ip?.detalle1 || ""; colorProd = prod?.detalle2 || ip?.detalle2 || "";
      }
    }
    const zid = esNov ? entry.n.zonaId : entry.e.zonaId;
    const pos = (posicionPorZona.get(zid) || 0) + 1;
    posicionPorZona.set(zid, pos);

    const fila = hojaLecturas.getRow(rowIndex);
    const isLectura = normalizar(scanSheetName) === "lectura";
    if (isLectura) {
      const zonaCol = lecturaHeaders.findIndex((h) => headerToField(h) === "zona");
      const codigoCol = lecturaHeaders.findIndex((h) => headerToField(h) === "codigo");
      if (zonaCol >= 0) fila.getCell(zonaCol + 1).value = zona.numero;
      if (codigoCol >= 0) {
        fila.getCell(codigoCol + 1).value = String(codigo).trim();
        fila.getCell(codigoCol + 1).numFmt = "@";
      }
      // Para cada columna (excepto zona y código), escribir VLOOKUP con cached result
      for (let c = 1; c <= hojaLecturas.columnCount; c++) {
        const field = headerToField(lecturaHeaders[c - 1]);
        if (field === "zona" || field === "codigo") continue;
        const invCol = lecturaToInvCol[c - 1];
        if (!invCol) continue;
        const cell = fila.getCell(c);
        if (esNov) {
          cell.value = "N/A";
        } else {
          const invRow = invRowMap.get(String(codigo).trim().replace(/^0+/, ""));
          let result = null;
          if (invRow) {
            const invVal = invSheet.getRow(invRow).getCell(invCol).value;
            result = invVal !== null && invVal !== undefined ? invVal : null;
          }
          const sheetRef = invSheetName.includes(" ") ? `'${invSheetName}'` : invSheetName;
          const formula = `VLOOKUP($B${rowIndex},${sheetRef}!$A$2:$${lastCol}$${invLastRow},${invCol},0)`;
          if (result !== null && result !== undefined) {
            cell.value = { formula: formula, result: result };
          } else {
            cell.value = { formula: formula };
          }
        }
      }
    } else {
      const valores = {};
      valores["zona"] = zona.numero;
      valores["codigo"] = /^\d{4,20}$/.test(String(codigo).trim()) ? Number(codigo) : codigo;
      valores["item"] = item;
      valores["genero"] = genero;
      valores["linea"] = linea;
      valores["talla"] = talla;
      valores["colorProd"] = colorProd;
      const rowValues = lecturaHeaders.map((h) => {
        const field = headerToField(h);
        if (field && valores[field] !== undefined) return valores[field];
        return null;
      });
      rowValues.forEach((v, i) => {
        if (v !== null && v !== undefined) fila.getCell(i + 1).value = v;
      });
    }

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

  // Escribir fórmulas VLOOKUP en filas vacías (para que el usuario pueda agregar códigos manualmente)
  const invSheet2 = wb.getWorksheet(invSheetName);
  const invLastRow2 = invSheet2?.rowCount || 2;
  const invColCount2 = invSheet2?.columnCount || 10;
  const lastCol2 = String.fromCharCode(64 + (invColCount2 > 26 ? 26 : invColCount2));
  const totalRows = Math.max(rowIndex - 1 + 50, 100);
  for (let r = rowIndex; r <= totalRows; r++) {
    const fila = hojaLecturas.getRow(r);
    const isLectura = normalizar(scanSheetName) === "lectura";
    if (isLectura) {
      for (let c = 1; c <= hojaLecturas.columnCount; c++) {
        const field = headerToField(lecturaHeaders[c - 1]);
        if (field === "zona" || field === "codigo") continue;
        const invCol = lecturaToInvCol ? lecturaToInvCol[c - 1] : c;
        if (!invCol) continue;
        const sheetRef2 = invSheetName.includes(" ") ? `'${invSheetName}'` : invSheetName;
        const formula = `VLOOKUP($B${r},${sheetRef2}!$A$2:$${lastCol2}$${invLastRow2},${invCol},0)`;
        fila.getCell(c).value = { formula };
      }
    }
  }

  if (!lecturas.length) {
    hojaLecturas.addRow(lecturaHeaders.map(() => ""));
    hojaLecturas.getRow(hojaLecturas.rowCount).getCell(1).value = "Sin lecturas registradas";
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
  // Acotar rangos INVENTARIO!$A:$J -> INVENTARIO!$A$2:$J$N (mejor compatibilidad)
  const invLastRowFinal = wb.getWorksheet(invSheetName)?.rowCount || 2;
  for (let r = 1; r <= hojaLecturas.rowCount; r++) {
    const row = hojaLecturas.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (cell.value && typeof cell.value === "object" && cell.value.formula) {
        const f = cell.value.formula;
        const newF = f.replace(/INVENTARIO!\$A:\$J/g, `INVENTARIO!$A$2:$J$${invLastRowFinal}`)
                      .replace(/INVENTARIO!A:J/g, `INVENTARIO!$A$2:$J$${invLastRowFinal}`)
                      .replace(/INVENTARIO!\$\d+:\$\d+/g, `INVENTARIO!$A$2:$J$${invLastRowFinal}`)
                      .replace(/INVENTARIO!\$A:\$\d+/g, `INVENTARIO!$A$2:$J$${invLastRowFinal}`);
        if (newF !== f) cell.value = { formula: newF, result: cell.value.result };
      }
    });
  }

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