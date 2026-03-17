@echo off
:: This script runs the touchpad server minimized in background
:: Place a shortcut to this file in your Windows Startup folder
cd /d "%~dp0server"
start /min "" python server.py
