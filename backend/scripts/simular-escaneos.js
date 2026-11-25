#!/usr/bin/env node
// ============================================================================
// Simulación de varios empleados escaneando al mismo tiempo
// ----------------------------------------------------------------------------
// Cada usuario inicia sesión, elige una zona, escanea unidades y cambia de zona
// cada cierto número de lecturas. Todos los usuarios trabajan en paralelo
// (peticiones HTTP concurrentes) contra el backend real.
//
// Pensado para la tienda de pruebas: por defecto apunta al servidor E2E
// (http://localhost:3100) y al local "TIENDA PRUEBAS CYPRESS", así no se toca
// el inventario real. Mientras corre, abre el navegador en /monitoreo con la
// cuenta administradora para ver a los 5 usuarios en vivo, cada uno con su color.
//
// Uso:
//   node backend/scripts/simular-escaneos.js
//   node backend/scripts/simular-escaneos.js --usuarios=6 --vueltas=12
//   node backend/scripts/simular-escaneos.js --base=http://localhost:3000 --local="MI TIENDA"
//
// Opciones:
//   --base=URL             Backend a usar (defecto: http://localhost:3100)
//   --local=NOMBRE         Nombre del local (defecto: TIENDA PRUEBAS CYPRESS)
//   --local-id=ID          Usar un id de local en vez del nombre
//   --usuarios=N           Cantidad de empleados (defecto: 5)
//   --vueltas=N            Lecturas por empleado (defecto: 10)
//   --cambiar-cada=N       Lecturas antes de cambiar de zona (defecto: 4)
//   --pausa=MS             Pausa entre lecturas de un mismo usuario (defecto: 200)
//   --password=CLAVE       Contraseña de los operarios (defecto: Pruebas123*)
//   --correos=a,b,c        Correos concretos; si no, operario1..N@benmoga.test
//   --admin-correo=...     Cuenta para consultar local, zonas y códigos
//   --admin-password=...   Contraseña de esa cuenta
//   --no-finalizar         Deja las zonas abiertas al terminar
//   --silencio             No imprime cada lectura (solo el resumen)
// ============================================================================
import path from "node:path";
import { pathToFileURL } from "node:url";

const DEFAULTS = {
  base: process.env.E2E_BASE_URL || "http://localhost:3100",
  local: "TIENDA PRUEBAS CYPRESS",
  usuarios: 5,
  vueltas: 10,
  cambiarCada: 4,
  pausa: 200,
  password: "Pruebas123*",
  adminCorreo: "admin.pruebas@benmoga.test",
  adminPassword: "Pruebas123*",
  finalizar: true,
  silencio: false,
};

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function numero(valor, defecto) {
  const n = Number(valor);
  return Number.isFinite(n) && n >= 0 ? n : defecto;
}

function texto(valor, defecto) {
  return valor === undefined || valor === null || String(valor).trim() === ""
    ? defecto
    : String(valor).trim();
}

function booleano(valor, defecto) {
  if (valor === undefined) return defecto;
  return !["false", "0", "no"].includes(String(valor).toLowerCase());
}

export function opcionesDesdeArgv(argv) {
  const crudas = {};
  for (const arg of argv) {
    if (!arg.startsWith("--")) continue;
    const [clave, ...resto] = arg.slice(2).split("=");
    crudas[clave] = resto.length ? resto.join("=") : "true";
  }

  const correos = crudas.correos
    ? crudas.correos.split(",").map((c) => c.trim()).filter(Boolean)
    : null;

  return {
    ayuda: !!crudas.help || !!crudas.h,
    base: texto(crudas.base, DEFAULTS.base).replace(/\/+$/, ""),
    local: texto(crudas.local, DEFAULTS.local),
    localId: crudas["local-id"] ? Number(crudas["local-id"]) : null,
    usuarios: Math.max(1, Math.round(numero(crudas.usuarios, DEFAULTS.usuarios))),
    vueltas: Math.max(1, Math.round(numero(crudas.vueltas, DEFAULTS.vueltas))),
    cambiarCada: Math.max(1, Math.round(numero(crudas["cambiar-cada"], DEFAULTS.cambiarCada))),
    pausa: numero(crudas.pausa, DEFAULTS.pausa),
    password: texto(crudas.password, DEFAULTS.password),
    correos,
    adminCorreo: texto(crudas["admin-correo"], DEFAULTS.adminCorreo),
    adminPassword: texto(crudas["admin-password"], DEFAULTS.adminPassword),
    finalizar: !crudas["no-finalizar"],
    silencio: booleano(crudas.silencio, DEFAULTS.silencio),
  };
}

async function api(base, ruta, { metodo = "GET", token, body } = {}) {
  const respuesta = await fetch(base + ruta, {
    method: metodo,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const textoRespuesta = await respuesta.text();
  let datos;
  try {
    datos = JSON.parse(textoRespuesta);
  } catch {
    datos = textoRespuesta;
  }

  if (!respuesta.ok) {
    const detalle = datos?.error || `HTTP ${respuesta.status}`;
    const error = new Error(`${detalle} (${metodo} ${ruta})`);
    error.status = respuesta.status;
    error.body = datos;
    throw error;
  }
  return datos;
}

async function iniciarSesion(base, correo, password) {
  const { token } = await api(base, "/api/auth/login", {
    metodo: "POST",
    body: { correo, password },
  });
  return token;
}

async function resolverLocal(base, token, opciones) {
  if (opciones.localId) {
    const { locales } = await api(base, "/api/locales", { token });
    const local = locales.find((l) => l.id === opciones.localId);
    if (!local) throw new Error(`No existe el local con id ${opciones.localId}.`);
    return local;
  }

  const { locales } = await api(base, "/api/locales", { token });
  const buscado = opciones.local.toLowerCase();
  const local =
    locales.find((l) => l.nombre.toLowerCase() === buscado) ||
    locales.find((l) => l.nombre.toLowerCase().includes(buscado));

  if (!local) {
    throw new Error(
      `No se encontró el local "${opciones.local}". ` +
        `Locales disponibles: ${locales.map((l) => l.nombre).join(" | ")}`,
    );
  }
  return local;
}

/**
 * Ejecuta la simulación y devuelve el resumen (también se puede importar desde
 * otro script o desde una tarea de Cypress).
 */
export async function simularEscaneos(opciones = {}) {
  const config = {
    ...DEFAULTS,
    ...opciones,
    correos: opciones.correos || null,
  };
  config.base = String(config.base).replace(/\/+$/, "");
  config.usuarios = Math.max(1, Number(config.usuarios) || DEFAULTS.usuarios);
  config.vueltas = Math.max(1, Number(config.vueltas) || DEFAULTS.vueltas);
  config.cambiarCada = Math.max(1, Number(config.cambiarCada) || DEFAULTS.cambiarCada);
  config.pausa = Number(config.pausa) || 0;

  const registro = (mensaje) => {
    if (!config.silencio) console.log(mensaje);
  };

  registro(`Simulación contra ${config.base}`);

  // Cuenta administradora: solo se usa para leer local, zonas y códigos.
  const adminToken = await iniciarSesion(
    config.base,
    config.adminCorreo,
    config.adminPassword,
  );

  const local = await resolverLocal(config.base, adminToken, config);

  const { zonas } = await api(
    config.base,
    `/api/zonas?localId=${local.id}`,
    { token: adminToken },
  );
  const zonasActivas = (zonas || []).filter((z) => z.activa !== false);
  if (!zonasActivas.length) {
    throw new Error(
      `El local "${local.nombre}" no tiene zonas. Créalas antes de simular.`,
    );
  }

  const comparativo = await api(
    config.base,
    `/api/inventarios/comparativo?localId=${local.id}`,
    { token: adminToken },
  );
  if (!comparativo.inventario) {
    throw new Error(
      `El local "${local.nombre}" no tiene un inventario activo. Actívalo antes de simular.`,
    );
  }
  const codigos = [...new Set((comparativo.productos || []).map((p) => p.codigoBarras))];
  if (!codigos.length) {
    throw new Error("El inventario activo no tiene códigos de barras para escanear.");
  }

  const correos = config.correos?.length
    ? config.correos
    : Array.from(
        { length: config.usuarios },
        (_, i) => `operario${i + 1}@benmoga.test`,
      );

  registro(
    `Local: ${local.nombre} (id ${local.id}) · ${zonasActivas.length} zonas · ` +
      `${codigos.length} códigos · ${correos.length} usuarios`,
  );
  registro(
    `Cada usuario hará ${config.vueltas} lecturas y cambiará de zona cada ` +
      `${config.cambiarCada}.`,
  );

  // Todos inician sesión primero; luego arrancan a escanear al mismo tiempo.
  const sesiones = [];
  for (let i = 0; i < correos.length; i++) {
    const correo = correos[i];
    try {
      const token = await iniciarSesion(config.base, correo, config.password);
      sesiones.push({ correo, token, indice: i });
    } catch (error) {
      throw new Error(
        `No se pudo iniciar sesión con ${correo}: ${error.message}. ` +
          "En el entorno de pruebas ejecuta `npm run e2e:datos` para crearlo.",
      );
    }
  }

  registro("Usuarios listos. Iniciando escaneos simultáneos...\n");
  const inicioEn = Date.now() + 800;

  const tareas = sesiones.map(async ({ correo, token, indice }) => {
    const esperaInicial = inicioEn - Date.now();
    if (esperaInicial > 0) await esperar(esperaInicial);

    let indiceZona = indice % zonasActivas.length;
    let zona = zonasActivas[indiceZona];
    let cambios = 0;
    let unidades = 0;
    const zonasVisitadas = [zona.numero];

    await api(config.base, "/api/zonas/seleccionar", {
      metodo: "POST",
      token,
      body: { zonaId: zona.id },
    });

    try {
      for (let n = 0; n < config.vueltas; n++) {
        if (n > 0 && n % config.cambiarCada === 0) {
          indiceZona = (indiceZona + 1) % zonasActivas.length;
          zona = zonasActivas[indiceZona];
          await api(config.base, "/api/zonas/seleccionar", {
            metodo: "POST",
            token,
            body: { zonaId: zona.id },
          });
          cambios++;
          if (!zonasVisitadas.includes(zona.numero)) zonasVisitadas.push(zona.numero);
          registro(`[${correo}] cambia a zona ${zona.numero}`);
        }

        const codigo = codigos[(indice * 5 + n) % codigos.length];
        const respuesta = await api(config.base, "/api/escaneos", {
          metodo: "POST",
          token,
          body: { codigoBarras: codigo },
        });
        unidades++;

        if (!config.silencio) {
          const r = respuesta.resumen || {};
          console.log(
            `[${correo}] zona ${zona.numero} · ${codigo} · ` +
              `zona=${r.totalEnZona ?? "?"} · mío=${r.unidades ?? "?"}`,
          );
        }
        if (config.pausa) await esperar(config.pausa);
      }

      if (config.finalizar) {
        await api(config.base, "/api/zonas/finalizar", { metodo: "POST", token });
      }

      return {
        correo,
        unidades,
        cambios,
        zonasVisitadas,
        estado: "ok",
      };
    } catch (error) {
      return {
        correo,
        unidades,
        cambios,
        zonasVisitadas,
        estado: "error",
        error: error.message,
      };
    }
  });

  const resultados = await Promise.all(tareas);

  let actividad = null;
  try {
    actividad = await api(
      config.base,
      `/api/zonas/actividad?localId=${local.id}`,
      { token: adminToken },
    );
  } catch {
    // El resumen por zona es informativo; si falla, no se interrumpe.
  }

  const resumen = {
    base: config.base,
    local: { id: local.id, nombre: local.nombre },
    usuarios: resultados,
    totalEscaneos: resultados.reduce((s, r) => s + r.unidades, 0),
    cambiosDeZona: resultados.reduce((s, r) => s + r.cambios, 0),
    errores: resultados.filter((r) => r.estado === "error"),
    actividad,
  };

  console.log("\nResumen por usuario:");
  for (const r of resultados) {
    console.log(
      `  ${r.correo}: ${r.unidades} lecturas · ${r.cambios} cambios de zona · ` +
        `zonas ${r.zonasVisitadas.join(", ")}` +
        (r.estado === "error" ? ` · ERROR: ${r.error}` : ""),
    );
  }
  console.log(
    `\nTotal: ${resumen.totalEscaneos} lecturas y ` +
      `${resumen.cambiosDeZona} cambios de zona en ${resultados.length} usuarios.`,
  );

  if (actividad?.zonas?.length) {
    console.log("\nEstado de las zonas:");
    for (const z of actividad.zonas) {
      const estado = z.enConteo ? "EN CONTEO" : z.terminada ? "TERMINADA" : "FALTANTE";
      console.log(
        `  Zona ${String(z.numero).padEnd(4)} ${String(z.tipo || "").padEnd(7)} ` +
          `${String(z.unidades).padStart(5)} unidades · ${estado}`,
      );
    }
  }
  console.log(
    "\nPara verlo en vivo: abre el sistema en el navegador, entra como " +
      `administradora (${config.adminCorreo}) y ve a Monitoreo.`,
  );

  return resumen;
}

// ---------------------------------------------------------------------------
// Ejecución directa desde la terminal
// ---------------------------------------------------------------------------
const ejecucionDirecta =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (ejecucionDirecta) {
  const opciones = opcionesDesdeArgv(process.argv.slice(2));

  if (opciones.ayuda) {
    console.log(
      [
        "Simula varios empleados escaneando y cambiando de zona al mismo tiempo.",
        "",
        "  node backend/scripts/simular-escaneos.js [opciones]",
        "",
        "Opciones:",
        "  --base=URL             Backend (defecto: http://localhost:3100)",
        "  --local=NOMBRE         Local (defecto: TIENDA PRUEBAS CYPRESS)",
        "  --local-id=ID          Usar el id del local",
        "  --usuarios=N           Empleados (defecto: 5)",
        "  --vueltas=N            Lecturas por empleado (defecto: 10)",
        "  --cambiar-cada=N       Lecturas antes de cambiar de zona (defecto: 4)",
        "  --pausa=MS             Pausa entre lecturas (defecto: 200)",
        "  --password=CLAVE       Contraseña de los operarios",
        "  --correos=a,b,c        Correos concretos",
        "  --admin-correo=...     Cuenta administradora para leer local/zonas/códigos",
        "  --admin-password=...   Contraseña de esa cuenta",
        "  --no-finalizar         Deja las zonas abiertas al terminar",
        "  --silencio             Solo muestra el resumen final",
        "",
        "Ejemplo:",
        "  node backend/scripts/simular-escaneos.js --usuarios=5 --vueltas=12 --pausa=300",
      ].join("\n"),
    );
    process.exit(0);
  }

  simularEscaneos(opciones)
    .then((resumen) => {
      process.exit(resumen.errores.length ? 1 : 0);
    })
    .catch((error) => {
      console.error("\nError:", error.message);
      process.exit(1);
    });
}
