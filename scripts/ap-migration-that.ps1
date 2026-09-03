# Ap migration vao DB that (production). Neon ngu dong: danh thuc bang mot query truoc, roi moi
# migrate deploy — khong thi Prisma CLI bao P1001 "Can't reach database" du DB van song.
# Chay: powershell -File scripts\ap-migration-that.ps1   (sau khi da sao luu!)
$ErrorActionPreference = 'Continue'
Set-Location (Split-Path $PSScriptRoot -Parent)
$line = (Get-Content .env | Where-Object { $_ -match '^DATABASE_URL=' })
$u = $line.Substring(13).Trim().Trim('"')
if ($u -notmatch 'connect_timeout') { $u = $u + '&connect_timeout=30&pool_timeout=30' }
$env:DATABASE_URL = $u

Write-Host "1) Danh thuc Neon..."
for ($i = 1; $i -le 4; $i++) {
  node scripts/thu-ket-noi.mjs 2>&1 | Select-String 'OK ' | Select-Object -First 1
  if ($LASTEXITCODE -eq 0) { break }
  Start-Sleep 8
}
Write-Host "2) migrate status"
node node_modules\prisma\build\index.js migrate status 2>&1 | Select-Object -Last 4
Write-Host "3) migrate deploy"
node node_modules\prisma\build\index.js migrate deploy 2>&1 | Select-Object -Last 8
Write-Host "EXIT=$LASTEXITCODE"
