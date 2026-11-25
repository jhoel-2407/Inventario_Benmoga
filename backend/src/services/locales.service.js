import { prisma } from "../lib/prisma.js";

export async function listarLocales() {
  const locales = await prisma.local.findMany({
    orderBy: { nombre: "asc" },
    include: {
      _count: { select: { zonas: true, inventarios: true } },
      inventarios: {
        where: { estado: "ACTIVO" },
        select: { id: true, nombre: true, estado: true },
        take: 1,
      },
    },
  });

  return locales.map(({ inventarios, ...local }) => ({
    ...local,
    inventarioActivo: inventarios[0] || null,
  }));
}

export async function crearLocal({ nombre }) {
  return prisma.local.create({ data: { nombre } });
}

export async function actualizarLocal(id, datos) {
  return prisma.local.update({ where: { id }, data: datos });
}
