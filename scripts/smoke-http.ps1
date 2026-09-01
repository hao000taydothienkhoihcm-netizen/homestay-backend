# Smoke test cach ly multi-tenant + khong lam hong duong gia.
# Chay backend truoc (npm run dev), roi:
#   $env:SMOKE_USER='admin'; $env:SMOKE_PASS='...'; powershell -File scripts\smoke-http.ps1
# KHONG ghi mat khau vao file nay.
$ErrorActionPreference = 'Stop'
$B = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { 'http://localhost:3000/v1' }
$U = if ($env:SMOKE_USER) { $env:SMOKE_USER } else { 'admin' }
$P = $env:SMOKE_PASS
if (-not $P) { Write-Host "Thieu \$env:SMOKE_PASS"; exit 1 }
$script:loi = 0
function Kt($ok, $msg) {
  if ($ok) { Write-Host "  OK   $msg" } else { Write-Host " FAIL  $msg"; $script:loi++ }
}
function Code($sb) {
  try { & $sb | Out-Null; return 200 } catch { return $_.Exception.Response.StatusCode.value__ }
}

$r = Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' `
     -Body (@{ username=$U; password=$P } | ConvertTo-Json)
$hdr = @{ Authorization = "Bearer $($r.token)" }
Kt ($null -ne $r.token) "login admin  (role=$($r.user.role) hostId=$($r.user.hostId))"

Write-Host "`n--- LIST endpoints: khong duoc hut dong nao ---"
$homes = Invoke-RestMethod -Uri "$B/homes" -Headers $hdr
Kt ($homes.Count -eq 2) "GET /homes = $($homes.Count) (mong doi 2)"
$bk = Invoke-RestMethod -Uri "$B/bookings" -Headers $hdr
Kt ($bk.Count -eq 51) "GET /bookings = $($bk.Count) (mong doi 51)"
$ex = Invoke-RestMethod -Uri "$B/expenses" -Headers $hdr
Kt ($ex.Count -eq 47) "GET /expenses = $($ex.Count) (mong doi 47)"
$ct = Invoke-RestMethod -Uri "$B/charge-templates" -Headers $hdr
Kt ($ct.Count -gt 0) "GET /charge-templates = $($ct.Count)"
$null = Invoke-RestMethod -Uri "$B/inventory" -Headers $hdr
Kt $true "GET /inventory"
$null = Invoke-RestMethod -Uri "$B/stats/dashboard" -Headers $hdr
Kt $true "GET /stats/dashboard"
$us = Invoke-RestMethod -Uri "$B/users" -Headers $hdr
Kt ($us.Count -eq 5) "GET /users = $($us.Count) (mong doi 5)"

Write-Host "`n--- Home theo id + bang gia ---"
foreach ($h in @($homes[0].id, $homes[1].id)) {
  $d = Invoke-RestMethod -Uri "$B/homes/$h" -Headers $hdr
  Kt ($d.id -eq $h) "GET /homes/$h -> $($d.name)"
  $p = Invoke-RestMethod -Uri "$B/homes/$h/prices?year=2026" -Headers $hdr
  $fill = ($p.months | Where-Object { $_.filled }).Count
  Kt ($p.months.Count -eq 12) "GET /homes/$h/prices?year=2026 -> 12 thang, da nhap $fill"
  $dp = Invoke-RestMethod -Uri "$B/homes/$h/date-prices" -Headers $hdr
  Kt $true "GET /homes/$h/date-prices -> $($dp.Count) ngay ghi de"
}

Write-Host "`n--- Gia tung dem (duong tien) ---"
foreach ($h in @($homes[0].id, $homes[1].id)) {
  $pv = Invoke-RestMethod -Uri "$B/homes/$h/price-preview?checkIn=2026-10-02&checkOut=2026-10-04" -Headers $hdr
  $ct2 = ($pv.detail | ForEach-Object { "$($_.kind)=$($_.price)" }) -join ' + '
  Write-Host "       home $h  02/10->04/10 : $ct2  =  $($pv.total)"
  Kt ($pv.nights -eq 2 -and $pv.total -gt 0) "price-preview home $h : $($pv.nights) dem, tong $($pv.total)"
}

Write-Host "`n--- GET id khong ton tai -> phai 404 ---"
foreach ($u in @("homes/999999", "bookings/999999", "homes/999999/prices?year=2026", "homes/999999/date-prices")) {
  $c = Code { Invoke-RestMethod -Uri "$B/$u" -Headers $hdr }
  Kt ($c -eq 404) "GET /$u -> $c"
}

Write-Host "`n--- PATCH/DELETE id khong ton tai -> phai 404 ---"
$cases = @(
  @('PATCH','bookings/999999','{"guest":"x"}'),
  @('DELETE','bookings/999999',$null),
  @('PATCH','expenses/999999','{"desc":"x"}'),
  @('DELETE','expenses/999999',$null),
  @('PATCH','holidays/999999','{"name":"x"}'),
  @('DELETE','holidays/999999',$null),
  @('PATCH','homes/999999','{"name":"x"}'),
  @('PATCH','charge-templates/999999','{"name":"x"}'),
  @('DELETE','charge-templates/999999',$null),
  @('DELETE','users/999999',$null),
  @('PATCH','inventory/entries/999999','{"note":"x"}')
)
foreach ($m in $cases) {
  $meth = $m[0]; $path = $m[1]; $body = $m[2]
  $c = Code {
    if ($body) { Invoke-RestMethod -Uri "$B/$path" -Method $meth -Headers $hdr -ContentType 'application/json' -Body $body }
    else { Invoke-RestMethod -Uri "$B/$path" -Method $meth -Headers $hdr }
  }
  Kt ($c -eq 404) "$meth /$path -> $c"
}

Write-Host "`n--- POST voi homeId la -> phai 404, khong tao dong rac ---"
$c = Code {
  Invoke-RestMethod -Uri "$B/expenses" -Method Post -Headers $hdr -ContentType 'application/json' `
    -Body '{"date":"2026-09-01","category":"Test","desc":"khong duoc tao","amount":1000,"homeId":999999}'
}
Kt ($c -eq 404) "POST /expenses homeId=999999 -> $c"

$c = Code {
  Invoke-RestMethod -Uri "$B/bookings" -Method Post -Headers $hdr -ContentType 'application/json' `
    -Body '{"guest":"Test","phone":"0900000000","homeId":999999,"checkIn":"2026-12-01","checkOut":"2026-12-02"}'
}
Kt ($c -eq 404) "POST /bookings homeId=999999 -> $c"

Write-Host "`n--- Dem lai sau test: khong duoc phat sinh dong nao ---"
$bk2 = Invoke-RestMethod -Uri "$B/bookings" -Headers $hdr
$ex2 = Invoke-RestMethod -Uri "$B/expenses" -Headers $hdr
Kt ($bk2.Count -eq $bk.Count) "bookings van $($bk2.Count)"
Kt ($ex2.Count -eq $ex.Count) "expenses van $($ex2.Count)"

Write-Host ("`n" + ('=' * 50))
if ($script:loi -eq 0) { Write-Host "  ALL PASS" } else { Write-Host "  $($script:loi) FAILED" }
Write-Host ('=' * 50)
exit $script:loi
