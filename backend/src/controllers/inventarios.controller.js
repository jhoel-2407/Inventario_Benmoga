import {
  activarInventario,
  eliminarInventario,
  impactoInventario,
  listarInventarios,
  obtenerComparativoActivo,
} from "../services/inventarios.service.js";
import { importarInventario, normalizarArchivoExcel } from "../services/importacion.service.js";
import { convertirStockAMaestra } from "../services/stock-converter.service.js";
import { actualizarMaestroInventario, reiniciarEscaneosInventario } from "../services/inventarios.service.js";
import { generarReporteCsv, generarReporteExcel } from "../services/reportes.service.js";

export async function listar(req, res, next) {
  try {
    const localId = req.query.localId ? Number(req.query.localId) : null;
    if (localId !== null && (!Number.isInteger(localId) || localId <= 0))
      return res.status(400).json({ error: "localId invalido." });
    res.json({ inventarios: await listarInventarios(localId) });
  } catch (error) { next(error); }
}

export async function comparativo(req, res, next) {
  try {
    const localId = req.query.localId ? Number(req.query.localId) : null;
    if (localId !== null && (!Number.isInteger(localId) || localId <= 0))
      return res.status(400).json({ error: "localId invalido." });
    res.json(await obtenerComparativoActivo(localId));
  } catch (error) { next(error); }
}

export async function importar(req, res, next) {
  try {
    if (!req.files?.archivo)
      return res.status(400).json({ error: "Adjunta el Excel en el campo 'archivo'." });

    let archivo = req.files.archivo;
    if (!/\.xlsx$/i.test(archivo.name) && !/\.xls$/i.test(archivo.name))
      return res.status(400).json({ error: "El archivo debe tener extensión .xls o .xlsx." });
    archivo = normalizarArchivoExcel(archivo);

    const localId = Number(req.body?.localId);
    if (!Number.isInteger(localId) || localId <= 0)
      return res
        .status(400)
        .json({ error: "Selecciona el local al que pertenece este inventario." });

    const resultado = await importarInventario({
      archivo,
      localId,
      mapeo: req.body?.mapeo,
      nombre: req.body?.nombre,
      usuarioId: req.usuario.id,
    });

    if (resultado.tipo === "sin_hoja")
      return res.status(400).json({
        error:
          "No se encontró la hoja INVENTARIO. " +
          `Hojas del archivo: ${resultado.hojas.length ? resultado.hojas.join(" | ") : "(ninguna)"}. ` +
          "Renombra la hoja con los datos a INVENTARIO e inténtalo de nuevo.",
        hojasDetectadas: resultado.hojas,
      });

    if (resultado.tipo === "mapeo")
      return res.status(200).json({
        requiereMapeo: true,
        motivo: resultado.motivo,
        ambiguo: resultado.ambiguo,
        hoja: "INVENTARIO",
        hojas: resultado.hojas,
        columnas: resultado.columnas,
        sugerencia: resultado.sugerencia || {},
        faltantes: resultado.faltantes || [],
      });

    if (resultado.tipo === "sin_filas")
      return res.status(400).json({
        error: "No se encontraron filas válidas con el mapeo indicado.",
        errores: resultado.errores.slice(0, 50),
      });

    res.status(201).json({
      mensaje:
        "Excel importado por lotes. El inventario queda en BORRADOR para revisión antes de activarlo.",
      inventario: resultado.inventario,
      filasLeidas: resultado.filasLeidas,
      productosImportados: resultado.productosImportados,
      codigosAgrupados: resultado.codigosAgrupados,
      totalErrores: resultado.totalErrores,
      errores: resultado.errores,
      mapeoUsado: resultado.mapeoUsado,
    });
  } catch (error) {
    console.error("[importar]", error);
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || "Error interno al importar." });
  }
}

export async function actualizarMaestro(req, res, next) {
  try {
    if (!req.files?.archivo)
      return res.status(400).json({ error: "Adjunta el Excel en el campo 'archivo'." });
    let archivo = req.files.archivo;
    if (!/\.xlsx$/i.test(archivo.name) && !/\.xls$/i.test(archivo.name))
      return res.status(400).json({ error: "El archivo debe tener extensión .xls o .xlsx." });
    archivo = normalizarArchivoExcel(archivo);

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Inventario inválido." });

    const resultado = await actualizarMaestroInventario({
      inventarioId: id,
      archivo,
      mapeo: req.body?.mapeo,
      usuarioId: req.usuario.id,
    });

    if (resultado.tipo === "sin_hoja")
      return res.status(400).json({
        error: "No se encontró la hoja INVENTARIO. " +
          `Hojas del archivo: ${resultado.hojas.length ? resultado.hojas.join(" | ") : "(ninguna)"}.`,
        hojasDetectadas: resultado.hojas,
      });
    if (resultado.tipo === "mapeo")
      return res.status(200).json({
        requiereMapeo: true,
        motivo: resultado.motivo,
        ambiguo: resultado.ambiguo,
        hojas: resultado.hojas,
        columnas: resultado.columnas,
        sugerencia: resultado.sugerencia || {},
        faltantes: resultado.faltantes || [],
      });
    if (resultado.tipo === "sin_filas")
      return res.status(400).json({ error: "No se encontraron filas válidas con el mapeo indicado.", errores: resultado.errores });

    res.json({
      mensaje: `Maestro actualizado: ${resultado.productosActualizados} actualizados, ${resultado.productosNuevos} nuevos. Los escaneos se conservan.`,
      ...resultado,
    });
  } catch (error) {
    console.error("[actualizarMaestro]", error);
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || "Error interno al actualizar el maestro." });
  }
}

export async function convertirStock(req, res, next) {
  try {
    if (!req.files?.archivo)
      return res.status(400).json({ error: "Adjunta el archivo STOCK en el campo 'archivo'." });
    const archivo = req.files.archivo;
    if (!/\.xlsx$/i.test(archivo.name) && !/\.xls$/i.test(archivo.name))
      return res.status(400).json({ error: "El archivo debe tener extensión .xls o .xlsx." });

    const localId = req.body?.localId || req.query?.localId;
    if (!localId)
      return res.status(400).json({ error: "Debes seleccionar el local al que pertenece el stock." });

    const resultado = await convertirStockAMaestra(archivo, localId);
    const nombreLocal = String(resultado.localNombre || "local").replace(/[^a-zA-Z0-9_-]+/g, "_");
    const nombreArchivo = `maestra-${nombreLocal}-convertida.xlsx`;

    // Importación automática + activación, reutilizando la lógica existente.
    let estadoImport = "no_intentado";
    let inventarioId = null;
    let errorImport = null;
    try {
      const archivoGen = { name: nombreArchivo, data: resultado.buffer };
      const imp = await importarInventario({
        archivo: archivoGen,
        localId: Number(localId),
        mapeo: null,
        nombre: null,
        usuarioId: req.usuario.id,
      });
      if (imp.tipo === "mapeo") {
        estadoImport = "requiere_mapeo";
        errorImport = "La maestra generada requiere mapeo de columnas manual.";
      } else if (imp.tipo === "sin_filas") {
        estadoImport = "sin_filas";
        errorImport = "No se encontraron filas válidas en la maestra generada.";
      } else {
        inventarioId = imp.inventario?.id;
        try {
          await activarInventario(inventarioId);
          estadoImport = "activado";
        } catch (e) {
          estadoImport = "importado_no_activado";
          errorImport = e?.message || "No se pudo activar el inventario.";
        }
      }
    } catch (e) {
      estadoImport = "error_importacion";
      errorImport = e?.message || "Error al importar la maestra generada.";
    }

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${nombreArchivo}"`);
    res.setHeader("X-Importacion-Estado", estadoImport);
    if (inventarioId) res.setHeader("X-Inventario-Id", String(inventarioId));
    if (errorImport) res.setHeader("X-Importacion-Error", encodeURIComponent(errorImport));
    if (resultado.camposNoMapeados && resultado.camposNoMapeados.length) {
      res.setHeader("X-Campos-No-Mapeados", encodeURIComponent(resultado.camposNoMapeados.join("|")));
    }
    res.send(resultado.buffer);
  } catch (error) {
    console.error("[convertirStock]", error);
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || "Error interno al convertir el stock." });
  }
}

export async function reiniciarEscaneos(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Inventario inválido." });
    const resultado = await reiniciarEscaneosInventario(id);
    res.json(resultado);
  } catch (error) {
    console.error("[reiniciarEscaneos]", error);
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || "Error interno." });
  }
}

export async function activar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Inventario invalido." });
    const inventario = await activarInventario(id);
    res.json({ inventario });
  } catch (error) { next(error); }
}

export async function impacto(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Inventario invalido." });
    res.json(await impactoInventario(id));
  } catch (error) { next(error); }
}

export async function eliminar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Inventario invalido." });
    const confirmado = String(req.query.confirmar || "").toUpperCase() === "SI";
    const resultado = await eliminarInventario(id, confirmado);

    if (resultado.tipo === "requiere_confirmacion")
      return res.status(409).json({
        error:
          `Este inventario tiene ${resultado.lecturas} lectura(s) registradas. ` +
          "Confirma desde la web que quieres borrarlas antes de eliminarlo.",
        requiereConfirmacion: true,
        impacto: resultado.impacto,
      });

    res.json({ ok: true, mensaje: resultado.mensaje });
  } catch (error) { next(error); }
}

export async function reporteCsv(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Inventario invalido." });
    const { nombre, contenido } = await generarReporteCsv(id);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(contenido);
  } catch (error) { next(error); }
}

export async function reporteExcel(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Inventario invalido." });
    const { nombre, buffer } = await generarReporteExcel(id);
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader("Content-Disposition", `attachment; filename="${nombre}"`);
    res.send(buffer);
  } catch (error) { next(error); }
}
