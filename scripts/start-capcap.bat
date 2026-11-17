@echo off
rem Bật giọng đọc CapCapTTS (VieNeu, CPU) cho Tarot ở cổng 8002.
rem Python mặc định: ..\CapCapTTS\venv (đổi bằng biến môi trường CAPCAP_PYTHON).
setlocal
if "%CAPCAP_PYTHON%"=="" set CAPCAP_PYTHON=%~dp0..\..\CapCapTTS\venv\Scripts\python.exe
"%CAPCAP_PYTHON%" -X utf8 "%~dp0capcap-tts-server.py" --port 8002
