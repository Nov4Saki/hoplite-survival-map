@echo off
title Hoplite Survival Map Explorer
echo ===================================================
echo     HOPLITE SURVIVAL INTERACTIVE MAP EXPLORER
echo ===================================================
echo Opening map in your default web browser...

REM Open index.html directly
start "" "%~dp0index.html"

echo.
echo Map successfully launched!
echo Keep this window open if you wish, or press any key to close.
pause
