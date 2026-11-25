import fs from "node:fs";
import * as XLSX from "xlsx";
// Use XLSX with cellFormula to read LECTURA
const buf = fs.readFileSync("D:/SENA-PRACTICAS/ARCHIVOS A USAR/Maestras/MAESTRA PILATOS ACC 27 DE OCTUBRE 2026.xlsx");
const wb = XLSX.read(buf, { type: "buffer", cellFormula: true });
const ws = wb.Sheets["LECTURA"];
console.log("dims:", ws["!ref"]);
for (let r = 1; r <= 3; r++) {
  for (let c = 1; c <= 11; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: r - 1, c: c - 1 })];
    if (cell) console.log(`R${r}C${c}:`, JSON.stringify(cell.v), cell.f ? "FORMULA:" + cell.f : "");
  }
}