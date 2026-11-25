package com.benmoga.inventario;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * Guarda la dirección del servidor (la PC donde corre el backend) en las
 * preferencias del dispositivo, para no tener que escribirla cada vez.
 */
public final class ServerPrefs {
    private static final String PREFS = "benmoga_inventario";
    private static final String KEY_URL = "server_url";

    private ServerPrefs() {
    }

    public static String getUrl(Context context) {
        String url = prefs(context).getString(KEY_URL, "");
        return url == null ? "" : url.trim();
    }

    public static void setUrl(Context context, String url) {
        prefs(context).edit().putString(KEY_URL, url == null ? "" : url.trim()).apply();
    }

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
