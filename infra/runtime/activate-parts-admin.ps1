# Execute este arquivo em PowerShell administrativo. Reinicia somente o administrativo.
$ErrorActionPreference='Stop'
$root='C:\ProgramData\iTechERP'
$source='G:\Outros computadores\Meu computador\itech-erp FINAL'
if(-not [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)){throw 'Abra o PowerShell como administrador para reiniciar o processo SYSTEM.'}
$log=Join-Path $source 'tmp\parts-deployment\activation-console.log'
Start-Transcript -Path $log -Append | Out-Null
try {
Write-Host 'Iniciando ativacao oficial de Valor de Pecas...' -ForegroundColor Cyan
$admin=Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -First 1
$public=Get-NetTCPConnection -State Listen -LocalPort 3002 | Select-Object -First 1
$process=Get-CimInstance Win32_Process -Filter "ProcessId=$($admin.OwningProcess)"
if($process.CommandLine -notlike '*C:\ProgramData\iTechERP\backend\server.js*'){throw 'Processo administrativo inesperado; nenhuma parada realizada.'}
Stop-Process -Id $admin.OwningProcess -Force
Start-ScheduledTask -TaskName 'iTech ERP - Startup Supervisor'
$ready=$false
for($i=0;$i -lt 90;$i++) {
 Start-Sleep -Seconds 1
 try {
  if((Invoke-RestMethod 'http://127.0.0.1:3001/api/health' -TimeoutSec 2).status -eq 'ok') {
   try {Invoke-WebRequest 'http://127.0.0.1:3001/api/calculators/parts' -UseBasicParsing -TimeoutSec 2 | Out-Null}
   catch {if([int]$_.Exception.Response.StatusCode -eq 401){$ready=$true;break}}
  }
 }catch{}
}
if(-not $ready){throw 'API nova ainda nao respondeu. O HTML antigo foi preservado; consulte admin.err.log.'}
Copy-Item -LiteralPath (Join-Path $source 'frontend\dist\index.html') -Destination (Join-Path $root 'backend\public\index.html') -Force
$adminAfter=Get-NetTCPConnection -State Listen -LocalPort 3001 | Select-Object -First 1
$publicAfter=Get-NetTCPConnection -State Listen -LocalPort 3002 | Select-Object -First 1
$result=@{status='active';adminBefore=$admin.OwningProcess;adminAfter=$adminAfter.OwningProcess;publicBefore=$public.OwningProcess;publicAfter=$publicAfter.OwningProcess;at=(Get-Date).ToString('o')}
$result | ConvertTo-Json | Set-Content (Join-Path $source 'tmp\parts-deployment\restart-result.json') -Encoding UTF8
Write-Output 'Valor de Pecas ativado. Apenas o administrativo foi reiniciado. A validacao no navegador deve ser realizada agora.'

} catch {
 Write-Host ('FALHA: ' + $_.Exception.Message) -ForegroundColor Red
 throw
} finally {
 Stop-Transcript -ErrorAction SilentlyContinue | Out-Null
}
