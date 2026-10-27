$ErrorActionPreference = 'Stop'
$hostName = 'itech.internal'
$serverIp = '192.168.1.199'
$expectedThumbprint = '686592067740E3AEF5437ADA5211267578CEA3B6'
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
  throw 'Execute este script como Administrador no computador principal.'
}
$caPath = Join-Path $PSScriptRoot 'itech-local-ca.crt'
if (-not (Test-Path -LiteralPath $caPath)) { throw 'Certificado público da CA não encontrado.' }
$ca = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2($caPath)
if ($ca.Thumbprint -ne $expectedThumbprint -or $ca.HasPrivateKey) {
  throw 'A CA não corresponde à identidade esperada. Instalação cancelada.'
}
$hostsPath = Join-Path $env:SystemRoot 'System32\drivers\etc\hosts'
$matches = Get-Content -LiteralPath $hostsPath | Where-Object { $_ -match ('(^|\s)' + [regex]::Escape($hostName) + '(\s|$)') -and $_ -notmatch '^\s*#' }
if ($matches | Where-Object { $_ -notmatch ('^\s*' + [regex]::Escape($serverIp) + '\s+') }) {
  throw "Já existe outro endereço para $hostName no arquivo hosts."
}
if (-not $matches) { Add-Content -LiteralPath $hostsPath -Value "$serverIp $hostName" -Encoding ASCII }
Import-Certificate -FilePath $caPath -CertStoreLocation 'Cert:\LocalMachine\Root' | Out-Null
ipconfig /flushdns | Out-Null
Write-Output "Configurado: https://$hostName/removedor-virus"
Write-Output "CA: $expectedThumbprint"
