import { PrismaClient } from "@prisma/client";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { normalizar } from "./src/lib/scanSpec.js";
const p = new PrismaClient();
const ids = [9, 10, 11, 12]; // MIC Camp, MIC Centro, Movies, Naf Naf
for (const localId of ids) {
  const local = await p.local.findUnique({ where: { id: localId } });
  const tpl = await p.maestraPlantilla.findUnique({ where: { localId } });
  console.log(`\n===== LOCAL ${localId} ${local.nombre} =====`);
  console.log("perfilColumnas:", JSON.stringify(local.perfilColumnas));
  if (!tpl) { console.log("SIN PLANTILLA"); continue; }
  const wb = await leerPlantillaLigera(tpl.contenido, { soloFilas: 4 });
  console.log("hojas:", wb.worksheets.map((w) => JSON.stringify(w.name)).join(", "));
  for (const ws of wb.worksheets) {
    if (!/inventario|lectura|escaneo|esacneo/i.test(ws.name)) continue;
    const hdr = [];
    ws.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i - 1] = String(c.value ?? "").trim(); });
    console.log(`  [${ws.name}] headers:`, hdr.map((h, i) => `${i + 1}:${JSON.stringify(h)}`).join(" | "));
    for (const r of [2, 3]) {
      const vals = [];
      for (let c = 1; c <= Math.min(hdr.length, 14); c++) vals.push(`${c}:${JSON.stringify(ws.getRow(r).getCell(c).value)}`);
      console.log(`    r${r}:`, vals.join(" | "));
    }
  }
  const inv = await p.inventario.findFirst({ where: { localId }, orderBy: { id: "desc" }, include: { _count: { select: { productos: true } } } });
  console.log("inventario:", inv && `${inv.id} ${inv.estado} ${inv.archivoOrigen} productos=${inv._count.productos}`);
  if (inv) {
    const ips = await p.inventarioProducto.findMany({ where: { inventarioId: inv.id }, take: 4, include: { producto: true } });
    for (const ip of ips) console.log("  ip:", JSON.stringify({ cod: ip.producto.codigoBarras, item: ip.item, desc: ip.descripcion, ref: ip.referencia, d1: ip.detalle1, d2: ip.detalle2, est: ip.estilo, gen: ip.genero, sub: ip.subGrupo, cargados: ip.descriptoresCargados }));
  }
}
await p.$disconnect();
