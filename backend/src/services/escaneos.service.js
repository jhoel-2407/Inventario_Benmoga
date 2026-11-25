import { prisma } from "../lib/prisma.js";
import { emitirLocal } from "../lib/realtime.js";
import { descriptoresDeInventarioProducto } from "../lib/descriptores.js";

// Caché del inventario activo por local. El inventario cambia muy pocas veces
// (solo cuando la administradora activa uno nuevo), así que guardarlo 30 s en
// memoria evita una consulta a la BD en cada escaneo.
const inventarioCache = new Map();
const TTL_INVENTARIO_MS = 30000;

async function obtenerInventarioActivo(localId) {
  const cached = inventarioCache.get(localId);
  if (cached && cached.expires > Date.now()) return cached.inventario;
  const inventario = await prisma.inventario.findFirst({
    where: { estado: "ACTIVO", localId },
    orderBy: { fechaInventario: "desc" },
  });
  inventarioCache.set(localId, { inventario, expires: Date.now() + TTL_INVENTARIO_MS });
  return inventario;
}

export function invalidarInventarioCache(localId) {
  if (localId) inventarioCache.delete(localId);
  else inventarioCache.clear();
}

function errorConEstado(mensaje, status, extra = {}) {
  const error = new Error(mensaje);
  error.status = status;
  Object.assign(error, extra);
  return error;
}

export async function registrarEscaneo(usuario, codigoBarras) {
  const sesion = await prisma.sesionZona.findFirst({
    where: { usuarioId: usuario.id, estado: "ACTIVA" },
    include: { zona: true },
    orderBy: { inicio: "desc" },
  });
  if (!sesion)
    throw errorConEstado("Primero debes seleccionar una zona.", 409);

  const inventario = await obtenerInventarioActivo(sesion.zona.localId);
  if (!inventario)
    throw errorConEstado("El local de esta zona no tiene un inventario activo.", 409);

  let codigoCorregido = false;
  let codigoUsado = codigoBarras;

  // Busqueda combinada inventario+producto en una sola consulta (JOIN).
  let inventarioProducto = await prisma.inventarioProducto.findFirst({
    where: { inventarioId: inventario.id, producto: { codigoBarras } },
    include: { producto: true },
  });

  // Si no existe el codigo exacto, intentar quitarle el ultimo digito
  // (caso que se presenta cuando el lector agrega un digito extra).
  if (!inventarioProducto && codigoBarras.length >= 7) {
    const sinUltimo = codigoBarras.slice(0, -1);
    const ipCorregido = await prisma.inventarioProducto.findFirst({
      where: { inventarioId: inventario.id, producto: { codigoBarras: sinUltimo } },
      include: { producto: true },
    });
    if (ipCorregido) {
      inventarioProducto = ipCorregido;
      codigoCorregido = true;
      codigoUsado = sinUltimo;
    }
  }

  if (!inventarioProducto) {
    const existeEnCatalogo = await prisma.producto.findUnique({ where: { codigoBarras } });
    let existeCorregido = null;
    if (!existeEnCatalogo && codigoBarras.length >= 7) {
      existeCorregido = await prisma.producto.findUnique({ where: { codigoBarras: codigoBarras.slice(0, -1) } });
    }
    if (!existeEnCatalogo && !existeCorregido) {
      // Código completamente desconocido: se registra como N/A para que no se
      // pierda la lectura, pero se avisa que no está en ningún catálogo.
      const [totalEscaneosZona, totalNovedadesZona] = await Promise.all([
        prisma.escaneo.count({ where: { zonaId: sesion.zonaId, inventarioId: inventario.id } }),
        prisma.escaneoNovedad.count({ where: { zonaId: sesion.zonaId, inventarioId: inventario.id } }),
      ]);
      const posicion = totalEscaneosZona + totalNovedadesZona + 1;
      const novedad = await prisma.escaneoNovedad.create({
        data: {
          inventarioId: inventario.id,
          zonaId: sesion.zonaId,
          usuarioId: usuario.id,
          codigoLeido: codigoBarras,
          descripcion: null,
          posicion,
        },
      });
      emitirLocal(inventario.localId, {
        type: "novedad",
        tipo: "novedad",
        inventarioId: inventario.id,
        localId: inventario.localId,
        zonaId: sesion.zona.id,
        zona: sesion.zona.nombre || `Zona ${sesion.zona.numero}`,
        zonaNumero: sesion.zona.numero,
        usuarioId: usuario.id,
        usuario: usuario.nombre || "",
        codigoBarras,
        posicion,
        fecha: novedad.leidoEn,
      });
      return {
        mensaje: "Producto registrado como N/A (código no encontrado en el catálogo).",
        novedad: true,
        escaneo: {
          id: String(novedad.id),
          codigoBarras,
          cantidad: 1,
          leidoEn: novedad.leidoEn,
          zona: sesion.zona.numero,
          posicion,
          producto: { descripcion: null },
        },
      };
    }

    // El código existe en el catálogo global pero NO pertenece al inventario
    // activo de este local: es un sobrante o un producto trocado. Se registra
    // como N/A (novedad) con su posición dentro de la zona, para que aparezca
    // en el apartado de N/A del reporte/monitoreo.
    const productoNovedad = existeEnCatalogo || existeCorregido;
    const [totalEscaneosZona, totalNovedadesZona] = await Promise.all([
      prisma.escaneo.count({ where: { zonaId: sesion.zonaId, inventarioId: inventario.id } }),
      prisma.escaneoNovedad.count({ where: { zonaId: sesion.zonaId, inventarioId: inventario.id } }),
    ]);
    const posicion = totalEscaneosZona + totalNovedadesZona + 1;
    const novedad = await prisma.escaneoNovedad.create({
      data: {
        inventarioId: inventario.id,
        zonaId: sesion.zonaId,
        usuarioId: usuario.id,
        codigoLeido: codigoBarras,
        descripcion: productoNovedad?.descripcion || null,
        posicion,
      },
    });

    emitirLocal(inventario.localId, {
      type: "novedad",
      tipo: "novedad",
      inventarioId: inventario.id,
      localId: inventario.localId,
      zonaId: sesion.zona.id,
      zona: sesion.zona.nombre || `Zona ${sesion.zona.numero}`,
      zonaNumero: sesion.zona.numero,
      usuarioId: usuario.id,
      usuario: usuario.nombre || "",
      codigoBarras,
      posicion,
      fecha: novedad.leidoEn,
    });

    return {
      mensaje: "Producto registrado como N/A (no pertenece al inventario activo).",
      novedad: true,
      escaneo: {
        id: String(novedad.id),
        codigoBarras,
        cantidad: 1,
        leidoEn: novedad.leidoEn,
        zona: sesion.zona.numero,
        posicion,
        producto: { descripcion: productoNovedad?.descripcion || null },
      },
    };
  }


  // Cada lectura válida suma una unidad. No se rechazan lecturas consecutivas automáticamente:
  // algunas referencias pueden tener varias unidades físicas con el mismo código.
  const escaneo = await prisma.escaneo.create({
    data: {
      inventarioId: inventario.id,
      inventarioProductoId: inventarioProducto.id,
      usuarioId: usuario.id,
      zonaId: sesion.zonaId,
      codigoLeido: codigoBarras,
      cantidad: 1,
    },
    include: {
      inventarioProducto: { include: { producto: true } },
      zona: true,
    },
  });

  // Totales para el monitoreo en vivo y para el resumen del propio empleado.
  // Se calculan dentro de MySQL (COUNT/SUM) en una sola pasada con índice, en
  // lugar de traer todas las filas de la zona/sesión al servidor: así el costo
  // por lectura no depende de cuántos códigos distintos se hayan escaneado.
  const [zonaResumen, mioResumen] = await Promise.all([
    prisma.$queryRaw`
      SELECT CAST(COALESCE(SUM(cantidad), 0) AS SIGNED) AS unidades,
             CAST(COUNT(DISTINCT codigoLeido) AS SIGNED) AS unicos
      FROM Escaneo
      WHERE zonaId = ${sesion.zonaId}`,
    prisma.$queryRaw`
      SELECT CAST(COALESCE(SUM(cantidad), 0) AS SIGNED) AS unidades,
             CAST(COUNT(DISTINCT inventarioProductoId) AS SIGNED) AS distintos
      FROM Escaneo
      WHERE inventarioId = ${inventario.id} AND usuarioId = ${usuario.id}`,
  ]);

  const totalEnZona = Number(zonaResumen[0]?.unidades || 0);
  const totalUnicosEnZona = Number(zonaResumen[0]?.unicos || 0);
  const misUnidades = Number(mioResumen[0]?.unidades || 0);
  const misDistintos = Number(mioResumen[0]?.distintos || 0);
  const productoInfo = descriptoresDeInventarioProducto(escaneo.inventarioProducto);

  // Avisa en vivo a quien esté viendo este local (el panel de administración).
  emitirLocal(inventario.localId, {
    type: "escaneo",
    tipo: "escaneo",
    inventarioId: inventario.id,
    localId: inventario.localId,
    zonaId: escaneo.zona.id,
    zona: escaneo.zona.nombre || `Zona ${escaneo.zona.numero}`,
    zonaNumero: escaneo.zona.numero,
    usuarioId: usuario.id,
    usuario: usuario.nombre || "",
    usuarioColor: usuario.color || null,
    rol: usuario.rol || "",
    barcode: codigoBarras,
    codigoBarras,
    referencia: productoInfo.referencia || productoInfo.item || productoInfo.estilo || "",
    estilo: productoInfo.estilo || "",
    descripcion: productoInfo.descripcion || "",
    cantidad: escaneo.cantidad,
    totalEnZona,
    totalUnicosEnZona,
    leidoEn: escaneo.leidoEn,
    fecha: escaneo.leidoEn,
  });

  return {
    mensaje: codigoCorregido
      ? "Unidad registrada correctamente (corrección automática: se ajustó el código escaneado)."
      : "Unidad registrada correctamente.",
    escaneo: {
      id: String(escaneo.id),
      codigoBarras: escaneo.codigoLeido,
      cantidad: escaneo.cantidad,
      leidoEn: escaneo.leidoEn,
      zona: escaneo.zona.numero,
      producto: productoInfo,
    },
    correccion: codigoCorregido
      ? { aplicado: true, leido: codigoBarras, usado: codigoUsado }
      : null,
    // El resumen del empleado viaja en la misma respuesta para que el celular
    // no tenga que pedir /resumen-mio después de cada lectura.
    resumen: {
      unidades: misUnidades,
      productosDistintos: misDistintos,
      totalEnZona,
      totalUnicosEnZona,
    },
  };
}

// Últimos escaneos de una zona (para que el panel de monitoreo muestre
// actividad histórica y no solo lo que ocurra mientras la pantalla está abierta).
export async function escaneosRecientes(zonaId, limit = 50) {
  const zona = await prisma.zona.findUnique({
    where: { id: zonaId },
    select: { id: true, numero: true, nombre: true, localId: true },
  });
  if (!zona) throw errorConEstado("Zona no encontrada.", 404);

  const inventario = await prisma.inventario.findFirst({
    where: { estado: "ACTIVO", localId: zona.localId },
    orderBy: { fechaInventario: "desc" },
    select: { id: true },
  });

  const escaneos = await prisma.escaneo.findMany({
    where: { zonaId, ...(inventario ? { inventarioId: inventario.id } : { id: -1 }) },
    orderBy: { leidoEn: "desc" },
    take: Math.min(Math.max(limit, 1), 200),
    include: {
      usuario: { select: { id: true, nombre: true, color: true, rol: true } },
      inventarioProducto: { include: { producto: true } },
    },
  });

  return escaneos.map((e) => {
    const info = descriptoresDeInventarioProducto(e.inventarioProducto);
    return {
      tipo: "escaneo",
      type: "escaneo",
      inventarioId: inventario?.id ?? null,
      localId: zona.localId,
      zonaId: zona.id,
      zona: zona.nombre || `Zona ${zona.numero}`,
      zonaNumero: zona.numero,
      usuarioId: e.usuario.id,
      usuario: e.usuario.nombre,
      usuarioColor: e.usuario.color,
      rol: e.usuario.rol,
      barcode: e.codigoLeido,
      codigoBarras: e.codigoLeido,
      referencia: info.referencia || info.item || info.estilo || "",
      estilo: info.estilo || "",
      descripcion: info.descripcion || "",
      cantidad: e.cantidad,
      totalEnZona: null,
      totalUnicosEnZona: null,
      leidoEn: e.leidoEn,
      fecha: e.leidoEn,
    };
  });
}

// Detalle completo de un usuario en un inventario: zona activa, zonas que
// escaneó (con conteos) y productos escaneados (con unidades).
export async function detalleUsuarioInventario(inventarioId, usuarioId) {
  const usuario = await prisma.usuario.findUnique({
    where: { id: usuarioId },
    select: { id: true, nombre: true, color: true, rol: true },
  });
  if (!usuario) throw errorConEstado("Usuario no encontrado.", 404);

  const sesionActiva = await prisma.sesionZona.findFirst({
    where: { usuarioId, estado: "ACTIVA" },
    include: { zona: { select: { id: true, numero: true, nombre: true, localId: true } } },
    orderBy: { inicio: "desc" },
  });
  // Solo la sesión activa que pertenezca al inventario (mismo local).
  const inventario = await prisma.inventario.findUnique({ where: { id: inventarioId }, select: { localId: true } });
  const zonaActiva = sesionActiva && inventario && sesionActiva.zona.localId === inventario.localId
    ? { id: sesionActiva.zona.id, numero: sesionActiva.zona.numero, nombre: sesionActiva.zona.nombre }
    : null;

  const porZona = await prisma.escaneo.groupBy({
    by: ["zonaId"],
    where: { inventarioId, usuarioId },
    _sum: { cantidad: true },
    _count: { id: true },
    _min: { leidoEn: true },
    _max: { leidoEn: true },
  });
  const zonaIds = porZona.map((z) => z.zonaId);
  const zonasInfo = zonaIds.length
    ? await prisma.zona.findMany({ where: { id: { in: zonaIds } }, select: { id: true, numero: true, nombre: true } })
    : [];
  const zonaMap = new Map(zonasInfo.map((z) => [z.id, z]));
  const zonas = porZona.map((z) => ({
    zonaId: z.zonaId,
    zona: zonaMap.get(z.zonaId)?.numero ?? z.zonaId,
    zonaNombre: zonaMap.get(z.zonaId)?.nombre || `Zona ${zonaMap.get(z.zonaId)?.numero ?? z.zonaId}`,
    unidades: z._sum.cantidad || 0,
    lecturas: z._count.id || 0,
    primeraLectura: z._min.leidoEn,
    ultimaLectura: z._max.leidoEn,
  })).sort((a, b) => a.zona - b.zona);

  const porProducto = await prisma.escaneo.groupBy({
    by: ["inventarioProductoId"],
    where: { inventarioId, usuarioId },
    _sum: { cantidad: true },
    _count: { id: true },
    _min: { leidoEn: true },
    _max: { leidoEn: true },
  });
  const ipIds = porProducto.map((p) => p.inventarioProductoId);
  const ips = ipIds.length
    ? await prisma.inventarioProducto.findMany({
        where: { id: { in: ipIds } },
        include: { producto: { select: { codigoBarras: true, descripcion: true, item: true } } },
      })
    : [];
  const ipMap = new Map(ips.map((ip) => [ip.id, ip]));
  const productos = porProducto.map((p) => {
    const ip = ipMap.get(p.inventarioProductoId);
    return {
      codigoBarras: ip?.producto?.codigoBarras || "",
      descripcion: ip?.descripcion || ip?.producto?.descripcion || "",
      item: ip?.item || ip?.producto?.item || "",
      unidades: p._sum.cantidad || 0,
      lecturas: p._count.id || 0,
      primeraLectura: p._min.leidoEn,
      ultimaLectura: p._max.leidoEn,
    };
  }).sort((a, b) => b.unidades - a.unidades);

  return {
    usuario: { id: usuario.id, nombre: usuario.nombre, color: usuario.color, rol: usuario.rol },
    zonaActiva,
    zonas,
    productos,
    totales: {
      unidades: zonas.reduce((s, z) => s + z.unidades, 0),
      lecturas: zonas.reduce((s, z) => s + z.lecturas, 0),
      productosDistintos: productos.length,
    },
  };
}

// Listado completo (lectura por lectura) de un usuario en una zona específica.
// Incluye tanto los escaneos válidos como las novedades (N/A), ordenados por
// fecha de escaneo, con una posición unificada (1, 2, 3...) según el orden real.
export async function detalleUsuarioZona(inventarioId, usuarioId, zonaId) {
  const [escaneos, novedades] = await Promise.all([
    prisma.escaneo.findMany({
      where: { inventarioId, usuarioId, zonaId },
      orderBy: { leidoEn: "asc" },
      include: {
        inventarioProducto: {
          include: { producto: { select: { codigoBarras: true, descripcion: true, item: true } } },
        },
      },
    }),
    prisma.escaneoNovedad.findMany({
      where: { inventarioId, usuarioId, zonaId },
      orderBy: { leidoEn: "asc" },
    }),
  ]);

  const items = [
    ...escaneos.map((e) => {
      const ip = e.inventarioProducto;
      return {
        leidoEn: e.leidoEn,
        codigoBarras: ip?.producto?.codigoBarras || e.codigoLeido,
        descripcion: ip?.descripcion || ip?.producto?.descripcion || "",
        item: ip?.item || ip?.producto?.item || "",
        cantidad: e.cantidad,
        esNovedad: false,
      };
    }),
    ...novedades.map((n) => ({
      leidoEn: n.leidoEn,
      codigoBarras: n.codigoLeido,
      descripcion: n.descripcion || "N/A (no pertenece al inventario)",
      item: "",
      cantidad: 1,
      esNovedad: true,
    })),
  ].sort((a, b) => new Date(a.leidoEn) - new Date(b.leidoEn));

  return items.map((it, idx) => ({ posicion: idx + 1, ...it }));
}

export async function listarNovedades(inventarioId, zonaId = null, usuarioId = null) {
  const where = { inventarioId };
  if (zonaId) where.zonaId = zonaId;
  if (usuarioId) where.usuarioId = usuarioId;
  // Códigos que ahora sí pertenecen al maestro del inventario: sus novedades
  // (N/A) son obsoletas y se excluyen (y se limpian en BD).
  const productos = await prisma.inventarioProducto.findMany({
    where: { inventarioId },
    include: { producto: { select: { codigoBarras: true } } },
  });
  const codigosMaestro = new Set(productos.map((p) => p.producto.codigoBarras));
  const filas = await prisma.escaneoNovedad.findMany({
    where,
    orderBy: [{ zonaId: "asc" }, { leidoEn: "asc" }],
    include: {
      zona: { select: { id: true, numero: true, nombre: true } },
      usuario: { select: { id: true, nombre: true, color: true } },
    },
  });
  // Reconciliación perezosa: las novedades cuyo código ahora pertenece al maestro
  // se convierten en escaneos (para que cuenten como ya pitados), salvo que ya
  // exista un escaneo de ese código (evita duplicar).
  const obsoletas = filas.filter((f) => codigosMaestro.has(f.codigoLeido));
  for (const nov of obsoletas) {
    const prod = await prisma.producto.findUnique({ where: { codigoBarras: nov.codigoLeido } });
    const invProd = prod
      ? await prisma.inventarioProducto.findUnique({ where: { inventarioId_productoId: { inventarioId, productoId: prod.id } } }).catch(() => null)
      : null;
    if (invProd) {
      const yaConvertido = await prisma.escaneo.findFirst({ where: { inventarioId, codigoLeido: nov.codigoLeido, leidoEn: nov.leidoEn } });
      if (!yaConvertido) {
        await prisma.escaneo.create({
          data: {
            inventarioId,
            inventarioProductoId: invProd.id,
            usuarioId: nov.usuarioId,
            zonaId: nov.zonaId,
            codigoLeido: nov.codigoLeido,
            cantidad: 1,
            leidoEn: nov.leidoEn,
          },
        }).catch(() => {});
      }
    }
    await prisma.escaneoNovedad.delete({ where: { id: nov.id } }).catch(() => {});
  }
  const validas = filas.filter((f) => !codigosMaestro.has(f.codigoLeido));
  // Enriquecer la descripción desde el catálogo global si falta.
  const codigosSinDesc = validas.filter((f) => !f.descripcion).map((f) => f.codigoLeido);
  const productosGlobal = codigosSinDesc.length
    ? await prisma.producto.findMany({ where: { codigoBarras: { in: codigosSinDesc } }, select: { codigoBarras: true, descripcion: true, item: true } })
    : [];
  const globalMap = new Map(productosGlobal.map((p) => [p.codigoBarras, p]));
  return validas.map((f) => {
    const g = !f.descripcion ? globalMap.get(f.codigoLeido) : null;
    return {
    id: String(f.id),
    inventarioId: f.inventarioId,
    zonaId: f.zonaId,
    zona: f.zona.numero,
    zonaNombre: f.zona.nombre || `Zona ${f.zona.numero}`,
    usuario: f.usuario.nombre,
    usuarioColor: f.usuario.color,
    codigoBarras: f.codigoLeido,
    descripcion: f.descripcion || g?.descripcion || g?.item || "",
    posicion: f.posicion,
    leidoEn: f.leidoEn,
  };
});
}

export async function resumenMio(usuario, localIdParam) {
  const sesion = await prisma.sesionZona.findFirst({
    where: { usuarioId: usuario.id, estado: "ACTIVA" },
    include: { zona: true },
    orderBy: { inicio: "desc" },
  });
  // La zona activa se informa al panel del empleado para indicar dónde está contando.
  // Solo aplica si pertenece al local del contexto actual.
  const enContexto = sesion && (!localIdParam || sesion.zona.localId === localIdParam);
  const zonaActiva = enContexto
    ? { id: sesion.zona.id, numero: sesion.zona.numero, nombre: sesion.zona.nombre }
    : null;
  const localId = localIdParam || sesion?.zona?.localId || null;
  const inventario = await prisma.inventario.findFirst({
    where: localId ? { estado: "ACTIVO", localId } : { estado: "ACTIVO" },
    orderBy: { fechaInventario: "desc" },
  });
  const base = {
    zonaActiva,
    inventario: inventario ? { id: inventario.id, nombre: inventario.nombre } : null,
  };
  if (!inventario) return { ...base, unidades: 0, productosDistintos: 0 };

  // Un solo agregado en la base: unidades y referencias distintas del empleado
  // sin traer cada lectura al servidor.
  const [mio] = await prisma.$queryRaw`
    SELECT CAST(COALESCE(SUM(cantidad), 0) AS SIGNED) AS unidades,
           CAST(COUNT(DISTINCT inventarioProductoId) AS SIGNED) AS distintos
    FROM Escaneo
    WHERE inventarioId = ${inventario.id} AND usuarioId = ${usuario.id}`;

  return {
    ...base,
    unidades: Number(mio?.unidades || 0),
    productosDistintos: Number(mio?.distintos || 0),
  };
}
