import { obtenerDashboard } from "../services/dashboard.service.js";

export async function resumen(req, res, next) {
  try {
    const localIdParam = req.query.localId ? Number(req.query.localId) : null;
    if (localIdParam !== null && (!Number.isInteger(localIdParam) || localIdParam <= 0))
      return res.status(400).json({ error: "localId invalido." });
    res.json(await obtenerDashboard(localIdParam));
  } catch (error) { next(error); }
}
