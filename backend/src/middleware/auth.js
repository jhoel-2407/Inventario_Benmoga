import jwt from "jsonwebtoken";
import { prisma } from "../lib/prisma.js";
import { tokenRevocado } from "../services/auth.service.js";

export async function autenticar(req, res, next) {
  try {
    const encabezado = req.headers.authorization || "";
    const token =
      req.cookies?.levis_token ||
      (encabezado.startsWith("Bearer ") ? encabezado.slice(7) : null);
    if (!token) return res.status(401).json({ error: "Debes iniciar sesión." });

    const payload = jwt.verify(token, process.env.JWT_SECRET);

    // Token revocado (logout) o versión antigua (contraseña cambiada).
    if (payload.jti && (await tokenRevocado(payload.jti))) {
      return res.status(401).json({ error: "Sesión inválida o vencida." });
    }

    const usuario = await prisma.usuario.findUnique({
      where: { id: Number(payload.sub) },
      select: { id: true, nombre: true, correo: true, rol: true, color: true, activo: true, tokenVersion: true },
    });

    if (!usuario || !usuario.activo) {
      return res.status(401).json({ error: "La cuenta no está disponible." });
    }
    if (payload.tv !== undefined && payload.tv !== usuario.tokenVersion) {
      return res.status(401).json({ error: "Sesión inválida o vencida." });
    }
    req.usuario = usuario;
    req.tokenPayload = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Sesión inválida o vencida." });
  }
}

export function soloAdministradora(req, res, next) {
  if (req.usuario?.rol !== "ADMINISTRADORA") {
    return res.status(403).json({ error: "Necesitas permisos de administradora." });
  }
  next();
}
