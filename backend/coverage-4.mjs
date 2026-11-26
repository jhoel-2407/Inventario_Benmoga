import { PrismaClient } from "@prisma/client";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { normalizar } from "./src/lib/scanSpec.js";
import { codeKeys } from "./src/lib/xlsxRefs.js";
const p = new PrismaClient();

for (const localId of [9, 10, 11, 12]) {
  const local = await p.local.findUnique({ where: { id: localId } });
  const tpl = await p.maestraPlantilla.findUnique({ where: { localId } });
  const inv = await p.inventario.findFirst({ where: { localId }, orderBy: { id: "desc" } });
  const ips = await p.inventarioProducto.findMany({ where: { inventarioId: inv.id }, include: { producto: true } });
  const wb = await leerPlantillaLigera(tpl.contenido);
  const invWs = wb.worksheets.find((w) => normalizar(w.name) === "inventario");
  const hdr = [];
  invWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { hdr[i - 1] = String(c.value ?? "").trim(); });
  console.log(`\n== ${localId} ${local.nombre} inv=${inv.id} productos=${ips.length} ==`);
  console.log("headers:", hdr.map((h, i) => `${i + 1}:${h}`).join(" | "));

  const map = new Map();
  let filasTpl = 0, noVacioF = 0;
  for (let r = 2; r <= invWs.rowCount; r++) {
    const code = invWs.getRow(r).getCell(1).value;
    const keys = codeKeys(code);
    if (!keys.length) continue;
    filasTpl++;
    const f = invWs.getRow(r).getCell(6).value;
    if (f !== null && f !== undefined && String(f).trim() !== "") noVacioF++;
    for (const k of keys) map.set(k, { r, f });
  }
  console.log(`plantilla filas=${filasTpl} colF(6) no vacía=${noVacioF}`);

  let enTpl = 0, fDisponible = 0, fVacia = 0, fueraTpl = 0;
  const ejemplos = { disponible: [], vacia: [], fuera: [] };
  for (const ip of ips) {
    const code = String(ip.producto.codigoBarras ?? "").trim();
    const hit = codeKeys(code).map((k) => map.get(k)).find(Boolean);
    if (!hit) { fueraTpl++; if (ejemplos.fuera.length < 3) ejemplos.fuera.push(code); continue; }
    enTpl++;
    if (hit.f !== null && hit.f !== undefined && String(hit.f).trim() !== "") {
      fDisponible++;
      if (ejemplos.disponible.length < 3) ejemplos.disponible.push(`${code}->${JSON.stringify(hit.f)}`);
    } else { fVacia++; if (ejemplos.vacia.length < 3) ejemplos.vacia.push(code); }
  }
  console.log(`productos: enPlantilla=${enTpl} fuera=${fueraTpl} | F disponible=${fDisponible} F vacía=${fVacia}`);
  console.log("  ej disponible:", ejemplos.disponible.join(" ; "));
  console.log("  ej F vacía:", ejemplos.vacia.join(" ; "));
  console.log("  ej fuera:", ejemplos.fuera.join(" ; "));

  if (localId === 12) {
    let descNull = 0, refNull = 0, descVacia = 0, refVacia = 0;
    const ejD = [], ejR = [];
    for (const ip of ips) {
      if (ip.descripcion === null) descNull++; else if (!String(ip.descripcion).trim()) descVacia++;
      if (ip.referencia === null) refNull++; else if (!String(ip.referencia).trim()) refVacia++;
      if (!String(ip.descripcion ?? "").trim() && ejD.length < 5) ejD.push(`${ip.producto.codigoBarras}|item=${ip.item}`);
      if (!String(ip.referencia ?? "").trim() && ejR.length < 5) ejR.push(`${ip.producto.codigoBarras}|item=${ip.item}`);
    }
    console.log(`NAF NAF: desc null=${descNull} vacía=${descVacia} | ref null=${refNull} vacía=${refVacia}`);
    console.log("  desc faltante ej:", ejD.join(" ; "));
    console.log("  ref faltante ej:", ejR.join(" ; "));
    // ¿La plantilla tiene Nombre artículo para esos códigos?
    let recuperables = 0;
    for (const ip of ips) {
      if (String(ip.descripcion ?? "").trim()) continue;
      const hit = codeKeys(ip.producto.codigoBarras).map((k) => map.get(k)).find(Boolean);
      if (hit) {
        const v = invWs.getRow(hit.r).getCell(3).value;
        if (v !== null && v !== undefined && String(v).trim() !== "") recuperables++;
      }
    }
    console.log(`  desc faltante recuperable desde plantilla (col 3): ${recuperables}`);
  }
}
await p.$disconnect();
