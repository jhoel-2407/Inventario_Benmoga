# Estimación de esfuerzo — Sistema de Inventario BENMOGA

> **Documento:** estimación de esfuerzo y tiempo de desarrollo desde cero.
> **Fecha:** 21 de octubre de 2026
> **Alcance:** sistema multi‑marca / multi‑local de inventario por zonas, con app web
> (administración + empleados), app Android para celulares y lectores Zebra, reportes
> en Excel y despliegue en Windows.
> **Naturaleza del documento:** es una **estimación** (± 30 % de margen), no un dato
> exacto. Sirve para planear, justificar horas y cotizar.

---

## 1. Para qué sirve este documento

Responde tres preguntas:

1. ¿Cuánto esfuerzo real tiene construir este sistema **desde cero**?
2. ¿Cuánto tiempo le tomaría a un **desarrollador junior** (primera vez con este tipo
   de proyecto)?
3. ¿En qué se va el tiempo, para poder **recortar** lo que no aporta?

---

## 2. Qué se construyó (inventario real del proyecto)

Medido sobre el código actual del repositorio (sin contar `node_modules`, `dist`,
`build` ni archivos generados por herramientas).

| Parte | Archivos | Líneas | Contenido |
| --- | ---: | ---: | --- |
| Backend (API Node + Express + Prisma) | 12 | 2.326 | 25 endpoints, auth JWT, roles, locales, zonas, escaneos, dashboard, importador, reporte |
| Esquema de base de datos (Prisma/MySQL) | 1 | 133 | 8 modelos: Local, Inventario, Producto, InventarioProducto, Zona, Escaneo, Usuario, SesionZona |
| Frontend (React + Vite) | 30 | 1.755 | 12 páginas, 10 componentes, 4 librerías de apoyo, hoja de estilos |
| App Android (Java + WebView) | 16 | 1.150 | 7 clases Java, permisos de cámara, lector Zebra (DataWedge), pantalla de servidor |
| Scripts de Windows (`.bat` / `.ps1` / `.cmd`) | 10 | 415 | arranque, firewall, HTTPS, túnel, publicación web, compilación de APK |
| Documentación (`README.md` + `ANDROID.md`) | 2 | 401 | guía del sistema y guía de la app Android |
| **Total de código propio** | **71** | **~5.800** | sin contar XML de Android ni `gradlew` generado |

### Funcionalidades incluidas

- Multimarca / multilocal, con un **inventario activo** por local.
- **Importación del Excel maestro** con nombres de columna distintos por marca,
  detección automática, perfil guardado por local y agrupación por código de barras.
- **Escaneo por zonas** (celular con cámara y lector Zebra), con cierre de zona.
- **Monitoreo en vivo** en 3 pestañas (avance / en vivo / buscar), primer y último
  código por zona, y **color por empleado**.
- **Comparativo** maestro vs. contado por producto, por referencia y por zona, con
  diferencias y estado (OK / FALTANTE / SOBRANTE / SIN CONTEO).
- **Excel de 7 hojas** + CSV de diferencias, con filtros.
- **App Android** (WebView) con configuración de servidor, cámara y DataWedge.
- Despliegue en Windows: **firewall**, **HTTPS** con certificado propio, **túnel
  Cloudflare** para entrar desde otras redes o datos móviles.

---

## 3. Supuestos de la estimación

- **Perfil estimado:** desarrollador junior (0–2 años de experiencia), es su primer
  proyecto de este tipo.
- **Equipo:** 1 persona, sin mentor permanente, con documentación oficial e IA como
  apoyo ocasional.
- **Jornada de referencia:** 8 h/día, 5 días/semana (el resto de escenarios está
  en la sección 5).
- **Se construye desde cero**, sin reutilizar código de otro proyecto.
- **Pruebas en equipo real**: hay al menos un celular Android y un lector Zebra
  disponibles desde el principio.

### Fuera de alcance (no está en las horas)

- Dominio propio, hosting en la nube o publicación en la Play Store.
- Soporte y mantenimiento posterior a la entrega.
- Migración de inventarios históricos de otros sistemas.
- Capacitación larga a usuarios finales.
- Rediseño gráfico / identidad visual de marca.

---

## 4. Estimación por módulo

| # | Módulo | Qué incluye | Mín. | Máx. | Prom. | Evidencia (archivos) |
| --- | --- | --- | ---: | ---: | ---: | --- |
| 1 | Entorno y puesta a punto | Node, MySQL, Prisma, React + Vite, Git, estructura del proyecto | 20 | 30 | 25 | — |
| 2 | Backend base | Login JWT, roles (administradora / empleado), locales, usuarios, zonas, CRUD, middlewares | 60 | 90 | 75 | `auth.routes.js`, `locales.routes.js`, `zonas.routes.js`, `middleware/auth.js`, `app.js`, `server.js` |
| 3 | **Importador de Excel maestro** | Lectura del `.xlsx`, mapeo de columnas, detección automática, perfil por local, agrupación por código de barras, creación de zonas | 60 | 100 | 80 | `inventarios.routes.js` (bloque de importación) |
| 4 | Escaneo | Endpoint de escaneo, sesión por zona, cierre de zona, sin duplicar lecturas, índices de base de datos | 40 | 60 | 50 | `escaneos.routes.js`, `ScanPage.jsx`, `CameraScanner.jsx`, `ZebraScanner.java` |
| 5 | Monitoreo en vivo | Dashboard, pestañas, qué zona escanea cada quien, color por empleado, notificaciones | 50 | 70 | 60 | `dashboard.routes.js`, `MonitoreoZonas.jsx`, `lib/realtime.js`, `NotifBell.jsx` |
| 6 | Comparativo y reportes | Consultas agregadas sin doble conteo, 7 hojas de Excel, CSV, referencias x zona | 60 | 100 | 80 | `inventarios.routes.js` (comparativo y reporte), `Comparativo.jsx` |
| 7 | Frontend web | 12 páginas, 2 perfiles de usuario, diseño adaptable a celular y escritorio | 100 | 160 | 130 | `frontend/src/**` |
| 8 | App Android | Proyecto Gradle, WebView, permisos de cámara, pantalla de servidor, DataWedge, APK | 60 | 100 | 80 | `android/app/src/**` |
| 9 | Despliegue en Windows | Firewall, red Privado/Público, certificado HTTPS, scripts de arranque, túnel Cloudflare | 30 | 50 | 40 | `iniciar-tienda.bat`, `abrir-firewall-red.ps1`, `tunel-web.ps1`, `generar-certificado.ps1` |
| 10 | Pruebas, ajustes y cambios de requisitos | Corrección de errores, datos reales, ajustes de lógica | 60 | 120 | 90 | (transversal a todos los módulos) |
| 11 | Documentación y capacitación | README único, guía de la app Android, paso a paso de uso | 10 | 20 | 15 | `README.md`, `ANDROID.md` |
| | **TOTAL** | | **550** | **900** | **725** | |

---

## 5. Resumen por escenario (tiempo calendario)

Con el promedio de **725 h** y el rango de **550 – 900 h**:

| Escenario | Horas / día | Días laborables | Semanas | **Tiempo real** |
| --- | ---: | ---: | ---: | ---: |
| **A.** Dedicación exclusiva | 8 h | 69 – 113 | 14 – 23 | **3,5 – 5,5 meses** |
| **B.** Medio tiempo | 5 h | 110 – 180 | 22 – 36 | **5 – 8 meses** |
| **C.** Media jornada (estudios u otras tareas) | 4 h | 138 – 225 | 28 – 45 | **6,5 – 10 meses** |
| **D.** Discontinuo | 2–3 h | 183 – 450 | 37 – 90 | **9 – 18 meses** |
| *Referencia:* semi‑senior (8 h/día) | 8 h | 34 – 56 | 7 – 11 | **1,5 – 2,5 meses** |
| *Referencia:* junior con apoyo de IA y dueño del negocio probando | — | — | — | **semanas, no meses** |

> **Respuesta corta a la pregunta:** un desarrollador junior, trabajando solo y a
> tiempo completo, se demora **entre 3,5 y 5,5 meses** (aproximadamente **4 meses**),
> con un rango realista de **4 a 6 meses** si se incluyen imprevistos, interrupciones
> y cambios de requisitos. A medio tiempo, **entre 6 y 10 meses**.

---

## 6. ¿En qué se va el tiempo?

Reparto estimado de las 725 horas:

| Tipo de actividad | % | Horas | ¿Se puede recortar? |
| --- | ---: | ---: | --- |
| Programación (backend, web, Android) | 38 % | 276 | Sí, con plantillas y IA |
| Pruebas y corrección de errores | 22 % | 160 | Sí, con datos de prueba buenos |
| Descubrimiento y análisis del negocio | 12 % | 87 | Poco: es el conocimiento del cliente |
| Entorno y despliegue (Windows, firewall, HTTPS, túnel, APK) | 12 % | 87 | Sí, con scripts listos |
| Diseño de datos y arquitectura | 10 % | 72 | Poco |
| Documentación y capacitación | 6 % | 43 | Sí, si se hace al final |

**Clave:** solo el **38 %** del tiempo es escribir código. El resto es descubrir,
probar, corregir y desplegar — que es donde un junior pierde la mayor parte del
esfuerzo.

---

## 7. Comprobación de sensatez

- Código propio: **~5.800 líneas** en **725 h** ≈ **8 líneas/hora** de producción.
- Sobre el tiempo *real* de programación (276 h): **~21 líneas/hora**.

Las dos cifras son normales para un proyecto de negocio: la primera incluye
descubrimiento, pruebas y despliegue; la segunda es el ritmo real de teclear código
de aplicación (leer, entender, compilar, probar, corregir). Si alguien dice "hice
esto en un fin de semana", el número no es de escritura: es que el resto ya venía
resuelto (plantillas, IA, dominio ya conocido).

---

## 8. Los riesgos que más alargan el proyecto

1. **El Excel maestro de cada marca** (20 %–25 % del esfuerzo). Cada marca trae
   encabezados distintos, con vacíos y formatos raros. El importador con detección
   automática y perfiles guardados es, con diferencia, el módulo más difícil.
2. **Windows y la red.** Firewall, perfil *Público* vs *Privado*, certificados
   HTTPS, puertos: un día entero de trabajo se puede perder en que el celular no
   conecte. Este proyecto sufrió ese problema varias veces.
3. **Cuentas que no se duplican.** El comparativo debe separar *unidades contadas* de
   *unidades del maestro* sin multiplicar la existencia por cada lectura. Es un tipo
   de error que no se ve hasta que hay datos reales.
4. **Zebra y cámara solo se prueban en el equipo físico.** El emulador no reproduce
   DataWedge ni los permisos de cámara de un lector de mano.
5. **Los cambios de requisitos.** Durante el desarrollo aparecieron ajustes de
   alcance (pestañas del monitoreo, columnas del Excel, qué información se muestra).
   Cada uno parece pequeño y suma horas.
6. **La base de datos local.** Credenciales, `db push` sin migraciones, respaldos y
   restauración: si algo se corrompe, se pierde trabajo.

---

## 9. Qué reduciría el tiempo (recomendaciones)

| Acción | Ahorro estimado |
| --- | ---: |
| Entregar el **Excel maestro real** y sus variantes desde el día 1 | 20 – 40 h |
| Definir por escrito **qué hojas y qué columnas** del Excel se entregan | 20 – 30 h |
| Tener 2 o 3 **equipos de prueba** (Zebra + celular) desde el inicio | 15 – 25 h |
| **Cerrar el alcance** por módulo antes de programarlo | 30 – 60 h |
| Usar **plantillas** de proyecto (React Admin, script de arranque) | 20 – 30 h |
| **Documentar al final**, en vez de durante | 10 h |

Con estas acciones, el escenario más realista baja a **~3 meses** a tiempo completo.

---

## 10. Cotización (ejemplo ilustrativo)

Si el proyecto se fuera a cotizar, el valor sale de multiplicar las horas por la
tarifa hora. Con el rango estimado:

| Horas | A $15.000/h | A $25.000/h | A $40.000/h |
| ---: | ---: | ---: | ---: |
| 550 h (optimista) | $8.250.000 | $13.750.000 | $22.000.000 |
| 725 h (promedio) | $10.875.000 | $18.125.000 | $29.000.000 |
| 900 h (pesimista) | $13.500.000 | $22.500.000 | $36.000.000 |

> Estas tarifas son **un ejemplo**: ajústalas a tu contexto. La tarifa no es
> uniforme: un junior factura menos por hora que un senior, pero consume muchas más
> horas (como muestra la tabla de la sección 5).

---

## 11. Conclusión

El sistema construido representa un esfuerzo de **550 a 900 horas** de trabajo
profesional, con un punto medio de **725 horas**, lo que equivale a:

- **Junior a tiempo completo:** 3,5 – 5,5 meses (rango de planificación: **4 a 6 meses**).
- **Junior a medio tiempo:** 6 – 10 meses.
- **Semisenior:** 1,5 – 2,5 meses.

El tamaño del código (≈5.800 líneas) es moderado; lo que define el calendario es
**el descubrimiento del negocio, los archivos Excel de cada marca, el trabajo en
Windows y las pruebas con equipos reales**.

---

### Anexo — Inventario de archivos por módulo

| Módulo | Archivos principales | Líneas |
| --- | --- | ---: |
| Backend — base | `app.js` 101, `server.js` 78, `middleware/auth.js` 27, `routes/auth.routes.js` 76, `routes/locales.routes.js` 50, `lib/prisma.js` 4, `lib/colores.js` 42 | 378 |
| Backend — zonas y monitoreo | `routes/zonas.routes.js` 294, `routes/dashboard.routes.js` 145, `lib/realtime.js` 67 | 506 |
| Backend — escaneo | `routes/escaneos.routes.js` 151 | 151 |
| Backend — inventarios (importar, comparativo, Excel) | `routes/inventarios.routes.js` | 1.291 |
| Base de datos | `prisma/schema.prisma` (8 modelos) | 133 |
| Frontend — páginas | `MonitoreoZonas.jsx` 347, `Inventories.jsx` 192, `Comparativo.jsx` 150, `UsersPage.jsx` 105, `Zones.jsx` 85, `EmployeeHome.jsx` 73, `Dashboard.jsx` 64, `Locales.jsx` 47, `LocalPicker.jsx` 46, `Login.jsx` 10, `ScanPage.jsx` 24, `NotFound.jsx` 5 | 1.148 |
| Frontend — componentes y libs | 10 componentes + 4 libs + `App.jsx` + `main.jsx` + `polyfills.js` + `styles.css` | 607 |
| Android | 7 clases Java (897) + XML de recursos y manifiesto (253) | 1.150 |
| Scripts de Windows | `tunel-web.ps1` 138, `abrir-firewall-red.ps1` 66, `iniciar-tienda.bat` 63, `generar-certificado.ps1` 54, `android/compilar-apk.bat` 38, `publicar-web.bat` 20, `tunel-web.bat` 18, `start-backend.bat` 9, `start-frontend.bat` 5, `abrir-firewall-red.cmd` 4 | 415 |
| Documentación | `README.md` 226, `ANDROID.md` 175 | 401 |

---

*Documento generado a partir de la medición real del repositorio. Las cifras de
horas son estimaciones profesionales basadas en descomposición por módulos; se
sugiere actualizar el documento si el alcance cambia.*
