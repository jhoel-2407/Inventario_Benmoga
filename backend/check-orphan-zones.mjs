import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const orphans = await p.zona.findMany({ where: { inventarioId: null } });
console.log("Orphan zones (inventarioId=null):", orphans.length);
// check escaneos
for (const z of orphans) {
  const esc = await p.escaneo.count({ where: { zonaId: z.id } });
  const nov = await p.escaneoNovedad.count({ where: { zonaId: z.id } });
  if (esc > 0 || nov > 0) console.log("  zone", z.id, z.numero, "local", z.localId, "has escaneos:", esc, "novedades:", nov);
}
// group by local
const byLocal = {};
for (const z of orphans) { byLocal[z.localId] = (byLocal[z.localId] || 0) + 1; }
console.log("By local:", JSON.stringify(byLocal));
await p.$disconnect();
