import JSZip from "jszip";

const dec = (s) => String(s ?? "")
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d))
  .replace(/&#x([0-9a-f]+);/gi, (_, d) => String.fromCharCode(parseInt(d, 16)));

// Extrae los nombres definidos (named ranges) de un buffer xlsx.
// Devuelve un Map: name -> referencia (ej. "INVENTARIO!$A:$D").
// Incluye nombres globales y locales (localSheetId); ignorareferencias #REF!.
export async function extraerDefinedNames(buffer) {
  const map = new Map();
  try {
    const zip = await JSZip.loadAsync(buffer);
    const archivo = zip.file("xl/workbook.xml");
    if (!archivo) return map;
    const wbXml = await archivo.async("string");
    const re = /<definedName\s+([^>]*)>([\s\S]*?)<\/definedName>/g;
    let m;
    while ((m = re.exec(wbXml)) !== null) {
      const attrs = m[1];
      const name = dec((attrs.match(/name="([^"]+)"/) || [])[1] || "");
      const ref = dec(m[2]).trim();
      if (!name || !ref || ref.startsWith("#")) continue;
      // _xlnm._FilterDatabase es interno de Excel; reemplazarlo rompe los filtros.
      if (name.startsWith("_xlnm.")) continue;
      const localSheetId = (attrs.match(/localSheetId="(\d+)"/) || [])[1] ?? null;
      const clave = localSheetId === null ? name : `${name}@local:${localSheetId}`;
      map.set(clave, ref);
      if (localSheetId === null) map.set(name, ref);
    }
  } catch (e) {
    console.error("[definedNames] no se pudieron extraer nombres:", e.message);
  }
  return map;
}

// Reescribe las fórmulas de una hoja, reemplazando nombres definidos por sus referencias.
// - No toca nombres ya seguidos de "!" (INVENTARIO!$A$2:$D$10).
// - Conserva el resultado en caché cuando existe.
export function reescribirFormulasConDefinedNames(ws, definedNames) {
  if (!definedNames || definedNames.size === 0) return;
  const nombres = [...definedNames.entries()]
    .filter(([name, ref]) => /^[A-Za-z_][A-Za-z0-9_.]*$/.test(name) && ref && !ref.startsWith("#"))
    .sort((a, b) => b[0].length - a[0].length);
  if (!nombres.length) return;
  let processed = 0;
  let rewritten = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: false }, (cell) => {
      if (!cell.value || typeof cell.value !== "object" || !cell.value.formula) return;
      processed++;
      let f = cell.value.formula;
      for (const [name, ref] of nombres) {
        if (name.includes("@local:")) continue;
        const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b(?!\\s*!)`, "g");
        f = f.replace(re, ref);
      }
      if (f !== cell.value.formula) {
        cell.value = { formula: f, ...(cell.value.result !== undefined ? { result: cell.value.result } : {}) };
        rewritten++;
      }
    });
  }
  console.error("[definedNames] processed:", processed, "rewritten:", rewritten, "rows:", ws.rowCount);
}
