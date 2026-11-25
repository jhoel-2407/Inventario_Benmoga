import ExcelJS from "exceljs";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import * as XLSX from "xlsx";

function errorConEstado(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

// ============================================================================
// Mapeo de columnas (maestros de cualquier tienda)
// ----------------------------------------------------------------------------
// Cada local puede traer un Excel con encabezados distintos. En vez de exigir
// nombres fijos, se reconocen por sinónimos + heurística del contenido y, si no
// hay certeza, el usuario confirma el mapeo desde la web. El mapeo se guarda por
// local para que las siguientes importaciones sean automáticas.
// ============================================================================

function normalizar(v) {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Los maestros traen encabezados como "Desc. item", "Cód. Barras 3",
    // "DESCRIP_CORTA" o "Código\nAlterno". Se ignoran puntuación y saltos de
    // línea para que todos esos formatos caigan en el mismo sinónimo.
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

// Campo interno -> encabezados típicos (se comparan ya normalizados).
const SINONIMOS = {
  // El orden importa: primero los encabezados más específicos. En los maestros
  // MIC/Movies vienen "Cód. Barras", "Cód. Barras 2" y "Cód. Barras 3"; la
  // tercera es el código de barras real, por eso va antes que "cod barras".
  codigo: [
    "cod barras 3", "codigo de barras", "codigo de barra", "codigo barra",
    "codigo barras", "codigo barra articulo", "codigo alterno", "cod alterno",
    "plu", "barcode", "ean", "upc", "cod barras", "barras",
    "codigo de barras ean", "codigo ean", "codigo de barra ean",
  ],
  item: [
    "item", "referencia", "referencia producto", "ref producto", "ref",
    "referencia item", "codigo articulo", "codigo de articulo", "cod articulo",
    "codigo producto", "codigo de producto", "cod producto", "articulo",
    "sku", "codigo interno", "id articulo",
  ],
  desc: [
    "desc item", "descripcion", "descripcion item", "descripcion producto",
    "desc producto", "nombre articulo", "nombre del articulo", "nombre producto",
    "nombre", "producto", "detalle", "detalle producto", "descripcion articulo",
    "descrip corta", "descripcion corta", "desc corta",
  ],
  existencia: [
    "existencia", "existencia fisica", "fisica", "fisico", "cantidad",
    "cantidad disponible", "cant disponible", "disponibles", "disponible",
    "stock", "unidades", "unidades disponibles", "saldo", "cant", "exist",
    "inventario", "total existencia",
  ],
  estilo: [
    "estilo", "linea", "linea producto", "familia", "estilo linea",
    "tipo", "tipos de prenda", "id linea", "categoria",
  ],
  referencia: ["referencia", "referencia producto", "ref producto", "ref"],
  genero: ["genero", "sexo", "subfamilia"],
  subgrupo: [
    "departamento", "marca", "subfamilia", "sub grupo", "subgrupo", "grupo",
    "categorias", "categoria", "segmento",
  ],
  // Detalle genérico: distintas marcas lo llaman distinto.
  //   - Americanino/Brandstore/Esprit/MIC/Movies: "Talla" + "Color".
  //   - Tennis: "Talla" + "GDI_LIBELLE_1" (allí esa columna es el color).
  //   - Levis/Superdry: "Detalle ext. 1" (color) + "Desc. detalle ext. 2" (talla).
  //   - Pilatos/Polito: mismo esquema, a veces sin "Desc.".
  // Para que la talla quede siempre en detalle1, se buscan primero "Talla" y
  // "detalle ext. 2"; el color se busca en "Color" y "detalle ext. 1".
  detalle1: [
    "talla", "talla 1", "talla medida", "medida", "size",
    "desc detalle ext 2", "detalle ext 2", "detalle 2",
    "desc detalle ext 1", "detalle ext 1", "detalle 1",
  ],
  detalle2: [
    "color", "colour", "desc color", "descripcion color", "color desc",
    "desc detalle ext 1", "detalle ext 1", "detalle 1",
    "gdi libelle 1",
  ],
};

const CAMPOS_MAPEO = [
  "codigo", "item", "desc", "existencia",
  "estilo", "referencia", "genero", "subgrupo", "detalle1", "detalle2",
];

// Campos mínimos para poder importar.
function camposObligatorios(modoStock) {
  if (modoStock) {
    return [
      ["codigo", "Código de barras (lo que lee el escáner)"],
      ["existencia", "Stock / Existencia"],
    ];
  }
  return [
    ["codigo", "Código de barras (lo que lee el escáner)"],
    ["item", "Referencia / Item"],
    ["existencia", "Existencia"],
  ];
}

function proporcion(valores, regex) {
  const v = valores.filter((x) => x != null && String(x).trim() !== "");
  if (!v.length) return 0;
  return v.filter((x) => regex.test(String(x).trim())).length / v.length;
}
const pareceBarras = (valores) => proporcion(valores, /^\d{8,14}$/);
const pareceEntero = (valores) => proporcion(valores, /^-?\d{1,6}$/);

// Arma la respuesta con la que la web pide confirmar el mapeo de columnas.
function construirMapeo(encabezados, muestra, sug) {
  return {
    motivo: sug.faltantes.length ? "faltantes" : "ambiguo",
    ambiguo: !!sug.ambiguo,
    columnas: encabezados.map(({ col, etiqueta }) => ({
      etiqueta,
      col,
      muestras: muestra
        .map((f) => f[col])
        .filter((v) => v != null && String(v) !== "")
        .slice(0, 3),
    })),
    sugerencia: sug.mapeo,
    faltantes: sug.faltantes,
  };
}

// Propone un mapeo (etiqueta de encabezado por campo) usando sinónimos y el
// contenido de la muestra. Devuelve también los campos obligatorios sin asignar
// y si hay ambigüedad en el código de barras.
function sugerirMapeo(encabezados, muestra, modoStock = false) {
  const porNorm = new Map();
  for (const { col, etiqueta } of encabezados)
    porNorm.set(normalizar(etiqueta), { col, etiqueta });
  const valores = (etiqueta) => {
    const hit = porNorm.get(normalizar(etiqueta));
    return hit ? muestra.map((f) => f[hit.col]) : [];
  };
  const buscar = (campo) => {
    for (const nombre of SINONIMOS[campo] || []) {
      const hit = porNorm.get(normalizar(nombre));
      if (hit) return hit.etiqueta;
    }
    return null;
  };
  const mapeo = {};
  for (const campo of CAMPOS_MAPEO) mapeo[campo] = buscar(campo);

  // Mejor candidato a código de barras por el contenido.
  let mejorBarras = { etiqueta: null, p: 0 };
  for (const { etiqueta } of encabezados) {
    const p = pareceBarras(valores(etiqueta));
    if (p > mejorBarras.p) mejorBarras = { etiqueta, p };
  }

  let ambiguo = false;
  if (!mapeo.codigo) {
    if (mejorBarras.p >= 0.5) mapeo.codigo = mejorBarras.etiqueta;
  } else if (
    mejorBarras.etiqueta &&
    normalizar(mejorBarras.etiqueta) !== normalizar(mapeo.codigo)
  ) {
    const pActual = pareceBarras(valores(mapeo.codigo));
    if (pActual < 0.5 && mejorBarras.p >= 0.7) {
      mapeo.codigo = mejorBarras.etiqueta;
      // Si la columna elegida por sinónimo no tenía prácticamente códigos de
      // barras, el cambio es evidente y no hace falta pedir confirmación.
      ambiguo = pActual >= 0.2;
    }
  }

  // El item (referencia) no puede ser la misma columna que el código.
  if (mapeo.item && mapeo.codigo && normalizar(mapeo.item) === normalizar(mapeo.codigo)) {
    const alt = (SINONIMOS.item || [])
      .map((n) => porNorm.get(normalizar(n))?.etiqueta)
      .find((e) => e && normalizar(e) !== normalizar(mapeo.codigo));
    mapeo.item = alt || null;
  }

  // Existencia por contenido si no se detectó por sinónimos.
  if (!mapeo.existencia) {
    let mejor = { etiqueta: null, p: 0 };
    for (const { etiqueta } of encabezados) {
      const n = normalizar(etiqueta);
      if (n === normalizar(mapeo.codigo || "") || n === normalizar(mapeo.item || ""))
        continue;
      const p = pareceEntero(valores(etiqueta));
      if (p > mejor.p) mejor = { etiqueta, p };
    }
    if (mejor.p >= 0.6) mapeo.existencia = mejor.etiqueta;
  }

  const faltantes = camposObligatorios(modoStock).filter(([k]) => !mapeo[k]).map(([, n]) => n);
  return { mapeo, faltantes, ambiguo };
}

// Convierte un mapeo por etiquetas a índices de columna del archivo actual.
function resolverColumnas(encabezados, mapeo, modoStock = false) {
  const porNorm = new Map();
  for (const { col, etiqueta } of encabezados) porNorm.set(normalizar(etiqueta), col);
  const columnas = {};
  for (const campo of CAMPOS_MAPEO) {
    const etq = mapeo?.[campo];
    columnas[campo] = etq ? porNorm.get(normalizar(etq)) || null : null;
  }
  const faltantes = camposObligatorios(modoStock).filter(([k]) => !columnas[k]).map(([, n]) => n);
  return { columnas, faltantes };
}

// Lee el Excel maestro y decide el mapeo de columnas: el enviado por la web >
// el guardado del local > automático. Se carga el libro en memoria porque el
// lector en streaming de ExcelJS tiene una condición de carrera que hacía fallar
// la importación de forma intermitente.
// Convierte un archivo .xls (formato antiguo) a .xlsx en memoria, para que el
// resto del sistema (que solo entiende .xlsx) pueda procesarlo.
export function normalizarArchivoExcel(archivo) {
  if (!archivo || !archivo.name) return archivo;
  if (/\.xlsx$/i.test(archivo.name)) return archivo;
  if (!/\.xls$/i.test(archivo.name)) return archivo;
  const wb = XLSX.read(archivo.data, { type: "buffer" });
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  return { ...archivo, name: archivo.name.replace(/\.xls$/i, ".xlsx"), data: buf };
}

export async function procesarImportacion(archivo, { mapeoExplicito = null, perfil = null, modoStock = false } = {}) {
  const { leerHojaInventario } = await import("../lib/xlsxSimple.js");
  const parsed = await leerHojaInventario(archivo.data);
  if (parsed.tipo === "sin_hoja") return parsed;

  const { hojas, rows } = parsed;
  // encabezados desde la fila 1
  const headerRow = rows[0] || [];
  const encabezados = [];
  headerRow.forEach((val, idx) => {
    const etiqueta = String(val ?? "").trim();
    if (etiqueta) encabezados.push({ col: idx + 1, etiqueta });
  });
  if (!encabezados.length) return { tipo: "sin_hoja", hojas };

  // muestra: primeras 12 filas con datos
  const muestra = [];
  const LIMITE = 12;
  for (let i = 1; i < rows.length && muestra.length < LIMITE; i++) {
    const r = rows[i];
    const v = {};
    for (const { col } of encabezados) v[col] = r[col - 1] ?? "";
    const tieneDatos = Object.values(v).some((x) => x !== null && x !== undefined && String(x).trim() !== "");
    if (tieneDatos) muestra.push(v);
  }

  // Decide el mapeo.
  let decision = null;
  let origen = null;
  if (mapeoExplicito) {
    const r = resolverColumnas(encabezados, mapeoExplicito, modoStock);
    if (r.faltantes.length) {
      return {
        tipo: "mapeo",
        hojas,
        motivo: "mapeo_incompleto",
        ambiguo: false,
        columnas: encabezados.map(({ col, etiqueta }) => ({ etiqueta, col, muestras: [] })),
        sugerencia: mapeoExplicito,
        faltantes: r.faltantes,
      };
    }
    decision = { columnas: r.columnas, mapeo: mapeoExplicito, guardar: true };
    origen = "explicito";
  } else if (perfil) {
    const sug = sugerirMapeo(encabezados, muestra, modoStock);
    const completado = { ...perfil };
    let agrego = false;
    for (const campo of CAMPOS_MAPEO) {
      const actual = completado[campo];
      const vacio = actual === undefined || actual === null || String(actual).trim() === "";
      if (vacio && sug.mapeo[campo]) { completado[campo] = sug.mapeo[campo]; agrego = true; }
    }
    const antes = resolverColumnas(encabezados, completado, modoStock);
    for (const campo of CAMPOS_MAPEO) {
      if (antes.columnas[campo] == null && sug.mapeo[campo] && completado[campo] !== sug.mapeo[campo]) {
        completado[campo] = sug.mapeo[campo]; agrego = true;
      }
    }
    const r = resolverColumnas(encabezados, completado, modoStock);
    if (!r.faltantes.length) {
      decision = { columnas: r.columnas, mapeo: completado, guardar: agrego };
      origen = "perfil";
    }
  }
  if (!decision) {
    const sug = sugerirMapeo(encabezados, muestra, modoStock);
    if (sug.faltantes.length || sug.ambiguo) {
      return { tipo: "mapeo", hojas, ...construirMapeo(encabezados, muestra, sug) };
    }
    decision = {
      columnas: resolverColumnas(encabezados, sug.mapeo, modoStock).columnas,
      mapeo: sug.mapeo,
      guardar: true,
    };
    origen = "auto";
  }

  // Procesa todas las filas.
  const agrupados = new Map();
  const errores = [];
  let filasLeidas = 0;
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const valores = {};
    for (const { col } of encabezados) valores[col] = row[col - 1] ?? "";
    // also fill any columnas cols
    for (const col of Object.values(decision.columnas)) {
      if (col != null && valores[col] === undefined) valores[col] = "";
    }
    const rawCodigo = decision.columnas.codigo != null ? valores[decision.columnas.codigo] : undefined;
    if (rawCodigo === null || rawCodigo === undefined || String(rawCodigo).trim() === "") continue;
    filasLeidas++;
    const codigoBarras = String(rawCodigo).trim().replace(/\.0$/, "");
    const existencia = Number(valores[decision.columnas.existencia] ?? 0);
    const texto = (col) => {
      const raw = col ? valores[col] : null;
      return raw === null || raw === undefined || String(raw).trim() === "" ? null : String(raw).trim();
    };
    if (!/^\d{4,20}$/.test(codigoBarras)) {
      errores.push({ fila: i + 1, codigo: String(rawCodigo).trim().slice(0, 40), error: "Código no válido (se esperaba un número de 4 a 20 dígitos)" });
      continue;
    }
    if (!Number.isFinite(existencia) || !Number.isInteger(existencia)) {
      errores.push({ fila: i + 1, codigo: codigoBarras, error: `Existencia no válida: "${String(valores[decision.columnas.existencia] ?? "").trim().slice(0, 40)}" (debe ser un número entero)` });
      continue;
    }
    const fila = {
      codigoBarras,
      item: texto(decision.columnas.item) || (modoStock ? codigoBarras : null),
      descripcion: texto(decision.columnas.desc),
      detalle1: texto(decision.columnas.detalle1),
      detalle2: texto(decision.columnas.detalle2),
      genero: texto(decision.columnas.genero),
      estilo: texto(decision.columnas.estilo),
      referencia: texto(decision.columnas.referencia) || texto(decision.columnas.item) || texto(decision.columnas.estilo) || null,
      subGrupo: texto(decision.columnas.subgrupo),
      existenciaInicial: existencia,
    };
    const prev = agrupados.get(codigoBarras);
    if (prev) {
      prev.existenciaInicial += existencia;
      for (const k of ["item", "descripcion", "detalle1", "detalle2", "genero", "estilo", "referencia", "subGrupo"])
        if (!prev[k] && fila[k]) prev[k] = fila[k];
    } else agrupados.set(codigoBarras, fila);
  }

  // Autocorrección: si el mapeo guardado no produjo filas, reintentar con auto.
  if (!agrupados.size && origen === "perfil") {
    const sug = sugerirMapeo(encabezados, muestra, modoStock);
    if (sug.faltantes.length || sug.ambiguo) {
      return { tipo: "mapeo", hojas, ...construirMapeo(encabezados, muestra, sug) };
    }
    decision = {
      columnas: resolverColumnas(encabezados, sug.mapeo, modoStock).columnas,
      mapeo: sug.mapeo,
      guardar: true,
    };
    // reprocess with new columns
    agrupados.clear(); errores.length = 0; filasLeidas = 0;
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const valores = {};
      for (const { col } of encabezados) valores[col] = row[col - 1] ?? "";
      for (const col of Object.values(decision.columnas)) {
        if (col != null && valores[col] === undefined) valores[col] = "";
      }
      const rawCodigo = decision.columnas.codigo != null ? valores[decision.columnas.codigo] : undefined;
      if (rawCodigo === null || rawCodigo === undefined || String(rawCodigo).trim() === "") continue;
      filasLeidas++;
      const codigoBarras = String(rawCodigo).trim().replace(/\.0$/, "");
      const existencia = Number(valores[decision.columnas.existencia] ?? 0);
      const texto = (col) => {
        const raw = col ? valores[col] : null;
        return raw === null || raw === undefined || String(raw).trim() === "" ? null : String(raw).trim();
      };
      if (!/^\d{4,20}$/.test(codigoBarras)) {
        errores.push({ fila: i + 1, codigo: String(rawCodigo).trim().slice(0, 40), error: "Código no válido (se esperaba un número de 4 a 20 dígitos)" });
        continue;
      }
      if (!Number.isFinite(existencia) || !Number.isInteger(existencia)) {
        errores.push({ fila: i + 1, codigo: codigoBarras, error: `Existencia no válida: "${String(valores[decision.columnas.existencia] ?? "").trim().slice(0, 40)}" (debe ser un número entero)` });
        continue;
      }
      const fila = {
        codigoBarras,
        item: texto(decision.columnas.item) || (modoStock ? codigoBarras : null),
        descripcion: texto(decision.columnas.desc),
        detalle1: texto(decision.columnas.detalle1),
        detalle2: texto(decision.columnas.detalle2),
        genero: texto(decision.columnas.genero),
        estilo: texto(decision.columnas.estilo),
        referencia: texto(decision.columnas.referencia) || texto(decision.columnas.item) || texto(decision.columnas.estilo) || null,
        subGrupo: texto(decision.columnas.subgrupo),
        existenciaInicial: existencia,
      };
      const prev = agrupados.get(codigoBarras);
      if (prev) {
        prev.existenciaInicial += existencia;
        for (const k of ["item", "descripcion", "detalle1", "detalle2", "genero", "estilo", "referencia", "subGrupo"])
          if (!prev[k] && fila[k]) prev[k] = fila[k];
      } else agrupados.set(codigoBarras, fila);
    }
  }

  return {
    tipo: "datos",
    hojas,
    agrupados,
    errores,
    filasLeidas,
    mapeo: decision.mapeo,
    guardarPerfil: !!decision.guardar,
  };
}

export function perfilDeLocal(local) {
  if (typeof local.perfilColumnas === "string") {
    try {
      return JSON.parse(local.perfilColumnas);
    } catch {
      return null;
    }
  }
  return local.perfilColumnas || null;
}

// Crea los productos nuevos en el catálogo global (Producto) y rellena los
// campos descriptivos que estén vacíos en los ya existentes, sin sobrescribir
// nada. Devuelve el mapa código de barras -> id de producto.
export async function asegurarProductos(productos) {
  for (let i = 0; i < productos.length; i += 400) {
    const lote = productos.slice(i, i + 400);
    await prisma.producto.createMany({
      data: lote.map(({ existenciaInicial, ...p }) => p),
      skipDuplicates: true,
    });
  }
  const CAMPOS_DESCRIPTIVOS = [
    "item", "descripcion", "detalle1", "detalle2",
    "genero", "estilo", "referencia", "subGrupo",
  ];
  const idsPorCodigo = new Map();
  const pendientes = [];
  for (let i = 0; i < productos.length; i += 400) {
    const lote = productos.slice(i, i + 400);
    const porCodigo = new Map(lote.map((p) => [p.codigoBarras, p]));
    const existentes = await prisma.producto.findMany({
      where: { codigoBarras: { in: lote.map((p) => p.codigoBarras) } },
    });
    for (const prod of existentes) {
      idsPorCodigo.set(prod.codigoBarras, prod.id);
      const nuevo = porCodigo.get(prod.codigoBarras);
      if (!nuevo) continue;
      const data = {};
      for (const campo of CAMPOS_DESCRIPTIVOS)
        if (!prod[campo] && nuevo[campo]) data[campo] = nuevo[campo];
      if (Object.keys(data).length) pendientes.push({ id: prod.id, data });
    }
  }
  for (let i = 0; i < pendientes.length; i += 40) {
    await Promise.all(
      pendientes
        .slice(i, i + 40)
        .map((u) => prisma.producto.update({ where: { id: u.id }, data: u.data })),
    );
  }
  return idsPorCodigo;
}

// Importación por lotes: evita miles de upserts individuales dentro de una
// transacción. Devuelve un resultado con el tipo de respuesta que debe enviar
// el controlador (sin_hoja, mapeo, sin_filas u ok).
export async function importarInventario({ archivo, localId, mapeo, nombre, usuarioId }) {
  const local = await prisma.local.findUnique({ where: { id: localId } });
  if (!local) throw errorConEstado("El local indicado no existe.", 404);

  // 1) Mapeo de columnas: el enviado por la web > el guardado del local > automático.
  let mapeoExplicito = null;
  if (mapeo) {
    try {
      mapeoExplicito = typeof mapeo === "string" ? JSON.parse(mapeo) : mapeo;
    } catch {
      throw errorConEstado("El mapeo de columnas no es válido.", 400);
    }
  }
  const perfil = perfilDeLocal(local);

  // 2) Leer el Excel una sola vez, decidiendo el mapeo e importando las filas.
  const resultado = await procesarImportacion(archivo, { mapeoExplicito, perfil });

  if (resultado.tipo === "sin_hoja") return resultado;
  if (resultado.tipo === "mapeo") return resultado;

  const { agrupados, errores, filasLeidas, mapeo: mapeoUsado, guardarPerfil } = resultado;

  // 3) Guardar el perfil de columnas del local para próximas importaciones.
  if (guardarPerfil && mapeoUsado)
    await prisma.local
      .update({ where: { id: local.id }, data: { perfilColumnas: mapeoUsado } })
      .catch(() => {});

  if (!agrupados.size) return { tipo: "sin_filas", errores };

  const nombreFinal = z
    .string()
    .min(3)
    .max(180)
    .parse(
      String(
        nombre ||
          `Inventario ${local.nombre} ${new Date().toLocaleDateString("sv-SE")}`,
      ),
    );

  const productos = [...agrupados.values()];
  const inventario = await prisma.inventario.create({
    data: {
      nombre: nombreFinal,
      localId: local.id,
      archivoOrigen: archivo.name,
      creadoPorId: usuarioId,
      estado: "BORRADOR",
    },
  });
  try {
    const idsPorCodigo = await asegurarProductos(productos);
    const relaciones = productos
      .map((p) => ({
        inventarioId: inventario.id,
        productoId: idsPorCodigo.get(p.codigoBarras),
        existenciaInicial: p.existenciaInicial,
        // Copia exacta del maestro para este inventario. Así cada tienda
        // conserva su propia talla/color/descripción aunque el código de barras
        // se repita con otra marca en el catálogo global.
        item: p.item,
        descripcion: p.descripcion,
        detalle1: p.detalle1,
        detalle2: p.detalle2,
        genero: p.genero,
        estilo: p.estilo,
        referencia: p.referencia,
        subGrupo: p.subGrupo,
        descriptoresCargados: true,
      }))
      .filter((p) => p.productoId);
    for (let i = 0; i < relaciones.length; i += 500) {
      await prisma.inventarioProducto.createMany({
        data: relaciones.slice(i, i + 500),
        skipDuplicates: true,
      });
    }
  } catch (error) {
    await prisma.inventario
      .delete({ where: { id: inventario.id } })
      .catch(() => {});
    throw error;
  }

  return {
    tipo: "ok",
    inventario: {
      id: inventario.id,
      nombre: inventario.nombre,
      estado: inventario.estado,
      local: { id: local.id, nombre: local.nombre },
    },
    filasLeidas,
    productosImportados: productos.length,
    codigosAgrupados: filasLeidas - productos.length,
    totalErrores: errores.length,
    errores: errores.slice(0, 50),
    mapeoUsado,
  };
}
