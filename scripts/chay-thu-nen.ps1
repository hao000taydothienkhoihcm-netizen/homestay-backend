# Tien ich: don cong 3100 roi chay chay-thu-nhanh.ps1 o nen, ghi log ra file.
$ErrorActionPreference = 'SilentlyContinue'
$root = Split-Path $PSScriptRoot -Parent
Get-NetTCPConnection -LocalPort 3100 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
Start-Sleep -Seconds 1
Remove-Item (Join-Path $root 'ket-qua-thu.log'), (Join-Path $root 'ket-qua-thu.err.log') -Force
Start-Process powershell -ArgumentList '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Join-Path $PSScriptRoot 'chay-thu-nhanh.ps1') `
  -WorkingDirectory $root -NoNewWindow `
  -RedirectStandardOutput (Join-Path $root 'ket-qua-thu.log') -RedirectStandardError (Join-Path $root 'ket-qua-thu.err.log')
Write-Host 'da chay o nen'
