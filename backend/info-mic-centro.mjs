import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const l = await p.local.findUnique({ where: { id: 10 }, include: { maestraPlantilla: true } });
console.log("local:", l.nombre, "perfil:", JSON.stringify(l.perfilColumnas));
console.log("plantilla:", l.maestraPlantilla?.nombreArchivo, "actualizadoEn:", l.maestraPlantilla?.actualizadoEn, "bytes:", l.maestraPlantilla?.contenido?.length);
const invs = await p.inventario.findMany({ where: { localId: 10 }, orderBy: { id: "desc" }, select: { id: true, nombre: true, estado: true, archivoOrigen: true, fechaInventario: true, creadoEn: true } });
console.log("inventarios:", JSON.stringify(invs, null, 2));
const inv = invs.find((i) => i.estado === "ACTIVO");
if (inv) {
  const count = await p.inventarioProducto.count({ where: { inventarioId: inv.id } });
  console.log("activo", inv.id, "productos:", count);
}
await p.$disconnect();
