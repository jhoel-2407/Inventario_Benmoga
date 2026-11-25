package com.benmoga.inventario;

import android.content.Intent;
import android.webkit.WebView;

import org.json.JSONObject;

/**
 * Componente de escaneo para los lectores Zebra.
 *
 * Funciona de dos formas:
 *  - DataWedge con salida de teclado (Keystroke): el código llega directo al
 *    campo de la página, sin pasar por aquí.
 *  - DataWedge con salida por Intent: el código llega a la actividad y aquí se
 *    inyecta en la página como si se hubiera tecleado.
 */
public final class ZebraScanner {

    private static final String EXTRA_DATAWEDGE = "com.symbol.datawedge.data_string";

    private ZebraScanner() {
    }

    /** Extrae el código escaneado del Intent (o null si no viene ninguno). */
    public static String codigoDe(Intent intent) {
        if (intent == null) return null;
        String codigo = intent.getStringExtra(EXTRA_DATAWEDGE);
        if (codigo == null) codigo = intent.getStringExtra(Intent.EXTRA_TEXT);
        if (codigo == null) return null;
        codigo = codigo.trim();
        return codigo.isEmpty() ? null : codigo;
    }

    /** Inyecta el código en la página como si se hubiera tecleado. */
    public static void inyectar(final WebView webView, final String codigo) {
        if (webView == null || codigo == null) return;
        String script = "(function(c){try{for(var i=0;i<c.length;i++){var k=c.charAt(i);"
                + "document.dispatchEvent(new KeyboardEvent('keydown',{key:k,bubbles:true}));"
                + "document.dispatchEvent(new KeyboardEvent('keyup',{key:k,bubbles:true}));}"
                + "document.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));"
                + "}catch(e){}})(" + JSONObject.quote(codigo) + ");";
        webView.post(new Runnable() {
            @Override
            public void run() {
                webView.evaluateJavascript(script, null);
            }
        });
    }
}
