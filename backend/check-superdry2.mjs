import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const invs = await p.inventario.findMany({ where: { local: { nombre: { contains: "superdry" } } }, select: { id: true, estado: true, _count: { select: { escaneos: true, productos: true } } } });
for (const i of invs) console.log("id", i.id, i.estado, "scans:", i._count.escaneos, "products:", i._count.productos);
await p.$disconnect();
