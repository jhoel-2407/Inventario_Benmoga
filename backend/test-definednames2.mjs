import fs from "node:fs";
import * as XLSX from "xlsx";
// Load a converted maestra (if exists) or generate one
// First, check if any converted file exists
const files = fs.readdirSync(".").filter((f) => f.includes("convertida"));
console.log("converted files:", files);
"