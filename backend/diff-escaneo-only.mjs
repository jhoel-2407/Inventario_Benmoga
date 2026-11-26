import fs from "node:fs";
import ExcelJS from "exceljs";

const dirA = "audit-reports-before";
const dirB = "audit-reports";
const files = fs.readdirSync(dirB).filter((f) => f.endsWith(".xlsx")).sort();

function norm(v) {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if (v.formula !== undefined) return `=${v.formula}|${v.result !== undefined && v.result !== null ? JSON.stringify(v.result) : ""}`;
    return JSON.stringify(v);
  }
  return String(v);
}

for (const f of files) {
  const A = new ExcelJS.Workbook(); await A.xlsx.load(fs.readFileSync(`${dirA}/${f}`));
  const B = new ExcelJS.Workbook(); await B.xlsx.load(fs.readFileSync(`${dirB}/${f}`));
  const sheetNames = [...new Set([...A.worksheets.map((w) => w.name), ...B.worksheets.map((w) => w.name)])];
  const diffsPorHoja = {};
  for (const sn of sheetNames) {
    const aw = A.getWorksheet(sn); const bw = B.getWorksheet(sn);
    if (!aw || !bw) { diffsPorHoja[sn] = ["HOJA_AUSENTE"]; continue; }
    const d = [];
    const maxR = Math.max(aw.rowCount, bw.rowCount);
    const maxC = Math.max(aw.columnCount, bw.columnCount);
    for (let r = 1; r <= maxR; r++) for (let c = 1; c <= maxC; c++) {
      const va = norm(aw.getRow(r).getCell(c).value);
      const vb = norm(bw.getRow(r).getCell(c).value);
      if (va !== vb) d.push(`${aw.getRow(r).getCell(c).address}: ${JSON.stringify(va)} -> ${JSON.stringify(vb)}`);
    }
    if (d.length) diffsPorHoja[sn] = d;
  }
  const escaneoHoja = Object.keys(diffsPorHoja).filter((k) => /esc|lect/.test(k));
  const fueraDeEscaneo = Object.entries(diffsPorHoja).filter(([k]) => !/esc|lect/i.test(k));
  if (escaneoHoja.length) {
    console.log(`${f}: ${JSON.stringify(diffsPorHoja)}`);
  }
  for (const [k, v] of Object.entries(diffsPorHoja)) {
    if (!/esc|lect/i.test(k)) console.log(`${f}: (fuera de escaneo) ${k}: ${v.length} celdas e.g. ${v.slice(0, 3).join(" ; ")}`);
  }
}
