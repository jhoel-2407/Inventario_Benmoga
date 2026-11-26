// Lector ligero de plantillas XLSX usando solo XML (JSZip).
// Evita cargar con ExcelJS decenas de miles de fórmulas solo para leer encabezados.
// Expone una interfaz mínima compatible con lo que usa scanSpec / reportes:
//   wb.worksheets[], wb.getWorksheet(nombre), ws.getRow(n).getCell(c).value / eachCell()
import JSZip from "jszip";

const dec = (s) => String(s ?? "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)))
  // &amp; al final para no decodificar dos veces entidades escapadas.
  .replace(/&amp;/g, "&");

const colNumber = (letras) => {
  let n = 0;
  for (const ch of String(letras || "").toUpperCase()) {
    if (ch < "A" || ch > "Z") break;
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
};

export async function leerPlantillaLigera(buffer, { soloFilas = Infinity } = {}) {
  const zip = await JSZip.loadAsync(buffer);

  // sharedStrings
  const ss = [];
  const ssFile = zip.file("xl/sharedStrings.xml");
  if (ssFile) {
    const ssXml = await ssFile.async("string");
    for (const m of ssXml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
      ss.push([...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => dec(x[1])).join(""));
    }
  }

  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const relsXml = await (zip.file("xl/_rels/workbook.xml.rels")?.async("string") ?? "");
  const rels = new Map();
  for (const m of relsXml.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = (m[0].match(/Id="([^"]+)"/) || [])[1];
    const target = (m[0].match(/Target="([^"]+)"/) || [])[1];
    if (id && target) rels.set(id, target.replace(/^\//, ""));
  }

  const sheets = [];
  for (const m of wbXml.matchAll(/<sheet\b[^>]*\/>/g)) {
    const tag = m[0];
    const name = dec((tag.match(/name="([^"]+)"/) || [])[1] || "");
    const sheetId = (tag.match(/sheetId="(\d+)"/) || [])[1] || "";
    const rid = (tag.match(/r:id="([^"]+)"/) || [])[1] || "";
    let target = rels.get(rid) || `worksheets/sheet${sheetId}.xml`;
    if (!target.startsWith("xl/")) target = `xl/${target}`;
    const file = zip.file(target);
    const filas = new Map();

    if (file) {
      const xml = await file.async("string");
      for (const rm of xml.matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
        const r = Number((rm[1].match(/r="(\d+)"/) || [])[1] || 0);
        if (!r || r > soloFilas) continue;
        const celdas = new Map();
        for (const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>|<c\b([^>]*)\/>/g)) {
          const attrs = cm[1] || cm[3] || "";
          const inner = cm[2] || "";
          const addr = (attrs.match(/r="([^"]+)"/) || [])[1] || "";
          const c = colNumber(String(addr).replace(/\d+$/, ""));
          if (!c) continue;
          const t = (attrs.match(/t="([^"]+)"/) || [])[1] || "";
          const vm = inner.match(/<v>([\s\S]*?)<\/v>/);
          let v = vm ? dec(vm[1]) : "";
          if (t === "s" && v !== "") v = ss[Number(v)] ?? "";
          if (t === "inlineStr") v = [...inner.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((x) => dec(x[1])).join("");
          const fm = inner.match(/<f\b[^>]*(?:\/>|>([\s\S]*?)<\/f>)/);
          if (fm) v = { formula: dec(fm[1] || "") };
          celdas.set(c, v);
        }
        filas.set(r, celdas);
      }
    }

    const maxFila = filas.size ? Math.max(...filas.keys()) : 0;
    const ws = {
      name,
      rowCount: maxFila,
      getRow(n) {
        const celdas = filas.get(Number(n)) || new Map();
        return {
          eachCell(opts, cb) {
            const fn = typeof opts === "function" ? opts : cb;
            for (const [c, value] of [...celdas.entries()].sort((a, b) => a[0] - b[0])) fn({ value }, c);
          },
          getCell(c) {
            return { value: celdas.get(Number(c)) ?? null };
          },
        };
      },
    };
    sheets.push(ws);
  }

  return {
    worksheets: sheets,
    getWorksheet(nombre) {
      return sheets.find((w) => w.name === nombre) || null;
    },
  };
}
