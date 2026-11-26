import { PrismaClient } from "@prisma/client";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { leerSpecScan, normalizar, campoDeHeader } from "./src/lib/scanSpec.js";

const p = new PrismaClient();
const locales = await p.local.findMany({ orderBy: { id: "asc" } });
for (const l of locales) {
  const inv = await p.inventario.findFirst({ where: { localId: l.id, estado: "ACTIVO" }, orderBy: { id: "desc" } });
  const tpl = await p.maestraPlantilla.findUnique({ where: { localId: l.id } });
  if (!inv || !tpl) continue;
  let wb;
  try {
    wb = await leerPlantillaLigera(tpl.contenido);
  } catch (e) {
    console.log(`\n##### ${l.id} ${l.nombre}: ERROR plantilla ${e.message}`);
    continue;
  }
  const invSheetName = wb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario") || "INVENTARIO";
  const invWs = wb.getWorksheet(invSheetName);
  const invHeaders = [];
  invWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { invHeaders[i - 1] = String(c.value ?? "").trim(); });
  const spec = leerSpecScan(wb, invSheetName, 1, invHeaders);
  console.log(`\n##### ${l.id} ${l.nombre} inv=${inv.id} tpl=${tpl.nombreArchivo}`);
  console.log("  invHeaders:", invHeaders.map((h, i) => `${i + 1}:${h}`).join(" | "));
  console.log("  scan:", spec.headers.map((h, i) => `${i + 1}:${h}`).join(" | "));
  console.log("  columnas:", [...spec.columnas].map(([a, b]) => `${a}->${b}`).join(", "), "| originales:", [...spec.originales].map(([a, b]) => `${a}->${b}`).join(", "));
  const missing = [];
  spec.headers.forEach((h, idx) => {
    const col = idx + 1;
    if (col === spec.zonaCol || col === spec.codeCol || spec.columnas.has(col)) return;
    const campo = campoDeHeader(h);
    const cands = invHeaders.map((ih, j) => ({ j: j + 1, ih, c: campoDeHeader(ih) })).filter((x) => campo && x.c === campo);
    missing.push(`${col}:${h} (campo=${campo}) -> [${cands.map((x) => `${x.j}:${x.ih}`).join(", ")}]`);
  });
  if (missing.length) console.log("  SIN MAPEO:", missing.join(" || "));
}
await p.$disconnect();
