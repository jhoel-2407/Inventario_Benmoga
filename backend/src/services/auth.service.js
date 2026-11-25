import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import crypto from "node:crypto";
import { prisma } from "../lib/prisma.js";

function errorConEstado(mensaje, status) {
  const error = new Error(mensaje);
  error.status = status;
  return error;
}

export async function login({ correo, password }) {
  const usuario = await prisma.usuario.findUnique({ where: { correo } });
  if (!usuario || !usuario.activo || !(await bcrypt.compare(password, usuario.passwordHash))) {
    throw errorConEstado("Correo o contraseña incorrectos.", 401);
  }

  const jti = crypto.randomUUID();
  const token = jwt.sign(
    { sub: String(usuario.id), rol: usuario.rol, tv: usuario.tokenVersion },
    process.env.JWT_SECRET,
    { expiresIn: "8h", jwtid: jti },
  );

  return {
    token,
    jti,
    usuario: {
      id: usuario.id,
      nombre: usuario.nombre,
      correo: usuario.correo,
      rol: usuario.rol,
      color: usuario.color,
    },
  };
}

// Revoca un token (logout real): queda inutilizable aunque no haya expirado.
export async function revocarToken(jti, usuarioId, exp) {
  if (!jti) return;
  const expiraEn = exp ? new Date(exp * 1000) : new Date(Date.now() + 8 * 60 * 60 * 1000);
  await prisma.tokenRevocado.upsert({
    where: { jti },
    update: {},
    create: { jti, usuarioId, expiraEn },
  }).catch(() => {});
}

// Verifica si un token fue revocado.
export async function tokenRevocado(jti) {
  if (!jti) return false;
  const found = await prisma.tokenRevocado.findUnique({ where: { jti } });
  return !!found;
}

// Revoca todos los tokens de un usuario (p. ej. al desactivarlo o cambiar contraseña).
export async function revocarTokensDeUsuario(usuarioId) {
  // Incrementa tokenVersion: todos los JWT anteriores quedan inválidos.
  await prisma.usuario.update({ where: { id: usuarioId }, data: { tokenVersion: { increment: 1 } } }).catch(() => {});
}

// Desactiva (elimina lógicamente) un usuario: no se borra para conservar el
// historial de escaneos/sesiones, pero deja de poder iniciar sesión.
export async function eliminarUsuario(id, solicitanteId) {
  if (!Number.isInteger(id) || id <= 0) throw errorConEstado("Usuario inválido.", 400);
  if (id === solicitanteId) throw errorConEstado("No puedes eliminar tu propia cuenta.", 400);

  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw errorConEstado("Usuario no encontrado.", 404);
  if (!usuario.activo) throw errorConEstado("El usuario ya está desactivado.", 400);

  // No permitir dejar el sistema sin administradoras activas.
  if (usuario.rol === "ADMINISTRADORA") {
    const adminsActivos = await prisma.usuario.count({ where: { rol: "ADMINISTRADORA", activo: true } });
    if (adminsActivos <= 1) throw errorConEstado("No se puede eliminar la última administradora.", 400);
  }

  await prisma.usuario.update({ where: { id }, data: { activo: false } });
  await revocarTokensDeUsuario(id);
  // Revocar tokens individuales en la tabla de revocados (best effort).
  await prisma.tokenRevocado.updateMany({ where: { usuarioId: id }, data: { expiraEn: new Date() } }).catch(() => {});

  return { ok: true, mensaje: `Usuario ${usuario.nombre} desactivado.` };
}

// Eliminación definitiva: borra el usuario y todos sus datos asociados.
export async function eliminarUsuarioDefinitivo(id, solicitanteId) {
  if (!Number.isInteger(id) || id <= 0) throw errorConEstado("Usuario inválido.", 400);
  if (id === solicitanteId) throw errorConEstado("No puedes eliminar tu propia cuenta.", 400);

  const usuario = await prisma.usuario.findUnique({ where: { id } });
  if (!usuario) throw errorConEstado("Usuario no encontrado.", 404);

  if (usuario.rol === "ADMINISTRADORA") {
    const adminsActivos = await prisma.usuario.count({ where: { rol: "ADMINISTRADORA", activo: true, id: { not: id } } });
    if (adminsActivos < 1) throw errorConEstado("No se puede eliminar la última administradora.", 400);
  }

  // Borrar datos asociados (en orden por FK).
  await prisma.$transaction([
    prisma.tokenRevocado.deleteMany({ where: { usuarioId: id } }),
    prisma.escaneoNovedad.deleteMany({ where: { usuarioId: id } }),
    prisma.escaneo.deleteMany({ where: { usuarioId: id } }),
    prisma.sesionZona.deleteMany({ where: { usuarioId: id } }),
    // Reasignar inventarios creados por este usuario al solicitante.
    prisma.inventario.updateMany({ where: { creadoPorId: id }, data: { creadoPorId: solicitanteId } }),
    prisma.usuario.delete({ where: { id } }),
  ]);

  return { ok: true, mensaje: `Usuario ${usuario.nombre} eliminado definitivamente.` };
}

// Elimina definitivamente todos los usuarios de prueba (@benmoga.test).
export async function eliminarUsuariosDePrueba(solicitanteId) {
  const usuarios = await prisma.usuario.findMany({
    where: { correo: { endsWith: "@benmoga.test" }, id: { not: solicitanteId } },
    select: { id: true, nombre: true },
  });
  let eliminados = 0;
  for (const u of usuarios) {
    try {
      await eliminarUsuarioDefinitivo(u.id, solicitanteId);
      eliminados++;
    } catch (e) {
      // ignora (p. ej. última admin)
    }
  }
  return { ok: true, mensaje: `${eliminados} usuario(s) de prueba eliminados.`, eliminados };
}

// Limpieza de tokens revocados ya expirados (mantenimiento).
export async function limpiarTokensRevocados() {
  await prisma.tokenRevocado.deleteMany({ where: { expiraEn: { lt: new Date() } } }).catch(() => {});
}

export async function listarUsuarios() {
  return prisma.usuario.findMany({
    select: { id: true, nombre: true, correo: true, rol: true, color: true, activo: true, creadoEn: true },
    orderBy: { nombre: "asc" },
  });
}

// Solo una administradora autenticada puede crear usuarios.
// El primer usuario administrador se crea con el script de inicialización.
export async function crearUsuario({ nombre, correo, password, rol, color }) {
  const passwordHash = await bcrypt.hash(password, 12);
  return prisma.usuario.create({
    data: { nombre, correo, rol, passwordHash, color: color || null },
    select: { id: true, nombre: true, correo: true, rol: true, color: true, activo: true },
  });
}

// Cambiar el color (o quitarlo) de un usuario ya creado.
export async function actualizarColorUsuario(id, color) {
  return prisma.usuario.update({
    where: { id },
    data: { color: color || null },
    select: { id: true, nombre: true, correo: true, rol: true, color: true, activo: true },
  });
}
