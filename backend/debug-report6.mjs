const base = "http://localhost:3000";
const loginRes = await fetch(base + "/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ correo: "inventario@gmail.com", password: "1234567890" }),
});
const token = (await loginRes.json()).token;
const localesRes = await fetch(base + "/api/locales", { headers: { Authorization: `Bearer ${token}` } });
const locales = await localesRes.json();
const local = locales.locales[0];
const invRes = await fetch(base + `/api/inventarios?localId=${local.id}`, { headers: { Authorization: `Bearer ${token}` } });
const invs = await invRes.json();
const activo = invs.inventarios[0];
console.log("activo", activo?.id);
const r = await fetch(base + `/api/inventarios/${activo.id}/reporte.xlsx`, { headers: { Authorization: `Bearer ${token}` } });
console.log("status", r.status);
const buf = Buffer.from(await r.arrayBuffer());
import fs from "node:fs";
fs.writeFileSync("test-report6.xlsx", buf);
console.log("bytes", buf.length);
