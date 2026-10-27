param([string]$BackendPath = (Join-Path (Split-Path $PSScriptRoot -Parent | Split-Path -Parent) 'backend'))
$ErrorActionPreference = 'Stop'
$logs = Join-Path $BackendPath 'logs'
New-Item -ItemType Directory -Path $logs -Force | Out-Null
$logFile = Join-Path $logs 'cloudflared.log'
$stateFile = Join-Path $logs 'tunnel-watchdog-state.json'
function Write-TunnelLog([string]$Message) {
    if ((Test-Path $logFile) -and (Get-Item $logFile).Length -gt 5MB) {
        for ($i = 3; $i -ge 1; $i--) {
            $source = if ($i -eq 1) { $logFile } else { "$logFile.$($i - 1)" }
            if (Test-Path $source) { Move-Item -LiteralPath $source -Destination "$logFile.$i" -Force }
        }
    }
    Add-Content -LiteralPath $logFile -Encoding UTF8 -Value "$(Get-Date -Format o) $Message"
}
function Get-PublicHealth([string]$Url) {
    $reply = @(& curl.exe -4 -sS -w '\n%{http_code}' --max-time 10 $Url 2>$null)
    $curlExit = $LASTEXITCODE
    $status = if ($reply.Count) { [string]$reply[-1] } else { '000' }
    $healthy = $false
    if ($curlExit -eq 0 -and $status -eq '200' -and $reply.Count -gt 1) {
        try {
            $body = ($reply[0..($reply.Count - 2)] -join "`n") | ConvertFrom-Json
            $healthy = $body.status -eq 'ok' -and $body.service -eq 'itech-public-tracking'
        } catch { }
    }
    return [pscustomobject]@{ status=$status; healthy=$healthy }
}
$configModule = Join-Path $BackendPath 'config/publicTracking.js'
$port = & node -e "console.log(require(process.argv[1]).getListenConfig().port)" $configModule
if ($LASTEXITCODE -ne 0) { throw 'PUBLIC_PORT invalida.' }
$urlLine = Get-Content (Join-Path $BackendPath '.env') | Where-Object { $_ -match '^PUBLIC_TRACKING_URL=' } | Select-Object -Last 1
$publicUrl = ($urlLine -replace '^PUBLIC_TRACKING_URL=', '').Trim().Trim('"').Trim("'").TrimEnd('/')
if (-not $publicUrl) { throw 'PUBLIC_TRACKING_URL ausente.' }
$local = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 4
if ($local.status -ne 'ok' -or $local.service -ne 'itech-public-tracking') {
    throw 'Origin nao saudavel; recuperacao pertence ao supervisor Node, nao ao Tunnel.'
}
$service = Get-Service Cloudflared -ErrorAction Stop
if ($service.Status -ne 'Running') {
    Write-TunnelLog "Origin OK porta=$port; iniciando servico Cloudflared parado."
    Start-Service Cloudflared
    $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
    # Running is not connected: let a fresh connector register at the edge.
    Start-Sleep -Seconds 15
}
$failures = 0
for ($attempt = 0; $attempt -lt 3; $attempt++) {
    $check = Get-PublicHealth "$publicUrl/health"
    $status = $check.status
    if ($check.healthy) {
        Write-TunnelLog "Origin OK porta=$port; dominio HTTP 200."
        return
    }
    $failures++
    Write-TunnelLog "Origin OK porta=$port; dominio HTTP=$status falha=$failures/3."
    Start-Sleep -Seconds 2
}
$lastRestart = [DateTimeOffset]::MinValue
if (Test-Path $stateFile) {
    try { $lastRestart = [DateTimeOffset]::Parse((Get-Content $stateFile -Raw | ConvertFrom-Json).lastRestart) } catch { }
}
if (([DateTimeOffset]::Now - $lastRestart).TotalMinutes -lt 5) {
    throw 'Tunnel segue indisponivel; intervalo minimo de cinco minutos entre reinicios. Node preservado.'
}
# Record effective remote ingress and counters before recovery, without tokens.
$svc = Get-CimInstance Win32_Service -Filter "Name='Cloudflared'"
$listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $_.OwningProcess -eq $svc.ProcessId -and $_.LocalAddress -eq '127.0.0.1' }
foreach ($listener in $listeners) {
    try {
        $remote = Invoke-RestMethod "http://127.0.0.1:$($listener.LocalPort)/config" -TimeoutSec 3
        if ($remote.config.ingress) { Write-TunnelLog "Effective ingress: $($remote.config.ingress | Select-Object hostname,service | ConvertTo-Json -Compress)" }
        $ready = Invoke-RestMethod "http://127.0.0.1:$($listener.LocalPort)/ready" -TimeoutSec 3
        Write-TunnelLog "Ready before recovery: $($ready | ConvertTo-Json -Compress)"
    } catch { Write-TunnelLog "Metrics unavailable: $($_.Exception.Message)" }
}
Write-TunnelLog "Tres falhas externas com origin saudavel. Reiniciando SOMENTE Cloudflared PID=$($svc.ProcessId)."
Restart-Service Cloudflared -ErrorAction Stop
@{ lastRestart = [DateTimeOffset]::Now.ToString('o') } | ConvertTo-Json | Set-Content $stateFile -Encoding UTF8
Start-Sleep -Seconds 5
$check = Get-PublicHealth "$publicUrl/health"
$status = $check.status
Write-TunnelLog "Depois do reinicio: dominio HTTP=$status; Node nao reiniciado."
if (-not $check.healthy) { throw "Tunnel ainda falha: HTTP $status ou health invalido. Verificar DNS, ingress e conectores remotos." }
