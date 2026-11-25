@echo off
REM Compila la app Android desde la linea de comandos (sin abrir Android Studio).
REM Requiere haber instalado el Android SDK (lo instala Android Studio).
setlocal
cd /d "%~dp0"

if "%ANDROID_HOME%"=="" (
  if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
)
if "%ANDROID_HOME%"=="" (
  if exist "%USERPROFILE%\AppData\Local\Android\Sdk" set "ANDROID_HOME=%USERPROFILE%\AppData\Local\Android\Sdk"
)
if "%ANDROID_HOME%"=="" (
  echo.
  echo No se encontro el Android SDK.
  echo Abre el proyecto en Android Studio una vez (el lo descarga) o define la
  echo variable de entorno ANDROID_HOME con la ruta del SDK.
  echo.
  pause
  exit /b 1
)

echo Usando Android SDK: %ANDROID_HOME%
echo Compilando la app (APK de depuracion)...
echo.
call gradlew.bat assembleDebug
if errorlevel 1 (
  echo.
  echo La compilacion fallo. Revisa el mensaje anterior.
  pause
  exit /b 1
)

echo.
echo Listo. El APK quedo en:
echo   app\build\outputs\apk\debug\app-debug.apk
echo.
echo Instalalo en el celular/Zebra con:
echo   adb install -r app\build\outputs\apk\debug\app-debug.apk
echo.
pause
