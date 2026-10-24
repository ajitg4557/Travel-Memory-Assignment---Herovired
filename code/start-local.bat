@echo off
title DevOps Task Board - running on localhost
REM =====================================================================
REM  Windows one-click launcher for the DevOps Task Board (laptop mode)
REM  - If backend\.env has a real MONGO_URI (Atlas) -> uses it
REM  - Otherwise starts a temporary in-memory MongoDB (no account needed)
REM  Then open http://localhost:5000   (close this window to stop)
REM =====================================================================
cd /d "%~dp0backend"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Node.js is not installed. Install the LTS version from https://nodejs.org
  echo  then double-click this file again.
  pause
  exit /b 1
)
echo Node.js version:
node -v

if not exist node_modules (
  echo.
  echo Installing dependencies ^(first run only^)...
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

if not exist .env goto memdb
findstr /C:"<db_password>" .env >nul
if not errorlevel 1 goto memdb

echo.
echo Using MongoDB connection string from backend\.env
set SERVE_FRONTEND=true
call npm start
goto end

:memdb
echo.
echo No real MONGO_URI in backend\.env - using a temporary in-memory MongoDB.
echo First run downloads MongoDB (about 100 MB). Please wait...
call npm run dev:local

:end
pause
