$ErrorActionPreference = 'Stop'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este script como Administrador no computador servidor.'
}
$name = 'iTech HTTPS LAN (TCP 443)'
$existing = Get-NetFirewallRule -DisplayName $name -ErrorAction SilentlyContinue
if (-not $existing) {
  New-NetFirewallRule -DisplayName $name -Direction Inbound -Action Allow -Protocol TCP -LocalPort 443 -LocalAddress '192.168.1.199' -RemoteAddress '192.168.1.0/24' -Profile Private | Out-Null
}
Get-NetFirewallRule -DisplayName $name | Select-Object DisplayName,Enabled,Profile,Direction,Action
