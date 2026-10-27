param([string]$Root = 'C:\ProgramData\iTechERP')
$ErrorActionPreference = 'Stop'
$service = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
if ($service.PathName -notmatch 'tunnel run --token-file C:\\ProgramData\\cloudflared\\token$') {
    throw 'Comando Cloudflared diferente do diagnosticado; nenhuma alteracao automatica aplicada.'
}
$directory = Join-Path $Root 'backend\logs\native-tunnel'
New-Item -ItemType Directory -Path $directory -Force | Out-Null
$newPath = $service.PathName -replace 'tunnel run --token-file', ('tunnel --log-directory "' + $directory + '" run --token-file')
@{ previousPath=$service.PathName; newPath=$newPath; changedAt=(Get-Date -Format o) } | ConvertTo-Json |
    Set-Content (Join-Path $Root 'tunnel-service-change.json') -Encoding UTF8
$result = Invoke-CimMethod -InputObject $service -MethodName Change -Arguments @{PathName=$newPath}
if ($result.ReturnValue -ne 0) { throw "Falha ao atualizar servico: $($result.ReturnValue)" }
Restart-Service Cloudflared -ErrorAction Stop
Start-Sleep -Seconds 15
& (Join-Path $Root 'infra/https/watch-public-tunnel.ps1') -BackendPath (Join-Path $Root 'backend')
