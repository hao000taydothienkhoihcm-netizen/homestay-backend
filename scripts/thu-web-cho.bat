@echo off
setlocal
set U=http://localhost:3202
echo === Web chợ phục vụ đúng chưa ===
call :G /
call :G /bat-ky-duong-dan-nao
call :G /health
echo.
echo === API van la API, khong bi nuot thanh HTML ===
call :G /v1/khong-co
call :G /v1/cho
goto :eof

:G
for /f "tokens=1,2" %%a in ('curl -s -o nul -w "%%{http_code} %%{content_type}" -m 20 %U%%1') do (
  echo   %1 -^> %%a  %%b
)
goto :eof
