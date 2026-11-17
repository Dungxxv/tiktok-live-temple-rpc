@echo off
rem MỘT CÚ BẤM: bật giọng đọc (CapCapTTS) + server Tarot + mở màn live và trang admin.
rem Muốn tắt: đóng 2 cửa sổ đen "Giong doc CapCapTTS" và "Server Tarot".
setlocal
set ROOT=%~dp0..
start "Giong doc CapCapTTS" cmd /k "%~dp0start-capcap.bat"
start "Server Tarot" cmd /k "%~dp0start-tarot.bat"
rem Chờ server lên rồi mở trình duyệt (giọng đọc nạp thêm ~10 giây, nhưng câu nào chưa kịp sẽ tự chờ).
timeout /t 10 /nobreak >nul
start "" "http://localhost:3000/tarot"
start "" "http://localhost:3000/tarot/admin"
