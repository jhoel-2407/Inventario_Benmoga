const base = "http://localhost:3000";
const loginRes = await fetch(base + "/api/auth/login", {
  method: "POST", headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ correo: "inventario@gmail.com", password: "1234567890" }),
});
const token = (await loginRes.json()).token;
const localesRes = await fetch(base + "/api/locales", { headers: { Authorization: `Bearer ${token}` } });
const locales = await localesRes.json();
// find a local with active inventory
let local, activo;
for (const loc of locales.locales) {
  const invRes = await fetch(base + `/api/inventarios?localId=${loc.id}`, { headers: { Authorization: `Bearer ${token}` } });
  const invs = await invRes.json();
  const a = (invs.inventarios || []).find((i) => i.estado === "ACTIVO");
  if (a) { local = loc; activo = a; break; }
}
console.log("local", local.id, local.nombre, "activo", activo.id);
// find a product in global catalog that is NOT in this inventory
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();
const invProds = await prisma.inventarioProducto.findMany({ where: { inventarioId: activo.id }, select: { productoId: true } });
const invProdIds = new Set(invProds.map((p) => p.productoId));
const globalProd = await prisma.producto.findFirst({ where: { id: { notIn: [...invProdIds] } } });
console.log("global product not in inventory:", globalProd?.codigoBarras, globalProd?.descripcion);
await prisma.$disconnect();
if (!globalProd) { console.log("no global product outside inventory"); process.exit(0); }
const zonasRes = await fetch(base + `/api/zonas?localId=${local.id}`, { headers: { Authorization: `Bearer ${token}` } });
const zonas = await zonasRes.json();
const zona = (zonas.zonas || [])[0];
await fetch(base + "/api/zonas/seleccionar", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ zonaId: zona.id }),
});
const r = await fetch(base + "/api/escaneos", {
  method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
  body: JSON.stringify({ codigoBarras: globalProd.codigoBarras }),
});
console.log("scan (in catalog, not in inventory):", r.status, await r.text());
