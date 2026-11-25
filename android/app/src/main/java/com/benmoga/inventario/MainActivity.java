package com.benmoga.inventario;

import android.app.Activity;
import android.app.ActionBar;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.Log;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.WindowManager;
import android.webkit.PermissionRequest;
import android.webkit.WebView;
import android.widget.ProgressBar;
import android.widget.Toast;

import androidx.swiperefreshlayout.widget.SwipeRefreshLayout;

/**
 * Pantalla principal de la app.
 *
 * Muestra TODO el sistema (login, zonas, escaneo, comparativo, monitoreo…) en un
 * WebView, cargándolo desde el backend que corre en la PC (http://IP:3000).
 *
 * Cada responsabilidad vive en su propio componente:
 *   - {@link NavegadorWeb}  → configura el WebView y vigila la carga.
 *   - {@link ServidorRed}   → direcciones y búsqueda del servidor.
 *   - {@link CamaraHelper}  → permiso de cámara.
 *   - {@link ZebraScanner}  → escaneo del lector Zebra.
 *   - {@link ServerPrefs}   → guarda la dirección elegida.
 */
public class MainActivity extends Activity implements NavegadorWeb.Eventos {

    private static final String TAG = "InventarioBENMOGA";
    private static final int REQ_CONFIG = 1001;

    private static final int MENU_REFRESH = 1;
    private static final int MENU_SERVER = 2;
    private static final int MENU_DIAG = 3;

    private WebView webView;
    private ProgressBar progreso;
    private SwipeRefreshLayout swipe;
    private CamaraHelper camara;
    private String serverUrl = "";

    /** Último error de JavaScript que reportó la página (para el diagnóstico). */
    private String ultimoErrorJs = "";
    private boolean avisoBlancoMostrado = false;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        // Mantener la pantalla encendida mientras el conteo esté activo en el Zebra/celular.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = findViewById(R.id.webview);
        progreso = findViewById(R.id.progress);
        swipe = findViewById(R.id.swipe);
        camara = new CamaraHelper(this);

        // Deslizar desde arriba hacia abajo recarga la página (como otras apps).
        swipe.setColorSchemeResources(
                android.R.color.holo_blue_dark,
                android.R.color.holo_green_dark,
                android.R.color.holo_orange_dark);
        swipe.setOnRefreshListener(this::recargarDeslizando);

        NavegadorWeb.configurar(webView, this);

        serverUrl = ServerPrefs.getUrl(this);
        if (serverUrl.isEmpty()) {
            abrirConfiguracion();
        } else {
            cargar(serverUrl);
        }

        camara.pedir();

        String codigo = ZebraScanner.codigoDe(getIntent());
        if (codigo != null) {
            ZebraScanner.inyectar(webView, codigo);
        }
    }

    // ------------------------------------------------------- NavegadorWeb.Eventos

    @Override
    public void alCambiarProgreso(int porcentaje) {
        if (porcentaje < 100) {
            progreso.setVisibility(View.VISIBLE);
            progreso.setProgress(porcentaje);
        } else {
            progreso.setVisibility(View.GONE);
            if (swipe != null) swipe.setRefreshing(false);
            actualizarBotonAtras();
        }
    }

    @Override
    public void alFallarCargaPrincipal(String detalle) {
        progreso.setVisibility(View.GONE);
        if (swipe != null) swipe.setRefreshing(false);
        mostrarErrorConexion(detalle);
    }

    @Override
    public boolean alAbrirEnlaceExterno(Uri uri) {
        if (uri == null) return false;
        String esquema = uri.getScheme();
        if (esquema == null) return false;
        if (esquema.equals("http") || esquema.equals("https")) {
            return false; // lo carga el propio WebView
        }
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, uri));
        } catch (Exception e) {
            Log.w(TAG, "No se pudo abrir el enlace: " + uri);
        }
        return true;
    }

    @Override
    public void alPedirPermisoWeb(final PermissionRequest request) {
        runOnUiThread(() -> camara.atender(CamaraHelper.esPeticionDeCamara(request), request));
    }

    @Override
    public void alMensajeConsola(String mensaje) {
        ultimoErrorJs = mensaje == null ? "" : mensaje;
        Log.e(TAG, "Error de la página: " + ultimoErrorJs);
    }

    @Override
    public void alPaginaEnBlanco() {
        if (avisoBlancoMostrado || isFinishing()) return;
        avisoBlancoMostrado = true;
        new AlertDialog.Builder(this)
                .setTitle(R.string.blank_title)
                .setMessage(getString(R.string.blank_message,
                        versionWebView(), ultimoErrorJs.isEmpty() ? "(sin detalle)" : ultimoErrorJs))
                .setPositiveButton(R.string.menu_diag, (d, w) -> mostrarDiagnostico())
                .setNegativeButton(R.string.error_retry, (d, w) -> cargar(serverUrl))
                .show();
    }

    @Override
    public void alHistorialActualizado() {
        actualizarBotonAtras();
    }

    // ------------------------------------------------------ Gesto "deslizar"

    /** Se ejecuta al deslizar desde arriba hacia abajo: recarga la página. */
    private void recargarDeslizando() {
        if (serverUrl.isEmpty()) {
            swipe.setRefreshing(false);
            abrirConfiguracion();
            return;
        }
        ultimoErrorJs = "";
        avisoBlancoMostrado = false;
        webView.reload();
    }

    // --------------------------------------------------------- Botón "atrás"

    /** Muestra la flecha de la barra de título solo cuando hay historia. */
    private void actualizarBotonAtras() {
        final ActionBar bar = getActionBar();
        if (bar != null) {
            bar.setDisplayHomeAsUpEnabled(webView != null && webView.canGoBack());
        }
    }

    /** Retrocede en el historial de la aplicación web. */
    private void volverAtras() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        }
    }

    // -------------------------------------------------------------------- Carga

    private void cargar(String url) {
        String normalizada = ServidorRed.normalizar(url);
        if (normalizada.isEmpty()) {
            abrirConfiguracion();
            return;
        }
        serverUrl = normalizada;
        ultimoErrorJs = "";
        avisoBlancoMostrado = false;
        progreso.setVisibility(View.VISIBLE);
        webView.loadUrl(serverUrl + "/");
    }

    private void mostrarErrorConexion(String detalle) {
        if (isFinishing()) return;
        String extra = detalle == null || detalle.isEmpty() ? "" : "\n\nDetalle: " + detalle;
        new AlertDialog.Builder(this)
                .setTitle(R.string.error_title)
                .setMessage(getString(R.string.error_message, serverUrl) + extra)
                .setCancelable(false)
                .setPositiveButton(R.string.error_retry, (d, w) -> cargar(serverUrl))
                .setNeutralButton(R.string.menu_diag, (d, w) -> mostrarDiagnostico())
                .setNegativeButton(R.string.error_change, (d, w) -> abrirConfiguracion())
                .show();
    }

    // ------------------------------------------------------------- Diagnóstico

    private void mostrarDiagnostico() {
        new AlertDialog.Builder(this)
                .setTitle(R.string.menu_diag)
                .setMessage(diagnostico())
                .setPositiveButton(android.R.string.ok, null)
                .show();
    }

    private String diagnostico() {
        StringBuilder texto = new StringBuilder();
        texto.append("Android: ").append(Build.VERSION.RELEASE)
                .append(" (API ").append(Build.VERSION.SDK_INT).append(")\n");
        texto.append("WebView: ").append(versionWebView()).append("\n");
        texto.append("Servidor: ")
                .append(serverUrl.isEmpty() ? "(sin configurar)" : serverUrl).append("\n");
        texto.append("\n");
        if (ultimoErrorJs.isEmpty()) {
            texto.append("La página no ha reportado errores.");
        } else {
            texto.append("Último error de la página:\n").append(ultimoErrorJs);
        }
        return texto.toString();
    }

    private String versionWebView() {
        try {
            PackageInfo info = WebView.getCurrentWebViewPackage();
            if (info != null && info.versionName != null) return info.versionName;
        } catch (Exception ignored) {
            // versión no disponible
        }
        return "desconocida";
    }

    // ------------------------------------------------------------- Configuración

    private void abrirConfiguracion() {
        startActivityForResult(new Intent(this, SettingsActivity.class), REQ_CONFIG);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_CONFIG) return;
        if (resultCode == RESULT_OK) {
            serverUrl = ServerPrefs.getUrl(this);
            cargar(serverUrl);
        } else if (serverUrl.isEmpty()) {
            Toast.makeText(this, R.string.toast_configure, Toast.LENGTH_LONG).show();
        }
    }

    // ------------------------------------------------------------------ Permisos

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        camara.resultado(requestCode, grantResults);
    }

    // ---------------------------------------------------------------------- Menú

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, MENU_REFRESH, 0, R.string.menu_refresh);
        menu.add(0, MENU_SERVER, 1, R.string.menu_server);
        menu.add(0, MENU_DIAG, 2, R.string.menu_diag);
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        int id = item.getItemId();
        if (id == android.R.id.home) {
            // Flecha "←" de la barra de título.
            volverAtras();
            return true;
        }
        if (id == MENU_REFRESH) {
            if (serverUrl.isEmpty()) {
                abrirConfiguracion();
            } else {
                cargar(serverUrl);
            }
            return true;
        }
        if (id == MENU_SERVER) {
            abrirConfiguracion();
            return true;
        }
        if (id == MENU_DIAG) {
            mostrarDiagnostico();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    // ------------------------------------------------------------------- Escaneo

    /** DataWedge (Intent Output) entrega el código escaneado a la actividad. */
    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        String codigo = ZebraScanner.codigoDe(intent);
        if (codigo != null) {
            ZebraScanner.inyectar(webView, codigo);
        }
    }

    // --------------------------------------------------------------------- Ciclo

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            volverAtras();
        } else {
            super.onBackPressed();
        }
    }
}
