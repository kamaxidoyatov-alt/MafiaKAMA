@echo off
cd /d "C:\Users\user\Desktop\Developer\MafiaBOT"
pm2 resurrect 2>nul || pm2 start ecosystem.config.js
