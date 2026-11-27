import { z } from "zod";
import { detalleUsuarioInventario, detalleUsuarioZona, eliminarEscaneo, listarNovedades, registrarEscaneo, resumenMio, escaneosRecientes } from "../services/escaneos.service.js";

export async function crear(req, res, next) {
  try {
    const { codigoBarras } = z.object({
      codigoBarras: z.string().trim().min(6).max(64),
    }).parse(req.body);

    res.status(201).json(await registrarEscaneo(req.usuario, codigoBarras));
  } catch (error) {
    // El código inexistente devuelve detalles extra para que el lector pueda
    // mostrar una ayuda sin perder el mensaje de error estándar.
    if (error.codigoEscaneado)
      return res.status(error.status || 404).json({
        error: error.message,
        detalle: error.detalle,
        codigoEscaneado: error.codigoEscaneado,
      });
    next(error);
  }
}

export async function resumen(req, res, next) {
  try {
    const localIdParam = req.query.localId ? Number(req.query.localId) : null;
    if (localIdParam !== null && (!Number.isInteger(localIdParam) || localIdParam <= 0))
      return res.status(400).json({ error: "localId invalido." });
    res.json(await resumenMio(req.usuario, localIdParam));
  } catch (error) { next(error); }
}

export async function recientes(req, res, next) {
  try {
    const zonaId = Number(req.query.zonaId);
    if (!Number.isInteger(zonaId) || zonaId <= 0)
      return res.status(400).json({ error: "zonaId es obligatorio." });
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    res.json({ escaneos: await escaneosRecientes(zonaId, limit) });
  } catch (error) { next(error); }
}

export async function novedades(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);
    if (!Number.isInteger(inventarioId) || inventarioId <= 0)
      return res.status(400).json({ error: "inventarioId es obligatorio." });
    const zonaId = req.query.zonaId ? Number(req.query.zonaId) : null;
    if (zonaId !== null && (!Number.isInteger(zonaId) || zonaId <= 0))
      return res.status(400).json({ error: "zonaId invalido." });
    const usuarioId = req.query.usuarioId ? Number(req.query.usuarioId) : null;
    if (usuarioId !== null && (!Number.isInteger(usuarioId) || usuarioId <= 0))
      return res.status(400).json({ error: "usuarioId invalido." });
    res.json({ novedades: await listarNovedades(inventarioId, zonaId, usuarioId) });
  } catch (error) { next(error); }
}

export async function detalleUsuario(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);
    const usuarioId = Number(req.query.usuarioId);
    if (!Number.isInteger(inventarioId) || inventarioId <= 0)
      return res.status(400).json({ error: "inventarioId es obligatorio." });
    if (!Number.isInteger(usuarioId) || usuarioId <= 0)
      return res.status(400).json({ error: "usuarioId es obligatorio." });
    res.json(await detalleUsuarioInventario(inventarioId, usuarioId));
  } catch (error) { next(error); }
}

export async function detalleUsuarioZonaCtrl(req, res, next) {
  try {
    const inventarioId = Number(req.query.inventarioId);
    const usuarioId = Number(req.query.usuarioId);
    const zonaId = Number(req.query.zonaId);
    if (!Number.isInteger(inventarioId) || inventarioId <= 0)
      return res.status(400).json({ error: "inventarioId es obligatorio." });
    if (!Number.isInteger(usuarioId) || usuarioId <= 0)
      return res.status(400).json({ error: "usuarioId es obligatorio." });
    if (!Number.isInteger(zonaId) || zonaId <= 0)
      return res.status(400).json({ error: "zonaId es obligatorio." });
    res.json({ productos: await detalleUsuarioZona(inventarioId, usuarioId, zonaId) });
  } catch (error) { next(error); }
}

export async function eliminar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Id de lectura invalido." });
    const data = await eliminarEscaneo(req.usuario, BigInt(id));
    res.json(data);
  } catch (error) { next(error); }
}
