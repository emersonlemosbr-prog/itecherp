param([string]$SourcePath = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
if (-not (New-Object Security.Principal.WindowsPrincipal($identity)).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'A instalacao do runtime e da tarefa SYSTEM exige uma sessao administrativa.'
}
$root = 'C:\ProgramData\iTechERP'
$sourceBackend = Join-Path $SourcePath 'backend'
$backend = Join-Path $root 'backend'
$node = (Get-Command node.exe).Source
$pendingFile = Join-Path $SourcePath 'infra/runtime/install.pending.json'
$request = Get-Content $pendingFile -Raw | ConvertFrom-Json
if ($request.source -ne $SourcePath) { throw 'Origem do pedido de instalacao difere do projeto.' }
if (Test-Path (Join-Path $root 'runtime.json')) { throw 'Runtime ja instalado; use atualizacao explicita, sem recopiAR banco.' }
$log = Join-Path $root 'installation.log'
function Record([string]$Message) { Add-Content $log "$(Get-Date -Format o) $Message" -Encoding UTF8 }
function Set-EnvValue([string]$Text, [string]$Name, [string]$Value) {
    $pattern = "(?m)^$([regex]::Escape($Name))=.*$"
    if ($Text -match $pattern) { return [regex]::Replace($Text, $pattern, "$Name=$Value") }
    return $Text.TrimEnd() + "`r`n$Name=$Value`r`n"
}
$envFile = Join-Path $sourceBackend '.env'
$originalEnv = [IO.File]::ReadAllText($envFile)
foreach ($required in @('backend/server.js','backend/node_modules/better-sqlite3/package.json','data/compatibilidadePeliculas.json','iniciar-servicos.ps1','infra/https/Caddyfile')) {
    if (-not (Test-Path (Join-Path $root $required))) { throw "Runtime incompleto: $required" }
}
if ($originalEnv -match '(?m)^ITECH_DB_PATH=.+') { throw 'ITECH_DB_PATH ja configurado; revisar origem antes de migrar.' }
$port = & $node -e "console.log(require(process.argv[1]).getListenConfig().port)" (Join-Path $sourceBackend 'config/publicTracking.js')
if ($LASTEXITCODE -ne 0) { throw 'Configuracao publica invalida.' }
$listeners = @(Get-NetTCPConnection -State Listen -LocalPort 3001,$port -ErrorAction Stop)
$owned = @()
foreach ($listener in $listeners) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    $scriptName = if ($listener.LocalPort -eq 3001) { 'server.js' } else { 'publicTrackingServer.js' }
    $expected = Join-Path $sourceBackend $scriptName
    if (-not $process.CommandLine -or $process.CommandLine.IndexOf($expected, [StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "PID=$($process.ProcessId) porta=$($listener.LocalPort) nao executa arquivo esperado; migracao cancelada."
    }
    $owned += $process
    if ($listener.LocalPort -eq $port) {
        $parent = Get-CimInstance Win32_Process -Filter "ProcessId=$($process.ParentProcessId)"
        if ($parent.CommandLine -match 'publicTrackingSupervisor\.js') { $owned += $parent }
    }
}
$backup = Join-Path $root ('backups\before-runtime-' + (Get-Date -Format yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Path $backup -Force | Out-Null
[IO.File]::WriteAllText((Join-Path $backup 'backend.env'), $originalEnv)
Export-ScheduledTask -TaskName 'iTech ERP - Startup Supervisor' | Set-Content (Join-Path $backup 'task.xml') -Encoding Unicode
Record 'Preflight OK. Parando somente processos ERP identificados para transferir banco e uploads.'
$committed = $false
try {
    # Stop supervisors before children so they cannot recreate a writer mid-copy.
    foreach ($process in ($owned | Sort-Object @{Expression={ if ($_.CommandLine -match 'Supervisor') { 0 } else { 1 } }})) {
        Record "Stop PID=$($process.ProcessId)"
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
    $sourceDb = Join-Path $sourceBackend 'db\itech.db'
    $targetDb = Join-Path $backend 'db\itech.db'
    & $node -e "const DB=require(process.argv[1]);const db=new DB(process.argv[2],{fileMustExist:true});db.backup(process.argv[3]).then(()=>{db.close();const check=new DB(process.argv[3],{readonly:true});if(check.pragma('integrity_check',{simple:true})!=='ok')process.exitCode=1;check.close()}).catch(e=>{console.error(e.message);process.exitCode=1})" (Join-Path $sourceBackend 'node_modules\better-sqlite3') $sourceDb $targetDb
    if ($LASTEXITCODE -ne 0) { throw 'Backup consistente do SQLite falhou.' }
    Copy-Item $targetDb (Join-Path $backup 'itech.db')
    robocopy (Join-Path $sourceBackend 'uploads') (Join-Path $backend 'uploads') /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw 'Copia de uploads falhou.' }
    $updatedEnv = Set-EnvValue $originalEnv 'ITECH_DB_PATH' ($targetDb -replace '\\','/')
    $updatedEnv = Set-EnvValue $updatedEnv 'ITECH_UPLOAD_PATH' ((Join-Path $backend 'uploads') -replace '\\','/')
    [IO.File]::WriteAllText((Join-Path $backend '.env'), $updatedEnv, (New-Object Text.UTF8Encoding($false)))
    [IO.File]::WriteAllText($envFile, $updatedEnv, (New-Object Text.UTF8Encoding($false)))
    @{ installed=$true; root=$root; source=$SourcePath; appData=$request.appData; localAppData=$request.localAppData; installedAt=(Get-Date -Format o); database=$targetDb; backup=$backup } |
        ConvertTo-Json | Set-Content (Join-Path $root 'runtime.json') -Encoding UTF8
    $committed = $true
    & (Join-Path $root 'instalar-inicializacao-automatica.ps1')
    & sc.exe failure Cloudflared reset= 86400 actions= restart/5000/restart/15000/restart/60000 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel configurar recuperacao do servico Cloudflared.' }
    & sc.exe config Cloudflared start= demand | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Nao foi possivel ordenar inicializacao do Cloudflared apos as origens.' }
    Record 'Banco e uploads transferidos. Tarefa oficial SYSTEM/boot instalada; iniciando servicos locais.'
    Move-Item -LiteralPath $pendingFile -Destination ($pendingFile -replace 'pending','completed') -Force
    # A new scheduled invocation runs after this invocation releases its mutex.
    # Do not mistake a mutex-skipped nested invocation for successful health.
    Record 'Instalacao concluida. A proxima execucao da tarefa confirma os health checks; consulte logs locais.'
} catch {
    Record "ERRO committed=$committed $($_.Exception.Message)"
    if (-not $committed) {
        [IO.File]::WriteAllText($envFile, $originalEnv, (New-Object Text.UTF8Encoding($false)))
        Record 'Configuracao original preservada; proxima inicializacao usa origem original.'
    }
    throw
}
