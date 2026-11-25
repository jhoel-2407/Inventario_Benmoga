package com.benmoga.inventario;

import java.net.HttpURLConnection;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.net.URL;
import java.security.SecureRandom;
import java.security.cert.X509Certificate;
import java.util.Enumeration;
import java.util.Locale;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import javax.net.ssl.HostnameVerifier;
import javax.net.ssl.HttpsURLConnection;
import javax.net.ssl.SSLContext;
import javax.net.ssl.SSLSession;
import javax.net.ssl.TrustManager;
import javax.net.ssl.X509TrustManager;

/**
 * Componente de red: normaliza direcciones, comprueba si el servidor responde
 * y lo busca automáticamente dentro de la red local (Wi‑Fi).
 */
public final class ServidorRed {

    /** Puerto HTTP por defecto del backend. */
    public static final int PUERTO = 3000;

    /** Puerto HTTPS (necesario para usar la cámara del celular). */
    public static final int PUERTO_HTTPS = 3443;

    private ServidorRed() {
    }

    /**
     * Acepta "192.168.1.50", "192.168.1.50:3000", "https://algo.trycloudflare.com"
     * o la URL completa. Ignora mayúsculas, espacios y la ruta final.
     *
     * Regla de esquema y puerto:
     *  - Dirección de la red local (192.168.x, 10.x, 172.16-31.x, .local):
     *    `http://` y puerto {@link #PUERTO}, salvo que se pida `https://`
     *    a propósito, que usa {@link #PUERTO_HTTPS}.
     *  - Dirección de internet (un dominio, como el enlace del túnel): se
     *    respeta tal cual, SIN agregarle puerto; por defecto `https://`.
     */
    public static String normalizar(String cruda) {
        if (cruda == null) return "";
        String texto = cruda.trim().replace(" ", "");
        if (texto.isEmpty()) return "";

        String esquema = "";
        int separador = texto.indexOf("://");
        if (separador > 0) {
            // Deja el esquema siempre en minúsculas (Http:// -> http://).
            esquema = texto.substring(0, separador).toLowerCase(Locale.ROOT);
            texto = texto.substring(separador + 3);
        }
        // Solo interesa host[:puerto]: se descarta cualquier ruta o consulta.
        int corte = texto.indexOf('/');
        if (corte >= 0) texto = texto.substring(0, corte);

        String host = texto;
        int puerto = -1;
        int dosPuntos = texto.lastIndexOf(':');
        if (dosPuntos > 0) {
            try {
                puerto = Integer.parseInt(texto.substring(dosPuntos + 1));
                host = texto.substring(0, dosPuntos);
            } catch (NumberFormatException e) {
                puerto = -1;
            }
        }
        if (host.isEmpty()) return "";

        boolean local = esDireccionLocal(host);
        if (esquema.isEmpty()) esquema = local ? "http" : "https";
        if (puerto == -1 && local) puerto = "https".equals(esquema) ? PUERTO_HTTPS : PUERTO;

        return puerto == -1 ? esquema + "://" + host : esquema + "://" + host + ":" + puerto;
    }

    /**
     * ¿La dirección es de la red local? (IP privada, localhost o nombre .local).
     * Solo a estas se les pone el puerto por defecto del backend.
     */
    public static boolean esDireccionLocal(String host) {
        if (host == null) return false;
        String h = host.toLowerCase(Locale.ROOT);
        if (h.equals("localhost") || h.equals("127.0.0.1")) return true;
        if (h.endsWith(".local")) return true;
        String[] partes = h.split("\\.");
        if (partes.length != 4) return false;
        try {
            int a = Integer.parseInt(partes[0]);
            int b = Integer.parseInt(partes[1]);
            Integer.parseInt(partes[2]);
            Integer.parseInt(partes[3]);
            if (a == 10) return true;                        // 10.0.0.0/8
            if (a == 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
            if (a == 192 && b == 168) return true;            // 192.168.0.0/16
            if (a == 169 && b == 254) return true;            // 169.254.0.0/16
        } catch (NumberFormatException e) {
            return false;
        }
        return false;
    }

    /** Devuelve la misma dirección pero en HTTPS (para la cámara), o "". */
    public static String aHttps(String cruda) {
        String url = normalizar(cruda);
        if (url.isEmpty()) return "";
        try {
            URL original = new URL(url);
            String host = original.getHost();
            if (host == null || host.isEmpty()) return "";
            // Un dominio de internet (p. ej. el enlace del túnel) ya es HTTPS:
            // se deja tal cual, sin el puerto del backend local.
            if (!esDireccionLocal(host)) return url;
            return "https://" + host + ":" + PUERTO_HTTPS;
        } catch (Exception e) {
            return "";
        }
    }

    /** Hace GET a {base}/api/health y responde si contesta 200 (límite 1,5 s). */
    public static boolean responde(String base) {
        return responde(base, 1500);
    }

    /**
     * Igual que {@link #responde(String)} pero con el tiempo límite indicado.
     * La búsqueda en la red usa el corto; el botón "Probar" usa uno más largo,
     * porque un servidor de internet (el túnel) puede tardar más en contestar.
     */
    public static boolean responde(String base, int tiempoMs) {
        HttpURLConnection conexion = null;
        try {
            URL url = new URL(base + "/api/health");
            conexion = (HttpURLConnection) url.openConnection();
            if (conexion instanceof HttpsURLConnection) {
                // El certificado del servidor es propio de la red local: se acepta.
                aceptarCertificadoPropio((HttpsURLConnection) conexion);
            }
            conexion.setRequestMethod("GET");
            conexion.setConnectTimeout(tiempoMs);
            conexion.setReadTimeout(tiempoMs);
            conexion.setUseCaches(false);
            return conexion.getResponseCode() == 200;
        } catch (Exception e) {
            return false;
        } finally {
            if (conexion != null) conexion.disconnect();
        }
    }

    /** Acepta certificados autofirmados (solo para el servidor propio de la red). */
    private static void aceptarCertificadoPropio(HttpsURLConnection conexion) {
        try {
            SSLContext contexto = SSLContext.getInstance("TLS");
            contexto.init(null, new TrustManager[]{new X509TrustManager() {
                @Override
                public void checkClientTrusted(X509Certificate[] cadena, String tipo) {
                }

                @Override
                public void checkServerTrusted(X509Certificate[] cadena, String tipo) {
                }

                @Override
                public X509Certificate[] getAcceptedIssuers() {
                    return new X509Certificate[0];
                }
            }}, new SecureRandom());
            conexion.setSSLSocketFactory(contexto.getSocketFactory());
            conexion.setHostnameVerifier(new HostnameVerifier() {
                @Override
                public boolean verify(String host, SSLSession sesion) {
                    return true;
                }
            });
        } catch (Exception ignored) {
            // Si falla, se usa la validación normal.
        }
    }

    /** Prefijo de la red local, p. ej. "192.168.2." (o null si no hay Wi‑Fi). */
    public static String prefijoLocal() {
        String ip = ipLocal();
        if (ip == null) return null;
        return ip.substring(0, ip.lastIndexOf('.') + 1);
    }

    /** IPv4 local (Wi‑Fi/Ethernet) del propio dispositivo. */
    public static String ipLocal() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface red = interfaces.nextElement();
                if (!red.isUp() || red.isLoopback()) continue;
                Enumeration<InetAddress> direcciones = red.getInetAddresses();
                while (direcciones.hasMoreElements()) {
                    InetAddress dir = direcciones.nextElement();
                    if (dir instanceof Inet4Address
                            && !dir.isLoopbackAddress()
                            && dir.isSiteLocalAddress()) {
                        return dir.getHostAddress();
                    }
                }
            }
        } catch (Exception ignored) {
            // sin red disponible
        }
        return null;
    }

    /**
     * Recorre la subred local buscando el backend en el puerto {@link #PUERTO}.
     * Bloquea hasta ~8 s y devuelve la URL encontrada, o null.
     * Debe llamarse desde un hilo aparte (usa red).
     */
    public static String buscarServidor() {
        final String prefijo = prefijoLocal();
        if (prefijo == null) return null;

        final AtomicReference<String> hallado = new AtomicReference<>(null);
        final CountDownLatch fin = new CountDownLatch(254);
        final ExecutorService pool = Executors.newFixedThreadPool(40);
        for (int i = 1; i <= 254; i++) {
            final String host = prefijo + i;
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        String url = "http://" + host + ":" + PUERTO;
                        if (hallado.get() == null && responde(url)) {
                            hallado.compareAndSet(null, url);
                        }
                    } finally {
                        fin.countDown();
                    }
                }
            });
        }
        pool.shutdown();
        try {
            fin.await(8, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
        }
        pool.shutdownNow();
        return hallado.get();
    }
}
