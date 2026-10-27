param([switch]$OpenBrowser, [switch]$Restart)

$ErrorActionPreference = 'Stop'
$runtimeFile = 'C:\ProgramData\iTechERP\runtime.json'
if (Test-Path -LiteralPath $runtimeFile) {
    $runtime = Get-Content -LiteralPath $runtimeFile -Raw | ConvertFrom-Json
    if ($runtime.installed -and $PSScriptRoot -ne $runtime.root) {
        Start-ScheduledTask -TaskName 'iTech ERP - Startup Supervisor'
        if ($OpenBrowser) { Start-Process 'http://itech.internal' }
        Write-Output 'Inicializacao solicitada a tarefa oficial SYSTEM. Logs: C:\ProgramData\iTechERP\backend\logs'
        exit 0
    }
}
$projectPath = $PSScriptRoot
$backendPath = Join-Path $projectPath 'backend'
$logPath = Join-Path $backendPath 'logs'
$runLog = Join-Path $logPath 'startup-supervisor.log'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null
$adminPort = 4001
$envFile = Join-Path $backendPath '.env'
if (Test-Path $envFile) {
    $envPort = (Get-Content $envFile | Where-Object { $_ -match '^PORT\s*=\s*(\d+)' } | ForEach-Object { $matches[1] })
    if ($envPort) { $adminPort = [int]$envPort }
}

function Write-RunLog([string]$Message) {
    if ((Test-Path $runLog) -and (Get-Item $runLog).Length -gt 5MB) {
        for ($i = 3; $i -ge 1; $i--) {
            $source = if ($i -eq 1) { $runLog } else { "$runLog.$($i - 1)" }
            if (Test-Path $source) { Move-Item -LiteralPath $source -Destination "$runLog.$i" -Force }
        }
    }
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -LiteralPath $runLog -Value $line -Encoding UTF8
    Write-Output $line
}

function Test-Health([string]$Url, [string]$Service = '') {
    try {
        $response = Invoke-RestMethod -Uri $Url -TimeoutSec 4
        if ($Service) { return $response.status -eq 'ok' -and $response.service -eq $Service }
        return $response.status -eq 'ok'
    }
    catch { return $false }
}

function Wait-Health([string]$Url, [string]$Service = '', [int]$Attempts = 30) {
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        if (Test-Health $Url $Service) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Start-AdminServer {
    $port = $adminPort
    $url = "http://127.0.0.1:$port/api/health"
    if ($Restart) {
        Write-RunLog "[1/4] Reinicio forcado solicitado. Encerrando processos existentes na porta $port..."
        $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        $existing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'backend\\server\.js' }
        if ($existing) { $existing | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
        if ($listener) { $listener | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
        Start-Sleep -Seconds 2
    } elseif (Test-Health $url) {
        Write-RunLog "[1/4] Administrativo saudavel em 127.0.0.1:$port."; return
    }
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    $existing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'backend\\server\.js' }
    if ($listener -or $existing) {
        if (Wait-Health $url '' 5) { Write-RunLog "[1/4] Administrativo existente ficou saudavel em 127.0.0.1:$port."; return }
        Write-RunLog "[1/4] Administrativo existente na porta $port nao esta saudavel. Encerrando para reiniciar..."
        if ($existing) { $existing | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue } }
        if ($listener) { $listener | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue } }
        Start-Sleep -Seconds 2
    }
    $nodePath = (Get-Command node -ErrorAction Stop).Source
    $scriptPath = Join-Path $backendPath 'server.js'
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        Write-RunLog "[1/4] Iniciando administrativo (tentativa $attempt/3)."
        $process = Start-Process -FilePath $nodePath -ArgumentList ('"' + $scriptPath + '"') -WorkingDirectory $backendPath -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath 'admin.out.log') -RedirectStandardError (Join-Path $logPath 'admin.err.log')
        if (Wait-Health $url '' 30) { Write-RunLog "[1/4] Administrativo confirmado pelo health check (PID $($process.Id))."; return }
        if (-not $process.HasExited) { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue }
        Write-RunLog "[1/4] Falha na tentativa $attempt. Consulte backend/logs/admin.err.log."
        Start-Sleep -Seconds ([Math]::Min(10, $attempt * 2))
    }
    throw 'O servidor administrativo nao respondeu apos 3 tentativas.'
}

function Start-PublicServer {
    $configModule = Join-Path $backendPath 'config/publicTracking.js'
    $publicPort = & node -e "console.log(require(process.argv[1]).getListenConfig().port)" $configModule
    if ($LASTEXITCODE -ne 0) { throw 'PUBLIC_PORT invalida.' }
    $url = "http://127.0.0.1:$publicPort/health"
    $starter = Join-Path $projectPath 'iniciar-acompanhamento.ps1'
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        Write-RunLog "[2/4] Verificando acompanhamento e supervisor (tentativa $attempt/3)."
        try { & $starter } catch { Write-RunLog "[2/4] $($_.Exception.Message)"; Start-Sleep -Seconds 2; continue }
        if (Wait-Health $url 'itech-public-tracking' 20) { Write-RunLog '[2/4] Acompanhamento confirmado pelo health check.'; return }
        Start-Sleep -Seconds ([Math]::Min(10, $attempt * 2))
    }
    throw 'O acompanhamento publico nao respondeu apos 3 tentativas.'
}

function Confirm-Cloudflare {
    try {
        & (Join-Path $projectPath 'infra\https\watch-public-tunnel.ps1') -BackendPath $backendPath
    } catch {
        Write-RunLog "[Cloudflare] Servico opcional / nao ativo: $($_.Exception.Message)"
    }
}

$startupMutex = New-Object Threading.Mutex($false, 'Local\iTechERP-StartupSupervisor')
$startupLocked = $false
try {
    try { $startupLocked = $startupMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $startupLocked = $true }
    if (-not $startupLocked) { Write-RunLog 'Outra supervisao ja esta em andamento.'; exit 0 }
    Write-RunLog 'Inicio da supervisao dos servicos iTech.'
    if (Test-Path (Join-Path $projectPath 'infra/runtime/install.pending.json')) {
        & (Join-Path $projectPath 'infra/runtime/install-runtime.ps1') -SourcePath $projectPath
        exit 0
    }
    Start-AdminServer
    try {
        Start-PublicServer
    } catch {
        Write-RunLog "[2/4] Acompanhamento publico opcional / aviso: $($_.Exception.Message)"
    }
    $tunnelLoggingRequest = Join-Path $projectPath 'infra/runtime/tunnel-logging.pending'
    if (Test-Path $tunnelLoggingRequest) {
        Move-Item -LiteralPath $tunnelLoggingRequest -Destination ($tunnelLoggingRequest -replace 'pending', 'started') -Force
        & (Join-Path $projectPath 'infra/runtime/configure-tunnel-service.ps1') -Root $projectPath
    }
    $recoveryRequest = Join-Path $projectPath 'infra/runtime/test-recovery.pending'
    if (Test-Path $recoveryRequest) {
        Move-Item -LiteralPath $recoveryRequest -Destination ($recoveryRequest -replace 'pending', 'started') -Force
        & (Join-Path $projectPath 'infra/runtime/test-recovery.ps1') -Root $projectPath
    }
    # Recovery of the public domain must not depend on the internal HTTPS proxy.
    Confirm-Cloudflare
    Write-RunLog '[3/4] Verificando proxy interno HTTP/HTTPS.'
    try {
        & (Join-Path $projectPath 'infra\https\start-https.ps1')
        Write-RunLog '[3/4] Proxy interno confirmado.'
    } catch {
        Write-RunLog "[3/4] Proxy interno HTTP/HTTPS opcional: $($_.Exception.Message)"
    }
    $targetUrl = "http://localhost:$adminPort"
    if (Test-Health 'http://itech.internal/api/health') {
        $targetUrl = 'http://itech.internal'
    }
    Write-RunLog "Inicializacao concluida com sucesso. Painel disponivel em: $targetUrl"
    if ($OpenBrowser) { Start-Process $targetUrl }
    exit 0
}
catch {
    Write-RunLog "ERRO: $($_.Exception.Message)"
    exit 1
}
finally {
    if ($startupLocked) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
