// Servidor exclusivo para las pruebas E2E.
// Usa el mismo código y la misma base de datos que la aplicación, pero en un
// puerto aparte (3100) para poder ejecutar las pruebas sin detener el servidor
// normal de la tienda (3000). HTTPS se desactiva: Cypress entra por HTTP.
import path from "node:path";
import { fileURLToPath } from "node:url";

const backendDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(backendDir);
process.env.PORT = process.env.E2E_PORT || "3100";
process.env.HOST = "127.0.0.1";
process.env.DISABLE_HTTPS = "1";
process.env.NODE_ENV = "test";
// Las pruebas inician sesión muchas veces seguidas: se sube el límite.
process.env.AUTH_RATE_LIMIT_MAX = "5000";

await import("../src/server.js");
