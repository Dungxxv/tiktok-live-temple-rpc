@echo off
rem Chạy server ở chế độ TAROT (nhận bình luận/quà/vào phòng TikTok cho Tarot), không nạp ZeroTTS.
rem Nhớ bật giọng đọc trước: scripts\start-capcap.bat (cửa sổ riêng).
cd /d "%~dp0.."
set APP_MODE=tarot
set DISABLE_ZEROTTS_WORKER=1
bun run server.js
