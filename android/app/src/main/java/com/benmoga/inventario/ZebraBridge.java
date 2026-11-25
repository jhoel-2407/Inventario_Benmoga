package com.benmoga.inventario;

import android.content.Context;
import android.webkit.JavascriptInterface;

/**
 * Puente entre la app Android y la página web para el diagnóstico del lector Zebra.
 * Expone información sobre cómo llegan los códigos escaneados (teclado/Intent)
 * y confirma el estado del dispositivo.
 */
public class ZebraBridge {
    private final Context context;

    public ZebraBridge(Context context) {
        this.context = context;
    }

    @JavascriptInterface
    public String getInfo() {
        try {
            return "{\"so\":\"Android " + android.os.Build.VERSION.RELEASE + "\","
                    + "\"dispositivo\":\"" + escape(android.os.Build.MANUFACTURER + " " + android.os.Build.MODEL) + "\","
                    + "\"paquete\":\"" + escape(context.getPackageName()) + "\","
                    + "\"pantallaSiempreEncendida\":true,"
                    + "\"soportaIntentDataWedge\":true}";
        } catch (Exception e) {
            return "{\"error\":\"" + escape(e.getMessage()) + "\"}";
        }
    }

    private String escape(String s) {
        if (s == null) return "";
        return s.replace("\\", "\\\\").replace("\"", "\\\"").replace("\n", " ").replace("\r", " ");
    }
}
