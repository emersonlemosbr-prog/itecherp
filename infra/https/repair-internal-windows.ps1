param([Parameter(Mandatory=$true)][string]$ProjectPath, [Parameter(Mandatory=$true)][string]$ResultPath)
$ErrorActionPreference = 'Stop'
Start-Transcript -LiteralPath $ResultPath -Force | Out-Null
try {
    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) { throw 'Requer Administrador.' }
    $hostsFile = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
    $entries = @(Get-Content -LiteralPath $hostsFile | Where-Object { $_ -notmatch '^\s*#' -and ($_ -split '#')[0] -match '(^|\s)itech\.internal(\s|$)' })
    if ($entries | Where-Object { $_ -notmatch '^\s*192\.168\.1\.199\s+' }) { throw 'Entrada hosts conflitante; preservada para revisao.' }
    if (-not $entries.Count) {
        Copy-Item -LiteralPath $hostsFile -Destination ($hostsFile + '.itech-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.bak')
        Add-Content -LiteralPath $hostsFile -Value "`r`n192.168.1.199 itech.internal" -Encoding ASCII
    }
    ipconfig /flushdns
    foreach ($port in @(80,443)) {
        if ($port -eq 443 -and (Get-NetFirewallRule -DisplayName 'iTech HTTPS LAN (TCP 443)' -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Action -eq 'Allow' })) { continue }
        $name = "iTech internal LAN (TCP $port)"
        if (-not (Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue)) {
            New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort $port -LocalAddress '192.168.1.199' -RemoteAddress '192.168.1.0/24' -Profile Private | Out-Null
        }
    }
    Get-NetFirewallRule | Where-Object DisplayName -match 'itech|caddy|3001|3002' | ForEach-Object {
        $_ | Select-Object DisplayName,Enabled,Profile,Direction,Action
        $_ | Get-NetFirewallPortFilter | Select-Object Protocol,LocalPort
    } | Format-List
    & (Join-Path $ProjectPath 'instalar-inicializacao-automatica.ps1')
    Start-ScheduledTask -TaskName 'iTech ERP - Startup Supervisor'
    Write-Output 'REPAIR_OK'
} catch {
    Write-Output "REPAIR_ERROR: $($_.Exception.Message)"
    exit 1
} finally { Stop-Transcript | Out-Null }
