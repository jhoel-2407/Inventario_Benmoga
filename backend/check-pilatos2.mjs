import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const inv = await p.inventario.findUnique({ where: { id: 203 }, select: { id: true, estado: true, local: { select: { nombre: true } }, _count: { select: { escaneos: true, productos: true } } } });
console.log("inventory 203:", inv.local.nombre, inv.estado, "scans:", inv._count.escaneos, "products:", inv._count.productos);
await p.$disconnect();
