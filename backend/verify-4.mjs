import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { normalizar } from "./src/lib/scanSpec.js";
import { codeKeys, safeResult } from "./src/lib/xlsxRefs.js";
import { generarReporteExcel } from "./src/services/reportes.service.js";

const p = new PrismaClient();

async function tplInfo(localId) {
  const tpl = await p.maestraPlantilla.findUnique({ where: { localId } });
  const wb = await leerPlantillaLigera(tpl.contenido);
  const invName = wb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario");
  const ws = wb.getWorksheet(invName);
  const hdr = [];
  ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i - 1] = String(c.value ?? "").trim(); });
  return { wb, invName, ws, hdr };
}

function mapCol(ws, col) {
  const m = new Map();
  for (let r = 2; r <= ws.rowCount; r++) {
    const code = ws.getRow(r).getCell(1).value;
    for (const k of codeKeys(code)) m.set(k, ws.getRow(r).getCell(col).value);
  }
  return m;
}

const out = [];
for (const localId of [9, 10, 11, 12]) {
  const local = await p.local.findUnique({ where: { id: localId } });
  const inv = await p.inventario.findFirst({ where: { localId, estado: "ACTIVO" }, orderBy: { id: "desc" } });
  const { invName, ws: tplWs, hdr } = await tplInfo(localId);
  const r = await generarReporteExcel(inv.id);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buffer);
  const invWs = wb.getWorksheet(invName);
  const scanWs = wb.worksheets.find((w) => ["escaneo", "lectura", "esacneo"].includes(normalizar(w.name)));
  const ih = [];
  invWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { ih[i - 1] = String(c.value ?? "").trim(); });

  const descCol = ih.findIndex((h) => /nombre.*articulo|descripcion/i.test(normalizar(h))) + 1;
  const barcodeCols = ih.map((h, i) => ({ i: i + 1, h })).filter(({ h }) => /codigo.*barr|cod.*barr|barcode|plu|barras?/.test(normalizar(h)));
  const primaryBc = barcodeCols[0]?.i || 1;
  const secondaryBc = barcodeCols.slice(1).map((b) => b.i);

  // Mapas de la maestra
  const tplMaps = new Map();
  for (const bc of barcodeCols) tplMaps.set(bc.i, mapCol(tplWs, bc.i));

  const invByCode = new Map();
  let invRows = 0;
  const mismatches = [];
  let secEmpty = 0, secEqPrimary = 0, secChecked = 0, descEmpty = 0, descChecked = 0;
  for (let row = 2; row <= invWs.rowCount; row++) {
    const code = invWs.getRow(row).getCell(primaryBc).value;
    if (code === null || code === undefined || String(code).trim() === "") continue;
    invRows++;
    const key = codeKeys(code)[0];
    invByCode.set(key, row);
    // Secundarias
    for (const bc of secondaryBc) {
      secChecked++;
      const v = safeResult(invWs.getRow(row).getCell(bc).value);
      if (v === null || v === undefined || String(v).trim() === "") { secEmpty++; continue; }
      const tplVal = codeKeys(code).map((k) => tplMaps.get(bc)?.get(k)).find((x) => x !== undefined);
      if (tplVal !== undefined && String(v).trim() !== String(tplVal).trim()) {
        if (mismatches.length < 5) mismatches.push(`r${row} col${bc}: gen=${JSON.stringify(v)} tpl=${JSON.stringify(tplVal)}`);
      }
      if (String(v).trim() === String(code).trim()) secEqPrimary++;
    }
    // Descripción
    if (descCol) {
      descChecked++;
      const v = safeResult(invWs.getRow(row).getCell(descCol).value);
      if (v === null || v === undefined || String(v).trim() === "") descEmpty++;
    }
  }

  // ESCANEO
  let scanRows = 0, scanSecEmpty = 0, scanSecMismatch = 0, scanDescEmpty = 0, scanDescMismatch = 0, scanRefEmpty = 0;
  const scanHdr = [];
  scanWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { scanHdr[i - 1] = String(c.value ?? "").trim(); });
  const scanCodeCol = scanHdr.findIndex((h) => /codigo.*barr|cod.*barr|plu|barras?/i.test(normalizar(h))) + 1;
  const scanRefCol = scanHdr.findIndex((h) => /ref/i.test(normalizar(h))) + 1;
  const scanDescCol = scanHdr.findIndex((h) => /desc|nombre/i.test(normalizar(h))) + 1;
  const scanSecCol = scanHdr.findIndex((h) => secondaryBc.length && /cod.*barr/i.test(normalizar(h)) && h !== scanHdr[scanCodeCol - 1]) + 1;
  for (let row = 2; row <= scanWs.rowCount; row++) {
    const code = safeResult(scanWs.getRow(row).getCell(scanCodeCol).value);
    if (code === null || code === undefined || String(code).trim() === "") continue;
    scanRows++;
    const key = codeKeys(code)[0];
    const invRow = invByCode.get(key);
    // Descripción
    if (scanDescCol) {
      const v = safeResult(scanWs.getRow(row).getCell(scanDescCol).value);
      if (v === null || v === undefined || String(v).trim() === "") scanDescEmpty++;
      else if (invRow) {
        const invV = safeResult(invWs.getRow(invRow).getCell(descCol).value);
        if (String(v).trim() !== String(invV ?? "").trim()) scanDescMismatch++;
      }
    }
    // Referencia
    if (scanRefCol) {
      const v = safeResult(scanWs.getRow(row).getCell(scanRefCol).value);
      if (v === null || v === undefined || String(v).trim() === "") scanRefEmpty++;
    }
    // Segunda barra
    if (secondaryBc.length && scanSecCol) {
      const v = safeResult(scanWs.getRow(row).getCell(scanSecCol).value);
      if (v === null || v === undefined || String(v).trim() === "") scanSecEmpty++;
      else if (invRow) {
        const invV = safeResult(invWs.getRow(invRow).getCell(secondaryBc[0]).value);
        if (String(v).trim() !== String(invV ?? "").trim()) scanSecMismatch++;
      }
    }
  }

  out.push({
    local: `${localId} ${local.nombre}`,
    invId: inv.id,
    invHeaders: ih,
    barcodeCols: barcodeCols.map((b) => `${b.i}:${b.h}`),
    invRows,
    secChecked, secEmpty, secEqPrimary, secMismatch: mismatches.length ? mismatches : 0,
    descChecked, descEmpty,
    scanRows, scanDescEmpty, scanDescMismatch, scanRefEmpty, scanSecEmpty, scanSecMismatch,
  });
}
console.log(JSON.stringify(out, null, 2));
await p.$disconnect();
