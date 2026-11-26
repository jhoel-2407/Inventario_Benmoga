import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { leerSpecScan, normalizar } from "./src/lib/scanSpec.js";
import { generarReporteExcel } from "./src/services/reportes.service.js";
const p = new PrismaClient();

for (const localId of [9, 10, 11, 12]) {
  const local = await p.local.findUnique({ where: { id: localId } });
  const tpl = await p.maestraPlantilla.findUnique({ where: { localId } });
  const inv = await p.inventario.findFirst({ where: { localId }, orderBy: { id: "desc" } });
  const wbT = await leerPlantillaLigera(tpl.contenido);
  const invName = wbT.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario");
  const invHeaders = [];
  wbT.getWorksheet(invName).getRow(1).eachCell({ includeEmpty: true }, (c, i) => { invHeaders[i - 1] = String(c.value ?? "").trim(); });
  const spec = leerSpecScan(wbT, invName, 1, invHeaders);
  console.log(`\n== ${localId} ${local.nombre} == spec hoja=${spec.sheetName} codeCol=${spec.codeCol} zonaCol=${spec.zonaCol} lookupCol=${spec.lookupCol}`);
  console.log("  columnas (scan->inv):", [...spec.columnas.entries()].map(([a, b]) => `${a}->${b}`).join(", "));
  console.log("  originales:", [...spec.originales.entries()].map(([a, b]) => `${a}->${b}`).join(", "));

  const r = await generarReporteExcel(inv.id);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(r.buffer);
  const invWs = wb.getWorksheet(invName);
  const scanWs = wb.worksheets.find((w) => /lectura|escaneo|esacneo/i.test(w.name));
  const hdr = [];
  invWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i - 1] = String(c.value ?? "").trim(); });

  // INVENTARIO: contar vacíos por columna (solo filas con datos)
  const vacios = new Array(invWs.columnCount).fill(0);
  let filas = 0;
  for (let rr = 2; rr <= invWs.rowCount; rr++) {
    const cod = invWs.getRow(rr).getCell(1).value;
    if (cod === null || cod === undefined || String(cod).trim() === "") continue;
    filas++;
    for (let c = 1; c <= invWs.columnCount; c++) {
      const v = invWs.getRow(rr).getCell(c).value;
      if (v === null || v === undefined || String(v).trim() === "") vacios[c - 1]++;
    }
  }
  console.log(`  INVENTARIO filas=${filas} vacíos por col:`, vacios.map((n, i) => `${i + 1}:${hdr[i] || "?"}=${n}`).join(" | "));

  // ESCANEO: contar vacíos por columna (solo filas con código en B)
  const sHdr = [];
  scanWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { sHdr[i - 1] = String(c.value ?? "").trim(); });
  const sVacios = new Array(scanWs.columnCount).fill(0);
  let sFilas = 0;
  const ejemplos = [];
  for (let rr = 2; rr <= scanWs.rowCount; rr++) {
    const cod = scanWs.getRow(rr).getCell(spec.codeCol).value;
    if (cod === null || cod === undefined || String(cod).trim() === "") continue;
    sFilas++;
    let filaVacia = false;
    for (let c = 1; c <= scanWs.columnCount; c++) {
      const v = scanWs.getRow(rr).getCell(c).value;
      const res = v && typeof v === "object" && v.formula ? v.result : v;
      if (res === null || res === undefined || String(res).trim() === "") { sVacios[c - 1]++; filaVacia = true; }
    }
    if (filaVacia && ejemplos.length < 3) {
      const out = [];
      for (let c = 1; c <= scanWs.columnCount; c++) { const v = scanWs.getRow(rr).getCell(c).value; out.push(`${c}:${JSON.stringify(v && typeof v === "object" && v.formula ? v.result : v)}`); }
      ejemplos.push(`fila ${rr} ${out.join(" ")}`);
    }
  }
  console.log(`  ESCANEO filas=${sFilas} vacíos por col:`, sVacios.map((n, i) => `${i + 1}:${sHdr[i] || "?"}=${n}`).join(" | "));
  for (const e of ejemplos) console.log("    ej:", e);
}
await p.$disconnect();
