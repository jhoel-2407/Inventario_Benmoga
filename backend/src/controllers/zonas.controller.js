import { z } from "zod";
import {
  actualizarZona,
  crearZona,
  crearZonasLote,
  eliminarZona,
  finalizarZona,
  listarZonas,
  obtenerActividadZonas,
  seleccionarZona,
} from "../services/zonas.service.js";

export async function listar(req, res, next) {
  try {
    const localId = req.query.localId ? Number(req.query.localId) : null;
    if (localId !== null && (!Number.isInteger(localId) || localId <= 0))
      return res.status(400).json({ error: "localId invalido." });
    res.json(await listarZonas(localId));
  } catch (error) { next(error); }
}

export async function actividad(req, res, next) {
  try {
    const localId = req.query.localId ? Number(req.query.localId) : null;
    if (localId !== null && (!Number.isInteger(localId) || localId <= 0))
      return res.status(400).json({ error: "localId invalido." });
    res.json(await obtenerActividadZonas(localId));
  } catch (error) { next(error); }
}

export async function crear(req, res, next) {
  try {
    const data = z
      .object({
        localId: z.number().int().positive(),
        numero: z.number().int().positive(),
        nombre: z.string().max(100).optional().nullable(),
        tipo: z.enum(["PDV", "BODEGA"]).optional(),
      })
      .parse(req.body);
    res.status(201).json({ zona: await crearZona(data) });
  } catch (error) { next(error); }
}

export async function crearLote(req, res, next) {
  try {
    const data = z
      .object({
        localId: z.number().int().positive(),
        desde: z.number().int().positive(),
        hasta: z.number().int().positive(),
        prefijo: z.string().max(60).optional(),
        tipo: z.enum(["PDV", "BODEGA"]).optional(),
      })
      .parse(req.body);
    res.status(201).json(await crearZonasLote(data));
  } catch (error) { next(error); }
}

export async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Zona invalida." });
    const data = z.object({
      numero: z.coerce.number().int().positive().optional(),
      nombre: z.string().max(100).optional().nullable(),
      activa: z.boolean().optional(),
      tipo: z.enum(["PDV", "BODEGA"]).optional(),
    }).parse(req.body);
    res.json({ zona: await actualizarZona(id, data) });
  } catch (error) { next(error); }
}

export async function eliminar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Zona invalida." });
    res.json(await eliminarZona(id));
  } catch (error) { next(error); }
}

export async function seleccionar(req, res, next) {
  try {
    const { zonaId } = z.object({ zonaId: z.number().int().positive() }).parse(req.body);
    res.status(201).json(await seleccionarZona(req.usuario, zonaId));
  } catch (error) { next(error); }
}

export async function finalizar(req, res, next) {
  try {
    res.json(await finalizarZona(req.usuario));
  } catch (error) { next(error); }
}
