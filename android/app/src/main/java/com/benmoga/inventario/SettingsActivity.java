package com.benmoga.inventario;

import android.app.Activity;
import android.os.Bundle;
import android.view.View;
import android.widget.Button;
import android.widget.EditText;
import android.widget.ProgressBar;
import android.widget.TextView;

/**
 * Pantalla para indicar la dirección del servidor (la PC con el backend).
 * Permite escribirla, probarla y buscarla automáticamente en la red Wi‑Fi.
 *
 * La lógica de red vive en {@link ServidorRed}; aquí solo está la interfaz.
 */
public class SettingsActivity extends Activity {

    private EditText urlInput;
    private Button botonDetectar;
    private Button botonHttps;
    private ProgressBar progreso;
    private TextView estado;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_settings);

        urlInput = findViewById(R.id.urlInput);
        botonDetectar = findViewById(R.id.detectBtn);
        botonHttps = findViewById(R.id.httpsBtn);
        progreso = findViewById(R.id.progress);
        estado = findViewById(R.id.statusText);

        String actual = ServerPrefs.getUrl(this);
        if (!actual.isEmpty()) {
            urlInput.setText(actual);
            urlInput.setSelection(actual.length());
        } else {
            // Primera vez: se busca el servidor automáticamente en la red.
            urlInput.post(this::buscarEnLaRed);
        }

        findViewById(R.id.saveBtn).setOnClickListener(v -> guardar());
        findViewById(R.id.cancelBtn).setOnClickListener(v -> {
            setResult(RESULT_CANCELED);
            finish();
        });
        findViewById(R.id.testBtn).setOnClickListener(v -> probar(urlInput.getText().toString()));
        botonDetectar.setOnClickListener(v -> buscarEnLaRed());
        botonHttps.setOnClickListener(v -> usarHttps());
    }

    private void guardar() {
        String url = ServidorRed.normalizar(urlInput.getText().toString());
        if (url.isEmpty()) {
            estado.setText(R.string.settings_url_hint);
            return;
        }
        ServerPrefs.setUrl(this, url);
        setResult(RESULT_OK);
        finish();
    }

    /** Comprueba que la dirección responda (GET /api/health) sin salir de la pantalla. */
    private void probar(final String cruda) {
        final String url = ServidorRed.normalizar(cruda);
        if (url.isEmpty()) {
            estado.setText(R.string.settings_url_hint);
            return;
        }
        bloquear(true);
        estado.setText(getString(R.string.test_testing_dir, url));
        new Thread(() -> {
            final boolean ok = ServidorRed.responde(url, 7000);
            runOnUiThread(() -> {
                bloquear(false);
                estado.setText(ok ? R.string.test_ok : R.string.test_fail);
            });
        }).start();
    }

    /** Pasa la dirección actual a HTTPS (puerto 3443) para usar la cámara. */
    private void usarHttps() {
        String https = ServidorRed.aHttps(urlInput.getText().toString());
        if (https.isEmpty()) {
            estado.setText(R.string.settings_url_hint);
            return;
        }
        urlInput.setText(https);
        urlInput.setSelection(https.length());
        estado.setText(R.string.settings_https_listo);
    }

    /** Recorre la subred local buscando el backend. */
    private void buscarEnLaRed() {
        final String prefijo = ServidorRed.prefijoLocal();
        if (prefijo == null) {
            estado.setText(R.string.detect_sin_ip);
            return;
        }
        estado.setText(getString(R.string.detect_searching, prefijo + "0/24"));
        bloquear(true);

        new Thread(() -> {
            final String encontrado = ServidorRed.buscarServidor();
            runOnUiThread(() -> {
                bloquear(false);
                if (encontrado != null) {
                    urlInput.setText(encontrado);
                    urlInput.setSelection(encontrado.length());
                    estado.setText(getString(R.string.detect_found, encontrado));
                } else {
                    estado.setText(R.string.detect_none);
                }
            });
        }).start();
    }

    private void bloquear(boolean activo) {
        progreso.setVisibility(activo ? View.VISIBLE : View.GONE);
        botonDetectar.setEnabled(!activo);
        botonHttps.setEnabled(!activo);
    }
}
