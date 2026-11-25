import fs from "node:fs";
import * as XLSX from "xlsx";
const dir = "D:/SENA-PRACTICAS/ARCHIVOS A USAR/Maestras";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".xlsx"));
for (const f of files) {
  const buf = fs.readFileSync(dir + "/" + f);
  const wb = XLSX.read(buf, { type: "buffer", cellFormula: true });
  // find LECTURA/escaneo sheet
  const scanName = wb.SheetNames.find((n) => /lectura|escaneo/i.test(n));
  if (!scanName) continue;
  const ws = wb.Sheets[scanName];
  // get first formula
  const range = XLSX.utils.decode_range(ws["!ref"]);
  let sample = "";
  outer: for (let r = range.s.r; r <= Math.min(range.s.r + 1, range.e.r); r++) {
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cell = ws[XLSX.utils.encode_cell({ r, c })];
      if (cell && cell.f) { sample = cell.f; break outer; }
    }
  }
  console.log(f, "=>", scanName, ":", sample);
}
