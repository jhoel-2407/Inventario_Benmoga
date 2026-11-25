// Lector XLSX ligero: extrae solo los valores de la hoja "INVENTARIO" sin
// cargar estilos ni el libro completo en memoria (evita OOM con ExcelJS).
import { Open } from "unzipper";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

function colLetraAIndice(letra) {
  let n = 0;
  for (let i = 0; i < letra.length; i++) {
    n = n * 26 + (letra.charCodeAt(i) - 64);
  }
  return n; // 1-based
}

function decodificarXml(s) {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export async function leerHojaInventario(entrada) {
  let ruta = entrada;
  let tmp = null;
  if (Buffer.isBuffer(entrada) || entrada instanceof Uint8Array) {
    tmp = path.join(os.tmpdir(), `xlsx-${Date.now()}-${Math.random().toString(36).slice(2)}.xlsx`);
    fs.writeFileSync(tmp, entrada);
    ruta = tmp;
  }
  try {
    const dir = await Open.file(ruta);
  const files = Object.fromEntries(dir.files.map((f) => [f.path, f]));

  // 1) workbook.xml -> nombres de hojas y rIds
  const wbXml = (await files["xl/workbook.xml"].buffer()).toString("utf8");
  const sheetMatches = [...wbXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*r:id="([^"]*)"[^>]*\/>/g)];
  // fallback: r:id before name
  const sheetMatches2 = sheetMatches.length ? sheetMatches : [...wbXml.matchAll(/<sheet[^>]*r:id="([^"]*)"[^>]*name="([^"]*)"[^>]*\/>/g)].map((m) => [m[0], m[2], m[1]]);
  const hojas = sheetMatches2.map((m) => m[1]);

  // 2) rels -> rId -> target
  const relsXml = (await files["xl/_rels/workbook.xml.rels"].buffer()).toString("utf8");
  const rels = {};
  for (const m of relsXml.matchAll(/<Relationship[^>]*Id="([^"]*)"[^>]*Target="([^"]*)"[^>]*\/>/g)) {
    rels[m[1]] = m[2].replace(/^\//, "");
  }

  // 3) encontrar hoja INVENTARIO
  let targetPath = null;
  for (const m of sheetMatches2) {
    const name = m[1];
    const rid = m[2];
    if (name.trim().toLowerCase().replace(/[^a-z]/g, "") === "inventario") {
      const target = rels[rid];
      targetPath = target.startsWith("xl/") ? target : "xl/" + target;
      break;
    }
  }
  if (!targetPath) {
    // hoja no encontrada
    return { tipo: "sin_hoja", hojas };
  }

  // 4) shared strings
  let shared = [];
  if (files["xl/sharedStrings.xml"]) {
    const ssXml = (await files["xl/sharedStrings.xml"].buffer()).toString("utf8");
    // cada <si> puede tener <t> o <r><t>
    const siMatches = ssXml.match(/<si>[\s\S]*?<\/si>/g) || [];
    shared = siMatches.map((si) => {
      const ts = [...si.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => decodificarXml(m[1]));
      return ts.join("");
    });
  }

  // 5) leer sheet xml
  const sheetXml = (await files[targetPath].buffer()).toString("utf8");

  // parse rows
  const rows = [];
  const rowRegex = /<row[^>]*>([\s\S]*?)<\/row>/g;
  let rm;
  while ((rm = rowRegex.exec(sheetXml)) !== null) {
    const rowXml = rm[1];
    const cells = {};
    let maxCol = 0;
    const cellRegex = /<c\s+([^>]*)>([\s\S]*?)<\/c>/g;
    let cm;
    while ((cm = cellRegex.exec(rowXml)) !== null) {
      const attrs = cm[1];
      const inner = cm[2];
      const rMatch = attrs.match(/\br="([A-Z]+)\d+"/);
      if (!rMatch) continue;
      const colLetter = rMatch[1];
      const colIdx = colLetraAIndice(colLetter);
      if (colIdx > maxCol) maxCol = colIdx;
      const tMatch = attrs.match(/\bt="([^"]*)"/);
      const t = tMatch ? tMatch[1] : "";
      let val = "";
      if (t === "s") {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        const idx = vMatch ? parseInt(vMatch[1], 10) : -1;
        val = idx >= 0 && idx < shared.length ? shared[idx] : "";
      } else if (t === "inlineStr") {
        const tMatch2 = inner.match(/<t[^>]*>([\s\S]*?)<\/t>/);
        val = tMatch2 ? decodificarXml(tMatch2[1]) : "";
      } else if (t === "str") {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        val = vMatch ? decodificarXml(vMatch[1]) : "";
      } else {
        const vMatch = inner.match(/<v>([\s\S]*?)<\/v>/);
        val = vMatch ? vMatch[1] : "";
      }
      cells[colIdx] = val;
    }
    // build array by col
    const arr = [];
    for (let c = 1; c <= maxCol; c++) {
      arr.push(cells[c] !== undefined ? cells[c] : "");
    }
    rows.push(arr);
  }

  return { tipo: "ok", hojas, rows };
  } finally {
    if (tmp) try { fs.unlinkSync(tmp); } catch { /* ignora */ }
  }
}
