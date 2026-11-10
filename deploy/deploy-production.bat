@echo off
setlocal
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-production.ps1" %*
exit /b %ERRORLEVEL%
