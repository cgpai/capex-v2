@echo off
REM CAPEX dev runner — Windows fallback (cmd or older PowerShell)
REM Prefer: ./run

setlocal
set ROOT=%~dp0
if "%~1"=="" (
  node "%ROOT%run" run
) else (
  node "%ROOT%run" %*
)
exit /b %ERRORLEVEL%
