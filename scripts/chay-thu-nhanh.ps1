# Chay bo thu (lich khoa + dang cho) tren NHANH Neon "thu-phuc-hoi" - KHONG dung production.
# Tu bat backend o cong 3100, doi /health, chay 2 script thu, roi tat.
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$db = 'postgresql://neondb_owner:npg_b5d0mkIrzBDN@ep-dry-sunset-atgn22q1-pooler.c-9.us-east-1.aws.neon.tech/neondb?sslmode=require'
if ($db -notmatch 'ep-dry-sunset') { Write-Host 'CHAN: khong phai nhanh thu'; exit 1 }

$env:DATABASE_URL = $db
$env:PORT = '3100'
$env:NODE_ENV = 'development'
$log = Join-Path $root 'thu-server.log'
if (Test-Path $log) { Remove-Item $log -Force }
$p = Start-Process -FilePath 'node' -ArgumentList 'src/server.js' -WorkingDirectory $root -NoNewWindow -PassThru -RedirectStandardOutput $log -RedirectStandardError "$log.err"

$ok = $false
for ($i = 0; $i -lt 40; $i++) {
  Start-Sleep -Seconds 2
  try { Invoke-RestMethod -Uri 'http://localhost:3100/health' -TimeoutSec 5 | Out-Null; $ok = $true; break } catch {}
}
if (-not $ok) { Write-Host 'Backend khong len duoc'; Get-Content $log, "$log.err" -ErrorAction SilentlyContinue; Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; exit 1 }
Write-Host "Backend san sang (pid $($p.Id))"

$env:SMOKE_BASE = 'http://localhost:3100/v1'
$env:SMOKE_PASS = 'admin@123'

# Neon tu ngu sau vai phut -> lan connect dau bi P1001. Danh thuc bang cach login lai vai lan.
$thuc = $false
for ($i = 0; $i -lt 12; $i++) {
  try {
    Invoke-RestMethod -Uri "$($env:SMOKE_BASE)/auth/login" -Method Post -ContentType 'application/json' `
      -Body (,[Text.Encoding]::UTF8.GetBytes('{"username":"admin","password":"' + $env:SMOKE_PASS + '"}')) | Out-Null
    $thuc = $true; break
  } catch { Write-Host "  danh thuc Neon... lan $($i+1)"; Start-Sleep -Seconds 6 }
}
if (-not $thuc) { Write-Host 'Neon khong danh thuc duoc / sai mat khau'; Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue; exit 1 }
Write-Host 'DB san sang'

$loi = 0
Write-Host "`n===== THU LICH KHOA ====="
& powershell -NoProfile -File (Join-Path $PSScriptRoot 'thu-lich-khoa.ps1') 2>&1 | ForEach-Object { "$_" }; $loi += $LASTEXITCODE
Write-Host "`n===== THU DANG CHO ====="
& powershell -NoProfile -File (Join-Path $PSScriptRoot 'thu-dang-cho.ps1') 2>&1 | ForEach-Object { "$_" }; $loi += $LASTEXITCODE

Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue
Write-Host "`n===== TONG: $loi loi ====="
exit $loi
