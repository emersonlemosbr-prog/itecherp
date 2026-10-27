$ErrorActionPreference = 'Stop'
$taskName = 'iTech ERP - Startup Supervisor'
$scriptPath = Join-Path $PSScriptRoot 'iniciar-servicos.ps1'
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $PSScriptRoot
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
$principal = New-ScheduledTaskPrincipal -UserId ([Security.Principal.WindowsIdentity]::GetCurrent().Name) -LogonType Interactive -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon,$watchdog) -Settings $settings -Principal $principal -Description 'Ao entrar no Windows e a cada minuto: administrativo 3001 -> acompanhamento 3002 -> Caddy 80/443 -> Cloudflare. Aguarda disponibilidade do projeto no Google Drive.' -Force | Out-Null
Write-Output "Tarefa '$taskName' instalada para o usuario $env:USERNAME (logon + verificacao a cada minuto)."
