import { z } from "zod";
import {
  actualizarLocal,
  crearLocal,
  listarLocales,
} from "../services/locales.service.js";

export async function listar(_req, res, next) {
  try {
    res.json({ locales: await listarLocales() });
  } catch (error) { next(error); }
}

export async function crear(req, res, next) {
  try {
    const datos = z
      .object({ nombre: z.string().trim().min(2).max(120) })
      .parse(req.body);
    const local = await crearLocal(datos);
    res.status(201).json({ local });
  } catch (error) { next(error); }
}

export async function actualizar(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Local invalido." });

    const datos = z
      .object({
        nombre: z.string().trim().min(2).max(120).optional(),
        activo: z.boolean().optional(),
      })
      .refine((d) => d.nombre !== undefined || d.activo !== undefined, {
        message: "Debes enviar al menos un campo.",
      })
      .parse(req.body);
    const local = await actualizarLocal(id, datos);
    res.json({ local });
  } catch (error) { next(error); }
}
