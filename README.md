# BENMOGA — Sistema de inventario

Aplicacion web (mas app Android) para el conteo fisico de inventario de varias
marcas/tiendas (**Levis, Americanino, Ambiente Gourmet, MIC, Tennis...**), con
backend **Node + Express + Prisma** y frontend **React + Vite** sobre **MySQL**.

La administracion importa el **Excel maestro** de cada local, crea usuarios y
zonas, y activa el inventario. Los empleados cuentan cada zona desde un celular
(con camara o lector Zebra) y la administracion sigue el avance en tiempo real.

> El maestro se sube una vez (mensual) y **nunca se modifica** desde la app: el
> sistema solo **agrega** lecturas. Los conteos tampoco se alteran.

> Documentos del proyecto: esta guia (**README**), la guia de la app Android
> ([`ANDROID.md`](ANDROID.md)) y la **estimacion de esfuerzo** desde cero
> ([`ESTIMACION.md`](ESTIMACION.md)).

---

## Como funciona

```
Local (marca/tienda)  ->  Inventario (Excel maestro ACTIVO)
                              |
                              +-- Zonas 1..N (por inventario)
                              +-- Productos (referencia, talla, existencia)

Empleado: elige una zona -> escanea -> cierra la zona
Admin:    Monitoreo en vivo + Comparativo + Excel (maestro vs contado)
```

- Cada **local** tiene su propio inventario activo (uno a la vez), sus zonas y sus
  empleados. Los datos de un local nunca se mezclan con los de otro.
- Cada **escaneo valido cuenta como una unidad** y guarda empleado, zona y
  fecha/hora.
- Nada del maestro ni de los conteos se edita desde la interfaz.

## Funciones

- Login con token JWT (cookie httpOnly) y roles `ADMINISTRADORA` / `EMPLEADO`.
- **Locales**: alta y edicion de los locales/marcas; selector de local al entrar.
- **Inventarios**: importacion del Excel `.xlsx` desde el navegador (hoja
  `INVENTARIO`, y `ZONAS` si existe), borrador -> activo, historial, y borrado
  **protegido** que antes muestra cuantas lecturas, unidades, zonas y personas se
  perderian.
- **Usuarios**: se crean desde la interfaz, con **rol y color por persona** (el
  color identifica a cada empleado en el monitoreo, las notificaciones y el Excel).
  Se pueden **desactivar** o **eliminar definitivamente** (preservando historial).
- **Zonas**: alta individual o por lote (rango de numeros). Las zonas pertenecen
  a un inventario: al activar uno nuevo, las zonas del anterior se conservan pero
  no se mezclan.
- **Conteo**: el empleado selecciona zona y escanea con la camara del dispositivo
  o con el lector fisico/Zebra (que escribe como teclado).
- **Monitoreo** (5 pestanas):
  - *Avance*: terminadas, faltantes y zonas en conteo, con el **primer y ultimo
    codigo escaneado** de cada zona. Incluye apartado de **Novedades (N/A)**.
  - *En vivo*: quien esta escaneando cada zona (con su color), actividad en vivo
    por WebSocket y acumulado por referencia.
  - *Buscar*: buscador de referencias con detalle por codigo de barras y el cuadro
    **Referencias x Zona**.
  - *Por usuario*: detalle por empleado (zona actual, zonas escaneadas, productos
    escaneados uno por uno con drill-down por zona).
  - *N/A*: todos los productos escaneados que no pertenecen al inventario activo.
- **Comparativo**: por referencia, existencia del maestro vs. contado, diferencia y
  estado. Filtros por estado, busqueda por texto, vista por referencia o por codigo.
- **Reportes**: Excel con hoja "Lectura" (escaneo por escaneo) y hoja "Hoja de Zonas"
  (control de conteos con formulas). CSV de diferencias.

## Reporte en Excel (`reporte.xlsx`)

1. **Lectura** - listado completo escaneo por escaneo: Zona, Codigo de barras,
   Codigo articulo, Genero, Linea, Talla, Color, Empleado (con su color), Fecha/Hora.
   Las filas N/A (sobrantes/trocados) aparecen resaltadas en amarillo.
2. **Hoja de Zonas** - control de conteos por zona con formulas (Diferencia,
   % Diferencia, Estado), formato condicional (verde/rojo/amarillo), fila de
   totales, resumen por persona y resumen Puntos de Venta vs Bodega.

## Requisitos

- Node.js 20 o superior.
- MySQL 8 (o compatible).
- Navegador moderno. Para la camara del celular se requiere HTTPS (o `localhost`)
  y permiso de camara.

## 1. Configurar el backend

En `backend/`:

```bash
npm install
copy .env.example .env
```

Edita `backend/.env` con tus datos:

```env
PORT=3000
NODE_ENV=development
DATABASE_URL="mysql://USUARIO:CONTRASENA@localhost:3306/levis_inventario"
JWT_SECRET="una-clave-aleatoria-de-al-menos-32-caracteres"
FRONTEND_URL="http://localhost:5173"
```

Crea la base de datos si aun no existe:

```sql
CREATE DATABASE levis_inventario CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

Sincroniza el esquema y genera el cliente de Prisma:

```bash
npx prisma generate
npx prisma db push
```

## 2. Crear la cuenta administradora (solo la primera vez)

```bash
node scripts/crear-admin.js "Administradora BENMOGA" admin@levis.com "CambiaEstaClave123!"
```

Cambia el correo y la contrasena. No publiques el `.env` ni compartas el token.

## 3. Encender el backend

```bash
npm run dev
```

Comprueba `http://localhost:3000/api/health` -> `{"ok":true,"servicio":"levis-inventario-api"}`.
La consola imprime la **IP de la red** (`http://192.168.x.x:3000`) que usaran los
celulares/Zebras.

## 4. Frontend

**Modo desarrollo** (recarga en caliente) - en otra terminal, en `frontend/`:

```bash
npm install
copy .env.example .env
npm run dev
```

Abre `http://localhost:5173` (`VITE_API_URL` apunta al backend).

**Modo servidor unico** (recomendado para la tienda) - el backend sirve tambien la
web compilada, asi los dispositivos solo necesitan **una** direccion:

```powershell
cd frontend
npm run build
```

Y entra en `http://IP:3000` desde el celular o el Zebra (reinicia el backend
despues de compilar).

> **Si los celulares no cargan la pagina**, casi siempre es el perfil de red: si
> Windows tiene esa Wi-Fi como **Publica**, bloquea el acceso entrante aunque las
> reglas existan. Puedes pasarla a **Privada** con
> `Set-NetConnectionProfile -NetworkCategory Private` desde PowerShell como
> administrador.

### Desde otra red o datos moviles (tunel HTTPS)

Si necesitas que alguien entre desde **otra red** o con **datos moviles** (sin
compartir la Wi-Fi), usa el tunel de Cloudflare:

```powershell
cd backend
powershell -File ..\tunel-web.ps1
```

- El enlace ya es **HTTPS**, asi que la **camara** del celular funciona.
- El **PC debe tener internet** y la ventana del tunel quedarse abierta.
- El enlace **cambia cada vez** que se abre el tunel.
- Queda **expuesto a internet**: quien tenga el enlace ve la pantalla de login.

## 5. Flujo de uso

1. Inicia sesion como administradora y elige el **local**.
2. En **Locales**, revisa que exista el local correcto.
3. En **Inventarios**, importa el Excel maestro del local (crea el inventario en
   `BORRADOR`).
4. **Activa** el inventario que se va a contar.
5. En **Usuarios**, crea las cuentas de los empleados y **asignale un color**.
6. En **Zonas**, agrega las zonas que falten (individual o por lote).
7. El empleado entra en **Escanear productos**, elige su zona y escanea cada
   unidad fisica; al terminar, cierra la zona.
8. La administracion sigue el avance en **Monitoreo** (Avance / En vivo / Buscar /
   Por usuario / N/A).
9. Al final, en **Comparativo** revisa diferencias y descarga el **Excel** o el
   **CSV**.
10. Si el maestro cambia durante el conteo, usa **"Actualizar maestro"** (sin
    perder escaneos). Si quieres empezar el conteo de cero, usa **"Reiniciar"**.

## 6. App Android (varios celulares y Zebra)

El sistema tambien se instala como **app Android** (contenedor del WebView) en
varios celulares y en los lectores Zebra de la misma Wi-Fi. La guia completa esta
en [`ANDROID.md`](ANDROID.md).

Lo esencial:

1. Compila la web (`npm run build` en `frontend/`) para que el backend la sirva en
   `http://IP:3000`.
2. Abre la carpeta `android/` en Android Studio y pulsa **Run** (o genera el APK).
3. En la app escribe la IP de la PC o pulsa **Buscar en la red**.
4. Para la **camara** del celular, usa `https://IP:3443` (el backend levanta HTTPS
   con el certificado que crea `generar-certificado.ps1`).
5. Para el **Zebra** (lector laser) basta con `http://IP:3000` y DataWedge.
6. Si usas el **tunel**, en **Servidor** tambien puedes escribir el enlace
   `https://...trycloudflare.com`.

## Scripts de Windows (en la raiz)

| Archivo | Para que |
| --- | --- |
| `abrir-firewall-red.cmd` | Abre los puertos 3000, 3443 y 5173 y pasa la Wi-Fi a *Privada* (pide administrador). |
| `generar-certificado.ps1` | Crea el certificado HTTPS de `certs/` para la IP actual. |

Utilidades del backend: `node scripts/crear-admin.js`, `node scripts/seed-locales.js`
(crea los locales oficiales), `node scripts/seed-pruebas.js` (recrea el local
aislado que usan las pruebas automaticas), `node scripts/limpiar-zonas.js "nombreLocal"`
(**borra** las zonas, sesiones y escaneos de un local).

## Pruebas automaticas (Cypress)

La app tiene una suite **E2E real** de **42 casos** que corre sobre la web
compilada. No usa el conteo de una tienda: crea un local aislado
**`TIENDA PRUEBAS CYPRESS`** con usuarios, zonas, inventario y lecturas fijas, y lo
vuelve a crear en cada corrida.

```bash
cd frontend
npm run test:e2e
```

Ese comando, en orden:

1. `e2e:datos` - `node ../backend/scripts/seed-pruebas.js` limpia y recrea el
   local de pruebas (no toca los locales reales).
2. `e2e:fixture` - genera el Excel de prueba que se sube en la ultima prueba.
3. `e2e:build` - compila la web (`vite build`), que es la que se prueba.
4. Levanta el backend solo para las pruebas en **`http://localhost:3100`**
   (`backend/scripts/e2e-server.mjs`, sin HTTPS y con el limite de login ampliado).
5. `cypress run` - corre las pruebas sin interfaz y deja el reporte JUnit en
   `frontend/cypress/results/`.

Para verlas **en vivo, en la ventana de Cypress**, usa:

```bash
npm run test:e2e:abrir
```

Si prefieres controlar el servidor aparte: deja `npm run e2e:servidor` en una
terminal y ejecuta `npm run e2e:abrir` en otra.

> Requisitos: MySQL con el esquema al dia (`npx prisma db push`), dependencias del
> backend instaladas y el puerto **3100** libre. No hace falta detener el servidor
> normal de la tienda (3000).

| Archivo | Casos | Que valida |
| --- | --- | --- |
| `01-login.cy.js` | 5 | Ingreso, credenciales incorrectas, usuario inactivo y cierre de sesion. |
| `02-locales.cy.js` | 4 | Lista y busqueda de locales, cambio de local y volver al selector. |
| `03-zonas.cy.js` | 7 | Crear PDV/BODEGA, duplicados, rangos, borrado protegido y selector por tipo. |
| `04-monitoreo.cy.js` | 5 | Avance, primer/ultimo codigo, empleado en vivo con color y Referencias x Zona. |
| `05-escaneo.cy.js` | 9 | Lectura valida, suma de unidades, QR invalido, codigo corto/inexistente, digito extra y cierre de zona. |
| `06-comparativo.cy.js` | 8 | Totales, filtros, busqueda, vista por referencia, Excel de 7 hojas y CSV. |
| `07-importacion.cy.js` | 4 | Importacion del Excel, filas omitidas, borrador, reporte y borrado. |

Los datos de prueba estan en `frontend/cypress/support/datos.js` y deben coincidir
con `backend/scripts/seed-pruebas.js` (usuarios `operario1..8@benmoga.test`,
contrasena `Pruebas123*`, zonas 901-906, 12 productos). El Excel que se sube en la
prueba se genera con `node backend/scripts/generar-maestro-pruebas.js`.

## Simulacion de 5+ usuarios escaneando a la vez

Cypress maneja un navegador a la vez, asi que para probar **varios empleados
escaneando en paralelo** hay un simulador que usa la misma API real. Cada usuario
inicia sesion, elige una zona, escanea y cambia de zona; mientras corre, la
administradora puede verlos en **Monitoreo**, cada uno con su color.

### Preparar el entorno aislado

En una terminal:

```bash
cd frontend
npm run e2e:datos
npm run e2e:build
npm run e2e:servidor
```

Deja esa terminal abierta. El servidor de pruebas queda en
`http://localhost:3100` y usa el local **TIENDA PRUEBAS CYPRESS**, no el
inventario real.

### Verlo en vivo

Abre `http://localhost:3100` en el navegador, entra con
`admin.pruebas@benmoga.test` / `Pruebas123*`, elige **TIENDA PRUEBAS CYPRESS** y
ve a **Monitoreo**.

### Lanzar la simulacion

En otra terminal:

```bash
cd frontend
npm run e2e:simular
```

Por defecto son **5 usuarios, 10 lecturas por usuario y cambio de zona cada 4
lecturas**. Para cambiarlo:

```bash
npm run e2e:simular -- --usuarios=6 --vueltas=12 --cambiar-cada=5 --pausa=300
```

Opciones principales:

| Opcion | Uso | Defecto |
| --- | --- | --- |
| `--usuarios=N` | Cantidad de empleados simultaneos | 5 |
| `--vueltas=N` | Lecturas por empleado | 10 |
| `--cambiar-cada=N` | Lecturas antes de pasar a otra zona | 4 |
| `--pausa=MS` | Pausa entre lecturas (simula el ritmo real) | 200 |
| `--correos=a,b,c` | Correos concretos en vez de `operario1..N` | - |
| `--no-finalizar` | Deja las zonas abiertas al terminar | finaliza |
| `--base=URL` | Otro backend (por defecto el de pruebas 3100) | `http://localhost:3000` |

Al final imprime cuantas lecturas y cambios de zona hizo cada usuario y el estado
de las zonas. Si quieres que las sesiones queden abiertas para revisar el
monitoreo con calma despues de la simulacion, usa `--no-finalizar`:

```bash
npm run e2e:simular -- --usuarios=5 --vueltas=20 --pausa=500 --no-finalizar
```

Si quieres dejar otra vez los datos limpios:

```bash
npm run e2e:datos
```

> El simulador escribe lecturas reales en el inventario del local indicado. No lo
> apuntes con `--base=http://localhost:3000` a una tienda real si no quieres que
> esas lecturas queden en su conteo.

**Solo manual:** el limite de intentos de login (50 cada 15 minutos), el WebSocket
con dos dispositivos reales, la camara del celular, el lector Zebra fisico, el
tunel HTTPS y la importacion de un maestro completo (miles de filas) se verifican a
mano; son los casos marcados como manuales en el plan de pruebas.

## Estructura del backend

```text
backend/src/
  routes/         Rutas y permisos (autenticar, soloAdministradora)
  controllers/    Validan la peticion y arman la respuesta HTTP
  services/       Reglas de negocio y acceso a datos con Prisma
  middleware/     Autenticacion JWT y control de permisos
  lib/            Prisma, colores y WebSocket en tiempo real
```

Cada modulo (`auth`, `locales`, `inventarios`, `zonas`, `escaneos`, `dashboard`)
tiene su archivo en `routes/`, `controllers/` y `services/`. El modulo de
inventarios se apoya ademas en:

- `services/comparativo.service.js`: comparativo por producto y por referencia,
  mas el cruce referencia x zona.
- `services/importacion.service.js`: lectura del Excel, deteccion y confirmacion
  del mapeo de columnas y carga por lotes.
- `services/reportes.service.js`: generacion del CSV y del Excel (hojas "Lectura"
  y "Hoja de Zonas").

## API principal

| Metodo | Ruta | Permiso | Uso |
| --- | --- | --- | --- |
| GET | `/api/health` | Publico | Verificar el backend |
| POST | `/api/auth/login` | Publico | Login, body `{ "correo", "password" }` |
| GET | `/api/auth/me` | Sesion | Usuario actual |
| GET/POST | `/api/auth/usuarios` | Administradora | Listar / crear usuarios |
| PATCH | `/api/auth/usuarios/:id` | Administradora | Editar rol, color, activo o contrasena |
| DELETE | `/api/auth/usuarios/:id` | Administradora | Desactivar; con `?definitivo=1` borra permanentemente |
| DELETE | `/api/auth/usuarios/test` | Administradora | Borra todos los usuarios de prueba |
| POST | `/api/auth/logout` | Sesion | Cerrar sesion (revoca el token) |
| GET | `/api/locales` | Sesion | Locales |
| POST/PATCH | `/api/locales` / `/:id` | Administradora | Crear / editar local |
| GET | `/api/inventarios` | Sesion | Historial de inventarios |
| POST | `/api/inventarios/importar` | Administradora | Importar Excel (multipart `archivo`) |
| POST | `/api/inventarios/:id/actualizar-maestro` | Administradora | Actualizar maestro sin perder escaneos |
| PATCH | `/api/inventarios/:id/activar` | Administradora | Activar el inventario |
| POST | `/api/inventarios/:id/reiniciar-escaneos` | Administradora | Borrar escaneos, conservar maestro |
| GET | `/api/inventarios/:id/impacto` | Administradora | Que se perderia al borrarlo |
| DELETE | `/api/inventarios/:id` | Administradora | Borrar; con lecturas exige `?confirmar=SI` |
| GET | `/api/inventarios/:id/reporte.csv` | Administradora | Reporte CSV |
| GET | `/api/inventarios/:id/reporte.xlsx` | Administradora | Reporte Excel (hojas "Lectura" y "Hoja de Zonas") |
| GET | `/api/inventarios/comparativo` | Administradora | Comparativo + `zonasPorReferencia` |
| GET | `/api/zonas` | Sesion | Zonas del local (del inventario activo) |
| POST | `/api/zonas` / `/lote` | Administradora | Crear zonas (una o por rango) |
| GET | `/api/zonas/actividad` | Administradora | Monitoreo: avance, sesiones, 1°/ult. codigo por zona |
| POST | `/api/zonas/seleccionar` | Sesion | Abrir zona, body `{ "zonaId": 1 }` |
| POST | `/api/zonas/finalizar` | Sesion | Cerrar la zona activa |
| POST | `/api/escaneos` | Sesion | Registrar unidad, body `{ "codigoBarras": "770..." }` |
| GET | `/api/escaneos/resumen-mio` | Sesion | Unidades y referencias distintas del empleado |
| GET | `/api/escaneos/novedades` | Sesion | N/A (sobrantes/trocados), filtros por zona/usuario |
| GET | `/api/escaneos/usuario` | Sesion | Detalle por usuario: zona activa, zonas escaneadas, productos |
| GET | `/api/escaneos/usuario-zona` | Sesion | Productos escaneados por usuario en una zona |
| GET | `/api/dashboard` | Administradora | Resumen y actividad reciente |
| WS | `/ws?token=...&localId=...` | Sesion | Escaneos en vivo del local (Monitoreo) |

Las rutas protegidas usan `Authorization: Bearer TOKEN` o cookie httpOnly; la
interfaz lo agrega sola tras el login.

### Mapeo de columnas de los maestros

El importador reconoce los encabezados sin depender de acentos, puntos, guiones
ni saltos de linea. Ademas de los nombres obvios (`Codigo de barras`,
`Referencia`, `Descripcion`, `Existencia`, `Talla`, `Color`), entiende variantes
como `Desc. item`, `Cod. Barras 3`, `DESCRIP_CORTA`, `Total_Existencia` y
`Codigo\nAlterno`.

- La **talla** se guarda en `detalle1` y el **color** en `detalle2`. En Levis,
  Pilatos, Polito y Superdry la talla viene en `Detalle ext. 2` y el color en
  `Detalle ext. 1`; en Tennis la talla es `Talla` y el color es `GDI_LIBELLE_1`.
- **Ambiente** y **Toysmart** no traen talla/color, por eso la app oculta esa
  columna. **Tennis** no trae una columna de descripcion: se muestra
  `Sin descripcion` con la linea/estilo, y el codigo del articulo sigue visible
  en la columna Item.
- Si un maestro cambia de encabezados, el perfil guardado por local se completa
  automaticamente con la deteccion por contenido; si hay ambiguedad, la app pide
  confirmar el mapeo antes de importar.

## Notas y limites

- El maestro se agrupa por producto; si el Excel repite un codigo, sus existencias
  se suman. Los codigos ya existentes conservan el catalogo previo.
- El conteo considera **cada escaneo valido como una unidad**: si una referencia
  tiene varias unidades con el mismo codigo, escanea cada una.
- La base de datos no guarda historial de cambios del maestro: si la jefatura
  corrige el Excel, se importa un **inventario nuevo** o se usa **"Actualizar maestro"**
  (preserva escaneos).
- Para un uso real: usa respaldos de la base, HTTPS y contrasenas propias, y prueba
  el flujo completo con una copia del Excel antes del conteo en tienda.

## Documentacion del proyecto

- [`docs/Levantamiento_Requerimientos_BENMOGA.docx`](docs/Levantamiento_Requerimientos_BENMOGA.docx):
  levantamiento de informacion, observacion por tienda, guias de entrevista,
  requerimientos funcionales/no funcionales y reglas de negocio.
- [`docs/Requerimientos_BENMOGA.docx`](docs/Requerimientos_BENMOGA.docx):
  documento de requerimientos (44 RF y 12 RNF) con trazabilidad.
- [`docs/Diseno_Base_Datos_BENMOGA.docx`](docs/Diseno_Base_Datos_BENMOGA.docx):
  diseno de la base de datos, diagrama entidad-relacion, diccionario de datos,
  indices e integridad.
- [`docs/Plan_Pruebas_BENMOGA.docx`](docs/Plan_Pruebas_BENMOGA.docx): plan de
  pruebas, 55 casos, datos, defectos y automatizacion con Cypress.
- [`ANDROID.md`](ANDROID.md): guia de la app Android.
- [`ESTIMACION.md`](ESTIMACION.md): estimacion de esfuerzo desde cero.
