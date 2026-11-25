package com.benmoga.inventario;

import android.Manifest;
import android.app.Activity;
import android.content.pm.PackageManager;
import android.webkit.PermissionRequest;

/**
 * Componente de cámara: gestiona el permiso de Android y autoriza la cámara
 * que pide la página (getUserMedia) para el escaneo desde el celular.
 */
public final class CamaraHelper {

    public static final int CODIGO_PETICION = 2001;

    private final Activity actividad;
    private PermissionRequest pedidoWebPendiente;

    public CamaraHelper(Activity actividad) {
        this.actividad = actividad;
    }

    public boolean tienePermiso() {
        return actividad.checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED;
    }

    /** Pide el permiso de cámara a Android si aún no se tiene. */
    public void pedir() {
        if (!tienePermiso()) {
            actividad.requestPermissions(new String[]{Manifest.permission.CAMERA}, CODIGO_PETICION);
        }
    }

    /** True si la petición del navegador es para usar la cámara. */
    public static boolean esPeticionDeCamara(PermissionRequest request) {
        for (String recurso : request.getResources()) {
            if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(recurso)) return true;
        }
        return false;
    }

    /** Atiende la petición de cámara hecha por la página (getUserMedia). */
    public void atender(boolean esCamara, PermissionRequest request) {
        if (esCamara && tienePermiso()) {
            request.grant(request.getResources());
        } else {
            // Se guarda y se vuelve a pedir el permiso de Android; cuando el
            // usuario lo concede, se autoriza la cámara del WebView.
            pedidoWebPendiente = request;
            pedir();
        }
    }

    /** Debe llamarse desde Activity.onRequestPermissionsResult. */
    public void resultado(int requestCode, int[] grantResults) {
        if (requestCode != CODIGO_PETICION || pedidoWebPendiente == null) return;
        boolean concedido = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (concedido) {
            pedidoWebPendiente.grant(pedidoWebPendiente.getResources());
        } else {
            pedidoWebPendiente.deny();
        }
        pedidoWebPendiente = null;
    }
}
