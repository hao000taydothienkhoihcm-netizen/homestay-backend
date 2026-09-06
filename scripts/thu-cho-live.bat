@echo off
setlocal
set U=https://sabi-marketplace.onrender.com
echo === Duong dan CHO phai chay duoc ===
call :G /health
call :G /v1/cho
call :G /v1/cho/phuong
echo.
echo === Duong dan APP NOI BO phai KHONG ton tai (404) ===
call :G /v1/bookings
call :G /v1/expenses
call :G /v1/inventory
call :G /v1/homes
call :G /v1/hosts
echo.
echo === Moi lenh GHI phai bi chan (405) ===
call :M POST /v1/cho
call :M PATCH /v1/cho/1
call :M DELETE /v1/cho/1
call :M POST /v1/bookings
echo.
echo === Dang nhap van phai chay (401 voi tai khoan sai) ===
curl -s -o nul -w "  POST /v1/auth/login -> %%{http_code}\n" -m 45 -X POST %U%/v1/auth/login -H "Content-Type: application/json" -d "{\"username\":\"khong-co-that\",\"password\":\"x\"}"
goto :eof

:G
curl -s -o nul -w "  GET %1 -> %%{http_code}\n" -m 45 %U%%1
goto :eof

:M
curl -s -o nul -w "  %1 %2 -> %%{http_code}\n" -m 45 -X %1 %U%%2 -H "Content-Type: application/json" -d "{}"
goto :eof
