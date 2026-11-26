import ExcelJS from "exceljs";

for (const f of ["audit-conversiones-before/10-mic_centro.xlsx", "audit-conversiones/10-mic_centro.xlsx"]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f);
  console.log(`\n===== ${f} hojas: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  for (const ws of wb.worksheets) {
    if (!/inventario|lectura|escan/i.test(ws.name)) continue;
    console.log(`--- [${ws.name}] filas=${ws.rowCount} cols=${ws.columnCount}`);
    const hdr = ws.getRow(1);
    console.log("hdr:", Array.from({ length: ws.columnCount }, (_, i) => `${i + 1}:${hdr.getCell(i + 1).value ?? ""}`).join(" | "));
    for (let r = 2; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const vals = [];
      for (let c = 1; c <= Math.min(ws.columnCount, 11); c++) {
        const v = row.getCell(c).value;
        vals.push(`${c}:${v && typeof v === "object" ? (v.formula ? `={${v.formula}}` : JSON.stringify(v)) : JSON.stringify(v)}`);
      }
      console.log(`r${r}:`, vals.join(" | "));
    }
  }
}
