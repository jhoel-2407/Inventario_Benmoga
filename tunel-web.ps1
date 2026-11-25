# Expone la app (backend del puerto 3000) por un tunel HTTPS de Cloudflare.
#
# Sirve para entrar desde OTRA red o desde datos moviles, sin tocar el firewall
# ni instalar certificados (el enlace ya es HTTPS, asi que la camara funciona).
#
# El PC debe tener internet y esta ventana debe quedar abierta.
# El enlace cambia cada vez que se abre el tunel.
#
# Uso: doble clic en tunel-web.bat (o: powershell -ExecutionPolicy Bypass -File tunel-web.ps1)

$ErrorActionPreference = 'Stop'
$puerto = 3000

function Escribir([string]$texto, [string]$color = 'Gray') { Write-Host $texto -ForegroundColor $color }

Escribir ''
Escribir '============================================================' 'DarkCyan'
Escribir '   BENMOGA - Inventario  |  Tunel HTTPS (Cloudflare)' 'Cyan'
Escribir '============================================================' 'DarkCyan'
Escribir ''

# ---------------------------------------------------------------- 1) servidor
$servidorOk = $false
try {
  $r = Invoke-WebRequest -Uri "http://localhost:$puerto/api/health" -UseBasicParsing -TimeoutSec 5
  $servidorOk = ($r.StatusCode -eq 200)
} catch { $servidorOk = $false }

if ($servidorOk) {
  Escribir "[1/3] Servidor local encendido en http://localhost:$puerto" 'Green'
} else {
  Escribir "[1/3] AVISO: no responde http://localhost:$puerto" 'Yellow'
  Escribir "      Enciende primero 'iniciar-tienda.bat' en otra ventana." 'Yellow'
  Escribir "      El tunel se abre igual, pero dara error hasta que arranques el servidor." 'DarkGray'
}

# ------------------------------------------------------------- 2) cloudflared
Escribir ''
$exe = $null
$enElSistema = Get-Command cloudflared -ErrorAction SilentlyContinue
if ($enElSistema) {
  $exe = $enElSistema.Source
  Escribir '[2/3] cloudflared encontrado en el sistema.' 'Green'
} else {
  $carpeta = Join-Path $env:LOCALAPPDATA 'BENMOGA'
  $exe = Join-Path $carpeta 'cloudflared.exe'
  if (Test-Path $exe) {
    Escribir '[2/3] cloudflared ya estaba descargado.' 'Green'
  } else {
    New-Item -ItemType Directory -Force -Path $carpeta | Out-Null
    Escribir '[2/3] Descargando cloudflared (una sola vez, ~35 MB)...' 'Cyan'
    $ProgressPreference = 'SilentlyContinue'
    try {
      Invoke-WebRequest -UseBasicParsing -TimeoutSec 600 -OutFile $exe `
        -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe'
      Escribir "      Guardado en $exe" 'Green'
    } catch {
      Escribir "      No se pudo descargar: $($_.Exception.Message)" 'Red'
      Escribir '      Descargalo a mano desde https://github.com/cloudflare/cloudflared/releases' 'Yellow'
      Escribir "      y guardalo como: $exe" 'Yellow'
      Read-Host 'Pulsa Enter para salir'
      exit 1
    }
  }
}

# ------------------------------------------------------------------ 3) tunel
Escribir ''
Escribir '[3/3] Abriendo el tunel... (tarda unos segundos)' 'Cyan'

$logErr = Join-Path $env:TEMP 'benmoga-tunel.err.log'
$logOut = Join-Path $env:TEMP 'benmoga-tunel.out.log'
Remove-Item $logErr, $logOut -Force -ErrorAction SilentlyContinue

$proc = Start-Process -FilePath $exe `
  -ArgumentList @('tunnel', '--url', "http://localhost:$puerto", '--no-autoupdate') `
  -RedirectStandardError $logErr -RedirectStandardOutput $logOut `
  -WindowStyle Hidden -PassThru

# El enlace aparece en los mensajes de cloudflared; se busca ahi.
$enlace = $null
for ($i = 0; $i -lt 90 -and -not $enlace -and -not $proc.HasExited; $i++) {
  Start-Sleep -Seconds 1
  foreach ($archivo in @($logErr, $logOut)) {
    if ($enlace) { break }
    if (Test-Path $archivo) {
      $texto = Get-Content $archivo -Raw -ErrorAction SilentlyContinue
      if ($texto -match 'https://[a-zA-Z0-9\.\-]+\.trycloudflare\.com') { $enlace = $Matches[0] }
    }
  }
}

if (-not $enlace) {
  Escribir ''
  Escribir 'No se pudo obtener el enlace del tunel.' 'Red'
  $pistas = @()
  foreach ($archivo in @($logErr, $logOut)) {
    if (Test-Path $archivo) { $pistas += (Get-Content $archivo -ErrorAction SilentlyContinue | Where-Object { $_ -match 'ERR|error|failed|denied' } | Select-Object -Last 6) }
  }
  if ($pistas.Count) {
    Escribir 'Ultimos mensajes de cloudflared:' 'Yellow'
    foreach ($p in $pistas) { Escribir "  $p" 'DarkYellow' }
  } else {
    Escribir 'Revisa que el PC tenga internet y vuelve a intentarlo.' 'Yellow'
  }
  if (-not $proc.HasExited) { Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue }
  Read-Host 'Pulsa Enter para salir'
  exit 1
}

Escribir ''
Escribir '================================================================' 'DarkGreen'
Escribir '   LISTO. Abre esta direccion en los celulares y Zebras:' 'Green'
Escribir ''
Escribir "   $enlace" 'White'
Escribir ''
Escribir '================================================================' 'DarkGreen'
Escribir ''

# Se copia al portapapeles y se guarda en un archivo, para que no haya que
# seleccionar el texto a mano dentro de la ventana.
$archivoEnlace = Join-Path $PSScriptRoot 'enlace-tunel.txt'
$guardado = $false
try {
  Set-Content -Path $archivoEnlace -Value $enlace -Encoding ASCII -Force
  $guardado = $true
} catch { $guardado = $false }

$copiado = $false
try { Set-Clipboard -Value $enlace; $copiado = $true } catch { $copiado = $false }

if ($copiado) {
  Escribir '   - El enlace YA esta copiado: pulsa Ctrl+V donde lo necesites.' 'Cyan'
}
if ($guardado) {
  Escribir "   - Tambien quedo guardado en: $archivoEnlace" 'Cyan'
}
Escribir '   - Funciona desde CUALQUIER red o datos moviles: no hace falta Wi-Fi.' 'Gray'
Escribir '   - Ya es HTTPS: la camara del celular funciona sin certificados.' 'Gray'
Escribir '   - En la app Android puedes escribir este enlace en "Servidor".' 'Gray'
Escribir '   - El enlace cambia cada vez que abres este tunel.' 'Gray'
Escribir '   - Deja esta ventana ABIERTA mientras se cuenta. Ctrl+C para cerrar.' 'Yellow'
Escribir ''

try {
  while (-not $proc.HasExited) { Start-Sleep -Seconds 2 }
  Escribir 'El tunel se cerro.' 'Yellow'
} finally {
  if (-not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
    Escribir ''
    Escribir 'Tunel cerrado.' 'Yellow'
  }
}
