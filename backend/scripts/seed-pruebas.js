// ============================================================================
// Datos de prueba para Cypress (BENMOGA Inventario)
// ----------------------------------------------------------------------------
// Crea un local aislado ("TIENDA PRUEBAS CYPRESS") con usuarios, zonas,
// inventario activo y unas pocas lecturas. Las pruebas NUNCA tocan el conteo
// real de una tienda: todo lo que crean y borran vive en este local.
//
// Se puede ejecutar las veces que haga falta: primero limpia y luego recrea.
//
//   node backend/scripts/seed-pruebas.js
// ============================================================================
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(backendDir);
dotenv.config({ path: path.join(backendDir, ".env") });

const prisma = new PrismaClient();

export const LOCAL_PRUEBAS = "TIENDA PRUEBAS CYPRESS";
export const PASSWORD_PRUEBAS = "Pruebas123*";

const USUARIOS = [
  { nombre: "Admin Pruebas", correo: "admin.pruebas@benmoga.test", rol: "ADMINISTRADORA", color: "#1F3864" },
  { nombre: "Operario Pruebas 1", correo: "operario1@benmoga.test", rol: "EMPLEADO", color: "#B91C1C" },
  { nombre: "Operario Pruebas 2", correo: "operario2@benmoga.test", rol: "EMPLEADO", color: "#0F766E" },
  { nombre: "Operario Pruebas 3", correo: "operario3@benmoga.test", rol: "EMPLEADO", color: "#7C3AED" },
  { nombre: "Operario Pruebas 4", correo: "operario4@benmoga.test", rol: "EMPLEADO", color: "#B45309" },
  { nombre: "Operario Pruebas 5", correo: "operario5@benmoga.test", rol: "EMPLEADO", color: "#0E7490" },
  { nombre: "Operario Pruebas 6", correo: "operario6@benmoga.test", rol: "EMPLEADO", color: "#BE185D" },
  { nombre: "Operario Pruebas 7", correo: "operario7@benmoga.test", rol: "EMPLEADO", color: "#334155" },
  { nombre: "Operario Pruebas 8", correo: "operario8@benmoga.test", rol: "EMPLEADO", color: "#5B21B6" },
  { nombre: "Usuario Inactivo", correo: "inactivo@benmoga.test", rol: "EMPLEADO", color: "#6B7280", activo: false },
];

const ZONAS = [
  { numero: 901, nombre: "Entrada", tipo: "PDV" },
  { numero: 902, nombre: "Pasillo 1", tipo: "PDV" },
  { numero: 903, nombre: "Estantería A", tipo: "PDV" },
  { numero: 904, nombre: "Probador", tipo: "PDV" },
  { numero: 905, nombre: "Mostrador", tipo: "PDV" },
  { numero: 906, nombre: "Bodega principal", tipo: "BODEGA" },
];

// Los códigos son de 13 dígitos y únicos en todo el catálogo (prefijo 799).
const PRODUCTOS = [
  { codigoBarras: "7990000000011", item: "R-101", referencia: "R-101", descripcion: "Camisa manga larga", estilo: "CASUAL", genero: "HOMBRE", detalle1: "S", detalle2: "AZUL", existencia: 5 },
  { codigoBarras: "7990000000012", item: "R-101", referencia: "R-101", descripcion: "Camisa manga larga", estilo: "CASUAL", genero: "HOMBRE", detalle1: "M", detalle2: "AZUL", existencia: 4 },
  { codigoBarras: "7990000000013", item: "R-102", referencia: "R-102", descripcion: "Jean recto", estilo: "JEAN", genero: "MUJER", detalle1: "S", detalle2: "NEGRO", existencia: 1 },
  { codigoBarras: "7990000000014", item: "R-102", referencia: "R-102", descripcion: "Jean recto", estilo: "JEAN", genero: "MUJER", detalle1: "M", detalle2: "NEGRO", existencia: 6 },
  { codigoBarras: "7990000000015", item: "R-103", referencia: "R-103", descripcion: "Chaqueta liviana", estilo: "OUTER", genero: "HOMBRE", detalle1: "L", detalle2: "VERDE", existencia: 3 },
  { codigoBarras: "7990000000016", item: "R-103", referencia: "R-103", descripcion: "Chaqueta liviana", estilo: "OUTER", genero: "HOMBRE", detalle1: "XL", detalle2: "VERDE", existencia: 0 },
  { codigoBarras: "7990000000017", item: "R-104", referencia: "R-104", descripcion: "Blusa estampada", estilo: "BLUSA", genero: "MUJER", detalle1: "S", detalle2: "ROJO", existencia: 2 },
  { codigoBarras: "7990000000018", item: "R-104", referencia: "R-104", descripcion: "Blusa estampada", estilo: "BLUSA", genero: "MUJER", detalle1: "M", detalle2: "ROJO", existencia: 2 },
  { codigoBarras: "7990000000019", item: "R-105", referencia: "R-105", descripcion: "Pantalón cargo", estilo: "CARGO", genero: "HOMBRE", detalle1: "L", detalle2: "BEIGE", existencia: 8 },
  { codigoBarras: "7990000000020", item: "R-105", referencia: "R-105", descripcion: "Pantalón cargo", estilo: "CARGO", genero: "HOMBRE", detalle1: "XL", detalle2: "BEIGE", existencia: 1 },
  { codigoBarras: "7990000000021", item: "R-106", referencia: "R-106", descripcion: "Falda plisada", estilo: "FALDA", genero: "MUJER", detalle1: "S", detalle2: "AZUL", existencia: 4 },
  { codigoBarras: "7990000000022", item: "R-106", referencia: "R-106", descripcion: "Falda plisada", estilo: "FALDA", genero: "MUJER", detalle1: "M", detalle2: "AZUL", existencia: 3 },
];

async function limpiarLocal(localId) {
  const inventarios = await prisma.inventario.findMany({
    where: { localId },
    select: { id: true },
  });
  if (inventarios.length) {
    await prisma.escaneo.deleteMany({
      where: { inventarioId: { in: inventarios.map((i) => i.id) } },
    });
  }
  const zonas = await prisma.zona.findMany({ where: { localId }, select: { id: true } });
  if (zonas.length) {
    const zonaIds = zonas.map((z) => z.id);
    await prisma.escaneo.deleteMany({ where: { zonaId: { in: zonaIds } } });
    await prisma.sesionZona.deleteMany({ where: { zonaId: { in: zonaIds } } });
  }
  // InventarioProducto se elimina en cascada con el inventario.
  await prisma.inventario.deleteMany({ where: { localId } });
  await prisma.zona.deleteMany({ where: { localId } });
}

async function main() {
  console.log("Preparando datos de prueba...");
  const hash = await bcrypt.hash(PASSWORD_PRUEBAS, 12);

  for (const u of USUARIOS) {
    await prisma.usuario.upsert({
      where: { correo: u.correo },
      update: { nombre: u.nombre, rol: u.rol, color: u.color, activo: u.activo !== false, passwordHash: hash },
      create: {
        nombre: u.nombre,
        correo: u.correo,
        rol: u.rol,
        color: u.color,
        activo: u.activo !== false,
        passwordHash: hash,
      },
    });
  }

  const local = await prisma.local.upsert({
    where: { nombre: LOCAL_PRUEBAS },
    update: { activo: true },
    create: { nombre: LOCAL_PRUEBAS, activo: true },
  });
  await limpiarLocal(local.id);
  // El Excel de prueba de la importación crea estos códigos (79900000009xx).
  // Se borran para que el catálogo quede igual en cada corrida; sus inventarios
  // de prueba ya se eliminaron arriba.
  await prisma.producto.deleteMany({
    where: { codigoBarras: { startsWith: "79900000009" } },
  });

  const usuarios = await prisma.usuario.findMany({
    where: { correo: { in: USUARIOS.map((u) => u.correo) } },
    select: { id: true, correo: true },
  });
  const idPorCorreo = new Map(usuarios.map((u) => [u.correo, u.id]));
  const adminId = idPorCorreo.get("admin.pruebas@benmoga.test");

  const zonas = [];
  for (const z of ZONAS) {
    zonas.push(
      await prisma.zona.create({
        data: { localId: local.id, numero: z.numero, nombre: z.nombre, tipo: z.tipo },
      }),
    );
  }
  const zonaPorNumero = new Map(zonas.map((z) => [z.numero, z]));

  const inventario = await prisma.inventario.create({
    data: {
      localId: local.id,
      nombre: "Inventario de pruebas Cypress",
      estado: "ACTIVO",
      archivoOrigen: "maestro-pruebas.xlsx",
      creadoPorId: adminId,
    },
  });

  const ipPorCodigo = new Map();
  for (const p of PRODUCTOS) {
    const producto = await prisma.producto.upsert({
      where: { codigoBarras: p.codigoBarras },
      update: {
        item: p.item,
        referencia: p.referencia,
        descripcion: p.descripcion,
        estilo: p.estilo,
        genero: p.genero,
        detalle1: p.detalle1,
        detalle2: p.detalle2,
      },
      create: {
        codigoBarras: p.codigoBarras,
        item: p.item,
        referencia: p.referencia,
        descripcion: p.descripcion,
        estilo: p.estilo,
        genero: p.genero,
        detalle1: p.detalle1,
        detalle2: p.detalle2,
      },
    });
    const ip = await prisma.inventarioProducto.create({
      data: {
        inventarioId: inventario.id,
        productoId: producto.id,
        existenciaInicial: p.existencia,
      },
    });
    ipPorCodigo.set(p.codigoBarras, ip.id);
  }

  // --- Lecturas de ejemplo -------------------------------------------------
  // Zona 901 terminada: permite ver en Monitoreo una zona con conteo cerrado,
  // su primer y último código y el empleado que la trabajó.
  const sesion901 = await prisma.sesionZona.create({
    data: {
      usuarioId: idPorCorreo.get("operario2@benmoga.test"),
      zonaId: zonaPorNumero.get(901).id,
      estado: "FINALIZADA",
      inicio: new Date(Date.now() - 2 * 60 * 60 * 1000),
      fin: new Date(Date.now() - 60 * 60 * 1000),
    },
  });
  // Zona 902 en conteo ahora: deja una sesión ACTIVA para el monitoreo en vivo.
  const sesion902 = await prisma.sesionZona.create({
    data: {
      usuarioId: idPorCorreo.get("operario3@benmoga.test"),
      zonaId: zonaPorNumero.get(902).id,
      estado: "ACTIVA",
      inicio: new Date(Date.now() - 20 * 60 * 1000),
    },
  });

  const lecturas = [
    { zona: 901, usuario: "operario2@benmoga.test", codigo: "7990000000011", hace: 110 },
    { zona: 901, usuario: "operario2@benmoga.test", codigo: "7990000000012", hace: 105 },
    { zona: 902, usuario: "operario3@benmoga.test", codigo: "7990000000013", hace: 15 },
    { zona: 902, usuario: "operario3@benmoga.test", codigo: "7990000000016", hace: 12 },
    { zona: 902, usuario: "operario3@benmoga.test", codigo: "7990000000014", hace: 8 },
    { zona: 902, usuario: "operario3@benmoga.test", codigo: "7990000000014", hace: 5 },
    { zona: 902, usuario: "operario3@benmoga.test", codigo: "7990000000011", hace: 3 },
  ];
  for (const l of lecturas) {
    await prisma.escaneo.create({
      data: {
        inventarioId: inventario.id,
        inventarioProductoId: ipPorCodigo.get(l.codigo),
        usuarioId: idPorCorreo.get(l.usuario),
        zonaId: zonaPorNumero.get(l.zona).id,
        codigoLeido: l.codigo,
        cantidad: 1,
        leidoEn: new Date(Date.now() - l.hace * 60 * 1000),
      },
    });
  }

  console.log("");
  console.log("Datos de prueba listos:");
  console.log(`  Local:        ${LOCAL_PRUEBAS} (id ${local.id})`);
  console.log(`  Inventario:   ${inventario.nombre} (id ${inventario.id}, ACTIVO)`);
  console.log(`  Zonas:        ${ZONAS.map((z) => `${z.numero} ${z.tipo}`).join(", ")}`);
  console.log(`  Productos:    ${PRODUCTOS.length}`);
  console.log(`  Lecturas:     ${lecturas.length} (zona 901 terminada, zona 902 en conteo)`);
  console.log("");
  console.log("Usuarios (contraseña Pruebas123*):");
  for (const u of USUARIOS) console.log(`  ${u.rol.padEnd(14)} ${u.correo}`);
  console.log("");
  console.log(`  Sesiones de ejemplo: ${sesion901.id} y ${sesion902.id}`);
}

main()
  .catch((error) => {
    console.error("No se pudieron preparar los datos de prueba:", error.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
