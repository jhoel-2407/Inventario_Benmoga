import { prisma } from "../lib/prisma.js";
import { invalidarInventarioCache } from "./escaneos.service.js";
import {
  comparativoDeInventario,
  comparativoPorReferencia,
  conteoReferenciaPorZona,
  resumirComparativo,
  resumirComparativoPorReferencia,
} from "./comparativo.service.js";
import { procesarImportacion, asegurarProductos, perfilDeLocal } from "./importacion.service.js";

function errorConEstado(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

const RESUMEN_VACIO = {
  productosMaestro: 0,
  productosConConteo: 0,
  unidadesMaestro: 0,
  unidadesContadas: 0,
  faltantes: 0,
  sobrantes: 0,
  sinConteo: 0,
  ok: 0,
};

// ... (keep existing functions: listarInventarios, obtenerComparativoActivo, activarInventario, impactoInventario, eliminarInventario)

export async function listarInventarios(localId) {
  return prisma.inventario.findMany({
    where: localId ? { localId } : undefined,
    orderBy: { fechaInventario: "desc" },
    include: {
      local: { select: { id: true, nombre: true } },
      _count: { select: { productos: true, escaneos: true } },
    },
  });
}

export async function obtenerComparativoActivo(localId) {
  const inventario = await prisma.inventario.findFirst({
    where: localId ? { estado: "ACTIVO", localId } : { estado: "ACTIVO" },
    include: { local: { select: { id: true, nombre: true } } },
    orderBy: { fechaInventario: "desc" },
  });

  if (!inventario) {
    return {
      inventario: null,
      resumen: { ...RESUMEN_VACIO },
      productos: [],
      productosPorReferencia: [],
      zonasPorReferencia: {},
      zonas: [],
      resumenPorReferencia: { ...RESUMEN_VACIO },
    };
  }

  const [filas, filasRef, conteoRefZona, zonasLocal] = await Promise.all([
    comparativoDeInventario(inventario.id),
    comparativoPorReferencia(inventario.id),
    conteoReferenciaPorZona(inventario.id),
    prisma.zona.findMany({
      where: { localId: inventario.localId, activa: true },
      orderBy: { numero: "asc" },
      select: { id: true, numero: true, nombre: true },
    }),
  ]);

  const zonasPorReferencia = {};
  for (const r of conteoRefZona) {
    const clave = r.ref || "SIN REFERENCIA";
    if (!zonasPorReferencia[clave]) zonasPorReferencia[clave] = [];
    zonasPorReferencia[clave].push({
      zonaId: r.zonaId,
      zona: r.zonaNumero,
      unidades: Number(r.contado) || 0,
    });
  }

  const { productos, resumen } = resumirComparativo(filas);
  const { productosPorReferencia, resumenPorReferencia } =
    resumirComparativoPorReferencia(filasRef, productos);

  return {
    inventario,
    resumen,
    productos,
    productosPorReferencia,
    resumenPorReferencia,
    zonasPorReferencia,
    zonas: zonasLocal,
  };
}

export async function activarInventario(id) {
  if (!Number.isInteger(id)) throw errorConEstado("ID inválido.", 400);

  const objetivo = await prisma.inventario.findUnique({ where: { id } });
  if (!objetivo) throw errorConEstado("Inventario no encontrado.", 404);

  const resultado = await prisma.$transaction(async (tx) => {
    await tx.inventario.updateMany({
      where: { estado: "ACTIVO", localId: objetivo.localId },
      data: { estado: "CERRADO" },
    });
    await tx.sesionZona.updateMany({
      where: { estado: "ACTIVA", zona: { localId: objetivo.localId } },
      data: { estado: "FINALIZADA", fin: new Date() },
    });
    return tx.inventario.update({
      where: { id },
      data: { estado: "ACTIVO" },
    });
  });

  invalidarInventarioCache(objetivo.localId);
  return resultado;
}

export async function impactoInventario(id) {
  if (!Number.isInteger(id)) throw errorConEstado("ID inválido.", 400);

  const inventario = await prisma.inventario.findUnique({
    where: { id },
    include: {
      local: { select: { id: true, nombre: true } },
      _count: { select: { productos: true, escaneos: true } },
    },
  });
  if (!inventario) throw errorConEstado("Inventario no encontrado.", 404);

  const [gruposZona, gruposUsuario, suma] = await Promise.all([
    prisma.escaneo.groupBy({ by: ["zonaId"], where: { inventarioId: id } }),
    prisma.escaneo.groupBy({ by: ["usuarioId"], where: { inventarioId: id } }),
    prisma.escaneo.aggregate({
      where: { inventarioId: id },
      _sum: { cantidad: true },
    }),
  ]);
  const zonaIds = gruposZona.map((g) => g.zonaId);
  const usuarioIds = gruposUsuario.map((g) => g.usuarioId);
  const [zonas, usuarios] = await Promise.all([
    zonaIds.length
      ? prisma.zona.findMany({
          where: { id: { in: zonaIds } },
          select: { id: true, numero: true, nombre: true },
          orderBy: { numero: "asc" },
        })
      : [],
    usuarioIds.length
      ? prisma.usuario.findMany({
          where: { id: { in: usuarioIds } },
          select: { id: true, nombre: true },
        })
      : [],
  ]);

  return {
    inventario: {
      id: inventario.id,
      nombre: inventario.nombre,
      estado: inventario.estado,
      local: inventario.local,
    },
    productos: inventario._count.productos,
    escaneos: inventario._count.escaneos,
    unidades: suma._sum.cantidad || 0,
    zonas,
    usuarios,
  };
}

export async function eliminarInventario(id, confirmado) {
  if (!Number.isInteger(id)) throw errorConEstado("ID inválido.", 400);

  const inventario = await prisma.inventario.findUnique({
    where: { id },
    include: { _count: { select: { productos: true, escaneos: true } } },
  });
  if (!inventario) throw errorConEstado("Inventario no encontrado.", 404);

  const lecturas = inventario._count.escaneos;
  if (lecturas > 0 && !confirmado) {
    return {
      tipo: "requiere_confirmacion",
      lecturas,
      impacto: {
        productos: inventario._count.productos,
        escaneos: lecturas,
      },
    };
  }

  await prisma.$transaction([
    prisma.escaneo.deleteMany({ where: { inventarioId: id } }),
    prisma.escaneoNovedad.deleteMany({ where: { inventarioId: id } }),
    // Eliminar sesiones y zonas asociadas a este inventario, para que al
    // borrarlo no queden zonas "huérfanas" y el siguiente inventario arranque limpio.
    prisma.sesionZona.deleteMany({ where: { zona: { inventarioId: id } } }),
    prisma.zona.deleteMany({ where: { inventarioId: id } }),
    prisma.inventario.delete({ where: { id } }),
  ]);

  return {
    tipo: "ok",
    mensaje: `Inventario eliminado correctamente (${lecturas} lecturas borradas).`,
  };
}

// Actualiza el maestro de un inventario YA EXISTENTE (típicamente el activo),
// preservando todos los escaneos. Sirve para cuando la auditora corrige el
// Excel durante el conteo: se sube el maestro corregido y se actualizan las
// existencias iniciales (y se agregan productos nuevos) sin perder lecturas.
export async function actualizarMaestroInventario({ inventarioId, archivo, mapeo, usuarioId }) {
  if (!Number.isInteger(inventarioId)) throw errorConEstado("ID inválido.", 400);

  const inventario = await prisma.inventario.findUnique({
    where: { id: inventarioId },
    include: { local: true },
  });
  if (!inventario) throw errorConEstado("Inventario no encontrado.", 404);
  if (inventario.estado === "CERRADO") throw errorConEstado("No se puede actualizar el maestro de un inventario cerrado.", 409);

  const local = inventario.local;
  let mapeoExplicito = null;
  if (mapeo) {
    try { mapeoExplicito = typeof mapeo === "string" ? JSON.parse(mapeo) : mapeo; }
    catch { throw errorConEstado("El mapeo de columnas no es válido.", 400); }
  }
  const perfil = perfilDeLocal(local);

  const resultado = await procesarImportacion(archivo, { mapeoExplicito, perfil });
  if (resultado.tipo === "sin_hoja") return resultado;
  if (resultado.tipo === "mapeo") return resultado;
  if (!resultado.agrupados.size) return { tipo: "sin_filas", errores: resultado.errores };

  const productos = [...resultado.agrupados.values()];

  // Guardar perfil si corresponde
  if (resultado.guardarPerfil && resultado.mapeo) {
    await prisma.local.update({ where: { id: local.id }, data: { perfilColumnas: resultado.mapeo } }).catch(() => {});
  }

  // Asegurar productos en catálogo global
  const idsPorCodigo = await asegurarProductos(productos);

  // Aplicar cambios al inventario existente, preservando escaneos.
  // Se hace en una transacción para que un escaneo concurrente no vea un
  // estado parcial (todo o nada).
  let actualizados = 0;
  let nuevos = 0;
  const relacionesNuevas = [];
  for (const p of productos) {
    const productoId = idsPorCodigo.get(p.codigoBarras);
    if (!productoId) continue;
    const existente = await prisma.inventarioProducto.findUnique({
      where: { inventarioId_productoId: { inventarioId, productoId } },
    });
    if (existente) {
      relacionesNuevas.push({ tipo: "upd", id: existente.id, p });
      actualizados++;
    } else {
      relacionesNuevas.push({
        tipo: "new",
        data: {
          inventarioId,
          productoId,
          existenciaInicial: p.existenciaInicial,
          item: p.item,
          descripcion: p.descripcion,
          detalle1: p.detalle1,
          detalle2: p.detalle2,
          genero: p.genero,
          estilo: p.estilo,
          referencia: p.referencia,
          subGrupo: p.subGrupo,
          descriptoresCargados: true,
        },
      });
      nuevos++;
    }
  }

  await prisma.$transaction(async (tx) => {
    for (const r of relacionesNuevas) {
      if (r.tipo === "upd") {
        const p = r.p;
        await tx.inventarioProducto.update({
          where: { id: r.id },
          data: {
            existenciaInicial: p.existenciaInicial,
            item: p.item,
            descripcion: p.descripcion,
            detalle1: p.detalle1,
            detalle2: p.detalle2,
            genero: p.genero,
            estilo: p.estilo,
            referencia: p.referencia,
            subGrupo: p.subGrupo,
            descriptoresCargados: true,
          },
        });
      }
    }
    const nuevosData = relacionesNuevas.filter((r) => r.tipo === "new").map((r) => r.data);
    for (let i = 0; i < nuevosData.length; i += 500) {
      await tx.inventarioProducto.createMany({ data: nuevosData.slice(i, i + 500), skipDuplicates: true });
    }

    // Reconcilia las novedades (N/A) cuyo código ahora sí pertenece al maestro.
    const codigosMaestro = productos.map((p) => p.codigoBarras);
    if (codigosMaestro.length) {
      const novedadesObsoletas = await tx.escaneoNovedad.findMany({
        where: { inventarioId, codigoLeido: { in: codigosMaestro } },
      });
      for (const nov of novedadesObsoletas) {
        const prod = await tx.producto.findUnique({ where: { codigoBarras: nov.codigoLeido } });
        const invProd = prod
          ? await tx.inventarioProducto.findUnique({ where: { inventarioId_productoId: { inventarioId, productoId: prod.id } } })
          : null;
        if (!invProd) { await tx.escaneoNovedad.delete({ where: { id: nov.id } }); continue; }
        const yaConvertido = await tx.escaneo.findFirst({
          where: { inventarioId, codigoLeido: nov.codigoLeido, leidoEn: nov.leidoEn },
        });
        if (!yaConvertido) {
          await tx.escaneo.create({
            data: {
              inventarioId,
              inventarioProductoId: invProd.id,
              usuarioId: nov.usuarioId,
              zonaId: nov.zonaId,
              codigoLeido: nov.codigoLeido,
              cantidad: 1,
              leidoEn: nov.leidoEn,
            },
          });
        }
        await tx.escaneoNovedad.delete({ where: { id: nov.id } });
      }
    }

    if (resultado.guardarPerfil && resultado.mapeo) {
      await tx.local.update({ where: { id: local.id }, data: { perfilColumnas: resultado.mapeo } }).catch(() => {});
    }
  }, { timeout: 120000, maxWait: 10000 });

  invalidarInventarioCache(inventario.localId);
  invalidarInventarioCache(inventario.localId);

  return {
    tipo: "ok",
    inventario: { id: inventario.id, nombre: inventario.nombre, estado: inventario.estado, local: { id: local.id, nombre: local.nombre } },
    productosActualizados: actualizados,
    productosNuevos: nuevos,
    totalErrores: resultado.errores.length,
    errores: resultado.errores.slice(0, 50),
    mapeoUsado: resultado.mapeo,
  };
}

// Actualiza solo el stock (existencias) de un inventario existente a partir de un
// Excel con formato distinto (solo se requiere código + existencia). Conserva
// sin tener que re-importar el Excel.
export async function reiniciarEscaneosInventario(id) {
  if (!Number.isInteger(id)) throw errorConEstado("ID inválido.", 400);

  const inventario = await prisma.inventario.findUnique({ where: { id } });
  if (!inventario) throw errorConEstado("Inventario no encontrado.", 404);

  const [delEsc, delNov] = await prisma.$transaction([
    prisma.escaneo.deleteMany({ where: { inventarioId: id } }),
    prisma.escaneoNovedad.deleteMany({ where: { inventarioId: id } }),
  ]);

  // Finaliza sesiones activas del local para que el conteo arranque limpio.
  await prisma.sesionZona.updateMany({
    where: { estado: "ACTIVA", zona: { localId: inventario.localId } },
    data: { estado: "FINALIZADA", fin: new Date() },
  });

  invalidarInventarioCache(inventario.localId);

  return {
    ok: true,
    mensaje: `Conteo reiniciado: ${delEsc.count} lecturas y ${delNov.count} novedades (N/A) borradas. El maestro se conserva.`,
    lecturasBorradas: delEsc.count,
    novedadesBorradas: delNov.count,
  };
}
