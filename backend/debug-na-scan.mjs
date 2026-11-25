const base = "http://localhost:3000";
const loginRes = await fetch(base + "/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ correo: "inventario@gmail.com", password: "1234567890" }),
});
const token = (await loginRes.json()).token;
const localesRes = await fetch(base + "/api/locales", { headers: { Authorization: `Bearer ${token}` } });
const locales = await localesRes.json();
console.log("locales:", locales.locales.map((l) => l.id + ":" + l.nombre).join(", "));
// find a local with active inventory
for (const loc of locales.locales) {
  const invRes = await fetch(base + `/api/inventarios?localId=${loc.id}`, { headers: { Authorization: `Bearer ${token}` } });
  const invs = await invRes.json();
  const activo = (invs.inventarios || []).find((i) => i.estado === "ACTIVO");
  if (activo) {
    console.log("using local", loc.id, loc.nombre, "active inv", activo.id);
    const zonasRes = await fetch(base + `/api/zonas?localId=${loc.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const zonas = await zonasRes.json();
    const zona = (zonas.zonas || [])[0];
    if (!zona) { console.log("no zones"); continue; }
    await fetch(base + "/api/zonas/seleccionar", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ zonaId: zona.id }),
    });
    // scan a completely unknown code
    const r = await fetch(base + "/api/escaneos", {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ codigoBarras: "9999999999999" }),
    });
    console.log("unknown code scan:", r.status, await r.text());
    break;
  }
}
