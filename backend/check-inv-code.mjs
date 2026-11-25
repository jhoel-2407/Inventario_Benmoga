import fs from "node:fs";
import * as XLSX from "xlsx";
const buf = fs.readFileSync("D:/SENA-PRACTICAS/ARCHIVOS A USAR/Maestras/MAESTRA TOYSMART 20 Y 21 DE OCTUBRE 2026.xlsx");
const wb = XLSX.read(buf, { type: "buffer" });
const ws = wb.Sheets["INVENTARIO"];
const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
console.log("total rows:", rows.length);
// find the code
for (let i = 1; i < rows.length; i++) {
  if (String(rows[i][0]).includes("75656007062") || String(rows[i][0]) === "75656007062") {
    console.log("found at row", i, ":", JSON.stringify(rows[i][0]), typeof rows[i][0]);
    break;
  }
}
// check a few codes for leading zeros
let leadingZero = 0;
for (let i = 1; i < Math.min(rows.length, 20); i++) {
  const v = rows[i][0];
  if (typeof v === "string" && v.startsWith("0")) leadingZero++;
}
console.log("first 20 rows with leading-zero string codes:", leadingZero);
// Check if any code is stored as text
let textCount = 0, numCount = 0;
for (let i = 1; i < rows.length; i++) {
  if (typeof rows[i][0] === "string") textCount++;
  else if (typeof rows[i][0] === "number") numCount++;
}
console.log("text codes:", textCount, "number codes:", numCount);
// search for 75656007062 (without leading zero)
for (let i = 1; i < rows.length; i++) {
  if (String(rows[i][0]).replace(/^0+/, "") === "75656007062") {
    console.log("found (stripped) at row", i, ":", JSON.stringify(rows[i][0]), typeof rows[i][0]);
    break;
  }
}
