# Máy chủ giọng đọc nhỏ cho Tarot: nạp VieNeu-TTS (bản ONNX của CapCapTTS, chạy CPU) và trả WAV qua HTTP.
#   GET  /          → {"ok": true, "voices": [...]}   (kiểm tra sống)
#   POST /tts       → body JSON {"text": "...", "voice": "Ngọc Linh"} → file WAV 16-bit 48kHz
# Chạy: scripts/start-capcap.bat  (hoặc: python -X utf8 scripts/capcap-tts-server.py --port 8002)
# Chỉ lắng nghe 127.0.0.1. Xử lý tuần tự từng câu (một mô hình, CPU) — hàng đợi ưu tiên nằm ở phía Node.
import argparse, io, json, threading, wave
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import numpy as np

ap = argparse.ArgumentParser()
ap.add_argument('--port', type=int, default=8002)
ap.add_argument('--threads', type=int, default=0, help='số luồng CPU cho ONNX (0 = mặc định)')
args = ap.parse_args()

from vieneu import Vieneu
print('Đang nạp VieNeu-TTS (ONNX, CPU)...', flush=True)
model = Vieneu(backend='onnx')
voices = [v[1] for v in model.list_preset_voices()]
lock = threading.Lock()
print(f'Đã nạp xong, {len(voices)} giọng. Lắng nghe 127.0.0.1:{args.port}', flush=True)

def to_wav(a):
    a = np.asarray(a).squeeze()
    pcm = (np.clip(a, -1, 1) * 32767).astype(np.int16)
    buf = io.BytesIO()
    with wave.open(buf, 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(48000); w.writeframes(pcm.tobytes())
    return buf.getvalue()

class H(BaseHTTPRequestHandler):
    def log_message(self, *a): pass
    def _send(self, code, body, ctype):
        self.send_response(code); self.send_header('Content-Type', ctype); self.send_header('Content-Length', str(len(body))); self.end_headers(); self.wfile.write(body)
    def do_GET(self):
        self._send(200, json.dumps({'ok': True, 'voices': voices}, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')
    def do_POST(self):
        try:
            n = int(self.headers.get('Content-Length', 0))
            req = json.loads(self.rfile.read(n).decode('utf-8'))
            text = str(req.get('text', '')).strip()
            voice = req.get('voice') or voices[0]
            if not text: raise ValueError('Câu rỗng')
            if voice not in voices: raise ValueError(f'Không có giọng "{voice}"')
            with lock:
                audio = model.infer(text, voice=voice)
            self._send(200, to_wav(audio), 'audio/wav')
        except Exception as e:
            self._send(400, json.dumps({'error': str(e)}, ensure_ascii=False).encode('utf-8'), 'application/json; charset=utf-8')

ThreadingHTTPServer(('127.0.0.1', args.port), H).serve_forever()
