@echo off
REM iniciar.bat - Abre o sistema iTech Celular e Informatica.
REM Duplo clique neste arquivo para ligar o programa.

title iTech Celular e Informatica - Painel
cd /d "%~dp0"
echo Verificando administrativo, acompanhamento publico, proxy interno e Cloudflare...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-servicos.ps1" -OpenBrowser
if errorlevel 1 (
    echo A inicializacao falhou. Consulte backend\logs\startup-supervisor.log.
    pause
    exit /b 1
)
exit /b 0

