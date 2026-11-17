@echo off
rem Cài giọng đọc CapCapTTS (VieNeu, CPU) cho máy mới: tạo ..\CapCapTTS\venv (cạnh thư mục dự án) + cài gói.
rem Cần Python 3.10 (python.org, tick "Add to PATH"). Chạy một lần; sau đó bật giọng bằng scripts\start-capcap.bat.
rem Lần đầu start-capcap.bat sẽ tự tải mô hình (vài trăm MB) từ Hugging Face.
setlocal
set ROOT=%~dp0..\..
set VENV=%ROOT%\CapCapTTS\venv
if exist "%VENV%\Scripts\python.exe" (
  echo Da co %VENV%, chi cai/cap nhat goi.
) else (
  echo Tao moi truong Python tai %VENV% ...
  if not exist "%ROOT%\CapCapTTS" mkdir "%ROOT%\CapCapTTS"
  py -3.10 -m venv "%VENV%" 2>nul || python -m venv "%VENV%"
  if not exist "%VENV%\Scripts\python.exe" (
    echo LOI: khong tao duoc venv. Cai Python 3.10 tu python.org roi chay lai.
    exit /b 1
  )
)
"%VENV%\Scripts\python.exe" -m pip install --upgrade pip
"%VENV%\Scripts\python.exe" -m pip install vieneu==3.8.4 onnxruntime==1.23.2 numpy==2.2.6 soundfile==0.14.0
if errorlevel 1 ( echo LOI: cai goi that bai. & exit /b 1 )
echo.
echo Xong. Bat giong doc: scripts\start-capcap.bat (cua so rieng), roi chay scripts\start-tarot.bat
