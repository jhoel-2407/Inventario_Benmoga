import { API_URL } from './api.js';

// Abre una conexión WebSocket autenticada al backend y reconecta sola si se cae.
// El token NO viaja en la URL (evita que quede en logs/proxies); se envía como
// primer mensaje tras abrir la conexión.
export function conectarRealtime({ localId, onEvento, onEstado }) {
  const base = API_URL.replace(/^http/, 'ws');
  const url = `${base}/ws`;

  let ws = null;
  let cerrado = false;
  let reintento = 0;
  let timer = null;

  const abrir = () => {
    if (cerrado) return;
    ws = new WebSocket(url);
    ws.onopen = () => {
      reintento = 0;
      onEstado?.('conectado');
      // La cookie httpOnly se envía automáticamente en el handshake.
      // Se mantiene el mensaje auth por compatibilidad (sin token).
      try { ws.send(JSON.stringify({ tipo: 'suscribir', localId: localId || null })); } catch { /* ignora */ }
      if (cerrado) { try { ws.close(); } catch { /* ignora */ } }
    };
    ws.onmessage = (evento) => {
      if (cerrado) return;
      try {
        const data = JSON.parse(evento.data);
        onEvento?.(data);
      } catch { /* mensaje no válido */ }
    };
    ws.onclose = () => {
      if (cerrado) return;
      onEstado?.('desconectado');
      const espera = Math.min(1000 * 2 ** reintento, 15000);
      reintento += 1;
      timer = setTimeout(abrir, espera);
    };
    ws.onerror = () => { /* onclose se encarga del reintento */ };
  };
  abrir();

  return () => {
    cerrado = true;
    if (timer) clearTimeout(timer);
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.close(); } catch { /* ignora */ }
    }
  };
}