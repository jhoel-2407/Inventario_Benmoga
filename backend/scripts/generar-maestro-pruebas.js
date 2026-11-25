// Genera el Excel de prueba que sube la prueba de importación.
// La hoja se llama INVENTARIO y trae encabezados en español, un código
// repetido (debe agruparse) y una fila con código inválido (debe omitirse).
//
//   node backend/scripts/generar-maestro-pruebas.js
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const destino = path.join(raiz, "frontend", "cypress", "fixtures", "maestro-pruebas.xlsx");
fs.mkdirSync(path.dirname(destino), { recursive: true });

const libro = new ExcelJS.Workbook();
libro.creator = "BENMOGA Inventario - pruebas";
const hoja = libro.addWorksheet("INVENTARIO");

hoja.columns = [
  { header: "Código de barras", key: "codigo", width: 20 },
  { header: "Referencia", key: "referencia", width: 14 },
  { header: "Descripción", key: "descripcion", width: 28 },
  { header: "Existencia", key: "existencia", width: 12 },
  { header: "Talla", key: "talla", width: 8 },
  { header: "Color", key: "color", width: 12 },
];

const filas = [
  ["7990000000901", "R-901", "Blusa de prueba", 2, "S", "ROJO"],
  ["7990000000902", "R-901", "Blusa de prueba", 3, "M", "ROJO"],
  ["7990000000903", "R-902", "Pantalón de prueba", 1, "L", "NEGRO"],
  // Código repetido: el sistema debe agruparlo en un solo producto.
  ["7990000000903", "R-902", "Pantalón de prueba", 1, "L", "NEGRO"],
  // Fila inválida: debe quedar en el listado de filas omitidas.
  ["ABC123", "R-904", "Código inválido", 1, "S", "AZUL"],
];
for (const fila of filas) hoja.addRow(fila);

hoja.getRow(1).font = { bold: true };

await libro.xlsx.writeFile(destino);
console.log(`Fixture generado: ${destino}`);
