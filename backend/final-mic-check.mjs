import fs from "node:fs";
import ExcelJS from "exceljs";

const wb = new ExcelJS.Workbook();
await wb.xlsx.load(fs.readFileSync("audit-reports/10-mic_centro.xlsx"));
const inv = wb.getWorksheet("INVENTARIO");
const hdr = [];
inv.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i - 1] = String(c.value ?? "").trim(); });
const codeCol = hdr.findIndex((h) => /barr/i.test(h)) + 1;
const secCol = hdr.findIndex((h) => /barr/i.test(h) && hdr.slice(0, hdr.indexOf(h)).some((x) => /barr/i.test(x))) + 1;
console.log("INVENTARIO headers:", hdr.map((h, i) => `${i + 1}:${h}`).join(" | "));
let emptyCode = 0, filledCode = 0, emptySec = 0, filledSec = 0, n = 0;
const ej = [];
for (let r = 2; r <= inv.rowCount; r++) {
  const code = inv.getRow(r).getCell(codeCol).value;
  n++;
  if (code === null || code === undefined || String(code).trim() === "") { emptyCode++; if (ej.length < 5) ej.push(`fila ${r} codigo vacio`); }
  else filledCode++;
  const sec = inv.getRow(r).getCell(secCol).value;
  if (sec === null || sec === undefined || String(sec).trim() === "") emptySec++; else filledSec++;
}
console.log(`INVENTARIO: filas=${n} codigoEmpty=${emptyCode} codigoFilled=${filledCode} secEmpty=${emptySec} secFilled=${filledSec}`, ej);

const scan = wb.worksheets.find((w) => /escaneo|lectura/i.test(w.name));
const shdr = [];
scan.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { shdr[i - 1] = String(c.value ?? "").trim(); });
const scode = shdr.findIndex((h) => /plu|barras/i.test(h)) + 1;
const sref = shdr.findIndex((h) => /ref/i.test(h)) + 1;
const sdesc = shdr.findIndex((h) => /desc/i.test(h)) + 1;
const stalla = shdr.findIndex((h) => /talla/i.test(h)) + 1;
const scolor = shdr.findIndex((h) => /color/i.test(h)) + 1;
let scanned = 0, manual = 0;
for (let r = 2; r <= scan.rowCount; r++) {
  const code = scan.getRow(r).getCell(scode).value;
  const v = code && typeof code === "object" ? (code.formula ? (code.result ?? "") : "") : code;
  if (String(v).trim() !== "") scanned++; else manual++;
}
console.log(`ESCANEO: filas=${scan.rowCount} conCodigoScanned=${scanned} manual=${manual}`);
await p;
