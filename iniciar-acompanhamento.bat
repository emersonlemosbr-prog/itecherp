@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0iniciar-acompanhamento.ps1"
if errorlevel 1 pause
