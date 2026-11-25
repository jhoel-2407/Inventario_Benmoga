# Abre los puertos de la app para entrar desde el celular, la app Android o el
# lector Zebra en la MISMA red Wi-Fi. Se ejecuta una sola vez.
#
#   - 3000  -> backend que ya sirve toda la web y el API (recomendado para la app Android)
#   - 3443  -> HTTPS del backend (para la camara del celular)
#   - 5173  -> servidor de desarrollo de Vite (si lo usas con la camara en HTTPS)
#
# Ademas pasa la Wi-Fi a perfil "Privado": en perfil "Publico" Windows bloquea el
# acceso entrante aunque las reglas existan.
#
# Uso: doble clic en este archivo (pedira permiso de administrador) o
#      clic derecho > "Ejecutar con PowerShell".
#
# Parametros:
#   -SinPausa   No espera a que pulses una tecla al terminar (lo usa iniciar-tienda.bat).

param([switch]$SinPausa)

# Si no se esta ejecutando como administrador, se relanza pidiendo elevacion (UAC).
if (-not ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  $argumentos = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$PSCommandPath`"")
  if ($SinPausa) { $argumentos += '-SinPausa' }
  Start-Process powershell -Verb RunAs -ArgumentList $argumentos
  exit
}

$ErrorActionPreference = 'Stop'

$puertos = @(3000, 3443, 5173)
foreach ($puerto in $puertos) {
  $nombre = "BENMOGA Inventario Web ($puerto)"
  if (Get-NetFirewallRule -DisplayName $nombre -ErrorAction SilentlyContinue) {
    Write-Host "Ya existe la regla: $nombre"
  } else {
    New-NetFirewallRule -DisplayName $nombre -Direction Inbound -Action Allow -Protocol TCP -LocalPort $puerto -Profile Any | Out-Null
    Write-Host "Regla creada: $nombre (TCP $puerto)"
  }
}

# Windows clasifica la Wi-Fi como "Publica" cuando no la reconoce, y en ese perfil
# bloquea el acceso entrante aunque existan las reglas. Se pasa a "Privada"
# (red de confianza) para que los celulares y Zebras puedan conectarse.
$publicas = @(Get-NetConnectionProfile | Where-Object { $_.NetworkCategory -eq 'Public' })
if ($publicas.Count -eq 0) {
  Write-Host "Las redes conectadas ya estan en perfil Privado."
} else {
  foreach ($red in $publicas) {
    try {
      Set-NetConnectionProfile -InterfaceIndex $red.InterfaceIndex -NetworkCategory Private
      Write-Host "Red '$($red.Name)' cambiada de Publica a Privada." -ForegroundColor Green
    } catch {
      Write-Host "No se pudo cambiar '$($red.Name)' a Privada: $($_.Exception.Message)" -ForegroundColor Yellow
    }
  }
}

Write-Host ""
Write-Host "Listo. Desde el celular o el Zebra (misma Wi-Fi):" -ForegroundColor Green
Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.IPAddress -notlike '192.168.56.*' } |
  ForEach-Object {
    Write-Host ("  App Android / navegador:  http://{0}:3000" -f $_.IPAddress) -ForegroundColor Cyan
    Write-Host ("  Camara del celular:       https://{0}:3443" -f $_.IPAddress) -ForegroundColor Cyan
    Write-Host ("  Vite (desarrollo):        https://{0}:5173" -f $_.IPAddress) -ForegroundColor DarkGray
  }
Write-Host ""
Write-Host "En la app Android, escribe esa direccion en 'Servidor' (o usa 'Buscar en la red')."
Write-Host ""
if (-not $SinPausa) {
  Write-Host "Pulsa una tecla para cerrar..."
  $null = $Host.UI.RawUI.ReadKey('NoEcho,IncludeKeyDown')
}
