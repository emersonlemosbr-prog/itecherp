@echo off
REM build.bat - Gera o build do frontend e copia para dentro do backend.
REM Duplo clique neste arquivo para compilar e atualizar o sistema.

title iTech Celular e Informatica - Build do Sistema
cd /d "%~dp0"

echo ========================================================
echo   iTech Celular e Informatica - Compilacao do Sistema
echo ========================================================
echo.

REM 1. Verifica se Node.js e npm estao disponiveis
where node >nul 2>nul
if errorlevel 1 (
    echo [ERRO] Node.js nao foi encontrado no sistema!
    echo Instale o Node.js ou adicione-o as variaveis de ambiente PATH.
    echo.
    pause
    exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
    echo [ERRO] O gerenciador 'npm' nao foi encontrado!
    echo Verifique sua instalacao do Node.js.
    echo.
    pause
    exit /b 1
)

set "FRONTEND_DIR=%~dp0frontend"
set "BACKEND_DIR=%~dp0backend"

if not exist "%FRONTEND_DIR%\package.json" (
    echo [ERRO] Pasta do frontend nao encontrada em:
    echo "%FRONTEND_DIR%"
    echo.
    pause
    exit /b 1
)

REM 2. Instala dependencias do frontend
echo [1/4] Verificando dependencias do frontend...
cd /d "%FRONTEND_DIR%"
call npm install
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar dependencias do frontend!
    echo.
    pause
    exit /b 1
)

REM 3. Compila o frontend (Vite)
echo.
echo [2/4] Gerando build de producao do frontend...
call npm run build
if errorlevel 1 (
    echo.
    echo [ERRO] Falha na compilacao do frontend (npm run build)!
    echo Verifique os erros acima.
    echo.
    pause
    exit /b 1
)

if not exist "%FRONTEND_DIR%\dist" (
    echo.
    echo [ERRO] A pasta dist nao foi gerada pelo Vite!
    echo.
    pause
    exit /b 1
)

REM 4. Copia os arquivos compilados para o backend
echo.
echo [3/4] Copiando arquivos compilados para o backend...
cd /d "%~dp0"
if not exist "%BACKEND_DIR%\public" mkdir "%BACKEND_DIR%\public"

xcopy /e /i /y "%FRONTEND_DIR%\dist\*" "%BACKEND_DIR%\public\"
if errorlevel 1 (
    echo.
    echo [AVISO/ERRO] Ocorreu uma falha ao copiar os arquivos para backend\public.
    echo Se o sistema estiver aberto (iniciar.bat ou node), feche-o e tente novamente.
    echo.
    pause
    exit /b 1
)

REM 5. Prepara dependencias do backend
echo.
echo [4/4] Verificando dependencias do backend...
cd /d "%BACKEND_DIR%"
if not exist .env (
    if exist .env.example copy .env.example .env
)
call npm install
if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar dependencias do backend!
    echo.
    pause
    exit /b 1
)

cd /d "%~dp0"
echo.
echo ========================================================
echo   Build concluido com sucesso!
echo   Agora voce ja pode abrir o sistema usando iniciar.bat
echo ========================================================
echo.
pause
exit /b 0
