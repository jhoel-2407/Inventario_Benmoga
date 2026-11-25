import { z } from "zod";
import jwt from "jsonwebtoken";
import {
  actualizarColorUsuario,
  crearUsuario,
  eliminarUsuario,
  eliminarUsuarioDefinitivo,
  eliminarUsuariosDePrueba,
  listarUsuarios,
  login as iniciarSesion,
  revocarToken,
} from "../services/auth.service.js";

export async function login(req, res, next) {
  try {
    const datos = z.object({
      correo: z.string().email(),
      password: z.string().min(1),
    }).parse(req.body);

    const resultado = await iniciarSesion(datos);
    const isProd = process.env.NODE_ENV === "production";
    res.cookie("levis_token", resultado.token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      maxAge: 8 * 60 * 60 * 1000,
      path: "/",
    });
    res.json(resultado);
  } catch (error) { next(error); }
}

export async function usuariosListar(_req, res, next) {
  try {
    res.json({ usuarios: await listarUsuarios() });
  } catch (error) { next(error); }
}

export async function usuariosCrear(req, res, next) {
  try {
    const datos = z.object({
      nombre: z.string().min(2).max(120),
      correo: z.string().email(),
      password: z.string().min(10),
      rol: z.enum(["ADMINISTRADORA", "EMPLEADO"]),
      // Color de identificación elegido por la administradora (opcional).
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullish(),
    }).parse(req.body);

    const usuario = await crearUsuario(datos);
    res.status(201).json({ usuario });
  } catch (error) { next(error); }
}

export async function usuariosActualizarColor(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Usuario inválido." });

    const { color } = z.object({
      color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    }).parse(req.body);

    res.json({ usuario: await actualizarColorUsuario(id, color) });
  } catch (error) { next(error); }
}

export function me(req, res) {
  res.json({ usuario: req.usuario });
}

export async function eliminarUsuariosPruebaCtrl(req, res, next) {
  try {
    const resultado = await eliminarUsuariosDePrueba(req.usuario.id);
    res.json(resultado);
  } catch (error) {
    console.error("[eliminarUsuariosPrueba]", error);
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || "Error interno." });
  }
}

export async function eliminarUsuarioCtrl(req, res, next) {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0)
      return res.status(400).json({ error: "Usuario inválido." });
    const definitivo = req.query.definitivo === "1" || req.query.definitivo === "true";
    const resultado = definitivo
      ? await eliminarUsuarioDefinitivo(id, req.usuario.id)
      : await eliminarUsuario(id, req.usuario.id);
    res.json(resultado);
  } catch (error) {
    console.error("[eliminarUsuario]", error);
    const status = error?.status || 500;
    return res.status(status).json({ error: error?.message || "Error interno." });
  }
}

export async function logout(req, res, next) {
  try {
    const token = (req.headers.authorization || "").startsWith("Bearer ")
      ? (req.headers.authorization || "").slice(7)
      : null;
    if (token) {
      try {
        const payload = jwt.decode(token);
        await revocarToken(payload?.jti, req.usuario.id, payload?.exp);
      } catch { /* ignora */ }
    }
    const isProd = process.env.NODE_ENV === "production";
    res.clearCookie("levis_token", {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? "none" : "lax",
      path: "/",
    });
    res.status(204).send();
  } catch (error) { next(error); }
}
