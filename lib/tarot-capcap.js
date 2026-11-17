'use strict';
// Giọng đọc Tarot bằng CapCapTTS (VieNeu-TTS ONNX, chạy CPU, https://github.com/notepower2k1/CapCapTTS).
// Mô hình chạy ở tiến trình riêng (scripts/capcap-tts-server.py, mặc định cổng 8002); ở đây chỉ gọi HTTP.
// Một giọng cố định cho mọi câu; cache theo nội dung + giọng: data/tts-cache/capcap_<sha1>.wav; chuẩn hóa độ to như OmniVoice.
// Hàng đợi tuần tự có ưu tiên: 'live' (câu của người đang được mời) luôn trước 'background'.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseWav, normalizeLoudness, encodeWav16, trimSilence } = require('./tarot-wav');
const { wavDurationSec } = require('./tarot-tts');

const normText = (t) => String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

function createCapCapVoice({ url = 'http://localhost:8002', voice = 'Ngọc Linh', targetDb = -18, timeoutSec = 60, cacheDir, fetchImpl = globalThis.fetch, log = () => {} }) {
  const base = String(url).replace(/\/+$/, '');
  const lanes = { live: [], background: [] };
  const inflight = new Map();
  let running = false; let current = null; let lastError = null;
  let health = { at: 0, ok: false, voices: [] };

  const cacheFile = (clean) => `capcap_${sha1(`capcap2::${voice}::db${targetDb}::${clean}`).slice(0, 20)}.wav`;

  async function generate(clean) {
    const res = await fetchImpl(`${base}/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: clean, voice }), signal: AbortSignal.timeout(timeoutSec * 1000) });
    if (!res.ok) {
      let m = `HTTP ${res.status}`; try { m = (await res.json()).error || m; } catch (_) {}
      throw new Error(`CapCapTTS báo lỗi: ${m}`);
    }
    return Buffer.from(await res.arrayBuffer());
  }

  async function run(job) {
    const t0 = Date.now();
    const { sampleRate, samples } = parseWav(await generate(job.clean));
    const wav = encodeWav16(normalizeLoudness(trimSilence(samples, sampleRate), sampleRate, { targetDb }), sampleRate);
    const out = path.join(cacheDir, job.file);
    const tmp = `${out}.${process.pid}.tmp`;
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(tmp, wav);
    fs.renameSync(tmp, out);
    return { ok: true, cached: false, voice: 'capcap', file: job.file, url: `/tts-cache/${job.file}`, synthSec: Math.round((Date.now() - t0) / 10) / 100, durationSec: wavDurationSec(out) || samples.length / sampleRate };
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (lanes.live.length || lanes.background.length) {
        const job = lanes.live.shift() || lanes.background.shift();
        current = job;
        try { job.resolve(await run(job)); lastError = null; }
        catch (e) { lastError = e.message; log(`[CapCapTTS] Lỗi tạo giọng: ${e.message}`); job.resolve({ ok: false, error: e.message }); }
        finally { inflight.delete(job.file); current = null; }
      }
    } finally { running = false; }
  }

  function synthesize(text, _voice, opts = {}) {
    const clean = normText(text);
    if (!clean) return Promise.resolve({ ok: false, error: 'Câu rỗng' });
    const file = cacheFile(clean);
    const out = path.join(cacheDir, file);
    try {
      if (fs.statSync(out).size > 200) return Promise.resolve({ ok: true, cached: true, voice: 'capcap', file, url: `/tts-cache/${file}`, synthSec: 0, durationSec: wavDurationSec(out) });
    } catch (_) { /* chưa có cache */ }
    const lane = opts.priority === 'background' ? 'background' : 'live';
    const existing = inflight.get(file);
    if (existing) {
      if (lane === 'live' && existing.lane === 'background') {
        const i = lanes.background.indexOf(existing);
        if (i >= 0) { lanes.background.splice(i, 1); existing.lane = 'live'; lanes.live.push(existing); }
      }
      return existing.promise;
    }
    const job = { clean, file, lane };
    job.promise = new Promise((resolve) => { job.resolve = resolve; });
    inflight.set(file, job);
    lanes[lane].push(job);
    pump();
    return job.promise;
  }

  async function status() {
    if (Date.now() - health.at > 3000) {
      try { const r = await fetchImpl(`${base}/`, { signal: AbortSignal.timeout(3000) }); health = { at: Date.now(), ok: r.ok, voices: r.ok ? ((await r.json()).voices || []) : [] }; }
      catch (_) { health = { at: Date.now(), ok: false, voices: [] }; }
    }
    const voiceOk = !health.ok || health.voices.includes(voice);
    const ready = health.ok && voiceOk;
    return {
      engine: 'capcap', ready, status: ready ? 'ready' : (!health.ok ? 'offline' : 'error'), url: base, voice,
      queued: lanes.live.length + lanes.background.length + (current ? 1 : 0),
      error: !health.ok ? `Không kết nối được CapCapTTS tại ${base} (đã chạy scripts/start-capcap.bat chưa?)` : (!voiceOk ? `CapCapTTS không có giọng "${voice}"` : lastError)
    };
  }

  return { synthesize, status, cacheFile: (t) => cacheFile(normText(t)) };
}

module.exports = { createCapCapVoice };
