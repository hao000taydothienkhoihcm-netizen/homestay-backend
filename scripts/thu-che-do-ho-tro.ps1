# Kiem tra qua HTTP: admin khong thay du lieu host, vao ho tro moi thay,
# host chi thay nha minh, thung rac booking.
# Server phai dang chay (tro vao nhanh nhap khi thu).
#   $env:SMOKE_PASS='...'; $env:HAOTRAN_PASS='...'; powershell -File scripts\thu-che-do-ho-tro.ps1
$ErrorActionPreference = 'Stop'
$B = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { 'http://localhost:3000/v1' }
$P = $env:SMOKE_PASS
if (-not $P) { Write-Host "Thieu `$env:SMOKE_PASS (mat khau admin)"; exit 1 }
$script:loi = 0
function Kt($ok, $msg) { if ($ok) { Write-Host "  OK   $msg" } else { Write-Host " FAIL  $msg"; $script:loi++ } }
function Code($sb) { try { & $sb | Out-Null; return 200 } catch { return $_.Exception.Response.StatusCode.value__ } }
function Dem($arr) { if ($null -eq $arr) { 0 } elseif ($arr -is [array]) { $arr.Count } else { 1 } }

# ───── ADMIN ngoai che do ho tro ─────
$r = Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' -Body (@{ username='admin'; password=$P } | ConvertTo-Json)
$hA = @{ Authorization = "Bearer $($r.token)" }
Kt ($r.user.role -eq 'ADMIN' -and $null -eq $r.user.hostId) "admin dang nhap: role=$($r.user.role) hostId=$($r.user.hostId) (phai null)"

Write-Host "`n--- ADMIN NGOAI HO TRO: khong thay du lieu host nao ---"
$bk = Invoke-RestMethod -Uri "$B/bookings" -Headers $hA
Kt ((Dem $bk) -eq 0) "GET /bookings = $(Dem $bk) (phai 0)"
$hm = Invoke-RestMethod -Uri "$B/homes" -Headers $hA
Kt ((Dem $hm) -eq 0) "GET /homes = $(Dem $hm) (phai 0)"
$ex = Invoke-RestMethod -Uri "$B/expenses" -Headers $hA
Kt ((Dem $ex) -eq 0) "GET /expenses = $(Dem $ex) (phai 0)"
$us = Invoke-RestMethod -Uri "$B/users" -Headers $hA
Kt ((Dem $us) -ge 6) "GET /users = $(Dem $us) (admin van thay TAT CA tai khoan de quan ly)"
$hs = Invoke-RestMethod -Uri "$B/hosts" -Headers $hA
Kt ((Dem $hs) -ge 2) "GET /hosts = $(Dem $hs) host (viec cap nen tang, van thay)"
$c = Code { Invoke-RestMethod -Uri "$B/homes" -Method Post -Headers $hA -ContentType 'application/json' -Body '{"name":"x","address":"x","price":1}' }
Kt ($c -eq 400) "POST /homes khi chua vao ho tro -> $c (phai 400, khong tao ban ghi mo coi)"
$me = Invoke-RestMethod -Uri "$B/auth/me" -Headers $hA
Kt ($null -eq $me.hoTro) "GET /auth/me -> hoTro = null"

Write-Host "`n--- ADMIN VAO HO TRO host #1 ---"
$ht = Invoke-RestMethod -Uri "$B/hosts/1/ho-tro" -Method Post -Headers $hA -ContentType 'application/json' -Body '{"lyDo":"kiem tra tu dong"}'
Kt ($null -ne $ht.token) "POST /hosts/1/ho-tro -> co token, host=$($ht.host.name)"
$hAH = @{ Authorization = "Bearer $($r.token)"; 'X-Ho-Tro' = $ht.token }
$bk1 = Invoke-RestMethod -Uri "$B/bookings" -Headers $hAH
Kt ((Dem $bk1) -gt 0) "GET /bookings (dang ho tro #1) = $(Dem $bk1)"
$hm1 = Invoke-RestMethod -Uri "$B/homes" -Headers $hAH
Kt ((Dem $hm1) -eq 2) "GET /homes (dang ho tro #1) = $(Dem $hm1) (phai 2)"
$me1 = Invoke-RestMethod -Uri "$B/auth/me" -Headers $hAH
Kt ($me1.hoTro.id -eq 1) "GET /auth/me -> hoTro.id = $($me1.hoTro.id)"
$log = Invoke-RestMethod -Uri "$B/hosts/1/ho-tro-log" -Headers $hA
Kt ((Dem $log) -ge 1 -and $log[0].lyDo -eq 'kiem tra tu dong') "nhat ky ho tro co dong vua ghi: '$($log[0].lyDo)' boi $($log[0].admin)"

Write-Host "`n--- ADMIN VAO HO TRO host #3: chi thay #3, khong thay #1 ---"
$ht3 = Invoke-RestMethod -Uri "$B/hosts/3/ho-tro" -Method Post -Headers $hA -ContentType 'application/json' -Body '{}'
$hAH3 = @{ Authorization = "Bearer $($r.token)"; 'X-Ho-Tro' = $ht3.token }
$bk3 = Invoke-RestMethod -Uri "$B/bookings" -Headers $hAH3
$hm3 = Invoke-RestMethod -Uri "$B/homes" -Headers $hAH3
Kt ((Dem $bk3) -lt (Dem $bk1)) "GET /bookings (ho tro #3) = $(Dem $bk3), khac han #1 ($(Dem $bk1))"
Kt ((Dem $hm3) -le 1) "GET /homes (ho tro #3) = $(Dem $hm3)"

Write-Host "`n--- Token ho tro gia / het han bi bo qua ---"
$hGia = @{ Authorization = "Bearer $($r.token)"; 'X-Ho-Tro' = 'abc.def.ghi' }
$bkG = Invoke-RestMethod -Uri "$B/bookings" -Headers $hGia
Kt ((Dem $bkG) -eq 0) "token ho tro gia -> van 0 booking"

# ───── HAOTRAN = HOST cua Sabi ─────
Write-Host "`n--- HAOTRAN (HOST Sabi) ---"
$P2 = $env:HAOTRAN_PASS
if ($P2) {
  $r2 = Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' -Body (@{ username='haotran'; password=$P2 } | ConvertTo-Json)
  $hH = @{ Authorization = "Bearer $($r2.token)" }
  Kt ($r2.user.role -eq 'HOST' -and $r2.user.hostId -eq 1) "haotran dang nhap: role=$($r2.user.role) hostId=$($r2.user.hostId)"
  $bkH = Invoke-RestMethod -Uri "$B/bookings" -Headers $hH
  Kt ((Dem $bkH) -eq (Dem $bk1)) "GET /bookings = $(Dem $bkH), bang dung so admin thay khi ho tro #1"
  $hmH = Invoke-RestMethod -Uri "$B/homes" -Headers $hH
  Kt ((Dem $hmH) -eq 2) "GET /homes = $(Dem $hmH) (2 can Sabi, khong co Dau Dau)"
  $c = Code { Invoke-RestMethod -Uri "$B/hosts" -Headers $hH }
  Kt ($c -eq 403) "GET /hosts -> $c (host khong duoc xem danh sach host khac)"
  $hT = @{ Authorization = "Bearer $($r2.token)"; 'X-Ho-Tro' = $ht3.token }
  $bkT = Invoke-RestMethod -Uri "$B/bookings" -Headers $hT
  Kt ((Dem $bkT) -eq (Dem $bk1)) "host dem token ho tro cua admin di -> van chi thay nha minh ($(Dem $bkT))"
  $nk = Invoke-RestMethod -Uri "$B/users/nhat-ky-ho-tro" -Headers $hH
  Kt ((Dem $nk) -ge 1) "host xem duoc nhat ky admin vao ho tro: $(Dem $nk) dong"

  # ───── THUNG RAC ─────
  Write-Host "`n--- THUNG RAC (tren du lieu cua haotran) ---"
  $mau = $bkH | Sort-Object id | Select-Object -First 1
  $truoc = Dem $bkH
  $null = Invoke-RestMethod -Uri "$B/bookings/$($mau.id)" -Method Delete -Headers $hH
  $sau = Invoke-RestMethod -Uri "$B/bookings" -Headers $hH
  Kt ((Dem $sau) -eq ($truoc - 1)) "xoa booking #$($mau.id) ($($mau.guest)) -> danh sach $truoc -> $(Dem $sau)"
  $c = Code { Invoke-RestMethod -Uri "$B/bookings/$($mau.id)" -Headers $hH }
  Kt ($c -eq 404) "GET /bookings/$($mau.id) sau khi xoa -> $c (an khoi moi cho)"
  $cal = Invoke-RestMethod -Uri "$B/bookings/calendar?year=$($mau.checkIn.Substring(0,4))&month=$([int]$mau.checkIn.Substring(5,2))" -Headers $hH
  Kt (-not ($cal | Where-Object { $_.id -eq $mau.id })) "booking da xoa khong con tren lich"
  $rac = Invoke-RestMethod -Uri "$B/bookings/thung-rac" -Headers $hH
  $trongRac = $rac | Where-Object { $_.id -eq $mau.id }
  Kt ($null -ne $trongRac) "thung rac co #$($mau.id), con $($trongRac.conLai) ngay"
  $kp = Invoke-RestMethod -Uri "$B/bookings/$($mau.id)/khoi-phuc" -Method Post -Headers $hH
  Kt ($kp.id -eq $mau.id -and $null -eq $kp.deletedAt) "khoi phuc #$($mau.id) -> deletedAt = null"
  $sau2 = Invoke-RestMethod -Uri "$B/bookings" -Headers $hH
  Kt ((Dem $sau2) -eq $truoc) "danh sach ve lai $(Dem $sau2) (bang $truoc)"
  $rac2 = Invoke-RestMethod -Uri "$B/bookings/thung-rac" -Headers $hH
  Kt (-not ($rac2 | Where-Object { $_.id -eq $mau.id })) "thung rac khong con #$($mau.id)"
} else {
  Write-Host "  (bo qua: chua dat `$env:HAOTRAN_PASS)"
}

Write-Host ("`n" + ('=' * 50))
if ($script:loi -eq 0) { Write-Host "  ALL PASS" } else { Write-Host "  $($script:loi) FAILED" }
Write-Host ('=' * 50)
exit $script:loi
