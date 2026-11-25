import fs from "node:fs";
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
// Use the same fixture (has codigo + existencia + item)
const buf = fs.readFileSync("D:/SENA-PRACTICAS/PRACTICAS 1/App3/levis-inventario-completo/frontend/cypress/fixtures/maestro-pruebas.xlsx");
const fd = new FormData();
fd.append("archivo", new Blob([buf]), "maestro-pruebas.xlsx");
const r = await fetch(base + `/api/inventarios/${activo.id}/actualizar-stock`, {
  method: "POST", headers: { Authorization: `Bearer ${token}` }, body: fd,
});
console.log("status", r.status, (await r.text()).slice(0, 200));
