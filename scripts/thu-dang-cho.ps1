# Thu luong dang can len cho (GD3): host luu nhap / gui duyet -> admin duyet / tu choi / go.
# Chay backend tro NHANH Neon truoc:  $env:SMOKE_PASS='...'; powershell -File scripts\thu-dang-cho.ps1
$ErrorActionPreference = 'Stop'
$B = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { 'http://localhost:3000/v1' }
$P = $env:SMOKE_PASS
if (-not $P) { Write-Host "Thieu `$env:SMOKE_PASS"; exit 1 }
$script:loi = 0
function Kt($ok, $msg) { if ($ok) { Write-Host "  OK   $msg" } else { Write-Host " FAIL  $msg"; $script:loi++ } }
function Code($sb) { try { & $sb | Out-Null; return 200 } catch { return $_.Exception.Response.StatusCode.value__ } }
# Gui bytes UTF-8: Invoke-RestMethod (PS 5) gui chuoi theo ma may -> tieng Viet ("Phuong 1" co dau) bi hong.
function J($o) { ,[Text.Encoding]::UTF8.GetBytes(($o | ConvertTo-Json -Depth 5)) }   # dau phay: giu nguyen byte[]

$r = Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' -Body (J @{ username='admin'; password=$P })
$H0 = @{ Authorization = "Bearer $($r.token)" }
$ht = Invoke-RestMethod -Uri "$B/hosts/1/ho-tro" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"lyDo":"thu dang cho"}'
$H = @{ Authorization = "Bearer $($r.token)"; 'X-Ho-Tro' = $ht.token }
$homes = Invoke-RestMethod -Uri "$B/homes" -Headers $H
$hid = $homes[0].id
Kt ($hid -gt 0) "can #$hid ($($homes[0].name)), trang thai cho: $($homes[0].choTrangThai)"

$ph = Invoke-RestMethod -Uri "$B/homes/phuong" -Headers $H
Kt ($ph.Count -ge 15 -and $ph -contains 'Khac' -or $ph.Count -ge 15) "GET /homes/phuong = $($ph.Count) phuong"

Write-Host "`n--- luu nhap ---"
$nhap = Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J @{ salesTitle='Thu dang cho'; amenities=@('Wifi','Wifi','BBQ'); roomNotes=@('Phong don'); bedrooms='3'; childUnder6='MIEN_PHI'; coCheHoaHong='PHAN_TRAM'; listPrice='5000000'; commissionPct='10' })
Kt ($nhap.choTrangThai -eq 'NHAP' -and $nhap.salesTitle -eq 'Thu dang cho' -and $nhap.amenities.Count -eq 2 -and $nhap.bedrooms -eq 3) "luu nhap: van NHAP, amenities khu trung (2), bedrooms=3"
$c = Code { Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J @{ coCheHoaHong='PHAN_TRAM'; commissionPct='80' }) }
Kt ($c -eq 400) "% hoa hong 80 -> 400 ($c)"

Write-Host "`n--- gui duyet ---"
$c = Code { Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J @{ salesTitle='Thu'; guiDuyet=$true }) }
Kt ($c -eq 400) "gui duyet thieu truong -> 400 ($c)"
$full = @{ salesTitle='Thu dang cho'; street='12 Nguyen Chi Thanh'; ward=$ph[0]; salesInfo='Bai gioi thieu thu'; coCheHoaHong='GIA_SAN'; floorPrice='4500000'; markupMin='300000'; markupMax='1000000'; guiDuyet=$true }
$gd = Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J $full)
Kt ($gd.choTrangThai -eq 'CHO_DUYET' -and $gd.ward -eq $ph[0] -and $gd.floorPrice -eq 4500000) "gui duyet du truong -> CHO_DUYET"

Write-Host "`n--- admin duyet (khong can ho tro) ---"
$cho = Invoke-RestMethod -Uri "$B/hosts/can/cho-duyet" -Headers $H0
$mine = $cho | Where-Object { $_.id -eq $hid }
Kt ($null -ne $mine -and $mine.host.id -eq 1) "GET /hosts/can/cho-duyet co can #$hid cua host #1 (nghiTrung=$(@($mine.nghiTrung).Count))"
Kt ($null -eq $mine.PSObject.Properties['bookings']) "khong lo booking trong danh sach duyet"
$d = Invoke-RestMethod -Uri "$B/hosts/can/$hid/duyet" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"quyetDinh":"DUYET"}'
Kt ($d.choTrangThai -eq 'DANG_BAN') "DUYET -> DANG_BAN"
$c = Code { Invoke-RestMethod -Uri "$B/hosts/can/$hid/duyet" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"quyetDinh":"DUYET"}' }
Kt ($c -eq 400) "DUYET lai khi dang DANG_BAN -> 400 ($c)"
$c = Code { Invoke-RestMethod -Uri "$B/hosts/can/cho-duyet" -Headers $H }
Kt ($c -eq 200) "admin trong ho tro van goi duoc route admin ($c)"

Write-Host "`n--- host sau khi len cho ---"
$full2 = $full.Clone(); $full2.Remove('guiDuyet'); $full2.street = 'DOI DIA CHI'; $full2.salesTitle = 'Tieu de moi'
$s = Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J $full2)
Kt ($s.street -eq '12 Nguyen Chi Thanh' -and $s.salesTitle -eq 'Tieu de moi' -and $s.choTrangThai -eq 'DANG_BAN') "dang ban: doi tieu de duoc, doi dia chi bi bo qua, van DANG_BAN"
$full2.an = $true
$s = Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J $full2)
Kt ($s.choTrangThai -eq 'AN') "host tam an -> AN"
$full2.an = $false
$s = Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J $full2)
Kt ($s.choTrangThai -eq 'DANG_BAN') "host hien lai -> DANG_BAN (khong can duyet lai)"
$tq = Invoke-RestMethod -Uri "$B/hosts/can/tong-quan" -Headers $H0
Kt ($tq.dem.DANG_BAN -ge 1 -and (@($tq.dangBan | Where-Object { $_.id -eq $hid }).Count -eq 1)) "tong-quan: DANG_BAN=$($tq.dem.DANG_BAN), co can #$hid"

Write-Host "`n--- quyen ---"
$c = Code { Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H0 -ContentType 'application/json' -Body (J @{ salesTitle='x' }) }
Kt ($c -eq 404) "admin NGOAI ho tro sua cho -> 404 ($c)"

Write-Host "`n--- don dep ---"
$g = Invoke-RestMethod -Uri "$B/hosts/can/$hid/duyet" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"quyetDinh":"GO"}'
Kt ($g.choTrangThai -eq 'NHAP') "GO -> NHAP"
$x = Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body '{}'
Kt ($x.choTrangThai -eq 'NHAP' -and $null -eq $x.salesTitle -and $x.amenities.Count -eq 0 -and $null -eq $x.ward) "xoa sach truong cho -> NHAP, rong"

Write-Host ""
if ($script:loi -eq 0) { Write-Host "TAT CA DAT" } else { Write-Host "CO $($script:loi) LOI" }
exit $script:loi
