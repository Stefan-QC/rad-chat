@echo off
rem Dubbelklik om RAD Chat te starten; de eerste keer wordt alles automatisch ingericht.
cd /d "%~dp0"
if not exist "frontend\dist\index.html" call npm run setup
if errorlevel 1 pause & exit /b 1
call npm start
pause
