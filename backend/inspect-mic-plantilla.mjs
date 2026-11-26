import JSZip from "jszip";
import fs from "fs";
import { leerPlantillaLigera } from "./src/lib/plantillaLigera.js";

const path = "templates/maestras/MAESTRA MIC CENTRO 30 DE SEPTIEMBRE DEL 2026.xlsx";
const buf = fs.readFileSync(path);
const wb = await leerPlantillaLigera(buf);

for (const sn of ["INVENTARIO", "ESCANEO"]) {
  const ws = wb.getWorksheet(sn);
  console.log(`\n### ${sn} rowCount=${ws.rowCount}`);
  for (let r = 1; r <= 6; r++) {
    const vals = [];
    for (let c = 1; c <= 10; c++) {
      const v = ws.getRow(r).getCell(c).value;
      vals.push(`${c}:${typeof v === "object" && v ? `{F:${v.formula}}` : JSON.stringify(v)}`);
    }
    console.log(`r${r}:`, vals.join(" | "));
  }
  // Conteo por columna 6 y 7
  for (const col of [1, 2, 6, 7]) {
    let nonEmpty = 0, formulas = 0, nums = 0;
    for (let r = 2; r <= ws.rowCount; r++) {
      const v = ws.getRow(r).getCell(col).value;
      if (v === null || v === undefined || String(v).trim() === "") continue;
      nonEmpty++;
      if (typeof v === "object" && v.formula) formulas++;
      else if (typeof v === "number") nums++;
    }
    console.log(`  col${col}: nonEmpty=${nonEmpty} formulas=${formulas} nums=${nums}`);
  }
}

// Raw XML: ¿hay celdas en la columna F de la hoja INVENTARIO?
const zip = await JSZip.loadAsync(buf);
const wbXml = await zip.file("xl/workbook.xml").async("string");
const relsXml = await zip.file("xl/_rels/workbook.xml.rels").async("string");
const rels = new Map();
for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
  const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
  const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
  if (id && target) rels.set(id, target.replace(/^\//, ""));
}
for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
  const name = (m[0].match(/name="([^"]+)"/) || [])[1];
  const rid = (m[0].match(/r:id="([^"]+)"/) || [])[1];
  const target = rels.get(rid);
  if (name !== "INVENTARIO") continue;
  const xml = await zip.file(`xl/${target}`).async("string");
  const fCells = [...xml.matchAll(/<c\b[^>]*r="F(\d+)"[^>]*>([\s\S]*?)<\/c>/g)];
  console.log(`\n### XML INVENTARIO col F: celdas=${fCells.length}`);
  for (const c of fCells.slice(0, 5)) console.log("  F" + c[1] + ":", c[2].slice(0, 200));
  const fAny = [...xml.matchAll(/<c\b[^>]*r="F(\d+)"[^>]*\/>/g)];
  console.log("  celdas F vacías autocerradas:", fAny.length);
}
