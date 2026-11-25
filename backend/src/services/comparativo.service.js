import { prisma } from "../lib/prisma.js";

// Comparativo producto a producto en una sola consulta.
// Evita los dos problemas que hacían lento el reporte con Prisma:
//   1) cargar todos los escaneos con un IN (…miles de ids…)
//   2) ordenar por una columna de una tabla relacionada (JOIN + filesort)
export async function comparativoDeInventario(inventarioId) {
  return prisma.$queryRaw`
    SELECT p.codigoBarras AS codigoBarras,
           CASE WHEN ip.descriptoresCargados THEN ip.item
                ELSE p.item END AS item,
           CASE WHEN ip.descriptoresCargados THEN ip.descripcion
                ELSE p.descripcion END AS descripcion,
           CASE WHEN ip.descriptoresCargados THEN ip.genero
                ELSE p.genero END AS genero,
           CASE WHEN ip.descriptoresCargados THEN ip.estilo
                ELSE p.estilo END AS estilo,
           CASE WHEN ip.descriptoresCargados
                THEN COALESCE(NULLIF(ip.referencia,''), NULLIF(ip.item,''), NULLIF(ip.estilo,''), '')
                ELSE COALESCE(NULLIF(p.referencia,''), NULLIF(p.item,''), NULLIF(p.estilo,''), '')
           END AS referencia,
           CASE WHEN ip.descriptoresCargados THEN ip.detalle1
                ELSE p.detalle1 END AS detalle1,
           CASE WHEN ip.descriptoresCargados THEN ip.detalle2
                ELSE p.detalle2 END AS detalle2,
           ip.existenciaInicial AS existenciaInicial,
           CAST((SELECT COALESCE(SUM(e.cantidad), 0)
                 FROM Escaneo e
                 WHERE e.inventarioProductoId = ip.id) AS SIGNED) AS contado
    FROM InventarioProducto ip
    JOIN Producto p ON p.id = ip.productoId
    WHERE ip.inventarioId = ${inventarioId}
    ORDER BY p.codigoBarras ASC
  `;
}

// Clasifica el resultado de un producto frente al maestro.
// Los productos con stock 0 en el maestro no se consideran "sin conteo": si no
// se escanean se dan por OK (0 = 0) y solo cuentan como sobrante si aparecen.
// Así el conteo y las diferencias se basan en la cantidad que sí existe.
export function estadoDeProducto(contado, existencia) {
  const stockMaestro = Number(existencia) || 0;
  if (stockMaestro === 0) {
    return contado > 0 ? "SOBRANTE" : "OK";
  }
  if (contado === 0) return "SIN CONTEO";
  if (contado < existencia) return "FALTANTE";
  if (contado > existencia) return "SOBRANTE";
  return "OK";
}

// Consolida todas las lecturas (todos los usuarios y zonas) y arma el resumen.
export function resumirComparativo(filas) {
  let unidadesMaestro = 0;
  let unidadesContadas = 0;
  let faltantes = 0;
  let sobrantes = 0;
  let sinConteo = 0;
  let ok = 0;
  let conConteo = 0;
  const productos = filas.map((f) => {
    const existencia = Number(f.existenciaInicial) || 0;
    const contado = Number(f.contado) || 0;
    const diferencia = contado - existencia;
    const estado = estadoDeProducto(contado, existencia);
    if (contado > 0) conConteo++;
    if (estado === "FALTANTE") faltantes++;
    else if (estado === "SOBRANTE") sobrantes++;
    else if (estado === "SIN CONTEO") sinConteo++;
    else ok++;
    unidadesMaestro += existencia;
    unidadesContadas += contado;
    return {
      codigoBarras: f.codigoBarras,
      item: f.item || "",
      descripcion: f.descripcion || "",
      genero: f.genero || "",
      estilo: f.estilo || "",
      referencia: f.referencia || "",
      detalle1: f.detalle1 || "",
      detalle2: f.detalle2 || "",
      existencia,
      contado,
      diferencia,
      estado,
    };
  });
  return {
    productos,
    resumen: {
      productosMaestro: productos.length,
      productosConConteo: conConteo,
      unidadesMaestro,
      unidadesContadas,
      faltantes,
      sobrantes,
      sinConteo,
      ok,
    },
  };
}

// Comparativo agrupado por referencia tal cual viene en el maestro.
// El contado se calcula con subconsulta (como el comparativo por código) para NO
// multiplicar la existencia del maestro por cada lectura. Antes se usaba un
// LEFT JOIN Escaneo y SUM(ip.existenciaInicial), que inflaba la existencia
// (un producto con 4 lecturas contaba su existencia 4 veces).
export async function comparativoPorReferencia(inventarioId) {
  return prisma.$queryRaw`
    SELECT ref                            AS referencia,
           MAX(descripcion)               AS descripcion,
           MAX(estilo)                    AS estilo,
           COUNT(*)                       AS productos,
           CAST(SUM(existencia) AS SIGNED) AS existenciaInicial,
           CAST(SUM(contado)   AS SIGNED) AS contado
    FROM (
      SELECT CASE WHEN ip.descriptoresCargados
                  THEN TRIM(COALESCE(NULLIF(ip.referencia,''), NULLIF(ip.item,''), NULLIF(ip.estilo,''), 'SIN REFERENCIA'))
                  ELSE TRIM(COALESCE(NULLIF(p.referencia,''), NULLIF(p.item,''), NULLIF(p.estilo,''), 'SIN REFERENCIA'))
             END AS ref,
             CASE WHEN ip.descriptoresCargados THEN ip.descripcion
                  ELSE p.descripcion END AS descripcion,
             CASE WHEN ip.descriptoresCargados THEN ip.estilo
                  ELSE p.estilo END AS estilo,
             ip.existenciaInicial AS existencia,
             (SELECT COALESCE(SUM(e.cantidad), 0)
              FROM Escaneo e
              WHERE e.inventarioProductoId = ip.id) AS contado
      FROM InventarioProducto ip
      JOIN Producto p ON p.id = ip.productoId
      WHERE ip.inventarioId = ${inventarioId}
    ) t
    GROUP BY ref
    ORDER BY ref ASC
  `;
}

// Resumir filas agrupadas por referencia
export function resumirComparativoPorReferencia(filasRef) {
  let unidadesMaestro = 0;
  let unidadesContadas = 0;
  let faltantes = 0;
  let sobrantes = 0;
  let sinConteo = 0;
  let ok = 0;
  let conConteo = 0;

  const productosPorReferencia = filasRef.map((f) => {
    const existencia = Number(f.existenciaInicial) || 0;
    const contado = Number(f.contado) || 0;
    const diferencia = contado - existencia;
    const estado = estadoDeProducto(contado, existencia);
    if (contado > 0) conConteo++;
    if (estado === "FALTANTE") faltantes++;
    else if (estado === "SOBRANTE") sobrantes++;
    else if (estado === "SIN CONTEO") sinConteo++;
    else ok++;
    unidadesMaestro += existencia;
    unidadesContadas += contado;
    return {
      referencia: f.referencia || "",
      descripcion: f.descripcion || "",
      estilo: f.estilo || "",
      productos: Number(f.productos) || 0,
      existencia,
      contado,
      diferencia,
      estado,
    };
  });

  return {
    productosPorReferencia,
    resumenPorReferencia: {
      productosMaestro: productosPorReferencia.length,
      productosConConteo: conConteo,
      unidadesMaestro,
      unidadesContadas,
      faltantes,
      sobrantes,
      sinConteo,
      ok,
    },
  };
}

// Cruce referencia x zona: en qué zonas se contó cada referencia y cuántas
// unidades en cada una. Usa la misma clave de referencia que el comparativo.
export async function conteoReferenciaPorZona(inventarioId) {
  return prisma.$queryRaw`
    SELECT
      CASE WHEN ip.descriptoresCargados
           THEN TRIM(COALESCE(NULLIF(ip.referencia,''), NULLIF(ip.item,''), NULLIF(ip.estilo,''), 'SIN REFERENCIA'))
           ELSE TRIM(COALESCE(NULLIF(p.referencia,''), NULLIF(p.item,''), NULLIF(p.estilo,''), 'SIN REFERENCIA'))
      END AS ref,
      z.id     AS zonaId,
      z.numero AS zonaNumero,
      CAST(COALESCE(SUM(e.cantidad), 0) AS SIGNED) AS contado
    FROM Escaneo e
    JOIN InventarioProducto ip ON ip.id = e.inventarioProductoId
    JOIN Producto p ON p.id = ip.productoId
    JOIN Zona z ON z.id = e.zonaId
    WHERE e.inventarioId = ${inventarioId}
    GROUP BY ref, z.id, z.numero
    ORDER BY z.numero ASC
  `;
}

// Versión ampliada para el Excel: incluye nombre de zona y descripción/estilo
// de la referencia.
export async function detalleReferenciaPorZona(inventarioId) {
  return prisma.$queryRaw`
    SELECT
      CASE WHEN ip.descriptoresCargados
           THEN TRIM(COALESCE(NULLIF(ip.referencia,''), NULLIF(ip.item,''), NULLIF(ip.estilo,''), 'SIN REFERENCIA'))
           ELSE TRIM(COALESCE(NULLIF(p.referencia,''), NULLIF(p.item,''), NULLIF(p.estilo,''), 'SIN REFERENCIA'))
      END AS ref,
      MAX(CASE WHEN ip.descriptoresCargados THEN ip.descripcion
               ELSE p.descripcion END) AS descripcion,
      MAX(CASE WHEN ip.descriptoresCargados THEN ip.estilo
               ELSE p.estilo END) AS estilo,
      z.id AS zonaId,
      z.numero AS zonaNumero,
      z.nombre AS zonaNombre,
      CAST(COALESCE(SUM(e.cantidad), 0) AS SIGNED) AS contado
    FROM Escaneo e
    JOIN InventarioProducto ip ON ip.id = e.inventarioProductoId
    JOIN Producto p ON p.id = ip.productoId
    JOIN Zona z ON z.id = e.zonaId
    WHERE e.inventarioId = ${inventarioId}
    GROUP BY ref, z.id, z.numero, z.nombre
    ORDER BY ref ASC, z.numero ASC
  `;
}
