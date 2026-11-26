import JSZip from "jszip";
import fs from "fs";

const files = [
  "templates/maestras/MAESTRA MIC CENTRO 30 DE SEPTIEMBRE DEL 2026.xlsx",
  "templates/maestras/MAESTRA MIC CAMP 16 DE OCTUBRE DEL 2026.xlsx",
  "templates/maestras/MAESTRA MOVIES 28 DE OCTUBRE DEL 2026.xlsx",
];

for (const path of files) {
  console.log(`\n##### ${path}`);
  const buf = fs.readFileSync(path);
  const zip = await JSZip.loadAsync(buf);
  const ssXml = await zip.file("xl/sharedStrings.xml").async("string");
  const ss = [];
  for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    ss.push([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(""));
  }
  console.log("sharedStrings:", ss.length, "idx 376:", JSON.stringify(ss[376]), "idx 714:", JSON.stringify(ss[714]));

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
    if (!/inventario/i.test(name)) continue;
    const target = rels.get(rid);
    const xml = await zip.file(`xl/${target}`).async("string");
    // header row F1 raw
    const f1 = xml.match(/<c\b[^>]*r="F1"[^>]*>([\s\S]*?)<\/c>/);
    console.log("F1 raw:", f1 ? f1[0] : "(none)");
    // count non-empty shared-string cells in F
    let nonEmpty = 0, sample = [];
    for (const c of xml.matchAll(/<c\b([^>]*r="F(\d+)"[^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs = c[1];
      const inner = c[3];
      const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
      if (!vm) continue;
      const t = (attrs.match(/t="([^"]+)"/) || [])[1] || "";
      let v = vm[1];
      if (t === "s") v = ss[Number(v)] ?? "";
      if (String(v).trim() !== "") {
        nonEmpty++;
        if (sample.length < 3) sample.push(`F${c[2]}=${JSON.stringify(v)}`);
      }
    }
    console.log("col F non-empty:", nonEmpty, sample.join(" ; "));
  }
}
