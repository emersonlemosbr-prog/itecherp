$ErrorActionPreference = 'Stop'
$taskName = 'iTech ERP - Startup Supervisor'
$runtimeFile = 'C:\ProgramData\iTechERP\runtime.json'
if (-not (Test-Path $runtimeFile)) { throw 'Instale o runtime local com infra/runtime/install-runtime.ps1 antes da tarefa de boot.' }
$runtime = Get-Content $runtimeFile -Raw | ConvertFrom-Json
if (-not $runtime.installed) { throw 'Runtime ainda nao instalado.' }
$scriptPath = Join-Path $runtime.root 'iniciar-servicos.ps1'
$powerShell = (Get-Command powershell.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powerShell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$scriptPath`"" -WorkingDirectory $runtime.root
$boot = New-ScheduledTaskTrigger -AtStartup
$watchdog = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger @($boot,$watchdog) -Settings $settings -Principal $principal -Description 'Runtime local: boot sem login e supervisao por minuto; administrativo 3001, publico configurado em PUBLIC_PORT e Cloudflared. Uma unica tarefa oficial.' -Force | Out-Null
Write-Output "Tarefa '$taskName' instalada: SYSTEM, boot + verificacao a cada minuto, runtime local."
