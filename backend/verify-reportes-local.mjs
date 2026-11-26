// Regresión local: genera y valida comparativos de todos los locales con plantilla.
import fs from "node:fs";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import { PrismaClient } from "@prisma/client";
import { generarReporteExcel } from "./src/services/reportes.service.js";

const prisma = new PrismaClient();
const locales = await prisma.local.findMany({ orderBy: { id: "asc" }, include: { maestraPlantilla: true } });
fs.mkdirSync("audit-reports", { recursive: true });
let fallos = 0;
for (const local of locales) {
  if (!local.maestraPlantilla) continue;
  const inv = await prisma.inventario.findFirst({ where: { localId: local.id }, orderBy: { id: "desc" } });
  if (!inv) { console.log(`${local.id} ${local.nombre}: SIN INVENTARIO`); continue; }
  const problemas = [];
  let buf;
  try {
    const t0 = Date.now();
    const r = await generarReporteExcel(inv.id);
    buf = r.buffer;
    fs.writeFileSync(`audit-reports/${String(local.id).padStart(2, "0")}-${local.nombre.replace(/[^\w-]+/g, "_")}.xlsx`, buf);
    console.log(`${String(local.id).padStart(2)} ${local.nombre.padEnd(24)} inv=${inv.id} bytes=${buf.length} ${Date.now() - t0}ms`);
  } catch (e) {
    console.log(`${String(local.id).padStart(2)} ${local.nombre.padEnd(24)} inv=${inv.id} ERROR: ${e.message}`);
    fallos++;
    continue;
  }
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const txt = await zip.file(name).async("string");
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(txt)) problemas.push(`XML inválido ${name}`);
    if (/#REF!/.test(txt)) problemas.push(`#REF! ${name}`);
  }
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf); } catch (e) { problemas.push(`ExcelJS: ${e.message}`); }
  const scan = wb.worksheets.find((w) => /lectura|escaneo|esacneo/i.test(w.name));
  if (!scan) problemas.push("SIN HOJA DE ESCANEO");
  else {
    let formulas = 0, cached = 0, mal = 0, codigoTexto = 0, primera = null;
    for (let r = 2; r <= Math.min(scan.rowCount, 30); r++) {
      scan.getRow(r).eachCell({ includeEmpty: false }, (cell) => {
        const v = cell.value;
        if (v && typeof v === "object" && v.formula) {
          formulas++;
          if (v.result !== undefined && v.result !== null) cached++;
          if (/!\$[A-Z]+:\$[A-Z]+!/.test(v.formula) || /!\d+:\d+!/.test(v.formula) || /#REF!/.test(v.formula)) {
            mal++;
            if (mal === 1) problemas.push(`Fórmula corrupta ${cell.address}: ${v.formula}`);
          }
          if (!primera) primera = `${cell.address}=${v.formula}${v.result !== undefined ? ` [${JSON.stringify(v.result)}]` : ""}`;
        }
      });
      const cod = scan.getRow(r).getCell(2).value;
      if (typeof cod === "string") codigoTexto++;
    }
    console.log(`   hoja=${scan.name} formulas=${formulas} cached=${cached} codTexto=${codigoTexto} ej=${primera || "-"}`);
  }
  if (problemas.length) { fallos++; console.log(`   FALLOS: ${problemas.join("; ")}`); }
}
console.log(`\nTiendas con problemas: ${fallos}`);
await prisma.$disconnect();
