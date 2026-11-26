import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { normalizar } from "./src/lib/scanSpec.js";
import { codeKeys, safeResult } from "./src/lib/xlsxRefs.js";
import { generarReporteExcel } from "./src/services/reportes.service.js";

const p = new PrismaClient();
const localId = 12;
const inv = await p.inventario.findFirst({ where: { localId, estado: "ACTIVO" }, orderBy: { id: "desc" } });
const ips = await p.inventarioProducto.findMany({ where: { inventarioId: inv.id }, include: { producto: true } });
const expected = new Map();
for (const ip of ips) {
  const prod = ip.producto;
  const desc = (ip.descriptoresCargados ? ip.descripcion : prod?.descripcion ?? ip.descripcion) ?? "";
  const ref = (ip.descriptoresCargados ? ip.referencia : prod?.referencia ?? ip.referencia) ?? "";
  for (const k of codeKeys(prod.codigoBarras)) expected.set(k, { desc, ref, code: prod.codigoBarras });
}

const r = await generarReporteExcel(inv.id);
const wb = new ExcelJS.Workbook();
await wb.xlsx.load(r.buffer);
const invWs = wb.getWorksheet("INVENTARIO");
const scanWs = wb.worksheets.find((w) => /escaneo|lectura/i.test(w.name));

const ih = [];
invWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { ih[i - 1] = String(c.value ?? "").trim(); });
const descCol = ih.findIndex((h) => normalizar(h) === "nombre articulo") + 1;
const codeCol = 1;

let rows = 0, descMismatch = 0, descEmpty = 0, amp = 0;
const ej = [];
for (let row = 2; row <= invWs.rowCount; row++) {
  const code = safeResult(invWs.getRow(row).getCell(codeCol).value);
  if (code === null || code === undefined || String(code).trim() === "") continue;
  rows++;
  const exp = codeKeys(code).map((k) => expected.get(k)).find(Boolean);
  const got = safeResult(invWs.getRow(row).getCell(descCol).value);
  if (got === null || got === undefined || String(got).trim() === "") { descEmpty++; continue; }
  if (String(got).includes("&amp;")) amp++;
  if (exp && String(got).trim() !== String(exp.desc).trim()) {
    descMismatch++;
    if (ej.length < 5) ej.push(`${code}: got=${JSON.stringify(got)} exp=${JSON.stringify(exp.desc)}`);
  }
}

const sh = [];
scanWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { sh[i - 1] = String(c.value ?? "").trim(); });
const sCode = sh.findIndex((h) => /plu|codigo.*barr|barras?/i.test(normalizar(h))) + 1;
const sRef = sh.findIndex((h) => /ref/i.test(normalizar(h))) + 1;
const sDesc = sh.findIndex((h) => /desc|nombre/i.test(normalizar(h))) + 1;
let sRows = 0, sDescEmpty = 0, sDescMismatch = 0, sRefEmpty = 0, sRefMismatch = 0;
for (let row = 2; row <= scanWs.rowCount; row++) {
  const code = safeResult(scanWs.getRow(row).getCell(sCode).value);
  if (code === null || code === undefined || String(code).trim() === "") continue;
  sRows++;
  const exp = codeKeys(code).map((k) => expected.get(k)).find(Boolean);
  const d = safeResult(scanWs.getRow(row).getCell(sDesc).value);
  const rf = safeResult(scanWs.getRow(row).getCell(sRef).value);
  if (d === null || d === undefined || String(d).trim() === "") sDescEmpty++;
  else if (exp && String(d).trim() !== String(exp.desc).trim()) sDescMismatch++;
  if (rf === null || rf === undefined || String(rf).trim() === "") sRefEmpty++;
  else if (exp && String(rf).trim() !== String(exp.ref).trim()) sRefMismatch++;
}

console.log(JSON.stringify({ invId: inv.id, archivoOrigen: inv.archivoOrigen, rows, descEmpty, descMismatch, amp, ej, sRows, sDescEmpty, sDescMismatch, sRefEmpty, sRefMismatch }, null, 2));
await p.$disconnect();
