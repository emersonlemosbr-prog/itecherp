@echo off
REM reiniciar.bat - Reinicia os serviços do iTech ERP atualizando o backend e servidores.

title iTech ERP - Reiniciar Servicos
cd /d "%~dp0"
echo Reiniciando os servicos do iTech ERP (recarregando backend)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-servicos.ps1" -Restart
if errorlevel 1 (
    echo O reinicio falhou. Consulte backend\logs\startup-supervisor.log.
    pause
    exit /b 1
)
echo Servicos reiniciados com sucesso!
exit /b 0
