import { PrismaClient } from "@prisma/client";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";
import { leerSpecScan, normalizar, campoDeHeader } from "./src/lib/scanSpec.js";

const p = new PrismaClient();
const id = 7;
const tpl = await p.maestraPlantilla.findUnique({ where: { localId: id } });
const wb = await leerPlantillaLigera(tpl.contenido);
const invSheetName = wb.worksheets.map((w) => w.name).find((n) => normalizar(n) === "inventario") || "INVENTARIO";
const invWs = wb.getWorksheet(invSheetName);
const invHeaders = [];
invWs.getRow(1).eachCell({ includeEmpty: true }, (c, i) => { invHeaders[i - 1] = String(c.value ?? "").trim(); });
const spec = leerSpecScan(wb, invSheetName, 1, invHeaders);

// Reimplementar el loop con logs
const invCampos = invHeaders.map((h) => campoDeHeader(h));
const usados = new Set([spec.lookupCol]);
const columnas = new Map();
console.log("lookupCol", spec.lookupCol, "zonaCol", spec.zonaCol, "codeCol", spec.codeCol);
spec.headers.forEach((h, idx) => {
  const col = idx + 1;
  if (col === spec.zonaCol || col === spec.codeCol) { console.log(`col ${col} SKIP (zona/code)`); return; }
  const orig = spec.originales.get(col);
  const campo = campoDeHeader(h);
  let invCol = null;
  if (spec.tipo === "escaneo" && orig) {
    invCol = orig;
  } else {
    invCol = invHeaders.findIndex((ih, j) => !usados.has(j + 1) && normalizar(ih) === normalizar(h)) + 1 || null;
    if (!invCol && campo) invCol = invCampos.findIndex((c, j) => !usados.has(j + 1) && c === campo) + 1 || null;
  }
  console.log(`col ${col} h=${h} orig=${orig} campo=${campo} invCol=${invCol} usados=${[...usados]}`);
  if (invCol) { usados.add(invCol); columnas.set(col, invCol); }
});
console.log("reimpl columnas", [...columnas]);
console.log("real columnas", [...spec.columnas]);
await p.$disconnect();
