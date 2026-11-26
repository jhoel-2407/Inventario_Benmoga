import fs from "node:fs";
import * as XLSX from "xlsx";

const dirA = "audit-conversiones-before";
const dirB = "audit-conversiones";
const files = fs.readdirSync(dirB).filter((f) => f.endsWith(".xlsx")).sort();
const norm = (v) => (v === null || v === undefined ? "" : String(v));

for (const f of files) {
  const aFile = `${dirA}/${f}`;
  if (!fs.existsSync(aFile)) { console.log(`${f}: sin before`); continue; }
  const A = XLSX.read(fs.readFileSync(aFile), { type: "buffer", cellFormula: true });
  const B = XLSX.read(fs.readFileSync(`${dirB}/${f}`), { type: "buffer", cellFormula: true });
  let diffs = 0;
  const samples = [];
  for (const sn of B.SheetNames) {
    if (!/inventario/i.test(sn)) continue;
    const aw = A.Sheets[sn], bw = B.Sheets[sn];
    if (!aw || !bw) { diffs++; samples.push(`hoja ${sn} ausente`); continue; }
    const ar = XLSX.utils.decode_range(bw["!ref"] || "A1");
    const maxR = Math.max(ar.e.r, XLSX.utils.decode_range(aw["!ref"] || "A1").e.r);
    const maxC = Math.max(ar.e.c, XLSX.utils.decode_range(aw["!ref"] || "A1").e.c);
    for (let r = 0; r <= maxR; r++) {
      for (let c = 0; c <= maxC; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const av = norm(aw[addr]?.v), bv = norm(bw[addr]?.v);
        if (av === bv) continue;
        diffs++;
        if (samples.length < 6) samples.push(`${sn}!${addr}: before=${JSON.stringify(av)} after=${JSON.stringify(bv)}`);
      }
    }
  }
  console.log(`${f.padEnd(40)} celdas_INV_diferentes=${diffs}`);
  for (const s of samples) console.log("   ", s);
}
