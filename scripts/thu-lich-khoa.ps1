# Thu lich khoa tay (GD3). Chay backend tro vao NHANH Neon truoc, roi:
#   $env:SMOKE_PASS='...'; powershell -File scripts\thu-lich-khoa.ps1
# Dung tai khoan admin + che do ho tro host #1 (giong smoke-http.ps1). Test tu don sau khi chay.
$ErrorActionPreference = 'Stop'
$B = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { 'http://localhost:3000/v1' }
$P = $env:SMOKE_PASS
if (-not $P) { Write-Host "Thieu `$env:SMOKE_PASS"; exit 1 }
$script:loi = 0
function Kt($ok, $msg) { if ($ok) { Write-Host "  OK   $msg" } else { Write-Host " FAIL  $msg"; $script:loi++ } }
function Code($sb) { try { & $sb | Out-Null; return 200 } catch { return $_.Exception.Response.StatusCode.value__ } }
function Loi($sb) { try { & $sb | Out-Null; return '' } catch { $s = $_.ErrorDetails.Message; if ($s) { try { return ($s | ConvertFrom-Json).error } catch { return $s } } return $_.Exception.Message } }

$r = Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' -Body (@{ username='admin'; password=$P } | ConvertTo-Json)
$ht = Invoke-RestMethod -Uri "$B/hosts/1/ho-tro" -Method Post -Headers @{ Authorization = "Bearer $($r.token)" } -ContentType 'application/json' -Body '{"lyDo":"thu lich khoa"}'
$H = @{ Authorization = "Bearer $($r.token)"; 'X-Ho-Tro' = $ht.token }
$H0 = @{ Authorization = "Bearer $($r.token)" }
$homes = Invoke-RestMethod -Uri "$B/homes" -Headers $H
$hid = $homes[0].id
Kt ($hid -gt 0) "can nha #$hid ($($homes[0].name))"

# Chon 3 ngay xa trong tuong lai, chac chan khong co booking
$d1 = (Get-Date).AddDays(400).ToString('yyyy-MM-dd'); $d2 = (Get-Date).AddDays(401).ToString('yyyy-MM-dd'); $d3 = (Get-Date).AddDays(402).ToString('yyyy-MM-dd')
$tu = $d1; $den = (Get-Date).AddDays(405).ToString('yyyy-MM-dd')

Write-Host "`n--- khoa / mo ---"
$k = Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body (@{ khoa=@($d1,$d2,$d3); ghiChu='khach nha' } | ConvertTo-Json)
Kt ($k.daKhoa -eq 3) "khoa 3 ngay -> daKhoa=$($k.daKhoa)"
$k2 = Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body (@{ khoa=@($d1) } | ConvertTo-Json)
Kt ($k2.daKhoa -eq 0) "khoa lai ngay da khoa -> bo qua (daKhoa=$($k2.daKhoa))"
$l = Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa?tu=$tu&den=$den" -Headers $H
Kt ($l.ngay.Count -eq 3 -and $l.ngay[0].nguon -eq 'MANUAL' -and $l.ngay[0].ghiChu -eq 'khach nha') "GET lich-khoa = 3 dong MANUAL, co ghi chu"
$lich = Invoke-RestMethod -Uri "$B/homes/$hid/lich?tu=$tu&den=$den" -Headers $H
$khoaCount = @($lich.ngay | Where-Object { $_.trangThai -eq 'khoa' }).Count
$trongCount = @($lich.ngay | Where-Object { $_.trangThai -eq 'trong' }).Count
Kt ($lich.ngay.Count -eq 6 -and $khoaCount -eq 3 -and $trongCount -eq 3) "GET lich tong hop: 6 ngay = 3 khoa + 3 trong"

Write-Host "`n--- booking khong duoc de len ngay khoa ---"
$body = @{ guest='Thu Khoa'; phone='0900000000'; homeId=$hid; checkIn=$d2; checkOut=$d3; guests=2 } | ConvertTo-Json
$c = Code { Invoke-RestMethod -Uri "$B/bookings" -Method Post -Headers $H -ContentType 'application/json' -Body $body }
$msg = Loi { Invoke-RestMethod -Uri "$B/bookings" -Method Post -Headers $H -ContentType 'application/json' -Body $body }
Kt ($c -eq 409 -and $msg -like '*kho*') "POST booking de len ngay khoa -> 409 ($msg)"
# checkOut = ngay khoa thi OK (dem checkOut khong tinh)
$d0 = (Get-Date).AddDays(399).ToString('yyyy-MM-dd')
$body2 = @{ guest='Thu Khoa OK'; phone='0900000000'; homeId=$hid; checkIn=$d0; checkOut=$d1; guests=2 } | ConvertTo-Json
$bk = Invoke-RestMethod -Uri "$B/bookings" -Method Post -Headers $H -ContentType 'application/json' -Body $body2
Kt ($bk.id -gt 0) "booking tra dung ngay bat dau khoa -> OK (#$($bk.id))"

Write-Host "`n--- khong khoa ngay da co booking ---"
$k3 = Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body (@{ khoa=@($d0) } | ConvertTo-Json)
Kt ($k3.daKhoa -eq 0 -and $k3.boQuaViCoBooking -contains $d0) "khoa ngay da co booking -> bo qua"

Write-Host "`n--- quyen & cach ly ---"
$c = Code { Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Headers $H0 }
Kt ($c -eq 404) "admin NGOAI ho tro doc lich-khoa -> 404 ($c)"
$c = Code { Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H0 -ContentType 'application/json' -Body (@{ khoa=@($d1) } | ConvertTo-Json) }
Kt ($c -eq 404) "admin NGOAI ho tro khoa -> 404 ($c)"
$c = Code { Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body '{}' }
Kt ($c -eq 400) "body rong -> 400 ($c)"
$c = Code { Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body (@{ khoa=@('abc','2026-13-99') } | ConvertTo-Json) }
Kt ($c -eq 400) "ngay sai dinh dang -> 400 ($c)"

Write-Host "`n--- don dep ---"
Invoke-RestMethod -Uri "$B/bookings/$($bk.id)" -Method Delete -Headers $H | Out-Null
$m = Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body (@{ mo=@($d1,$d2,$d3) } | ConvertTo-Json)
Kt ($m.daMo -eq 3) "mo 3 ngay -> daMo=$($m.daMo)"
$l = Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa?tu=$tu&den=$den" -Headers $H
Kt ($l.ngay.Count -eq 0) "sau don dep: 0 dong khoa"

Write-Host ""
if ($script:loi -eq 0) { Write-Host "TAT CA DAT" } else { Write-Host "CO $($script:loi) LOI" }
exit $script:loi
