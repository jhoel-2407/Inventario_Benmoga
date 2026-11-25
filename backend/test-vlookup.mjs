import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
// INVENTARIO sheet
const inv = wb.addWorksheet("INVENTARIO");
inv.getRow(1).values = ["CODIGO", "ITEM", "DESC"];
inv.getRow(2).values = [75656007062, "1530", "PRODUCTO TEST"];
// LECTURA sheet
const lec = wb.addWorksheet("LECTURA");
lec.getRow(1).values = ["ZONA", "CODIGO", "ITEM", "DESC"];
lec.getRow(2).getCell(1).value = 3;
lec.getRow(2).getCell(2).value = 75656007062;
lec.getRow(2).getCell(3).value = { formula: "VLOOKUP(B2,INVENTARIO!$A$2:$C$2,2,FALSE)" };
lec.getRow(2).getCell(4).value = { formula: "VLOOKUP(B2,INVENTARIO!$A$2:$C$2,3,FALSE)" };
const buf = await wb.xlsx.writeBuffer();
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.load(buf);
const ws = wb2.getWorksheet("LECTURA");
console.log("col3:", JSON.stringify(ws.getRow(2).getCell(3).value));
console.log("col4:", JSON.stringify(ws.getRow(2).getCell(4).value));
await wb.xlsx.writeFile("test-vlookup.xlsx");
console.log("saved");
