import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
const p = new PrismaClient();
// Find the inventory 192's products
const invProds = await p.inventarioProducto.findMany({ where: { inventarioId: 192 }, include: { producto: true } });
const ip = invProds.find((x) => x.producto?.codigoBarras === "7704945299880");
console.log("product:", JSON.stringify(ip, null, 2).slice(0, 500));
await p.$disconnect();
// Check INVENTARIO sheet in the generated reporte
const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile("reporte-polito2.xlsx");
const wi = wb.getWorksheet("INVENTARIO");
for (let r = 2; r <= wi.rowCount; r++) {
  if (wi.getRow(r).getCell(1).value === 7704945299880) {
    console.log("INVENTARIO row", r, ":", JSON.stringify(wi.getRow(r).values));
    break;
  }
}
