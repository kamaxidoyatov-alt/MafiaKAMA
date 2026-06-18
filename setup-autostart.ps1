# PowerShell скрипт для создания задачи автозапуска MafiaBOT
# Запускать: powershell -ExecutionPolicy Bypass -File setup-autostart.ps1

$taskName = "MafiaBotPM2"
$taskDescription = "MafiaBOT - автоматический запуск через PM2 при старте Windows"

# Действие: запустить cmd.exe c командой pm2 resurrect
$action = New-ScheduledTaskAction -Execute "cmd.exe" `
    -Argument "/c cd /d C:\Users\user\.pm2 && pm2 resurrect" `
    -WorkingDirectory "C:\Users\user\Desktop\Developer\MafiaBOT"

# Триггер: при запуске системы, с задержкой до 1 минуты
$trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay "00:01:00"

# Запускаем от имени текущего пользователя (PM2 dump хранится в его профиле)
$currentUser = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest

# Регистрируем задачу
Register-ScheduledTask -TaskName $taskName `
    -Description $taskDescription `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Force

Write-Host "✅ Задача '$taskName' создана успешно!"
