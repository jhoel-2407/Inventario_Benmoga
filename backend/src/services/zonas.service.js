import { prisma } from "../lib/prisma.js";
import { emitirAdministradoras, emitirLocal } from "../lib/realtime.js";

function errorConEstado(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

// MySQL puede reportar un deadlock cuando varios empleados eligen zona al mismo
// tiempo: cada transacción finaliza la sesión anterior y crea la nueva. Prisma
// lo identifica como P2034, así que se reintenta con una espera corta.
function esConflictoDeEscritura(error) {
  return (
    error?.code === "P2034" ||
    /deadlock|write conflict/i.test(error?.message || "")
  );
}

async function conReintentos(operacion, intentos = 5) {
  for (let intento = 0; intento < intentos; intento++) {
    try {
      return await operacion();
    } catch (error) {
      if (!esConflictoDeEscritura(error) || intento === intentos - 1) throw error;
      await new Promise((resolver) =>
        setTimeout(resolver, 20 * 2 ** intento + Math.random() * 20),
      );
    }
  }
}

export async function localDelInventarioActivo() {
  const inventario = await prisma.inventario.findFirst({
    where: { estado: "ACTIVO" },
    orderBy: { fechaInventario: "desc" },
  });
  return inventario?.localId ?? null;
}

// Zonas de un local. Si no se envía localId, usa el del inventario activo.
export async function listarZonas(localIdParam) {
  let localId = localIdParam;
  if (!localId) localId = await localDelInventarioActivo();
  if (!localId) return { zonas: [], local: null };

  const inventarioActivo = await prisma.inventario.findFirst({
    where: { estado: "ACTIVO", localId },
    orderBy: { fechaInventario: "desc" },
    select: { id: true },
  });

  const whereZona = { localId, activa: true };
  if (inventarioActivo) {
    whereZona.inventarioId = inventarioActivo.id;
  } else {
    // Sin inventario activo: no se muestran zonas (las legacy con inventarioId
    // null no se mezclan para que no aparezcan zonas "huérfanas").
    whereZona.id = -1;
  }

  const [zonas, local] = await Promise.all([
    prisma.zona.findMany({ where: whereZona, orderBy: [{ tipo: "asc" }, { numero: "asc" }] }),
    prisma.local.findUnique({ where: { id: localId } }),
  ]);
  return { zonas, local };
}

// Actividad en vivo de un local: quién tiene una zona abierta y cuánto lleva
// escaneado cada zona. Lo usa el panel de Monitoreo de la administradora.
export async function obtenerActividadZonas(localIdParam) {
  const localId = localIdParam || (await localDelInventarioActivo());
  if (!localId) return { sesiones: [], porZona: [] };

  // Solo se consideran los escaneos del inventario ACTIVO del local, para que
  // al activar un nuevo inventario el monitoreo arranque limpio.
  const inventarioActivo = await prisma.inventario.findFirst({
    where: { estado: "ACTIVO", localId },
    orderBy: { fechaInventario: "desc" },
    select: { id: true, fechaInventario: true },
  });
  const inventarioId = inventarioActivo?.id ?? null;
  const desdeFecha = inventarioActivo?.fechaInventario ?? null;
  const filtroEscaneo = inventarioId
    ? { zona: { localId }, inventarioId }
    : { zona: { localId }, id: -1 };

  const [sesiones, agrupado, zonas, historial, rangosMin, rangosMax, unicosZona] = await Promise.all([
    prisma.sesionZona.findMany({
      where: {
        estado: "ACTIVA",
        zona: {
          localId,
          ...(inventarioId ? { inventarioId } : { id: -1 }),
        },
      },
      include: {
        zona: { select: { id: true, numero: true, nombre: true } },
        usuario: { select: { id: true, nombre: true, rol: true, color: true } },
      },
      orderBy: { inicio: "desc" },
    }),
    prisma.escaneo.groupBy({
      by: ["zonaId"],
      where: filtroEscaneo,
      _sum: { cantidad: true },
      _count: { id: true },
      _max: { leidoEn: true },
    }),
    prisma.zona.findMany({
      where: {
        localId,
        activa: true,
        ...(inventarioId ? { inventarioId } : { id: -1 }),
      },
      orderBy: [{ tipo: "asc" }, { numero: "asc" }],
      select: { id: true, numero: true, nombre: true, tipo: true },
    }),
    // Historial de sesiones por zona: sirve para saber si una zona ya se cerró
    // (FINALIZADA) o si está abierta ahora (ACTIVA).
    prisma.sesionZona.findMany({
      where: {
        zona: { localId },
        ...(desdeFecha ? { inicio: { gte: desdeFecha } } : {}),
      },
      select: { zonaId: true, estado: true },
    }),
    // Primeras y últimas lecturas por zona: se resuelve en dos pasos para no
    // traer todos los escaneos del local (solo la hora extrema de cada zona).
    prisma.escaneo.groupBy({
      by: ["zonaId"],
      where: filtroEscaneo,
      _min: { leidoEn: true },
    }),
    prisma.escaneo.groupBy({
      by: ["zonaId"],
      where: filtroEscaneo,
      _max: { leidoEn: true },
    }),
    // Códigos únicos por zona: MySQL cuenta los distintos y solo devuelve una
    // fila por zona (antes se traían todas las lecturas al servidor).
    prisma.$queryRaw`
      SELECT e.zonaId AS zonaId, CAST(COUNT(DISTINCT e.codigoLeido) AS SIGNED) AS unicos
      FROM Escaneo e
      INNER JOIN Zona z ON z.id = e.zonaId
      WHERE z.localId = ${localId} AND e.inventarioId = ${inventarioId ?? -1}
      GROUP BY e.zonaId`,
  ]);

  const unicosPorZona = new Map();
  for (const r of unicosZona) unicosPorZona.set(Number(r.zonaId), Number(r.unicos || 0));

  // Con la hora extrema de cada zona en la mano, se buscan solo esas filas
  // para leer el código de barras correspondiente. Se consulta por pares
  // (zonaId, leidoEn) para que use el índice en vez de recorrer la tabla.
  const minPorZona = new Map();
  const maxPorZona = new Map();
  for (const r of rangosMin) {
    if (!r._min.leidoEn) continue;
    minPorZona.set(r.zonaId, new Date(r._min.leidoEn).getTime());
  }
  for (const r of rangosMax) {
    if (!r._max.leidoEn) continue;
    maxPorZona.set(r.zonaId, new Date(r._max.leidoEn).getTime());
  }
  const pares = [];
  for (const [zonaId, t] of minPorZona) pares.push({ zonaId, leidoEn: new Date(t) });
  for (const [zonaId, t] of maxPorZona) pares.push({ zonaId, leidoEn: new Date(t) });
  const extremos = pares.length
    ? await prisma.escaneo.findMany({
        where: { OR: pares, ...(inventarioId ? { inventarioId } : { id: -1 }) },
        select: { zonaId: true, codigoLeido: true, leidoEn: true },
        orderBy: { leidoEn: "asc" },
      })
    : [];
  const primeroPorZona = new Map();
  const ultimoPorZona = new Map();
  for (const f of extremos) {
    const t = new Date(f.leidoEn).getTime();
    if (!primeroPorZona.has(f.zonaId) && minPorZona.get(f.zonaId) === t)
      primeroPorZona.set(f.zonaId, f.codigoLeido);
    if (maxPorZona.get(f.zonaId) === t) ultimoPorZona.set(f.zonaId, f.codigoLeido);
  }

  const porZona = agrupado.map((g) => ({
    zonaId: g.zonaId,
    unidades: g._sum.cantidad || 0,
    lecturas: g._count.id || 0,
    unicos: unicosPorZona.get(g.zonaId) || 0,
    ultimoEscaneo: g._max.leidoEn,
  }));

  // Avance por zona:
  //   - terminada  = la zona se cerró (sesión FINALIZADA) o ya tiene conteo y nadie la tiene abierta.
  //   - en conteo  = hay una sesión ACTIVA ahora mismo.
  //   - faltante   = ninguna de las dos: todavía no se ha contado.
  const estadoZona = new Map();
  for (const s of historial) {
    const cur = estadoZona.get(s.zonaId) || { activa: false, finalizada: false, iniciada: false };
    cur.iniciada = true;
    if (s.estado === "ACTIVA") cur.activa = true;
    if (s.estado === "FINALIZADA") cur.finalizada = true;
    estadoZona.set(s.zonaId, cur);
  }

  const conteoPorZona = new Map(porZona.map((p) => [p.zonaId, p]));
  const zonasConteo = zonas.map((z) => {
    const p = conteoPorZona.get(z.id);
    const est = estadoZona.get(z.id) || { activa: false, finalizada: false, iniciada: false };
    const unidades = p?.unidades || 0;
    // Una zona está "en conteo" solo si tiene sesión activa Y al menos una unidad escaneada.
    const enConteo = est.activa && unidades > 0;
    // Una zona se marca "terminada" únicamente si se finalizó explícitamente.
    const terminada = est.finalizada && !est.activa;
    return {
      id: z.id,
      numero: z.numero,
      nombre: z.nombre,
      tipo: z.tipo || "PDV",
      unidades,
      lecturas: p?.lecturas || 0,
      unicos: p?.unicos || 0,
      ultimoEscaneo: p?.ultimoEscaneo || null,
      primerCodigo: primeroPorZona.get(z.id) || null,
      primerEscaneo: minPorZona.has(z.id) ? new Date(minPorZona.get(z.id)) : null,
      ultimoCodigo: ultimoPorZona.get(z.id) || null,
      enConteo,
      finalizada: est.finalizada,
      iniciada: est.iniciada,
      terminada,
    };
  });
  const terminadas = zonasConteo.filter((z) => z.terminada);
  const enConteoZonas = zonasConteo.filter((z) => z.enConteo);
  const faltantes = zonasConteo.filter((z) => !z.terminada && !z.enConteo);

  return {
    sesiones: sesiones.map((s) => ({
      id: s.id,
      inicio: s.inicio,
      zona: s.zona,
      usuario: s.usuario,
    })),
    porZona,
    zonas: zonasConteo,
    terminadas,
    faltantes,
    resumenZonas: {
      total: zonasConteo.length,
      terminadas: terminadas.length,
      enConteo: enConteoZonas.length,
      faltantes: faltantes.length,
    },
  };
}

export async function crearZona(data) {
  // Asocia la zona al inventario activo del local (si lo hay), para que cada
  // inventario conserve su propia configuración de zonas.
  if (!data.inventarioId) {
    const inv = await prisma.inventario.findFirst({
      where: { estado: "ACTIVO", localId: data.localId },
      orderBy: { fechaInventario: "desc" },
      select: { id: true },
    });
    if (inv) data = { ...data, inventarioId: inv.id };
  }
  return prisma.zona.create({ data });
}

// Alta por lote: crea las zonas de un rango de números de una sola vez.
export async function crearZonasLote({ localId, desde, hasta, prefijo, tipo, inventarioId }) {
  if (hasta < desde)
    throw errorConEstado("El rango es inválido (hasta < desde).", 400);
  if (hasta - desde > 2000)
    throw errorConEstado("El rango es demasiado grande (máximo 2001 zonas).", 400);

  if (!inventarioId) {
    const inv = await prisma.inventario.findFirst({
      where: { estado: "ACTIVO", localId },
      orderBy: { fechaInventario: "desc" },
      select: { id: true },
    });
    if (inv) inventarioId = inv.id;
  }

  const data = [];
  for (let n = desde; n <= hasta; n++)
    data.push({
      localId,
      inventarioId: inventarioId || null,
      numero: n,
      nombre: prefijo ? `${prefijo} ${n}` : null,
      tipo: tipo || "PDV",
    });
  const resultado = await prisma.zona.createMany({ data, skipDuplicates: true });

  return {
    mensaje: `${resultado.count} zonas creadas (${tipo || "PDV"}).`,
    creadas: resultado.count,
    tipo: tipo || "PDV",
  };
}

export async function actualizarZona(id, data) {
  return prisma.zona.update({ where: { id }, data });
}

export async function eliminarZona(id) {
  const zona = await prisma.zona.findUnique({
    where: { id },
    include: {
      sesiones: { take: 1 },
      escaneos: { take: 1 },
    },
  });
  if (!zona) throw errorConEstado("Zona no encontrada", 404);
  if (zona.sesiones.length > 0 || zona.escaneos.length > 0) {
    throw errorConEstado(
      "No se puede eliminar la zona porque ya tiene sesiones o escaneos registrados.",
      409,
    );
  }
  await prisma.zona.delete({ where: { id } });
  return { ok: true, mensaje: "Zona eliminada correctamente" };
}

export async function seleccionarZona(usuario, zonaId) {
  const zona = await prisma.zona.findFirst({ where: { id: zonaId, activa: true } });
  if (!zona) throw errorConEstado("Zona no encontrada o inactiva.", 404);

  // La zona debe pertenecer a un local que tenga su inventario activo.
  const inventario = await prisma.inventario.findFirst({
    where: { estado: "ACTIVO", localId: zona.localId },
    orderBy: { fechaInventario: "desc" },
  });
  if (!inventario)
    throw errorConEstado("El local de esta zona no tiene un inventario activo.", 409);

  const sesion = await conReintentos(() =>
    prisma.$transaction(async (tx) => {
      // Se finalizan las sesiones activas por su id (clave primaria) para no
      // bloquear rangos del índice [usuarioId, estado] y evitar deadlocks entre
      // empleados que eligen zona al mismo tiempo.
      const activas = await tx.sesionZona.findMany({
        where: { usuarioId: usuario.id, estado: "ACTIVA" },
        select: { id: true },
      });
      if (activas.length > 0) {
        await tx.sesionZona.updateMany({
          where: { id: { in: activas.map((s) => s.id) } },
          data: { estado: "FINALIZADA", fin: new Date() },
        });
      }
      return tx.sesionZona.create({ data: { usuarioId: usuario.id, zonaId } });
    }),
  );

  emitirLocal(zona.localId, {
    tipo: "sesion",
    localId: zona.localId,
    accion: "inicio",
    zona: { id: zona.id, numero: zona.numero, nombre: zona.nombre },
    usuario: { id: usuario.id, nombre: usuario.nombre, color: usuario.color || null },
  });

  return { mensaje: "Zona seleccionada.", sesion, zona };
}

export async function finalizarZona(usuario) {
  const sesion = await prisma.sesionZona.findFirst({
    where: { usuarioId: usuario.id, estado: "ACTIVA" },
    include: { zona: true },
    orderBy: { inicio: "desc" },
  });
  if (!sesion) {
    return { mensaje: "No tenías una zona activa.", sesionesFinalizadas: 0 };
  }

  const fin = new Date();
  await prisma.sesionZona.update({
    where: { id: sesion.id },
    data: { estado: "FINALIZADA", fin },
  });

  const stats = await prisma.escaneo.aggregate({
    where: {
      usuarioId: usuario.id,
      zonaId: sesion.zonaId,
      inventario: { localId: sesion.zona.localId },
    },
    _sum: { cantidad: true },
    _count: { id: true },
  });

  // El panel del local se refresca al instante…
  emitirLocal(sesion.zona.localId, {
    tipo: "sesion",
    localId: sesion.zona.localId,
    accion: "fin",
    zona: { id: sesion.zona.id, numero: sesion.zona.numero, nombre: sesion.zona.nombre },
    usuario: { id: usuario.id, nombre: usuario.nombre, color: usuario.color || null },
  });

  // …y la administradora recibe una notificación de la zona terminada.
  emitirAdministradoras(
    {
      tipo: "zona_finalizada",
      localId: sesion.zona.localId,
      zona: { id: sesion.zona.id, numero: sesion.zona.numero, nombre: sesion.zona.nombre },
      empleado: { id: usuario.id, nombre: usuario.nombre, color: usuario.color || null },
      unidades: stats._sum.cantidad || 0,
      lecturas: stats._count.id || 0,
      hora: fin,
    },
    sesion.zona.localId,
  );

  return { mensaje: "Sesión de zona finalizada.", sesionesFinalizadas: 1 };
}
