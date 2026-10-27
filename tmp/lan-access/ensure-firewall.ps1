$ErrorActionPreference = 'Stop'
$logPath = Join-Path $PSScriptRoot 'firewall-result.txt'
try {
    $rules = @(Get-NetFirewallPortFilter -PolicyStore ActiveStore | Where-Object { $_.LocalPort -eq '3001' -and $_.Protocol -eq 'TCP' } | Get-NetFirewallRule | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' -and ($_.Profile -match 'Private|Any') })
    if ($rules.Count -eq 0) {
        $rules = @(New-NetFirewallRule -Name 'iTech-Admin-LAN-TCP-3001' -DisplayName 'iTech Administrativo - LAN TCP 3001' -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001 -Profile Private -RemoteAddress LocalSubnet -EdgeTraversalPolicy Block)
        'CREATED' | Set-Content -LiteralPath $logPath
    } else {
        'EXISTING' | Set-Content -LiteralPath $logPath
    }
    $rules | Select-Object Name, Enabled, Direction, Action, Profile | Format-List | Out-String | Add-Content -LiteralPath $logPath
    $rules | Get-NetFirewallAddressFilter | Select-Object LocalAddress, RemoteAddress | Format-List | Out-String | Add-Content -LiteralPath $logPath
} catch {
    $_.Exception.Message | Set-Content -LiteralPath $logPath
    exit 1
}
