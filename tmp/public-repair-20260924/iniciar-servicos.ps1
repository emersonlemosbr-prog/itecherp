param([switch]$OpenBrowser)

$ErrorActionPreference = 'Stop'
$projectPath = $PSScriptRoot
$backendPath = Join-Path $projectPath 'backend'
$logPath = Join-Path $backendPath 'logs'
$runLog = Join-Path $logPath 'startup-supervisor.log'
New-Item -ItemType Directory -Path $logPath -Force | Out-Null

function Write-RunLog([string]$Message) {
    $line = "$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') $Message"
    Add-Content -LiteralPath $runLog -Value $line -Encoding UTF8
    Write-Output $line
}

function Test-Health([string]$Url, [string]$Service = '') {
    try {
        $response = Invoke-RestMethod -Uri $Url -TimeoutSec 4
        if ($Service) { return $response.status -eq 'ok' -and $response.service -eq $Service }
        return $response.status -eq 'ok'
    } catch { return $false }
}

function Wait-Health([string]$Url, [string]$Service = '', [int]$Attempts = 30) {
    for ($attempt = 1; $attempt -le $Attempts; $attempt++) {
        if (Test-Health $Url $Service) { return $true }
        Start-Sleep -Seconds 1
    }
    return $false
}

function Start-AdminServer {
    $url = 'http://127.0.0.1:3001/api/health'
    if (Test-Health $url) { Write-RunLog '[1/4] Administrativo saudavel em 127.0.0.1:3001.'; return }
    $listener = Get-NetTCPConnection -State Listen -LocalPort 3001 -ErrorAction SilentlyContinue
    $existing = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'backend\\server\.js' }
    if ($listener -or $existing) {
        if (Wait-Health $url '' 20) { Write-RunLog '[1/4] Administrativo existente ficou saudavel.'; return }
        throw 'Administrativo existente sem health check. Nenhum processo duplicado foi iniciado.'
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
    $url = 'http://127.0.0.1:3002/health'
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
    $service = Get-Service -Name 'cloudflared' -ErrorAction SilentlyContinue
    if (-not $service) { throw 'Servico cloudflared nao esta instalado.' }
    if ($service.Status -ne 'Running') {
        Write-RunLog '[4/4] Iniciando servico Cloudflared apos as origens ficarem saudaveis.'
        Start-Service -Name 'cloudflared' -ErrorAction Stop
        $service.WaitForStatus('Running', [TimeSpan]::FromSeconds(30))
    }
    $envFile = Get-Content -LiteralPath (Join-Path $backendPath '.env')
    $publicUrl = (($envFile | Where-Object { $_ -match '^PUBLIC_TRACKING_URL=' }) -replace '^PUBLIC_TRACKING_URL=', '').TrimEnd('/')
    if (-not $publicUrl) { throw 'PUBLIC_TRACKING_URL nao foi configurada.' }
    $consecutiveSuccesses = 0
    for ($attempt = 1; $attempt -le 20; $attempt++) {
        # Invoke-WebRequest pode preferir IPv6 e mascarar uma falha exclusiva
        # no caminho IPv4 do Tunnel. Clientes móveis/PCs usam majoritariamente IPv4.
        $ipv4Status = & curl.exe -4 -sS -o NUL -w '%{http_code}' --max-time 10 "$publicUrl/health" 2>$null
        if ($LASTEXITCODE -eq 0 -and $ipv4Status -eq '200') {
            $consecutiveSuccesses++
            if ($consecutiveSuccesses -ge 3) {
                Write-RunLog "[4/4] Cloudflare IPv4 e dominio publico confirmados 3 vezes: $publicUrl/health"
                return
            }
        } else {
            $consecutiveSuccesses = 0
            Write-RunLog "[4/4] Falha externa IPv4: HTTP $ipv4Status em $publicUrl/health (tentativa $attempt/20). Origin local permanece separado."
        }
        Start-Sleep -Seconds 1
    }
    throw "O Cloudflare esta ativo, mas $publicUrl/health nao respondeu corretamente."
}

$startupMutex = New-Object Threading.Mutex($false, 'Local\iTechERP-StartupSupervisor')
$startupLocked = $false
try {
    try { $startupLocked = $startupMutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $startupLocked = $true }
    if (-not $startupLocked) { Write-RunLog 'Outra supervisao ja esta em andamento.'; exit 0 }
    Write-RunLog 'Inicio da supervisao dos servicos iTech.'
    Start-AdminServer
    Start-PublicServer
    Write-RunLog '[3/4] Verificando proxy interno HTTP/HTTPS.'
    & (Join-Path $projectPath 'infra\https\start-https.ps1')
    Write-RunLog '[3/4] Proxy interno confirmado.'
    Confirm-Cloudflare
    Write-RunLog 'Inicializacao concluida: administrativo -> acompanhamento -> proxy interno -> Cloudflare.'
    if ($OpenBrowser) { Start-Process 'http://itech.internal' }
    exit 0
} catch {
    Write-RunLog "ERRO: $($_.Exception.Message)"
    exit 1
} finally {
    if ($startupLocked) { $startupMutex.ReleaseMutex() }
    $startupMutex.Dispose()
}
