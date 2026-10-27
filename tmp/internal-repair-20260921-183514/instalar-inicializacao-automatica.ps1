$ErrorActionPreference = 'Stop'
$taskName = 'iTech ERP - Startup Supervisor'
$scriptPath = Join-Path $PSScriptRoot 'iniciar-servicos.ps1'
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $PSScriptRoot
$logon = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 4)
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($logon,$watchdog) -Settings $settings -Description 'Monitora a cada minuto as portas 3001 e 3002, valida health checks e depois confirma o Cloudflare Tunnel.' -Force | Out-Null
Write-Output "Tarefa '$taskName' instalada para o usuario $env:USERNAME (logon + verificacao a cada minuto)."
