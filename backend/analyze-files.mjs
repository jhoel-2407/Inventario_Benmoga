import * as XLSX from "xlsx";
import fs from "node:fs";
const stockPath = "D:/SENA-PRACTICAS/PRACTICAS 1/App3/levis-inventario-completo/docs/stock pil acc 20 nov.xls";
const maestraPath = "D:/SENA-PRACTICAS/PRACTICAS 1/App3/levis-inventario-completo/docs/MAESTRA PILATOS ACC 27 DE OCTUBRE 2026.xlsx";

function analyze(filePath) {
  console.log("\n========== FILE:", filePath);
  const buf = fs.readFileSync(filePath);
  const wb = XLSX.read(buf, { type: "buffer" });
  console.log("SHEETS:", wb.SheetNames);
  for (const name of wb.SheetNames) {
    const ws = wb.Sheets[name];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
    console.log(`\n--- SHEET: ${name} | rows: ${rows.length} | cols: ${rows[0]?.length || 0}`);
    for (let i = 0; i < Math.min(4, rows.length); i++) {
      console.log(`  row ${i + 1}:`, JSON.stringify(rows[i]).slice(0, 500));
    }
    if (rows.length > 4) console.log(`  last row:`, JSON.stringify(rows[rows.length - 1]).slice(0, 300));
  }
}

analyze(stockPath);
analyze(maestraPath);
