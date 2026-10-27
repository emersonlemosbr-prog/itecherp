$ErrorActionPreference = 'Stop'
$caddy = Join-Path $env:LOCALAPPDATA 'iTechHttps\caddy.exe'
$caddyAppData = $env:APPDATA
if (Test-Path 'C:\ProgramData\iTechERP\runtime.json') {
    $runtime = Get-Content 'C:\ProgramData\iTechERP\runtime.json' -Raw | ConvertFrom-Json
    if ($runtime.installed) {
        $caddy = Join-Path $runtime.localAppData 'iTechHttps\caddy.exe'
        $caddyAppData = $runtime.appData
    }
}
$config = Join-Path $PSScriptRoot 'Caddyfile'
$mutex = New-Object Threading.Mutex($false, 'Local\iTechERP-CaddyStartup')
$locked = $false
try {
try { $locked = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $locked = $true }
if (-not $locked) { throw 'Outra inicializacao do Caddy esta em andamento.' }
if (-not (Test-Path -LiteralPath $caddy)) { throw "Caddy não instalado: $caddy" }
if (-not (Test-Path -LiteralPath $config)) { throw "Caddyfile não encontrado: $config" }
$listeners = @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Where-Object {
    $_.LocalPort -in 80,443 -and $_.LocalAddress -in '192.168.1.199','0.0.0.0','::'
})
foreach ($ownerId in @($listeners.OwningProcess | Select-Object -Unique)) {
    $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
    if ($owner.ExecutablePath -ne $caddy -or $owner.CommandLine -notmatch 'infra\\https\\Caddyfile') {
        throw "Porta 80/443 ocupada por outro processo (PID $ownerId)."
    }
}
if (-not $listeners.Count) {
    $existing = @(Get-CimInstance Win32_Process -Filter "Name='caddy.exe'" | Where-Object { $_.ExecutablePath -eq $caddy })
    if ($existing.Count) { throw 'Caddy ja esta em execucao, mas sem listeners; nao sera duplicado.' }
$logDir = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'tmp\lan-access'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$previousAppData = $env:APPDATA
try {
    $env:APPDATA = $caddyAppData
    $p = Start-Process -FilePath $caddy -ArgumentList @('run','--config',('"' + $config + '"'),'--adapter','caddyfile') -WorkingDirectory (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'https-caddy.out.log') -RedirectStandardError (Join-Path $logDir 'https-caddy.err.log') -PassThru
} finally { $env:APPDATA = $previousAppData }
Write-Output "HTTPS iniciado (PID $($p.Id))."
}
for ($attempt = 0; $attempt -lt 20; $attempt++) {
    # SYSTEM has a different certificate store; validate against the existing
    # Caddy CA explicitly, without disabling TLS verification or replacing it.
    $caFile = Join-Path $caddyAppData 'Caddy\pki\authorities\local\root.crt'
    $caArgs = @()
    if (Test-Path -LiteralPath $caFile) { $caArgs = @('--cacert', $caFile) }
    $body = & curl.exe @caArgs --noproxy '*' -s --fail --ssl-revoke-best-effort --resolve 'itech.internal:80:192.168.1.199' --resolve 'itech.internal:443:192.168.1.199' -L --max-time 5 'http://itech.internal/api/health'
    $curlResult = $LASTEXITCODE
    $health = $null
    try { $health = $body | ConvertFrom-Json } catch { }
    if ($curlResult -eq 0 -and $health.status -eq 'ok') {
        Write-Output 'Caddy confirmado: HTTP 80 -> HTTPS 443 -> administrativo 3001.'
        return
    }
    Start-Sleep -Seconds 1
}
throw 'Caddy nao confirmou HTTP/HTTPS. Consulte tmp/lan-access/https-caddy.err.log.'
} finally {
    if ($locked) { $mutex.ReleaseMutex() }
    $mutex.Dispose()
}
