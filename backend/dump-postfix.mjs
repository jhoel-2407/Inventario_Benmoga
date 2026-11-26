import fs from "node:fs";
import ExcelJS from "exceljs";

for (const f of ["audit-reports/12-naf_naf.xlsx", "audit-reports/10-mic_centro.xlsx"]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(fs.readFileSync(f));
  const scan = wb.worksheets.find((w) => /escaneo|lectura/i.test(w.name));
  console.log(`\n##### ${f} hoja=${scan.name} filas=${scan.rowCount}`);
  const hdr = scan.getRow(1);
  console.log("hdr:", Array.from({ length: scan.columnCount }, (_, i) => `${i + 1}:${hdr.getCell(i + 1).value ?? ""}`).join(" | "));
  for (let r = 2; r <= Math.min(8, scan.rowCount); r++) {
    const row = scan.getRow(r);
    const vals = [];
    for (let c = 1; c <= scan.columnCount; c++) {
      const v = row.getCell(c).value;
      vals.push(`${c}:${v && typeof v === "object" ? (v.formula ? `=${v.formula}|res:${JSON.stringify(v.result)}` : JSON.stringify(v)) : JSON.stringify(v)}`);
    }
    console.log(`r${r}:`, vals.join(" | "));
  }
  // Últimas filas (manuales)
  const last = scan.rowCount;
  for (let r = Math.max(2, last - 2); r <= last; r++) {
    const row = scan.getRow(r);
    const vals = [];
    for (let c = 1; c <= Math.min(scan.columnCount, 7); c++) {
      const v = row.getCell(c).value;
      vals.push(`${c}:${v && typeof v === "object" ? (v.formula ? `=${v.formula}|res:${JSON.stringify(v.result)}` : JSON.stringify(v)) : JSON.stringify(v)}`);
    }
    console.log(`r${r} (ULTIMA):`, vals.join(" | "));
  }
}
