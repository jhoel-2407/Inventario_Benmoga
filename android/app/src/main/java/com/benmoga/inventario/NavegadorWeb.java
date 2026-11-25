package com.benmoga.inventario;

import android.net.Uri;
import android.net.http.SslError;
import android.os.Handler;
import android.os.Looper;
import android.webkit.ConsoleMessage;
import android.webkit.PermissionRequest;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Componente del navegador: deja el WebView listo para mostrar toda la
 * aplicación web (JavaScript, almacenamiento local, cámara, certificados
 * propios de la red local, etc.).
 *
 * Además vigila el resultado de la carga: si la página no se dibuja (típico de
 * un WebView antiguo) lo avisa, para poder saber qué pasó en cada equipo.
 *
 * La pantalla que lo usa implementa {@link Eventos} para reaccionar.
 */
public final class NavegadorWeb {

    /** Eventos que la pantalla principal debe atender. */
    public interface Eventos {
        void alCambiarProgreso(int porcentaje);

        /** La página principal no se pudo cargar (sin red, IP mala, etc.). */
        void alFallarCargaPrincipal(String detalle);

        boolean alAbrirEnlaceExterno(Uri uri);

        void alPedirPermisoWeb(PermissionRequest request);

        /** La página reportó un error de JavaScript (se muestra en el diagnóstico). */
        void alMensajeConsola(String mensaje);

        /** La página cargó (HTTP 200) pero la aplicación no se dibujó. */
        void alPaginaEnBlanco();

        /**
         * Cambió el historial: navegación dentro de la aplicación (pushState) o
         * retroceso. Se usa para mostrar u ocultar el botón de "atrás".
         */
        void alHistorialActualizado();
    }

    private NavegadorWeb() {
    }

    public static void configurar(final WebView webView, final Eventos eventos) {
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setJavaScriptCanOpenWindowsAutomatically(true);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setUserAgentString(s.getUserAgentString() + " InventarioBENMOGA/1.0");

        // Puente para diagnóstico del lector Zebra desde la web.
        try {
            webView.addJavascriptInterface(new ZebraBridge(webView.getContext()), "BenmogaZebra");
        } catch (Exception ignored) {
            // Ignorar si no se puede añadir el puente
        }

        // Permite inspeccionar la app con chrome://inspect desde la PC (pruebas).
        WebView.setWebContentsDebuggingEnabled(true);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return eventos.alAbrirEnlaceExterno(request.getUrl());
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                eventos.alCambiarProgreso(100);
                eventos.alHistorialActualizado();
                comprobarContenido(view, eventos);
            }

            /**
             * Se dispara también cuando la aplicación web cambia de pantalla
             * sin recargar (React Router), así el botón de "atrás" no se queda
             * desactualizado.
             */
            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                eventos.alHistorialActualizado();
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    eventos.alFallarCargaPrincipal("código " + error.getErrorCode()
                            + ": " + error.getDescription());
                }
            }

            @Override
            public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Certificado propio de la red local (autofirmado). En pruebas se
                // acepta para poder usar el backend en HTTPS (:3443) y la cámara.
                handler.proceed();
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int avance) {
                eventos.alCambiarProgreso(avance);
            }

            @Override
            public void onPermissionRequest(PermissionRequest request) {
                eventos.alPedirPermisoWeb(request);
            }

            @Override
            public boolean onConsoleMessage(ConsoleMessage mensaje) {
                if (mensaje != null && mensaje.messageLevel() == ConsoleMessage.MessageLevel.ERROR) {
                    eventos.alMensajeConsola(mensaje.message());
                }
                return false;
            }
        });
    }

    /**
     * Poco después de terminar la carga, comprueba si la aplicación web alcanzó
     * a dibujarse dentro del contenedor #root. Si no, avisa.
     */
    private static void comprobarContenido(final WebView webView, final Eventos eventos) {
        new Handler(Looper.getMainLooper()).postDelayed(new Runnable() {
            @Override
            public void run() {
                try {
                    webView.evaluateJavascript(
                            "(function(){var r=document.getElementById('root');"
                                    + "return (r&&r.children.length>0)?'ok':'vacio';})()",
                            new ValueCallback<String>() {
                                @Override
                                public void onReceiveValue(String valor) {
                                    if (valor != null && valor.contains("vacio")) {
                                        eventos.alPaginaEnBlanco();
                                    }
                                }
                            });
                } catch (Exception ignored) {
                    // si el WebView ya no está disponible
                }
            }
        }, 5000);
    }
}
