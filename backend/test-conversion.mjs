// Prueba de conversión sin mutar la BD (llama al servicio directamente).
// - Polito: usa el STOCK original disponible en docs/.
// - Resto: stock sintético derivado de INVENTARIO de su propia plantilla (smoke test).
import fs from "node:fs";
import JSZip from "jszip";
import ExcelJS from "exceljs";
import XLSX from "xlsx";
import { PrismaClient } from "@prisma/client";
import { convertirStockAMaestra } from "./src/services/stock-converter.service.js";
import { leerSpecScan } from "./src/lib/scanSpec.js";

const prisma = new PrismaClient();
fs.mkdirSync("audit-conversiones", { recursive: true });
const locales = await prisma.local.findMany({ orderBy: { id: "asc" }, include: { maestraPlantilla: true } });

async function validar(buf, etiqueta, localId, tplWb, invHeaders, spec) {
  const problemas = [];
  const zip = await JSZip.loadAsync(buf);
  for (const name of Object.keys(zip.files)) {
    if (!/\.(xml|rels)$/.test(name)) continue;
    const txt = await zip.file(name).async("string");
    if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(txt)) problemas.push(`XML inválido ${name}`);
    if (/!\$[A-Z]+:\$[A-Z]+!/.test(txt)) problemas.push(`rango corrupto ${name}`);
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  void tplWb; void etiqueta;
  const ws = spec ? wb.getWorksheet(spec.sheetName) : null;
  if (!ws) problemas.push("Sin hoja de escaneo");
  else {
    let formulas = 0, mal = 0;
    for (let r = 2; r <= Math.min(ws.rowCount, 20); r++) {
      for (const [colScan, colInv] of spec.columnas) {
        const v = ws.getRow(r).getCell(colScan).value;
        if (!v || typeof v !== "object" || !v.formula) { if (r === 2) problemas.push(`Sin fórmula en ${ws.name}!${colScan}:${r}`); continue; }
        formulas++;
        const esperado = `VLOOKUP($${String.fromCharCode(64 + spec.codeCol) || "B"}${r},`;
        if (!v.formula.includes("VLOOKUP(") || v.formula.includes("!$A:$") || /!\$[A-Z]+:\$[A-Z]+!/.test(v.formula)) {
          mal++;
          if (mal === 1) problemas.push(`Fórmula mal formada ${v.formula}`);
        }
        void esperado; void colInv;
      }
    }
    console.log(`  ${ws.name}: codeCol=${spec.codeCol} lookupCol=${spec.lookupCol} colsConFormula=${spec.columnas.size} formulasRevisadas=${formulas}`);
  }
  return problemas;
}

const filtro = process.argv.find((a) => a.startsWith("--local="))?.split("=")[1];
const soloPolito = process.argv.includes("--polito");

function contexto(local) {
  const tplWb = new ExcelJS.Workbook();
  return tplWb.xlsx.load(local.maestraPlantilla.contenido).then(() => {
    const invName = tplWb.worksheets.map((w) => w.name).find((n) => n.trim().toLowerCase() === "inventario");
    const invHeaders = [];
    tplWb.getWorksheet(invName).getRow(1).eachCell({ includeEmpty: true }, (c, i) => { invHeaders[i - 1] = String(c.value ?? "").trim(); });
    const spec = leerSpecScan(tplWb, invName, 1, invHeaders);
    return { tplWb, invName, invHeaders, spec };
  });
}

// 1) Polito con stock real
if (!filtro || filtro === "16" || soloPolito) {
  const localId = 16;
  const ctx = await contexto(locales.find((l) => l.id === 16));
  const stock = fs.readFileSync("../docs/stock polito 23 de noviembre 2026.xls");
  const t0 = Date.now();
  const res = await convertirStockAMaestra({ name: "stock.xls", data: stock }, localId);
  fs.writeFileSync("audit-conversiones/polito-real.xlsx", res.buffer);
  console.log(`Polito (stock real): ${res.productos} productos, ${res.buffer.length} bytes, ${Date.now() - t0}ms`);
  console.log("  problemas:", (await validar(res.buffer, "polito", localId, ctx.tplWb, ctx.invHeaders, ctx.spec)).join("; ") || "ninguno");
}

// 2) Smoke test del resto con stock sintético desde su propia maestra
for (const local of locales) {
  if (soloPolito || !local.maestraPlantilla) continue;
  if (filtro && String(local.id) !== filtro) continue;
  if (!filtro && local.id === 16) continue;
  const ctx = await contexto(local);
  const { tplWb, invName, invHeaders: headers, spec } = ctx;
  const inv = tplWb.getWorksheet(invName);
  const rows = [headers];
  for (let r = 2; r <= Math.min(inv.rowCount, 101); r++) {
    const vals = headers.map((_, i) => {
      const v = inv.getRow(r).getCell(i + 1).value;
      return v === null || v === undefined ? "" : String(v).trim();
    });
    // Asegurar existencia numérica en la última columna
    const idx = headers.findIndex((h) => /exist|stock|f[ií]sica|dispon/i.test(h));
    if (idx >= 0) vals[idx] = Number(vals[idx]) || 1;
    rows.push(vals);
  }
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "STOCK");
  const stock = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const t0 = Date.now();
  try {
    const res = await convertirStockAMaestra({ name: "stock.xlsx", data: stock }, local.id);
    fs.writeFileSync(`audit-conversiones/${String(local.id).padStart(2, "0")}-${local.nombre.replace(/[^\w-]+/g, "_")}.xlsx`, res.buffer);
    const problemas = await validar(res.buffer, local.nombre, local.id, tplWb, headers, spec);
    console.log(`${String(local.id).padStart(2)} ${local.nombre.padEnd(24)}: ${res.productos} productos, ${Date.now() - t0}ms, ${problemas.length ? "FALLOS: " + problemas.join("; ") : "OK"}`);
  } catch (e) {
    console.log(`${String(local.id).padStart(2)} ${local.nombre.padEnd(24)}: ERROR ${e.message}`);
  }
}
await prisma.$disconnect();
