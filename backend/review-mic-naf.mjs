import { PrismaClient } from "@prisma/client";
import * as XLSX from "xlsx";
import fs from "fs";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { normalizar } from "./src/lib/scanSpec.js";
import { codeKeys } from "./src/lib/xlsxRefs.js";

const p = new PrismaClient();
for (const id of [10, 12]) {
  const l = await p.local.findUnique({ where: { id } });
  console.log(`\n##### ${id} ${l.nombre}`);
  console.log("perfilColumnas:", JSON.stringify(l.perfilColumnas));
  const inv = await p.inventario.findFirst({ where: { localId: id, estado: "ACTIVO" }, orderBy: { id: "desc" } });
  const ips = await p.inventarioProducto.findMany({ where: { inventarioId: inv.id }, take: 5, include: { producto: true } });
  for (const ip of ips) {
    console.log(" ip:", JSON.stringify({
      cod: ip.producto.codigoBarras, item: ip.item, ref: ip.referencia, desc: ip.descripcion,
      cargados: ip.descriptoresCargados, prodItem: ip.producto.item, prodRef: ip.producto.referencia,
    }));
  }
  // Todas las hojas y columnas con datos de la plantilla
  const tpl = await p.maestraPlantilla.findUnique({ where: { localId: id } });
  const wb = await leerPlantillaLigera(tpl.contenido);
  console.log("plantilla:", tpl.nombreArchivo, "hojas:", wb.worksheets.map((w) => w.name).join(", "));
  for (const ws of wb.worksheets) {
    const hdr = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i - 1] = String(c.value ?? "").trim(); });
    console.log(`  [${ws.name}] hdr:`, hdr.map((h, i) => `${i + 1}:${h}`).join(" | "));
  }
}
// Archivos sueltos que podrían ser conversiones reales
for (const f of ["converted-maestra.xlsx", "conv-test.xlsx"]) {
  if (!fs.existsSync(f)) continue;
  const wb = XLSX.read(fs.readFileSync(f), { type: "buffer", cellFormula: true });
  console.log(`\n### ${f} hojas:`, wb.SheetNames.join(", "));
  for (const sn of wb.SheetNames) {
    if (!/inventario/i.test(sn)) continue;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { header: 1, raw: true, defval: null });
    console.log("  hdr:", JSON.stringify(rows[0]));
    for (let r = 1; r <= 3; r++) console.log(`  r${r + 1}:`, JSON.stringify(rows[r]));
  }
}
await p.$disconnect();
