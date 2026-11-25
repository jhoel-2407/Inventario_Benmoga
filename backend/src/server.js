import "dotenv/config";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app } from "./app.js";
import { prisma } from "./lib/prisma.js";
import { iniciarRealtime } from "./lib/realtime.js";
import { limpiarTokensRevocados } from "./services/auth.service.js";

const port = Number(process.env.PORT || 3000);
// Puerto HTTPS opcional (con el certificado propio) para la cámara del celular.
const puertoHttps = Number(process.env.HTTPS_PORT || 3443);
// 0.0.0.0 = acepta conexiones de la red local (celular/lector Zebra en la misma Wi-Fi).
const host = process.env.HOST || "0.0.0.0";

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  console.error("Configura JWT_SECRET con al menos 32 caracteres en tu archivo .env");
  process.exit(1);
}

// Devuelve las direcciones IPv4 de la red local para mostrar la URL de acceso.
function direccionesLan() {
  const salida = [];
  const ifaces = os.networkInterfaces();
  for (const nombre of Object.keys(ifaces)) {
    for (const dir of ifaces[nombre] || []) {
      if (dir.family === "IPv4" && !dir.internal) salida.push({ ip: dir.address, iface: nombre });
    }
  }
  return salida;
}

// --- HTTP: es el que usan la app Android y los lectores Zebra (rápido, sin certificados).
const servidorHttp = http.createServer(app);
servidorHttp.listen(port, host, () => {
  console.log("API BENMOGA Inventario disponible en:");
  console.log(`  - Este equipo:  http://localhost:${port}`);
  for (const { ip, iface } of direccionesLan()) {
    console.log(`  - Red (${iface}): http://${ip}:${port}`);
  }
});
iniciarRealtime(servidorHttp);
// Limpieza diaria de tokens revocados ya expirados.
limpiarTokensRevocados();
setInterval(limpiarTokensRevocados, 24 * 60 * 60 * 1000);

// --- HTTPS opcional: solo para que el celular pueda usar la cámara.
// Se activa automáticamente si existen los certificados (generar-certificado.ps1).
const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const rutaCert = path.join(raiz, "certs", "server.crt");
const rutaClave = path.join(raiz, "certs", "server.key");

let servidorHttps = null;
if (process.env.DISABLE_HTTPS !== "1" && fs.existsSync(rutaCert) && fs.existsSync(rutaClave)) {
  try {
    servidorHttps = https.createServer(
      { cert: fs.readFileSync(rutaCert), key: fs.readFileSync(rutaClave) },
      app,
    );
    servidorHttps.on("error", (err) => {
      console.warn("HTTPS no disponible:", err.message);
      servidorHttps = null;
    });
    servidorHttps.listen(puertoHttps, host, () => {
      console.log("HTTPS (cámara del celular) disponible en:");
      console.log(`  - Este equipo:  https://localhost:${puertoHttps}`);
      for (const { ip, iface } of direccionesLan()) {
        console.log(`  - Red (${iface}): https://${ip}:${puertoHttps}`);
      }
    });
  } catch (error) {
    console.warn("No se pudo iniciar HTTPS:", error.message);
    servidorHttps = null;
  }
} else {
  console.log(
    "HTTPS desactivado. Ejecuta 'generar-certificado.ps1' para habilitar la cámara del celular.",
  );
}

async function cerrar() {
  const cerrarServidor = (s) =>
    new Promise((resolve) => (s ? s.close(() => resolve()) : resolve()));
  await Promise.all([cerrarServidor(servidorHttp), cerrarServidor(servidorHttps)]);
  await prisma.$disconnect();
  process.exit(0);
}
process.on("SIGINT", cerrar);
process.on("SIGTERM", cerrar);
