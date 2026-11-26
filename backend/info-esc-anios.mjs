import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const ids = [22, 68, 69, 76, 170];
for (const id of ids) {
  const inv = await p.inventario.findUnique({ where: { id }, include: { local: true, escaneos: true } });
  const n = await p.escaneo.count({ where: { inventarioId: id } });
  const nov = await p.escaneoNovedad.count({ where: { inventarioId: id } });
  const nzon = await p.zona.count({ where: { inventarioId: id } });
  console.log(`inv=${id} local=${inv.local?.nombre} escaneos=${n} novedades=${nov} zonas=${nzon}`);
}
await p.$disconnect();
