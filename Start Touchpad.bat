@echo off
title Touchpad Server
echo ============================================
echo   Starting Wireless Touchpad Server...
echo ============================================
echo.
cd /d "%~dp0server"
python server.py
pause
