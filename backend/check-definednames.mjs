import fs from "node:fs";
import * as XLSX from "xlsx";
const dir = "D:/SENA-PRACTICAS/ARCHIVOS A USAR/Maestras";
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".xlsx"));
for (const f of files) {
  const buf = fs.readFileSync(dir + "/" + f);
  // read workbook.xml from zip
  const JSZip = (await import("jszip")).default;
  const zip = await JSZip.loadAsync(buf);
  const wbXml = await zip.file("xl/workbook.xml").async("string");
  const names = [...wbXml.matchAll(/<definedName[^>]*name="([^"]+)"[^>]*>([^<]+)<\/definedName>/g)].map((m) => ({ name: m[1], ref: m[2] }));
  if (names.length > 0) {
    console.log(f, "=>", names.map((n) => n.name + "=" + n.ref).join("; "));
  }
}
