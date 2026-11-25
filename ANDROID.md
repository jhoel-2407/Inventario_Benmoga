# App Android — Inventario BENMOGA

El proyecto completo (login, zonas, escaneo, comparativo, monitoreo…) funciona
dentro de una **app Android nativa** que puedes abrir en **Android Studio**,
instalar en **varios celulares** y en los **lectores Zebra**, todos conectados a
la **misma red Wi‑Fi** que la PC donde corre el backend.

La app es un contenedor: carga el sistema web desde el servidor de la PC
(`http://IP:3000`), así que no hay que reescribir nada y siempre verás la misma
información en todos los dispositivos.

```
Celular 1 ┐
Celular 2 ├── Wi-Fi ──►  PC (backend + web)  http://192.168.x.x:3000
Zebra TC20┘
```

---

## 1. Requisitos

- **Android Studio** instalado en la PC (incluye el SDK). Descárgalo en
  <https://developer.android.com/studio>.
- **Node.js** (ya lo tienes, lo usa el backend).
- PC y dispositivos en la **misma red Wi‑Fi** (no la red de invitados).

---

## Paso 1 — Preparar el servidor en la PC

1. Compila la web para que el backend la sirva (solo cuando cambies el frontend):
   - Doble clic en **`publicar-web.bat`**, o
   ```powershell
   cd frontend
   npm run build
   ```
2. Abre el firewall una sola vez: clic derecho en **`abrir-firewall-red.cmd`** →
   **Ejecutar** → acepta el permiso de administrador. Abre los puertos
   **3000**, **3443** y **5173**.

   > ⚠️ Si el Windows pide permiso para `node.exe` en la red **privada**,
   > acepta. Si no, los celulares no podrán conectarse.

   > 💡 **Atajo:** el archivo **`iniciar-tienda.bat`** hace los pasos 1 y 2 de una
   > sola vez (compila la web, abre el firewall, deja la Wi‑Fi en *Privada*) y
   > además enciende el servidor. Un solo doble clic y aceptas el aviso de Windows.

3. Enciende el servidor:

   ```powershell
   cd backend
   npm run dev
   ```

   La consola muestra las direcciones de la red, por ejemplo:

   ```
   API BENMOGA Inventario disponible en:
     - Este equipo:  http://localhost:3000
     - Red (Wi-Fi): http://192.168.2.120:3000
   HTTPS (cámara del celular) disponible en:
     - Red (Wi-Fi): https://192.168.2.120:3443
   ```

   **Anota esa IP** (`192.168.2.120` en el ejemplo). La app Android la usará.
   (Si cambia la IP, ejecuta otra vez `generar-certificado.ps1`.)

> Para que la cámara del celular funcione usa `https://IP:3443`; para el Zebra
> (lector por láser) usa `http://IP:3000`, que es más directo.

> 💡 Para entrar **desde otra red o con datos móviles** (sin compartir la Wi‑Fi),
> ejecuta **`tunel-web.bat`** en la PC y en la app escribe el enlace
> `https://…trycloudflare.com` que muestra. Como ya es HTTPS, la **cámara
> funciona sin instalar certificados**.

---

## Paso 2: abrir el proyecto en Android Studio

1. Abre **Android Studio** → **Open** (o *File ▸ Open*).
2. Selecciona la carpeta **`android`** de este proyecto
   (`D:\SENA-PRACTICAS\PRACTICAS 1\App3\levis-inventario-completo\android`).
3. Espera a que termine el **Gradle Sync** (la primera vez descarga Gradle y las
   herramientas). Si pide instalar el **SDK 34**, acepta.
4. Conecta el celular o el Zebra por **USB** con la *depuración USB* activada y
   pulsa **Run ▸ Run 'app'** (triángulo verde). Android Studio compila e instala.

### Generar el APK para instalarlo en varios equipos
- **Menú ▸ Build ▸ Build Bundle(s) / APK(s) ▸ Build APK(s)**.
- O desde la terminal, en la carpeta `android`: doble clic en **`compilar-apk.bat`**.
- El APK queda en `android\app\build\outputs\apk\debug\app-debug.apk`.
  Cópialo a cada celular/Zebra e instálalo (o `adb install -r app-debug.apk`).

---

## Paso 3: configurar el servidor en la app

La primera vez que abres la app te pide la **dirección del servidor**:

1. Escribe la IP que mostró el backend. Puedes escribirla corta:
   `192.168.2.120` → la app completa solo a `http://192.168.2.120:3000`.
   Para la cámara pulsa **Usar cámara (HTTPS)**: cambia la dirección a
   `https://192.168.2.120:3443` automáticamente.
2. Pulsa **Buscar en la red**: escanea el Wi‑Fi y encuentra la PC automáticamente
   (muy útil para no equivocarse con la IP).
3. **Probar conexión** → debe decir «Conexión correcta». (Funciona tanto con
   `http://…:3000` como con `https://…:3443`.)
4. **Guardar**. La app abre el sistema.

> La app acepta tres formas de dirección: la IP corta (`192.168.2.120`), la
> dirección completa (`http://192.168.2.120:3000`) o el enlace del **túnel**
> (`https://…trycloudflare.com`). Reconoce las direcciones de internet y a esas
> **no** les agrega el puerto 3000.

Para cambiarla luego: menú (⋮) ▸ **Servidor**. Para recargar: ⋮ ▸ **Actualizar**.
Si algo no carga, usa ⋮ ▸ **Diagnóstico**: muestra la versión de Android, la del
WebView del equipo, la dirección del servidor y el último error de la página.

> El certificado es propio (autofirmado): la app lo acepta en modo prueba, no
> tienes que instalar nada en el celular.

---

## Gestos de la app

| Acción | Cómo |
| --- | --- |
| **Recargar la página** | Desliza desde la parte superior hacia abajo. Aparece la tira de recarga. |
| **Volver atrás** | La flecha **←** de la barra de título (aparece solo cuando hay pantalla anterior) o el botón/gesto de retroceso del propio equipo. |
| **Servidor y Diagnóstico** | Menú **⋮** de la barra de título. |
| **Actualizar** | Menú **⋮** ▸ Actualizar. |

La flecha se muestra y se oculta sola según la navegación, incluida la que hace la
propia aplicación (menús, zonas, etc.).

---

## Cómo dejar el Zebra listo para escanear (DataWedge)

En el Zebra ya funciona el escaneo sin tocar la app: DataWedge puede enviar el
código como si se tecleara. En el equipo:

1. Abre la app **DataWedge** (en el cajón de apps del Zebra).
2. Selecciona el perfil **Profile0** (o crea uno llamado *Inventario*).
3. En **Profile0** activa **Profile enabled**.
4. **Keystroke output** → **habilitado** (esto ya suele venir activo).
5. **Intent output** → **deshabilitado** (opcional; la app también lo soporta,
   ver abajo).
6. **Associated apps** → agrega una app con el paquete
   `com.benmoga.inventario` y la actividad `*` (si no aparece, escríbelo).
7. Vuelve atrás y guarda.

Con esto, al apretar el gatillo el código cae en el campo de **Escanear** igual
que en el navegador.

### (Opcional) Salida por Intent
Si prefieres la salida por *Intent*, en DataWedge activa **Intent output** con:
- **Intent action**: `com.benmoga.inventario.SCAN`
- **Intent category**: `android.intent.category.DEFAULT`
- **Intent delivery**: *Start activity*  →  *Activity*: `com.benmoga.inventario.MainActivity`

La app recibe `com.symbol.datawedge.data_string` y lo inyecta en la página.

---

## Varios celulares a la vez

Todos usan **la misma** dirección de servidor (la de la PC). Instala el APK en
cada uno, configura la IP una vez y listo: todos ven el mismo inventario en
tiempo real (WebSocket). No hay que abrir un puerto por celular.

---

## Problemas comunes

| Síntoma | Solución |
| --- | --- |
| “No se pudo conectar” en la app | Revisa que el backend esté encendido, la IP correcta, la misma Wi‑Fi y el firewall abierto (`abrir-firewall-red.cmd`). |
| El celular no entra pero el PC sí | Windows bloqueó Node: vuelve a ejecutar `abrir-firewall-red.cmd` y verifica que el perfil sea **Privada**, no **Invitado**. |
| **El Zebra abre la app en blanco (no carga nada)** | El WebView del equipo es antiguo. La página se abre bien pero el motor no dibuja la app. **Solución: actualiza “Android System WebView” y “Chrome” desde Play Store** y reinicia el equipo. En ⋮ ▸ **Diagnóstico** verás la versión de WebView y el error exacto. |
| El Zebra no inyecta el código | Revisa **DataWedge ▸ Profile0 ▸ Associated apps** con el paquete `com.benmoga.inventario`. |
| No aparece la cámara en el celular | Usa la dirección **HTTPS** (`https://IP:3443`, botón **Usar cámara (HTTPS)**) y acepta el permiso de cámara. |
| “No se pudo conectar” probando HTTPS | Ya está soportado el certificado propio. Si falla, revisa que el firewall permita el puerto **3443**. |
| Cambió la IP de la Wi‑Fi | Ejecuta `generar-certificado.ps1` y escribe la nueva IP en la app (o usa “Buscar en la red”). |
| “SDK 34 no instalado” en Android Studio | Acepta la instalación que propone el IDE. |

---

## Qué contiene el proyecto Android

```
android/
├─ settings.gradle            · nombre del proyecto y módulo :app
├─ build.gradle               · plugin de Android (AGP 8.5.2)
├─ gradle/wrapper/…           · Gradle 8.7
├─ gradlew / gradlew.bat      · compilación por consola
├─ compilar-apk.bat           · genera el APK depurado
└─ app/
   ├─ build.gradle
   └─ src/main/
      ├─ AndroidManifest.xml            · permisos (Internet, Cámara) y actividades
      ├─ java/com/benmoga/inventario/
      │  ├─ MainActivity.java     · pantalla principal (solo orquesta los componentes)
      │  ├─ SettingsActivity.java · pantalla del servidor (interfaz)
      │  ├─ NavegadorWeb.java     · componente: configura el WebView
      │  ├─ ServidorRed.java      · componente: red, "Probar" y "Buscar en la red"
      │  ├─ CamaraHelper.java     · componente: permiso de cámara
      │  ├─ ZebraScanner.java     · componente: escaneo del lector Zebra
      │  └─ ServerPrefs.java      · componente: guarda la dirección del servidor
      └─ res/                     · layout, textos, icono, red
```

Cada componente es una clase independiente; `MainActivity` solo los conecta,
igual que en el frontend (una responsabilidad por archivo).

## Compilar por consola (sin abrir Android Studio)

Si la PC ya tiene el JDK de Android Studio y el SDK, el APK se puede generar sin
abrir el IDE:

```powershell
$env:JAVA_HOME = "E:\SDK\jbr"     # JDK que trae Android Studio
cd android
.\gradlew.bat --console=plain :app:assembleDebug
```

El APK queda en `android/app/build/outputs/apk/debug/app-debug.apk`.
El `.gradle`, `.idea`, `build/` y `local.properties` están en `.gitignore`
(son de cada PC, no van al repositorio).
