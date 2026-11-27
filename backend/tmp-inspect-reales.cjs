const path = require("path");
const { PrismaClient } = require("@prisma/client");
const dotenv = require("dotenv");
dotenv.config({ path: path.join(__dirname, "..", ".env") });
const prisma = new PrismaClient();
(async () => {
  const locals = await prisma.local.findMany({ where: { activo: true, NOT: { nombre: "TIENDA PRUEBAS CYPRESS" } }, select: { id: true, nombre: true }, take: 50 });
  console.log("N locales reales:", locals.length);
  for (const l of locals) {
    const invActivo = await prisma.inventario.findFirst({ where: { localId: l.id, estado: "ACTIVO" }, select: { id: true, nombre: true } });
    const zonas = await prisma.zona.findMany({ where: { localId: l.id, activa: true }, select: { id: true, numero: true, inventarioId: true } });
    const escCount = await prisma.escaneo.count({ where: { inventario: { localId: l.id } } });
    // group escaneos by inventarioId
    const escPorInv = await prisma.escaneo.groupBy({ by: ["inventarioId"], where: { inventario: { localId: l.id } }, _count: { id: true } });
    if (escCount > 0) {
      console.log(`\nLOCAL ${l.id} "${l.nombre}": activo=${invActivo ? invActivo.id : "NONE"} zonas=${zonas.length} escaneos=${escCount}`);
      console.log("  escaneos por inventario:", JSON.stringify(escPorInv));
      console.log("  zonas inventarioId sample:", JSON.stringify(zonas.slice(0, 5)));
      // mismatch check: zones whose inventarioId != active inventario
      const mismatch = invActivo ? zonas.filter((z) => z.inventarioId !== null && z.inventarioId !== invActivo.id) : [];
      if (mismatch.length) console.log("  MISMATCH zonas:", JSON.stringify(mismatch.slice(0, 10)), "count", mismatch.length);
    }
  }
  await prisma.$disconnect();
})();
