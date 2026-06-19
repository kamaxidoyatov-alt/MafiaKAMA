@echo off
chcp 65001 >nul
cd /d "C:\Users\user\Desktop\Developer\MafiaBOT"
title MafiaBOT (порт 4001)
echo ^> Запуск MafiaBOT на порту 4001...
echo ^> Админ-панель: http://localhost:4001/admin
echo ^> Статус сна:  http://localhost:4001/admin/sleep
echo.
pm2 resurrect 2>nul || pm2 start ecosystem.config.js
echo.
echo ✅ MafiaBOT запущен!
pause
