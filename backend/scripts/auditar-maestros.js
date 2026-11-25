// Auditoría de solo lectura de los maestros importados.
// Uso:
//   node backend/scripts/auditar-maestros.js
//   node backend/scripts/auditar-maestros.js --local=levis --detalle
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(backendDir);
dotenv.config({ path: path.join(backendDir, ".env") });

const prisma = new PrismaClient();

const args = new Map();
for (const arg of process.argv.slice(2)) {
  if (!arg.startsWith("--")) continue;
  const [clave, ...resto] = arg.slice(2).split("=");
  args.set(clave, resto.length ? resto.join("=") : "true");
}

const filtroLocal = args.get("local");
const detalle = args.has("detalle");

const pct = (n, total) => (total ? `${Math.round((n / total) * 100)}%` : "0%");
const num = (n) => new Intl.NumberFormat("es-CO").format(n ?? 0);
const corto = (v, n = 34) => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

const locales = await prisma.local.findMany({
  orderBy: { nombre: "asc" },
  include: {
    inventarios: {
      orderBy: { id: "asc" },
      include: { _count: { select: { productos: true } } },
    },
  },
});

for (const local of locales) {
  if (filtroLocal && local.nombre.toLowerCase() !== filtroLocal.toLowerCase()) continue;

  console.log(`\n${"=".repeat(78)}`);
  console.log(`LOCAL: ${local.nombre} (id ${local.id})`);
  console.log(`Perfil de columnas: ${local.perfilColumnas ? JSON.stringify(local.perfilColumnas) : "(sin perfil guardado)"}`);

  if (!local.inventarios.length) {
    console.log("  Sin inventarios cargados.");
    continue;
  }

  for (const inv of local.inventarios) {
    const total = inv._count.productos;
    console.log(`\n  Inventario ${inv.id}: "${inv.nombre}" [${inv.estado}]`);
    console.log(`    Archivo: ${inv.archivoOrigen || "(sin nombre)"} · productos: ${num(total)}`);

    if (!total) continue;

    const [agg, faltantes, longitudes, tallas, refs, muestras] = await Promise.all([
      prisma.inventarioProducto.aggregate({
        where: { inventarioId: inv.id },
        _sum: { existenciaInicial: true },
        _min: { existenciaInicial: true },
        _max: { existenciaInicial: true },
      }),
      prisma.$queryRaw`
        SELECT
          SUM(CASE WHEN ip.descriptoresCargados THEN ip.item IS NULL ELSE p.item IS NULL END) AS sinItem,
          SUM(CASE WHEN ip.descriptoresCargados THEN ip.descripcion IS NULL ELSE p.descripcion IS NULL END) AS sinDesc,
          SUM(CASE WHEN ip.descriptoresCargados THEN ip.detalle1 IS NULL ELSE p.detalle1 IS NULL END) AS sinTalla,
          SUM(CASE WHEN ip.descriptoresCargados THEN ip.detalle2 IS NULL ELSE p.detalle2 IS NULL END) AS sinColor,
          SUM(CASE WHEN ip.descriptoresCargados THEN ip.referencia IS NULL ELSE p.referencia IS NULL END) AS sinRef
        FROM InventarioProducto ip JOIN Producto p ON p.id = ip.productoId
        WHERE ip.inventarioId = ${inv.id}`,
      prisma.$queryRaw`
        SELECT CHAR_LENGTH(p.codigoBarras) AS largo, COUNT(*) AS n
        FROM InventarioProducto ip JOIN Producto p ON p.id = ip.productoId
        WHERE ip.inventarioId = ${inv.id}
        GROUP BY CHAR_LENGTH(p.codigoBarras) ORDER BY n DESC`,
      prisma.$queryRaw`
        SELECT valor, COUNT(*) AS n,
               CAST(COALESCE(SUM(unidades), 0) AS SIGNED) AS unidades
        FROM (
          SELECT COALESCE(CASE WHEN ip.descriptoresCargados THEN ip.detalle1 ELSE p.detalle1 END, '(sin talla)') AS valor,
                 ip.existenciaInicial AS unidades
          FROM InventarioProducto ip JOIN Producto p ON p.id = ip.productoId
          WHERE ip.inventarioId = ${inv.id}
        ) t
        GROUP BY valor
        ORDER BY unidades DESC LIMIT 18`,
      prisma.$queryRaw`
        SELECT valor, COUNT(*) AS n,
               CAST(COALESCE(SUM(unidades), 0) AS SIGNED) AS unidades,
               COUNT(DISTINCT talla) AS tallas
        FROM (
          SELECT COALESCE(CASE WHEN ip.descriptoresCargados THEN ip.referencia ELSE p.referencia END,
                          CASE WHEN ip.descriptoresCargados THEN ip.item ELSE p.item END,
                          '(sin referencia)') AS valor,
                 ip.existenciaInicial AS unidades,
                 CASE WHEN ip.descriptoresCargados THEN ip.detalle1 ELSE p.detalle1 END AS talla
          FROM InventarioProducto ip JOIN Producto p ON p.id = ip.productoId
          WHERE ip.inventarioId = ${inv.id}
        ) t
        GROUP BY valor
        ORDER BY unidades DESC LIMIT 8`,
      prisma.inventarioProducto.findMany({
        where: { inventarioId: inv.id },
        take: detalle ? 20 : 6,
        orderBy: { id: "asc" },
        include: { producto: true },
      }),
    ]);

    const fr = faltantes[0] || {};
    const sinItem = Number(fr.sinItem || 0);
    const sinDesc = Number(fr.sinDesc || 0);
    const sinTalla = Number(fr.sinTalla || 0);
    const sinColor = Number(fr.sinColor || 0);
    const sinRef = Number(fr.sinRef || 0);
    console.log(
      `    Unidades: ${num(agg._sum.existenciaInicial)} · min ${agg._min.existenciaInicial ?? "?"} · max ${agg._max.existenciaInicial ?? "?"}`,
    );
    console.log(
      `    Faltantes: item ${pct(sinItem, total)} · descripción ${pct(sinDesc, total)} · talla ${pct(sinTalla, total)} · color ${pct(sinColor, total)} · referencia ${pct(sinRef, total)}`,
    );
    console.log(
      `    Largos de código: ${longitudes.map((r) => `${r.largo} díg.=${num(Number(r.n))}`).join(" · ")}`,
    );
    console.log("    Tallas (unidades):");
    console.log(
      "      " +
        tallas
          .map((t) => `${corto(t.valor, 22)}=${num(Number(t.unidades))} (${num(Number(t.n))} refs)`)
          .join(" · "),
    );
    console.log("    Top referencias (unidades · tallas):");
    for (const r of refs) {
      console.log(`      ${corto(r.valor, 40)} · ${num(Number(r.unidades))} u · ${r.tallas} tallas`);
    }
    console.log("    Muestras:");
    for (const ip of muestras) {
      const p = ip.producto;
      const campo = (nombre) => (ip.descriptoresCargados ? ip[nombre] : p[nombre]);
      console.log(
        `      ${p.codigoBarras} | item=${corto(campo("item"), 14)} | desc=${corto(campo("descripcion"), 24)} | talla=${corto(campo("detalle1"), 10)} | color=${corto(campo("detalle2"), 12)} | ref=${corto(campo("referencia"), 14)} | exist=${ip.existenciaInicial}`,
      );
    }
  }
}

await prisma.$disconnect();
