import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const invs = await p.inventario.findMany({ where: { local: { nombre: { contains: "superdry" } } }, select: { id: true, estado: true } });
for (const i of invs) console.log("id", i.id, i.estado);
await p.$disconnect();
