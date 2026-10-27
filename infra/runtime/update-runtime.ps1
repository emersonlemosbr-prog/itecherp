param([string]$SourcePath = (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent))
$ErrorActionPreference = 'Stop'
if (-not (New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Execute a atualizacao em PowerShell administrativo.'
}
$runtime = Get-Content 'C:\ProgramData\iTechERP\runtime.json' -Raw | ConvertFrom-Json
if (-not $runtime.installed -or $runtime.source -ne $SourcePath -or $runtime.root -ne 'C:\ProgramData\iTechERP') { throw 'Origem/runtime inesperado.' }
$root = $runtime.root
$taskName = 'iTech ERP - Startup Supervisor'
# Never overwrite the live database, uploads, secrets, or logs from the source checkout.
Disable-ScheduledTask -TaskName $taskName | Out-Null
try {
    Stop-ScheduledTask -TaskName $taskName
    $expected = [regex]::Escape((Join-Path $root 'backend'))
    $processes = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object {
        $_.CommandLine -match $expected -and $_.CommandLine -match '(publicTrackingSupervisor|publicTrackingServer|server)\.js'
    }
    foreach ($process in ($processes | Sort-Object @{Expression={ if ($_.CommandLine -match 'Supervisor') { 0 } else { 1 } }})) {
        Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
    }
    robocopy (Join-Path $SourcePath 'backend') (Join-Path $root 'backend') /E /R:1 /W:1 /XD logs uploads tests tmp-service-order-test backend /XF .env *.db *.db-wal *.db-shm /NFL /NDL /NJH /NJS /NP
    if ($LASTEXITCODE -ge 8) { throw 'Falha na copia do backend. Confira o runtime antes de retomar.' }
    robocopy (Join-Path $SourcePath 'data') (Join-Path $root 'data') /E /R:1 /W:1 /NFL /NDL /NJH /NJS /NP
    if ($LASTEXITCODE -ge 8) { throw 'Falha na copia dos catalogos.' }
    foreach ($file in @('iniciar-servicos.ps1','iniciar-acompanhamento.ps1','instalar-inicializacao-automatica.ps1','infra/https/start-https.ps1','infra/https/watch-public-tunnel.ps1','infra/https/Caddyfile','infra/runtime/test-recovery.ps1','infra/runtime/configure-tunnel-service.ps1')) {
        Copy-Item (Join-Path $SourcePath $file) (Join-Path $root $file) -Force
    }
} finally {
    Enable-ScheduledTask -TaskName $taskName | Out-Null
    Start-ScheduledTask -TaskName $taskName
}
Write-Output 'Atualizacao aplicada. Valide health local, dominio e logs em C:\ProgramData\iTechERP\backend\logs.'
