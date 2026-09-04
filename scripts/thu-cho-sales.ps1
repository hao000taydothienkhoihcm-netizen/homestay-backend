# Thu API CHO CAN cho vai SALES (GD3 tang 2).
# Trong tam: sales thay du can cua MOI host, nhung KHONG duoc thay dia chi / SDT / ten khach.
$ErrorActionPreference = 'Stop'
$B = if ($env:SMOKE_BASE) { $env:SMOKE_BASE } else { 'http://localhost:3000/v1' }
$P = $env:SMOKE_PASS
if (-not $P) { Write-Host "Thieu `$env:SMOKE_PASS"; exit 1 }
$script:loi = 0
function Kt($ok, $msg) { if ($ok) { Write-Host "  OK   $msg" } else { Write-Host " FAIL  $msg"; $script:loi++ } }
function Code($sb) { try { & $sb | Out-Null; return 200 } catch { return $_.Exception.Response.StatusCode.value__ } }
function J($o) { ,[Text.Encoding]::UTF8.GetBytes(($o | ConvertTo-Json -Depth 5)) }

$r = Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' -Body (J @{ username='admin'; password=$P })
$H0 = @{ Authorization = "Bearer $($r.token)" }

# ── Dung ho tro de dua 1 can cua host #1 len cho ──
$ht = Invoke-RestMethod -Uri "$B/hosts/1/ho-tro" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"lyDo":"thu cho sales"}'
$H = @{ Authorization = "Bearer $($r.token)"; 'X-Ho-Tro' = $ht.token }
$homes = Invoke-RestMethod -Uri "$B/homes" -Headers $H
$hid = $homes[0].id
$ph = Invoke-RestMethod -Uri "$B/homes/phuong" -Headers $H

# TU DON TRUOC KHI CHAY (lan chay hong truoc co the de can o DANG_BAN).
try { Invoke-RestMethod -Uri "$B/hosts/can/$hid/duyet" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"quyetDinh":"GO"}' | Out-Null } catch {}
Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body '{}' | Out-Null

$full = @{ salesTitle='Home thu nghiem cho sales'; ward=$ph[0]; bedrooms='3'; bedroomsSingle='2'; bedroomsDouble='1';
  landmark='ngay pho di bo'; minGuests='4'; amenities=@('Hoi boi','May giat'); roomNotes=@('Phong don co bon tam');
  albumUrl='https://drive.google.com/abc'; coverImages=@('https://vd.com/1.jpg');
  salesInfo='Bai chao khach thu'; rules='Nhan phong 14h'; caretakerPhone='0909123456';
  coCheHoaHong='PHAN_TRAM'; listPrice='5000000'; commissionPct='10'; guiDuyet=$true }
Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J $full) | Out-Null
Invoke-RestMethod -Uri "$B/hosts/can/$hid/duyet" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"quyetDinh":"DUYET"}' | Out-Null
Write-Host "Da dua can #$hid len cho (co che A)."

Write-Host "`n--- danh sach cho ---"
$ds = Invoke-RestMethod -Uri "$B/cho" -Headers $H0
$mine = $ds.can | Where-Object { $_.id -eq $hid }
Kt ($ds.soCan -ge 1 -and $null -ne $mine) "GET /cho tra $($ds.soCan) can, co can #$hid"
Kt ($mine.salesTitle -eq 'Home thu nghiem cho sales' -and $mine.bedrooms -eq 3 -and $mine.landmark -eq 'ngay pho di bo') "tra du tieu de / phong ngu / diem moc"

Write-Host "`n--- KHONG duoc lo thong tin rieng ---"
# LUU Y: PowerShell KHONG phan biet hoa/thuong -> dat ten bien $p / $b se de len $P (mat khau)
# va $B (URL goc) o dau file. Dung ten dai.
$cot = $mine.PSObject.Properties.Name
Kt ($cot -notcontains 'address') "khong tra address"
Kt ($cot -notcontains 'caretakerPhone') "khong tra caretakerPhone (SDT quan gia)"
Kt ($cot -notcontains 'rules') "khong tra rules"
Kt ($cot -notcontains 'name') "khong tra ten can noi bo"
Kt ($cot -notcontains 'price' -and $cot -notcontains 'floorPrice' -and $cot -notcontains 'listPrice') "khong tra cot gia tho (price/floorPrice/listPrice)"
Kt ($cot -notcontains 'desc' -and $cot -notcontains 'host') "khong tra desc / thong tin host"

Write-Host "`n--- gia theo co che ---"
Kt ($mine.gia.coChe -eq 'A' -and $mine.gia.giaBan -eq 5000000 -and $mine.gia.hoaHongToiDa -eq 500000) "co che A: giaBan 5.000.000, hoa hong 500.000 (10%)"
$bodyB = $full.Clone(); $bodyB.coCheHoaHong='GIA_SAN'; $bodyB.floorPrice='4500000'; $bodyB.markupMin='300000'; $bodyB.markupMax='1000000'; $bodyB.Remove('guiDuyet')
Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J $bodyB) | Out-Null
$mine2 = (Invoke-RestMethod -Uri "$B/cho/$hid" -Headers $H0)
Kt ($mine2.gia.coChe -eq 'B' -and $mine2.gia.giaSan -eq 4500000 -and $mine2.gia.keTu -eq 300000 -and $mine2.gia.keDen -eq 1000000 -and $mine2.gia.giaBanGoiY -eq 4800000) "co che B: san 4.5tr, ke 300k-1tr, goi y 4.8tr"

Write-Host "`n--- lich chi TRONG / BAN ---"
$lich = Invoke-RestMethod -Uri "$B/cho/$hid/lich?tu=2027-11-01&den=2027-11-10" -Headers $H0
Kt ($lich.ngay.Count -eq 10) "GET /cho/:id/lich tra 10 ngay"
$tt = $lich.ngay | ForEach-Object { $_.trangThai } | Sort-Object -Unique
Kt (($tt | Where-Object { $_ -ne 'trong' -and $_ -ne 'ban' }).Count -eq 0) "chi co trang thai trong/ban (thay: $($tt -join ','))"
$k1 = $lich.ngay[0].PSObject.Properties.Name
Kt ($k1 -notcontains 'guest' -and $k1 -notcontains 'bookingId' -and $k1 -notcontains 'nguon') "lich khong lo guest / bookingId / nguon khoa"

# Khoa 1 dem roi kiem lai
Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body (J @{ khoa=@('2027-11-05'); ghiChu='thu cho' }) | Out-Null
$lich2 = Invoke-RestMethod -Uri "$B/cho/$hid/lich?tu=2027-11-01&den=2027-11-10" -Headers $H0
$n5 = $lich2.ngay | Where-Object { $_.ngay -eq '2027-11-05' }
Kt ($n5.trangThai -eq 'ban') "ngay bi khoa tay -> hien 'ban' tren cho"

Write-Host "`n--- loc ---"
$l1 = Invoke-RestMethod -Uri "$B/cho?tu=2027-11-03&den=2027-11-07" -Headers $H0
Kt ((@($l1.can | Where-Object { $_.id -eq $hid })).Count -eq 0) "loc theo ngay: khoang trum ngay khoa -> loai can"
$l2 = Invoke-RestMethod -Uri "$B/cho?tu=2027-11-08&den=2027-11-10" -Headers $H0
Kt ((@($l2.can | Where-Object { $_.id -eq $hid })).Count -eq 1) "loc theo ngay: khoang trong -> con can"
$l3 = Invoke-RestMethod -Uri "$B/cho?khach=2" -Headers $H0
Kt ((@($l3.can | Where-Object { $_.id -eq $hid })).Count -eq 0) "loc so khach 2 < minGuests 4 -> loai can"
$l4 = Invoke-RestMethod -Uri "$B/cho?khach=6" -Headers $H0
Kt ((@($l4.can | Where-Object { $_.id -eq $hid })).Count -eq 1) "loc so khach 6 -> con can"
$l5 = Invoke-RestMethod -Uri "$B/cho?ward=KHONG_CO_PHUONG_NAY" -Headers $H0
Kt ($l5.soCan -eq 0) "loc phuong khong ton tai -> 0 can"
$pcho = Invoke-RestMethod -Uri "$B/cho/phuong" -Headers $H0
Kt ($pcho -contains $ph[0]) "GET /cho/phuong co phuong cua can dang ban"

Write-Host "`n--- tao tai khoan SALES that va dang nhap ---"
# Da tung lam sai: POST /users goi ownHostId() cho MOI vai -> admin ngoai ho tro tao Sales
# la nem loi, con bi catch nuot thanh "Loi tao tai khoan" chung chung.
$uname = 'thu_sales_tmp'
$cu = (Invoke-RestMethod -Uri "$B/users" -Headers $H0) | Where-Object { $_.username -eq $uname }
if ($cu) { Invoke-RestMethod -Uri "$B/users/$($cu.id)" -Method Delete -Headers $H0 | Out-Null }
$sales = Invoke-RestMethod -Uri "$B/users" -Method Post -Headers $H0 -ContentType 'application/json' `
  -Body (J @{ username=$uname; password='thu@12345'; name='Sales thu'; role='SALES'; active=$true })
Kt ($sales.role -eq 'SALES' -and $null -eq $sales.hostId) "tao Sales (admin NGOAI ho tro) -> OK, hostId = null"

$stok = (Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' -Body (J @{ username=$uname; password='thu@12345' })).token
$HS = @{ Authorization = "Bearer $stok" }
Kt ($null -ne $stok) "Sales dang nhap duoc"

# Dua can len cho (neu no dang DANG_BAN san thi DUYET se bao 400 - khong sao, bo qua)
Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body (J $full) | Out-Null
try { Invoke-RestMethod -Uri "$B/hosts/can/$hid/duyet" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"quyetDinh":"DUYET"}' | Out-Null } catch {}
$dsS = Invoke-RestMethod -Uri "$B/cho" -Headers $HS
Kt ((@($dsS.can | Where-Object { $_.id -eq $hid })).Count -eq 1) "Sales thay can #$hid tren cho (khac host, khong bi loc hostId)"

# Cach ly: sales KHONG thuoc host nao -> moi man nghiep vu phai rong / cam
$bkS = Invoke-RestMethod -Uri "$B/bookings" -Headers $HS
Kt (@($bkS).Count -eq 0) "Sales doc /bookings -> 0 dong (hostId null)"
$hmS = Invoke-RestMethod -Uri "$B/homes" -Headers $HS
Kt (@($hmS).Count -eq 0) "Sales doc /homes -> 0 dong"
$c = Code { Invoke-RestMethod -Uri "$B/users" -Headers $HS }
Kt ($c -eq 403) "Sales vao /users -> 403 ($c)"
$c = Code { Invoke-RestMethod -Uri "$B/hosts" -Headers $HS }
Kt ($c -eq 403) "Sales vao /hosts -> 403 ($c)"

Invoke-RestMethod -Uri "$B/users/$($sales.id)" -Method Delete -Headers $H0 | Out-Null

Write-Host "`n--- quyen ---"
$hostTok = $null
try { $hostTok = (Invoke-RestMethod -Uri "$B/auth/login" -Method Post -ContentType 'application/json' -Body (J @{ username='haotran'; password=$P })).token } catch {}
if ($hostTok) {
  $c = Code { Invoke-RestMethod -Uri "$B/cho" -Headers @{ Authorization = "Bearer $hostTok" } }
  Kt ($c -eq 403) "vai HOST vao cho -> 403 ($c)"
} else { Write-Host "  (bo qua kiem HOST: khong dang nhap duoc tai khoan haotran)" }
$c = Code { Invoke-RestMethod -Uri "$B/cho" }
Kt ($c -eq 401) "khong dang nhap -> 401 ($c)"

Write-Host "`n--- can chua duyet thi khong len cho ---"
Invoke-RestMethod -Uri "$B/hosts/can/$hid/duyet" -Method Post -Headers $H0 -ContentType 'application/json' -Body '{"quyetDinh":"GO"}' | Out-Null
$ds2 = Invoke-RestMethod -Uri "$B/cho" -Headers $H0
Kt ((@($ds2.can | Where-Object { $_.id -eq $hid })).Count -eq 0) "sau khi GO (ve NHAP) -> bien khoi cho"
$c = Code { Invoke-RestMethod -Uri "$B/cho/$hid" -Headers $H0 }
Kt ($c -eq 404) "GET /cho/:id can khong DANG_BAN -> 404 ($c)"

Write-Host "`n--- don dep ---"
Invoke-RestMethod -Uri "$B/homes/$hid/lich-khoa" -Method Put -Headers $H -ContentType 'application/json' -Body (J @{ mo=@('2027-11-05') }) | Out-Null
Invoke-RestMethod -Uri "$B/homes/$hid/cho" -Method Patch -Headers $H -ContentType 'application/json' -Body '{}' | Out-Null
$x = Invoke-RestMethod -Uri "$B/homes/$hid" -Headers $H
Kt ($x.choTrangThai -eq 'NHAP' -and $null -eq $x.salesTitle) "don sach: can ve NHAP, rong"

Write-Host ""
if ($script:loi -eq 0) { Write-Host "TAT CA DAT" } else { Write-Host "CO $($script:loi) LOI" }
exit $script:loi
