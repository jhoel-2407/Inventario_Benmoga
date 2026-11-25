import { PrismaClient } from "@prisma/client";
import ExcelJS from "exceljs";
const p = new PrismaClient();
const plantillas = await p.maestraPlantilla.findMany({ include: { local: { select: { nombre: true } } } });
console.log("Plantillas:", plantillas.length);
for (const pl of plantillas) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(pl.contenido);
  const invName = wb.worksheets.map((w) => w.name).find((n) => n.trim().toLowerCase() === "inventario" || n.trim().toLowerCase() === "inventario ");
  const scanName = wb.worksheets.map((w) => w.name).find((n) => { const nl = n.trim().toLowerCase(); return nl === "lectura" || nl === "escaneo" || nl === "esacneo"; });
  if (!invName || !scanName) { console.log(pl.local.nombre, ": MISSING inv or scan sheet"); continue; }
  const inv = wb.getWorksheet(invName);
  const scan = wb.getWorksheet(scanName);
  const invH = []; const scanH = [];
  inv.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { if (String(c.value ?? "").trim()) invH[i-1] = String(c.value).trim(); });
  scan.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { if (String(c.value ?? "").trim()) scanH[i-1] = String(c.value).trim(); });
  // trim trailing
  while (invH.length && !invH[invH.length-1]) invH.pop();
  while (scanH.length && !scanH[scanH.length-1]) scanH.pop();
  console.log(`\n${pl.local.nombre} (id ${pl.localId}): scan=[${scan.name}] inv=[${inv.name}]`);
  console.log("  INVENTARIO headers:", invH.join(" | "));
  console.log("  LECTURA headers:  ", scanH.join(" | "));
}
await p.$disconnect();