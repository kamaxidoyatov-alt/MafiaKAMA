# PowerShell скрипт для создания задачи автозапуска MafiaBOT
# Запускать: powershell -ExecutionPolicy Bypass -File setup-autostart.ps1

$projectPath = "C:\Users\user\Desktop\Developer\MafiaBOT"
$taskName = "MafiaBotAutoStart"
$taskDescription = "MafiaBOT - avtozapusk pri vkljuchenii kompjutera (port 4001)"

# Proverjaem, ustanovlen li PM2
$pm2Available = Get-Command pm2 -ErrorAction SilentlyContinue

if ($pm2Available) {
    Write-Host "PM2 najden! Ispolzuju PM2 dlja avtozapuska."
    
    pm2 save --force 2>$null
    
    $action = New-ScheduledTaskAction -Execute "cmd.exe" `
        -Argument "/c cd /d $projectPath && pm2 resurrect" `
        -WorkingDirectory $projectPath
} else {
    Write-Host "PM2 ne najden. Ispolzuju prjamoj zapusk cherez Node.js."
    
    $action = New-ScheduledTaskAction -Execute "node.exe" `
        -Argument "$projectPath\src\index.js" `
        -WorkingDirectory $projectPath
}

$trigger = New-ScheduledTaskTrigger -AtStartup -RandomDelay "00:00:30"

$currentUser = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -ExecutionTimeLimit (New-TimeSpan -Days 3)

Register-ScheduledTask -TaskName $taskName `
    -Description $taskDescription `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Force

Write-Host ""
Write-Host "Zadacha '$taskName' sozdana uspeshno!"
Write-Host "Bot budet avtomaticheski zapuskatsja pri vkljuchenii kompjutera na portu 4001."
Write-Host ""
Write-Host "Admin-panel: http://localhost:4001/admin"
Write-Host "Stranica sna: http://localhost:4001/admin/sleep"
Write-Host ""

Get-ScheduledTask -TaskName $taskName | Format-List TaskName, State, Description
