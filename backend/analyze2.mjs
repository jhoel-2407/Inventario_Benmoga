import * as XLSX from "xlsx";
import fs from "node:fs";
const maestraPath = "D:/SENA-PRACTICAS/PRACTICAS 1/App3/levis-inventario-completo/docs/MAESTRA PILATOS ACC 27 DE OCTUBRE 2026.xlsx";
const buf = fs.readFileSync(maestraPath);
const wb = XLSX.read(buf, { type: "buffer" });
console.log("SHEETS:", wb.SheetNames);

for (const name of ["LECTURA", "ZONAS", "Hoja1"]) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
  console.log(`\n========== ${name}: ${rows.length} rows, ${rows[0]?.length} cols`);
  // print rows 1-5
  for (let i = 0; i < Math.min(6, rows.length); i++) {
    console.log(`  row ${i+1}:`, JSON.stringify(rows[i]));
  }
  // print a middle row
  const mid = Math.floor(rows.length / 2);
  console.log(`  row ${mid}:`, JSON.stringify(rows[mid]));
  // print last non-empty row
  for (let i = rows.length - 1; i >= 0; i--) {
    if (rows[i].some((c) => c !== "")) { console.log(`  last nonempty row ${i+1}:`, JSON.stringify(rows[i])); break; }
  }
}
