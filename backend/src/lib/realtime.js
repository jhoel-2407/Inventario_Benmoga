import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";

// Conexiones activas: { ws, usuarioId, rol, localId }
const clientes = new Set();

const ADMIN = "ADMINISTRADORA";

function enviar(cliente, evento) {
  if (cliente.ws.readyState !== 1) return; // 1 = OPEN
  try {
    cliente.ws.send(JSON.stringify(evento));
  } catch {
    /* conexión caída: se limpia en el evento close */
  }
}

// Avisa a todos los clientes que estén viendo un local concreto.
export function emitirLocal(localId, evento) {
  if (!localId) return;
  for (const c of clientes) {
    if (Number(c.localId) === Number(localId)) enviar(c, evento);
  }
}

// Avisa a las administradoras (para notificaciones). Si se indica localId,
// solo a quienes estén viendo ese local (o aún no han elegido local).
export function emitirAdministradoras(evento, localId = null) {
  for (const c of clientes) {
    if (c.rol !== ADMIN) continue;
    if (localId && c.localId && Number(c.localId) !== Number(localId)) continue;
    enviar(c, evento);
  }
}

export function iniciarRealtime(server) {
  const wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    let payload = null;
    let cliente = null;
    let localId = null;
    let autenticado = false;
    let timer = null;

    try {
      const url = new URL(req.url, "http://localhost");
      localId = Number(url.searchParams.get("localId")) || null;
      const urlToken = url.searchParams.get("token");
      // Cookie httpOnly (preferida): el navegador la envía automáticamente.
      let cookieToken = null;
      const cookieHeader = req.headers.cookie || "";
      const match = cookieHeader.match(/(?:^|;\s*)levis_token=([^;]+)/);
      if (match) cookieToken = decodeURIComponent(match[1]);
      const tokenInicial = urlToken || cookieToken;
      if (tokenInicial) {
        payload = jwt.verify(tokenInicial, process.env.JWT_SECRET);
        cliente = { ws, usuarioId: Number(payload.sub), rol: payload.rol, localId };
        clientes.add(cliente);
        autenticado = true;
        enviar(cliente, { tipo: "conectado", mensaje: "Tiempo real activo" });
      }
    } catch {
      ws.close(4001, "No autorizado");
      return;
    }

    if (!autenticado) {
      timer = setTimeout(() => {
        if (!autenticado) {
          try { ws.close(4001, "No autorizado"); } catch { /* ignora */ }
        }
      }, 10000);
    }

    ws.on("message", (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }

      if (!autenticado) {
        if (msg?.tipo === "auth" && msg?.token) {
          try {
            const p = jwt.verify(msg.token, process.env.JWT_SECRET);
            localId = Number(msg.localId) || localId;
            payload = p;
            cliente = { ws, usuarioId: Number(p.sub), rol: p.rol, localId };
            clientes.add(cliente);
            autenticado = true;
            if (timer) { clearTimeout(timer); timer = null; }
            enviar(cliente, { tipo: "conectado", mensaje: "Tiempo real activo" });
          } catch {
            try { ws.close(4001, "No autorizado"); } catch { /* ignora */ }
          }
        }
        return;
      }

      if (msg?.tipo === "suscribir" && cliente) {
        cliente.localId = Number(msg.localId) || cliente.localId;
      }
    });

    const limpiar = () => {
      if (timer) clearTimeout(timer);
      if (cliente) clientes.delete(cliente);
    };
    ws.on("close", limpiar);
    ws.on("error", limpiar);
  });

  console.log("WebSocket disponible en /ws");
  return wss;
}