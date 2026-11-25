import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import fileUpload from "express-fileupload";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "./lib/prisma.js";
import authRoutes from "./routes/auth.routes.js";
import localesRoutes from "./routes/locales.routes.js";
import inventariosRoutes from "./routes/inventarios.routes.js";
import zonasRoutes from "./routes/zonas.routes.js";
import escaneosRoutes from "./routes/escaneos.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";

export const app = express();
const origins = (process.env.FRONTEND_URL || "http://localhost:5173").split(",").map((x) => x.trim()).filter(Boolean);
const permitirLan = process.env.NODE_ENV !== "production" || process.env.ALLOW_LAN_ORIGINS === "1";

// Permite el acceso desde el celular/lector en la misma red Wi-Fi sin tener que
// escribir la IP a mano (las IP cambian). Se acepta cualquier origen cuyo host sea
// localhost o una dirección privada (192.168.x.x, 10.x.x.x, 172.16-31.x.x).
function esOrigenDeRedLocal(origin) {
  if (!permitirLan) return false;
  try {
    const { hostname } = new URL(origin);
    return (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      /^192\.168\./.test(hostname) ||
      /^10\./.test(hostname) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    );
  } catch {
    return false;
  }
}

// CSP desactivada: la app web compilada usa atributos/estilos propios y
// `upgrade-insecure-requests` rompería el acceso por HTTP dentro de la app Android.
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);
// Compresión gzip/brotli: reduce el tamaño de respuestas JSON y reportes Excel/CSV.
// El umbral de 1 KB evita comprimir respuestas triviales (poca ganancia, más CPU).
app.use(compression({ threshold: 1024 }));
const esProduccion = process.env.NODE_ENV === "production";
app.use(
  cors({
    origin(origin, callback) {
      // Sin origen: apps nativas (Android), lectores Zebra o herramientas como curl.
      // En producción se rechaza para evitar que scripts en red local accedan sin cabecera Origin.
      // En desarrollo/LAN se permite para facilitar pruebas desde terminales y Postman.
      if (!origin) return callback(null, !esProduccion);
      if (origins.includes(origin) || esOrigenDeRedLocal(origin)) return callback(null, true);
      // Origen no permitido: se omiten las cabeceras CORS y el navegador lo bloquea.
      return callback(null, false);
    },
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    maxAge: 86400,
    optionsSuccessStatus: 204,
  }),
);
app.use(cookieParser());
app.use(express.json({ limit: "1mb" }));
app.use(fileUpload({ limits: { fileSize: 25 * 1024 * 1024 }, abortOnLimit: true, useTempFiles: false, responseOnLimit: "El archivo supera el límite de 25 MB." }));

// App web compilada (frontend/dist): permite abrir TODO el sistema desde el
// celular o el lector Zebra con una sola dirección, http://IP:3000, sin tener
// que levantar el servidor de Vite. Se genera con `npm run build` en frontend/.
const distDir = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "frontend",
  "dist",
);
const spaDisponible = fs.existsSync(path.join(distDir, "index.html"));
if (!spaDisponible) {
  console.warn(
    "Aviso: frontend/dist no existe. Ejecuta 'npm run build' en frontend/ para servir la web desde este backend.",
  );
}

app.get("/", (_req, res, next) => {
  // Si está la web compilada, se sirve más abajo (static + fallback SPA).
  if (spaDisponible) return next();
  res.json({ mensaje: "API de Inventario LEVIS funcionando", estado: "OK", health: "/api/health" });
});
app.get("/api/health", async (_req, res) => {
  const inicio = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      servicio: "levis-inventario-api",
      base_datos: "conectada",
      latencia_db_ms: Date.now() - inicio,
      entorno: process.env.NODE_ENV || "development",
      uptime_seg: Math.floor(process.uptime()),
    });
  } catch (err) {
    console.error("[health] BD no disponible:", err.message);
    res.status(503).json({
      ok: false,
      servicio: "levis-inventario-api",
      base_datos: "sin conexión",
      error: "No se pudo conectar a la base de datos.",
    });
  }
});
// --- Rate limiting por categoría ---

// 1. Login: 50 intentos / 15 min por IP (frena fuerza bruta).
// Extrae el id de usuario del JWT (sin verificarlo) solo para armar la clave
// de rate limiting. No sustituye a la autenticacion real del middleware.
function usuarioDeToken(req) {
  const encabezado = req.headers?.authorization || "";
  if (!encabezado.startsWith("Bearer ")) return "anon";
  try {
    const payload = jwt.decode(encabezado.slice(7));
    return payload?.sub ? `u${payload.sub}` : "anon";
  } catch {
    return "anon";
  }
}

function clavePorIpYUsuario(req) {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  return `${ip}:${usuarioDeToken(req)}`;
}

const limiteAuth = Number(process.env.AUTH_RATE_LIMIT_MAX) > 0 ? Number(process.env.AUTH_RATE_LIMIT_MAX) : 50;

// 2. Creación de usuarios: muy estricto (máximo 10 registros / 24 h por IP).
//    En la tienda son 5 usuarios máximos por día; el margen doble es suficiente.
const limiteCrearUsuario = Number(process.env.USER_CREATE_RATE_LIMIT_MAX) > 0
  ? Number(process.env.USER_CREATE_RATE_LIMIT_MAX) : 10;
const rateLimitCrearUsuario = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,   // ventana de 24 horas
  limit: limiteCrearUsuario,
  message: { error: "Límite diario de creación de usuarios alcanzado." },
  skip: (req) => req.method !== "POST", // solo limita POST /usuarios
  keyGenerator: clavePorIpYUsuario,
  standardHeaders: true,
  legacyHeaders: false,
});

// 3. Escaneos: alto (2 000 / 15 min por IP) — los lectores Zebra envían ráfagas.
//    A 2 escaneos/seg constantes = 1 800/15 min, así que 2 000 da margen.
const limiteEscaneos = Number(process.env.SCAN_RATE_LIMIT_MAX) > 0 ? Number(process.env.SCAN_RATE_LIMIT_MAX) : 5000;
const rateLimitEscaneos = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: limiteEscaneos,
  message: { error: "Demasiados escaneos. Espera un momento." },
  keyGenerator: clavePorIpYUsuario,
  standardHeaders: true,
  legacyHeaders: false,
});

// 4. General para el resto de rutas (consultas, reportes, etc.).
const limiteApi = Number(process.env.API_RATE_LIMIT_MAX) > 0 ? Number(process.env.API_RATE_LIMIT_MAX) : 300;
const rateLimitApi = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: limiteApi,
  message: { error: "Demasiadas peticiones. Espera unos minutos e intenta de nuevo." },
  keyGenerator: clavePorIpYUsuario,
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth", rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: limiteAuth,
  message: { error: "Demasiados intentos de acceso. Espera 15 minutos." },
  keyGenerator: (req) => `${req.ip}:${String(req.body?.correo || "").toLowerCase().trim() || "anon"}`,
  standardHeaders: true,
  legacyHeaders: false,
}), rateLimitCrearUsuario, authRoutes);
app.use("/api/inventarios", rateLimitApi, inventariosRoutes);
app.use("/api/locales", rateLimitApi, localesRoutes);
app.use("/api/zonas", rateLimitApi, zonasRoutes);
app.use("/api/escaneos", rateLimitEscaneos, escaneosRoutes);
app.use("/api/dashboard", rateLimitApi, dashboardRoutes);

// Sirve la web compilada y las rutas de la SPA (React Router). Nunca intercepta /api.
if (spaDisponible) {
  app.use(express.static(distDir, { index: "index.html" }));
  app.use((req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(distDir, "index.html"), (err) => (err ? next() : undefined));
  });
}

app.use((req, res) => res.status(404).json({ error: "Ruta no encontrada." }));
app.use((err, _req, res, _next) => {
  if (err?.name === "ZodError") return res.status(400).json({ error: "Datos invalidos.", detalles: err.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })) });
  if (err?.code === "P2002") return res.status(409).json({ error: "Ya existe un registro con esos datos." });
  if (err?.code === "P2025") return res.status(404).json({ error: "No se encontro el registro solicitado." });
  if (err?.type === "entity.too.large") return res.status(413).json({ error: "La peticion supera el tamano permitido." });
  if (err?.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  const mensaje = process.env.NODE_ENV !== "production" ? (err?.message || "Error interno del servidor.") : "Error interno del servidor.";
  res.status(500).json({ error: mensaje });
});
