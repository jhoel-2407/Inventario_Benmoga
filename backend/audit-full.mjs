// Auditoría profunda de plantillas usando SOLO XML (sin ExcelJS, evita OOM).
// Uso: node audit-full.mjs [--originals] [--db] [--formulas] [--xml]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import JSZip from "jszip";
import { PrismaClient } from "@prisma/client";

const backendDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(backendDir, ".env") });
const args = new Set(process.argv.slice(2));
const doOriginals = !args.has("--db") || args.has("--originals");
const doDb = !args.has("--originals") || args.has("--db");
const showFormulas = args.has("--formulas");
const showXml = args.has("--xml");

const dec = (s) => String(s ?? "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)));
const norm = (v) => dec(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9]+/g, " ").trim().toLowerCase().replace(/\s+/g, " ");
const colOf = (addr) => (String(addr).match(/^([A-Z]+)/) || [])[1] || "";
const rowOf = (addr) => Number((String(addr).match(/\d+/) || [])[0] || 0);

async function analyzeBuffer(buf, etiqueta) {
  const out = { etiqueta, sheets: [], definedNames: [], xmlIssues: [], shared: {}, calcPr: null };
  const zip = await JSZip.loadAsync(buf);
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");

  const relMap = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) relMap.set(id, target.replace(/^\//, ""));
  }
  out.calcPr = (wbXml.match(/<calcPr\b[^>]*\/>/) || [])[0] || null;

  // sharedStrings (limit to 30000 entries)
  const ss = [];
  if (zip.file("xl/sharedStrings.xml")) {
    const ssXml = await zip.file("xl/sharedStrings.xml").async("string");
    for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      const txt = [...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => dec(x[1])).join("");
      ss.push(txt);
      if (ss.length >= 40000) break;
    }
  }

  // sheets: attributes may be in any order
  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0];
    const name = dec((tag.match(/name="([^"]+)"/) || [])[1] || "");
    const sheetId = (tag.match(/sheetId="(\d+)"/) || [])[1] || "";
    const rid = (tag.match(/r:id="([^"]+)"/) || [])[1] || "";
    let target = relMap.get(rid) || `worksheets/sheet${sheetId}.xml`;
    if (!target.startsWith("xl/")) target = `xl/${target}`;
    sheets.push({ name, target });
  }

  // definedNames (globales y locales)
  for (const m of wbXml.matchAll(/<definedName\b([^>]*)>([\s\S]*?)<\/definedName>/g)) {
    out.definedNames.push({
      name: dec((m[1].match(/name="([^"]+)"/) || [])[1] || ""),
      localSheetId: (m[1].match(/localSheetId="(\d+)"/) || [])[1] ?? null,
      ref: dec(m[2].trim()),
    });
  }

  if (showXml) {
    for (const name of Object.keys(zip.files)) {
      if (!/\.(xml|rels)$/.test(name)) continue;
      const txt = await zip.file(name).async("string");
      if (/&(?!(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);)/i.test(txt)) out.xmlIssues.push(`${name}: entidad inválida`);
      const shared = (txt.match(/<f\b[^>]*t="shared"/g) || []).length;
      if (shared) out.shared[name] = shared;
    }
  }

  for (const sh of sheets) {
    const s = { name: sh.name, headersByRow: [], formulas: [], formulaCount: 0, codeCol: null, headerRow: null, maxRow: 0, dimension: null };
    const file = zip.file(sh.target);
    if (!file) { out.sheets.push(s); continue; }
    const xml = await file.async("string");
    s.dimension = (xml.match(/<dimension\s+ref="([^"]+)"/) || [])[1] || null;
    const dimMax = Number((String(s.dimension).match(/[A-Z]+\d+:([A-Z]+)(\d+)/) || [])[2] || 0);
    s.maxRow = dimMax;

    // Parse cells into rows (first 30 rows only)
    const rowMap = new Map();
    let stop = false;
    for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g) ) {
      const r = Number((rm[1].match(/r="(\d+)"/) || [])[1] || 0);
      if (r > 30) { stop = true; break; }
      const cells = [];
      for (const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
        const attrs = cm[1] || cm[3] || "";
        const inner = cm[2] || "";
        const addr = (attrs.match(/r="([^"]+)"/) || [])[1] || `${colOf("")}${r}`;
        const t = (attrs.match(/t="([^"]+)"/) || [])[1] || "";
        const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
        let v = vm ? dec(vm[1]) : "";
        if (t === "s" && v !== "") v = ss[Number(v)] ?? "";
        if (t === "inlineStr") v = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => dec(x[1])).join("");
        const fm = inner.match(/<f\b([^>]*)>([\s\S]*?)<\/f>|<f\b([^>]*)\/>/);
        let formula = null;
        if (fm) {
          formula = dec(fm[2] || "");
          if (!formula) formula = `(shared:${(fm[1] || fm[3] || "").match(/si="(\d+)"/)?.[1] || "?"})`;
        }
        const cell = { addr, col: colOf(addr), row: r, v, t, formula };
        cells.push(cell);
        if (formula) {
          s.formulaCount++;
          if (s.formulas.length < 8) s.formulas.push(cell);
        }
      }
      rowMap.set(r, cells);
      if (stop) break;
    }
    // count all formulas in sheet
    s.formulaCount = (xml.match(/<f\b/g) || []).length;

    const KW = ["codigo", "barras", "barcode", "existencia", "stock", "referencia", "item", "descripcion", "cantidad", "cant", "ean", "plu", "fisica", "disponibles", "zona", "conteo", "escaneo", "diferencia", "cedula", "nombre", "desc"];
    for (const [r, cells] of [...rowMap.entries()].sort((a, b) => a[0] - b[0])) {
      const nonempty = cells.filter((c) => String(c.v ?? "").trim());
      if (!nonempty.length) continue;
      const hits = KW.filter((kw) => nonempty.some((c) => norm(c.v).includes(kw))).length;
      if (hits >= 2 || r === 1) {
        s.headersByRow.push({ row: r, hits, cells: nonempty.map((c) => ({ c: c.col === "" ? "" : c.col.charCodeAt(0) - 64 + (c.col.length > 1 ? 0 : 0), addr: c.addr, v: String(c.v).replace(/\s+/g, " ").trim() })) });
      }
    }
    s.headerRow = s.headersByRow[0]?.row ?? null;
    if (s.headerRow) {
      for (const c of rowMap.get(s.headerRow) || []) {
        const n = norm(c.v);
        if (/codigo.*barr|c\W*barr|barcode|barras|plu|ean/.test(n) && !s.codeCol) {
          s.codeCol = `${c.col}${s.headerRow}`;
        }
      }
    }
    out.sheets.push(s);
  }
  return out;
}

function printAnalysis(a) {
  console.log(`\n${"=".repeat(100)}`);
  console.log(`### ${a.etiqueta}`);
  console.log(`Hojas: ${a.sheets.map((s) => `${s.name}(maxRow=${s.maxRow}, dim=${s.dimension || "?"}, f=${s.formulaCount})`).join(", ")}`);
  console.log(`calcPr: ${a.calcPr || "(ninguno)"}`);
  console.log(`Nombres definidos: ${a.definedNames.length ? a.definedNames.map((d) => `${d.name}${d.localSheetId !== null ? `[local:${d.localSheetId}]` : ""}=${d.ref}`).join(" | ") : "(ninguno)"}`);
  if (a.xmlIssues.length) console.log(`XML issues: ${a.xmlIssues.join(" | ")}`);
  if (Object.keys(a.shared).length) console.log(`Fórmulas compartidas: ${JSON.stringify(a.shared)}`);
  for (const s of a.sheets) {
    console.log(`  [${s.name}] headerRow=${s.headerRow ?? "?"} codeCell=${s.codeCol ?? "?"} formulas=${s.formulaCount}`);
    for (const h of s.headersByRow) {
      console.log(`    hdr@${h.row}(hits=${h.hits}): ${h.cells.map(({ addr, v }) => `${addr}:${v}`).join(" | ")}`);
    }
    if (showFormulas && s.formulas.length) {
      console.log(`    fórmulas: ${s.formulas.map((f) => `${f.addr}=${f.formula}`).join(" | ")}`);
    }
  }
}

const prisma = new PrismaClient();
const plantillas = await prisma.maestraPlantilla.findMany({ include: { local: { select: { nombre: true } } }, orderBy: { localId: "asc" } });

if (doOriginals) {
  for (const f of fs.readdirSync(path.join(backendDir, "templates/maestras")).filter((x) => x.endsWith(".xlsx"))) {
    printAnalysis(await analyzeBuffer(fs.readFileSync(path.join(backendDir, "templates/maestras", f)), `ORIGINAL: ${f}`));
  }
}
if (doDb) {
  for (const p of plantillas) {
    printAnalysis(await analyzeBuffer(p.contenido, `BD: ${p.local.nombre} (localId=${p.localId}, bytes=${p.contenido.length})`));
  }
}

console.log(`\n${"=".repeat(100)}`);
console.log("### COMPARACIÓN ORIGINAL vs BD");
for (const f of fs.readdirSync(path.join(backendDir, "templates/maestras")).filter((x) => x.endsWith(".xlsx"))) {
  const tienda = f.replace(/^MAESTRA\s+/i, "").replace(/\s+\d{1,2}\s+DE\s+.+\.xlsx$/i, "").replace(/\s+\d{1,2}\s+Y\s+\d{1,2}\s+DE\s+.+\.xlsx$/i, "").replace(/\.xlsx$/i, "").trim();
  const match = plantillas.find((p) => norm(p.local.nombre).includes(norm(tienda)) || norm(tienda).includes(norm(p.local.nombre)));
  const buf = fs.readFileSync(path.join(backendDir, "templates/maestras", f));
  const igual = match && Buffer.compare(buf, match.contenido) === 0;
  console.log(`${f.padEnd(58)} | BD: ${match ? `${match.local.nombre} (id ${match.localId})` : "NO ENCONTRADA"} | ${igual ? "IDÉNTICA" : match ? "DIFERENTE" : "-"}`);
}
await prisma.$disconnect();
