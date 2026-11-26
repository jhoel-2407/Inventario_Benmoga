import { PrismaClient } from "@prisma/client";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { leerSpecScan, normalizar, campoDeHeader } from "./src/lib/scanSpec.js";

const p = new PrismaClient();
for (const id of [7, 8, 12, 5, 17]) {
  const l = await p.local.findUnique({ where: { id } });
  const tpl = await p.maestraPlantilla.findUnique({ where: { localId: id } });
  const wb = await leerPlantillaLigera(tpl.contenido);
  const invSheetName = wb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario") || "INVENTARIO";
  const invWs = wb.getWorksheet(invSheetName);
  const invHeaders = [];
  invWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { invHeaders[i - 1] = String(c.value ?? "").trim(); });
  const spec = leerSpecScan(wb, invSheetName, 1, invHeaders);
  console.log(`\n### ${id} ${l.nombre}`);
  console.log("zonaCol", spec.zonaCol, "codeCol", spec.codeCol, "lookupCol", spec.lookupCol);
  console.log("headers", spec.headers.map((h, i) => `${i + 1}:${h}=${campoDeHeader(h)}`).join(" | "));
  console.log("columnas", [...spec.columnas]);
  console.log("originales", [...spec.originales]);
  // Fila 2 cruda de ESCANEO
  const ws = wb.getWorksheet(spec.sheetName);
  const vals = [];
  ws.getRow(2).eachCell({ includeEmpty: true }, (c, i) => {
    vals.push(`${i}:${typeof c.value === "object" && c.value ? `{F:${c.value.formula}}` : JSON.stringify(c.value)}`);
  });
  console.log("row2:", vals.join(" | "));
}
await p.$disconnect();
