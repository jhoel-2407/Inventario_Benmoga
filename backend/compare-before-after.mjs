import fs from "node:fs";
import ExcelJS from "exceljs";

const dirA = "audit-reports-before";
const dirB = "audit-reports";
const files = fs.readdirSync(dirB).filter((f) => f.endsWith(".xlsx")).sort();

function norm(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.formula !== undefined) return `=${v.formula}|${v.result !== undefined && v.result !== null ? JSON.stringify(v.result) : ""}`;
    if (v.richText) return v.richText.map((t) => t.text).join("");
    if (v.text !== undefined) return String(v.text);
    if (v.result !== undefined) return norm(v.result);
    return JSON.stringify(v);
  }
  return String(v);
}

async function load(file) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  return wb;
}

for (const f of files) {
  const aFile = `${dirA}/${f}`;
  if (!fs.existsSync(aFile)) { console.log(`${f}: sin archivo before`); continue; }
  const A = await load(aFile);
  const B = await load(`${dirB}/${f}`);
  let diffs = 0;
  const samples = [];
  const sheetNames = new Set([...A.worksheets.map((w) => w.name), ...B.worksheets.map((w) => w.name)]);
  for (const sn of sheetNames) {
    const aw = A.getWorksheet(sn);
    const bw = B.getWorksheet(sn);
    if (!aw || !bw) { diffs++; samples.push(`hoja ${sn} ausente`); continue; }
    const maxR = Math.max(aw.rowCount, bw.rowCount);
    const maxC = Math.max(aw.columnCount, bw.columnCount);
    for (let r = 1; r <= maxR; r++) {
      for (let c = 1; c <= maxC; c++) {
        const va = norm(aw.getRow(r).getCell(c).value);
        const vb = norm(bw.getRow(r).getCell(c).value);
        if (va === vb) continue;
        diffs++;
        if (samples.length < 6) samples.push(`${sn}!${aw.getRow(r).getCell(c).address}: before=${JSON.stringify(va)} after=${JSON.stringify(vb)}`);
      }
    }
  }
  console.log(`${f.padEnd(45)} celdas_diferentes=${diffs}`);
  for (const s of samples) console.log("   ", s);
}
