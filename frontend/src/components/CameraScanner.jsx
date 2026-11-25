import { useEffect, useRef, useState } from 'react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { Camera, CameraOff, ScanLine } from 'lucide-react';

// Escáner por cámara. Si el dispositivo no tiene cámara (p. ej. Zebra TC20),
// muestra un aviso claro en lugar de dejar la pantalla en negro.
export default function CameraScanner({ onCode, onClose }) {
  const videoRef = useRef(null);
  const controlsRef = useRef(null);
  const vivoRef = useRef(true);
  const estadoRef = useRef('iniciando');
  const [estado, setEstado] = useState('iniciando'); // iniciando | activo | error
  const [error, setError] = useState('');

  useEffect(() => {
    vivoRef.current = true;
    estadoRef.current = 'iniciando';
    let lector = null;
    let timeout = null;

    const cambiarEstado = (nuevo) => { estadoRef.current = nuevo; setEstado(nuevo); };

    const fallar = (mensaje) => {
      if (!vivoRef.current || estadoRef.current === 'error') return;
      cambiarEstado('error');
      setError(mensaje);
    };

    async function iniciar() {
      // 1) ¿Existe la API de cámara?
      if (!navigator.mediaDevices?.getUserMedia) {
        return fallar('Este dispositivo no ofrece acceso a cámara. Usa el lector físico del equipo.');
      }
      // 2) ¿Hay alguna cámara conectada?
      try {
        const dispositivos = await navigator.mediaDevices.enumerateDevices();
        const camaras = dispositivos.filter((d) => d.kind === 'videoinput');
        if (!camaras.length) {
          return fallar('Este dispositivo no tiene cámara. Usa el lector físico del equipo.');
        }
      } catch { /* seguimos e intentamos abrir directamente */ }

      // 3) Intentar abrir la cámara
      try {
        lector = new BrowserMultiFormatReader();
        await lector.decodeFromVideoDevice(undefined, videoRef.current, (result, _err, controls) => {
          if (!vivoRef.current) return;
          if (controls && !controlsRef.current) controlsRef.current = controls;
          if (result) {
            const value = result.getText();
            if (value) {
              vivoRef.current = false;
              try { controlsRef.current?.stop(); } catch { /* ignora */ }
              onCode(value);
            }
          }
        });
      } catch (e) {
        return fallar('No se pudo abrir la cámara. Revisa los permisos del navegador.');
      }
    }

    // Red de seguridad: si en 8s no hay imagen, avisamos en vez de seguir en negro.
    timeout = setTimeout(() => {
      if (!vivoRef.current || estadoRef.current !== 'iniciando') return;
      const video = videoRef.current;
      if (!video || !video.videoWidth) {
        fallar('No se detectó imagen de cámara en este dispositivo.');
      }
    }, 8000);

    iniciar();

    return () => {
      vivoRef.current = false;
      if (timeout) clearTimeout(timeout);
      try { controlsRef.current?.stop(); } catch { /* ignora */ }
      controlsRef.current = null;
      try { lector?.reset?.(); } catch { /* ignora */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onCode]);

  return (
    <div className="camera-box">
      <div className="camera-head">
        <span><Camera size={18}/> Escáner de cámara</span>
        <button className="icon-btn" onClick={onClose} aria-label="Cerrar cámara"><CameraOff size={18}/></button>
      </div>
      {estado !== 'error' && <video ref={videoRef} className="camera-video" muted playsInline onPlaying={() => { if (vivoRef.current) { estadoRef.current = 'activo'; setEstado('activo'); } }} />}
      {estado === 'iniciando' && <p className="muted small"><span className="spinner"/> Abriendo cámara…</p>}
      {estado === 'activo' && <p className="muted small">Centra el código de barras dentro de la imagen.</p>}
      {estado === 'error' && (
        <div className="camera-error">
          <ScanLine size={24}/>
          <b>{error}</b>
          <p className="muted small">En el Zebra TC20/TC21 usa el gatillo o el lector como teclado: apunta al código y se registra solo en el campo «Código de barras».</p>
          <button className="btn secondary" onClick={onClose}>Cerrar</button>
        </div>
      )}
    </div>
  );
}
