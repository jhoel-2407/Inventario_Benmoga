import ExcelJS from "exceljs";
import fs from "fs";

for (const f of ["C:/Users/jhoel/Downloads/comparativo-182.xlsx", "C:/Users/jhoel/Downloads/comparativo-182 (1).xlsx"]) {
  console.log(`\n##### ${f} size=${fs.statSync(f).size}`);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f);
  console.log("hojas:", wb.worksheets.map((w) => `${w.name}(${w.rowCount}x${w.columnCount})`).join(", "));
  for (const ws of wb.worksheets) {
    if (!/inventario|escan|lectura|comparat/i.test(ws.name)) continue;
    console.log(`--- [${ws.name}] filas=${ws.rowCount} cols=${ws.columnCount}`);
    const hdr = ws.getRow(1);
    console.log("hdr:", Array.from({ length: Math.min(ws.columnCount, 14) }, (_, i) => `${i + 1}:${hdr.getCell(i + 1).value ?? ""}`).join(" | "));
    for (let r = 2; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const vals = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 14); c++) {
        const v = row.getCell(c).value;
        vals.push(`${c}:${v && typeof v === "object" ? (v.formula ? `={${v.formula}}` : JSON.stringify(v)) : JSON.stringify(v)}`);
      }
      console.log(`r${r}:`, vals.join(" | "));
    }
  }
}
