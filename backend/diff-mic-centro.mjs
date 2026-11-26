import ExcelJS from "exceljs";

async function readSheet(file, name) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.getWorksheet(name);
  const rows = [];
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const vals = [];
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value;
      vals.push(v && typeof v === "object" ? (v.formula ? `=${v.formula}` : JSON.stringify(v)) : v ?? null);
    }
    rows.push(vals);
  }
  return rows;
}

for (const sheet of ["INVENTARIO", "ESCANEO"]) {
  const before = await readSheet("audit-reports-before/10-mic_centro.xlsx", sheet);
  const after = await readSheet("audit-reports/10-mic_centro.xlsx", sheet);
  console.log(`\n### ${sheet} before rows=${before.length} after rows=${after.length}`);
  console.log("hdr before:", JSON.stringify(before[0]));
  console.log("hdr after :", JSON.stringify(after[0]));
  let diffs = 0;
  for (let r = 0; r < Math.max(before.length, after.length); r++) {
    const a = JSON.stringify(before[r] ?? null);
    const b = JSON.stringify(after[r] ?? null);
    if (a !== b) {
      diffs++;
      if (diffs <= 8) console.log(`r${r + 1}\n  before: ${a}\n  after : ${b}`);
    }
  }
  console.log("total diffs:", diffs);
}
