import ExcelJS from "exceljs";
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("D:/SENA-PRACTICAS/ARCHIVOS A USAR/Maestras/MAESTRA PILATOS ACC 27 DE OCTUBRE 2026.xlsx");
console.log("definedNames:", JSON.stringify(wb.definedNames));
// modify something
const ws = wb.getWorksheet("INVENTARIO");
ws.getRow(2).getCell(1).value = 999;
const buf = await wb.xlsx.writeBuffer();
const wb2 = new ExcelJS.Workbook();
await wb2.xlsx.load(buf);
console.log("after roundtrip definedNames:", JSON.stringify(wb2.definedNames));