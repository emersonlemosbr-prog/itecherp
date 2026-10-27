@echo off
REM exec-testes.bat - Executa a suite de testes, compila o frontend e reinicia o backend com a nova rota DELETE.

title iTech ERP - Execucao de Testes e Recarregamento
cd /d "%~dp0"
node backend/scripts/runTestsAndReload.js
if errorlevel 1 (
    echo.
    echo [FALHA] Os testes ou build falharam!
    pause
    exit /b 1
)
echo.
echo [SUCESSO] Testes e build concluidos com exito!
pause
exit /b 0
