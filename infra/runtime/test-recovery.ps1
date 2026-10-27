param([string]$Root = 'C:\ProgramData\iTechERP')
$ErrorActionPreference = 'Stop'
$backend = Join-Path $Root 'backend'
$resultFile = Join-Path $Root 'recovery-test.json'
$port = & node -e "console.log(require(process.argv[1]).getListenConfig().port)" (Join-Path $backend 'config/publicTracking.js')
if ($LASTEXITCODE -ne 0) { throw 'Configuracao invalida.' }
$listener = Get-NetTCPConnection -State Listen -LocalPort $port | Select-Object -First 1
$origin = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
$expected = Join-Path $backend 'publicTrackingServer.js'
if (-not $origin.CommandLine -or $origin.CommandLine.IndexOf($expected, [StringComparison]::OrdinalIgnoreCase) -lt 0) { throw 'Origin nao pertence ao runtime; teste cancelado.' }
$parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($origin.ParentProcessId)"
if ($parent.CommandLine -notmatch 'publicTrackingSupervisor\.js') { throw 'Origin sem supervisor; teste cancelado.' }
$adminBefore = (Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -First 1).OwningProcess
$started = Get-Date -Format o
Stop-Process -Id $origin.ProcessId -Force
$recovered = $false
for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1
    try {
        $health = Invoke-RestMethod "http://127.0.0.1:$port/health" -TimeoutSec 2
        if ($health.status -eq 'ok' -and $health.service -eq 'itech-public-tracking') { $recovered = $true; break }
    } catch { }
}
if (-not $recovered) { throw 'Supervisor nao recuperou origin em 30 tentativas.' }
$newOrigin = (Get-NetTCPConnection -State Listen -LocalPort $port | Select-Object -First 1).OwningProcess
if ($newOrigin -eq $origin.ProcessId) { throw 'PID do origin nao mudou.' }
$tunnelBefore = (Get-CimInstance Win32_Service -Filter "Name='Cloudflared'").ProcessId
Stop-Service Cloudflared -ErrorAction Stop
& (Join-Path $Root 'infra/https/watch-public-tunnel.ps1') -BackendPath $backend
$tunnelAfter = (Get-CimInstance Win32_Service -Filter "Name='Cloudflared'").ProcessId
$adminAfter = (Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -First 1).OwningProcess
if ($adminBefore -ne $adminAfter) { throw 'PID administrativo mudou durante teste isolado.' }
@{ started=$started; finished=(Get-Date -Format o); oldOriginPid=$origin.ProcessId; newOriginPid=$newOrigin; supervisorPid=$parent.ProcessId; adminPid=$adminAfter; adminPreserved=$true; oldTunnelPid=$tunnelBefore; newTunnelPid=$tunnelAfter; originRecovered=$true; tunnelRecovered=$true } |
    ConvertTo-Json | Set-Content $resultFile -Encoding UTF8
