import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const inv = await p.inventario.findFirst({ where: { localId: 10, estado: "ACTIVO" }, orderBy: { id: "desc" } });
const ips = await p.inventarioProducto.findMany({ where: { inventarioId: inv.id }, include: { producto: true } });
console.log("ips:", ips.length);
const prod = new Map();
for (const ip of ips) prod.set(ip.productoId, ip.producto);
const items = new Map();
for (const ip of ips) {
  const it = ip.item;
  if (!items.has(it)) items.set(it, []);
  items.get(it).push({ prodId: ip.productoId, codigo: ip.producto.codigoBarras, desc: ip.descripcion });
}
let multi = 0, totalRefs = items.size, totalProds = prod.size;
for (const [it, list] of items) {
  if (list.length > 1) { multi++; if (multi <= 10) console.log(`ITEM ${it}:`, JSON.stringify(list)); }
}
console.log("refs(unicas item):", totalRefs, "productos:", totalProds, "items con varios codigos:", multi);
// Sample: check whether any producto.codigoBarras is NOT the "primary" of that item
await p.$disconnect();
