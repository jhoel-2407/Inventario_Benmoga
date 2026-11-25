import JSZip from "jszip";

// Extrae los nombres definidos (named ranges) de un buffer xlsx.
// Devuelve un Map: name -> referencia (ej. "INVENTARIO!$A:$J").
export async function extraerDefinedNames(buffer) {
  const zip = await JSZip.loadAsync(buffer);
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const map = new Map();
  const re = /<definedName\s+name="([^"]+)"[^>]*>([^<]+)<\/definedName>/g;
  let m;
  while ((m = re.exec(wbXml)) !== null) {
    const name = m[1];
    const ref = m[2].trim();
    if (name && ref && !ref.startsWith("#")) {
      map.set(name, ref);
    }
  }
  return map;
}

// Reescribe las fórmulas de una hoja, reemplazando nombres definidos por sus referencias.
export function reescribirFormulasConDefinedNames(ws, definedNames) {
  if (!definedNames || definedNames.size === 0) return;
  let processed = 0;
  let rewritten = 0;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    row.eachCell({ includeEmpty: true }, (cell) => {
      if (cell.value && typeof cell.value === "object" && cell.value.formula) {
        processed++;
        let f = cell.value.formula;
        const names = [...definedNames.keys()].sort((a, b) => b.length - a.length);
        for (const name of names) {
          const ref = definedNames.get(name);
          if (/[A-Za-z_]/.test(name) && !name.includes("(") && ref && !ref.startsWith("#")) {
            const re = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
            f = f.replace(re, ref);
          }
        }
        if (f !== cell.value.formula) {
          cell.value = { formula: f };
          rewritten++;
        }
      }
    });
  }
  console.error("[definedNames] processed:", processed, "rewritten:", rewritten, "rows:", ws.rowCount);
}
