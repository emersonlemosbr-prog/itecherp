$ErrorActionPreference = 'Stop'
$caddy = Join-Path $env:LOCALAPPDATA 'iTechHttps\caddy.exe'
$config = Join-Path $PSScriptRoot 'Caddyfile'
if (-not (Test-Path -LiteralPath $caddy)) { throw "Caddy não instalado: $caddy" }
if (-not (Test-Path -LiteralPath $config)) { throw "Caddyfile não encontrado: $config" }
$listener = Get-NetTCPConnection -State Listen -LocalAddress '192.168.1.199' -LocalPort 443 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) { Write-Output "HTTPS já está ativo (PID $($listener.OwningProcess))."; exit 0 }
$logDir = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'tmp\lan-access'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$p = Start-Process -FilePath $caddy -ArgumentList @('run','--config',('"' + $config + '"'),'--adapter','caddyfile') -WorkingDirectory (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'https-caddy.out.log') -RedirectStandardError (Join-Path $logDir 'https-caddy.err.log') -PassThru
Write-Output "HTTPS iniciado (PID $($p.Id))."
