import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const invs = await p.inventario.findMany({ where: { local: { nombre: { contains: "pilatos" } } }, select: { id: true, localId: true, estado: true, local: { select: { nombre: true } } } });
for (const i of invs) console.log("id", i.id, i.local.nombre, i.estado);
await p.$disconnect();
