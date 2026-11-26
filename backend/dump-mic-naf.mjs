import ExcelJS from "exceljs";

for (const f of ["audit-reports/10-mic_centro.xlsx", "audit-reports/12-naf_naf.xlsx"]) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(f);
  console.log(`\n===== ${f} hojas: ${wb.worksheets.map((w) => w.name).join(", ")}`);
  for (const ws of wb.worksheets) {
    if (!/inventario|escan|lectura/i.test(ws.name)) continue;
    console.log(`\n--- [${ws.name}] filas=${ws.rowCount} cols=${ws.columnCount}`);
    const hdr = ws.getRow(1);
    console.log("hdr:", Array.from({ length: ws.columnCount }, (_, i) => `${i + 1}:${hdr.getCell(i + 1).value ?? ""}`).join(" | "));
    for (let r = 2; r <= Math.min(4, ws.rowCount); r++) {
      const row = ws.getRow(r);
      const vals = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = row.getCell(c);
        let v = cell.value;
        if (v && typeof v === "object") v = v.formula ? `={${v.formula}}|res:${JSON.stringify(v.result)}` : JSON.stringify(v);
        vals.push(`${c}:${JSON.stringify(v)}`);
      }
      console.log(`r${r}:`, vals.join(" | "));
    }
  }
}
