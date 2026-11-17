'use strict';
// Giọng đọc Tarot: chọn bộ đọc (ZeroTTS có sẵn hoặc OmniVoice) và cho cùng một giao diện synthesize(text, voice, opts).
//
// OmniVoice (https://github.com/k2-fsa/OmniVoice, Apache-2.0): nhân bản giọng — MỌI câu bám theo cùng một đoạn giọng mẫu
// (data/tarot/voice/ref.wav + nội dung của nó) nên chất giọng đồng đều giữa các câu. Mô hình chạy ở tiến trình riêng
// (omnivoice-demo, mặc định cổng 8001); ở đây chỉ gọi qua HTTP của Gradio (không nạp thêm mô hình, không tốn thêm VRAM).
//
// - Cache theo nội dung + cấu hình + giọng mẫu: data/tts-cache/omni_<sha1>.wav (đổi giọng mẫu/cấu hình thì tự tạo lại).
// - Hàng đợi tuần tự có ưu tiên: câu của phiên đang live ('live') luôn được làm trước bộ đọc sẵn chạy nền ('background').
// - Mọi câu được chuẩn hóa về cùng một độ to (tarot-wav.js).
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { parseWav, normalizeLoudness, encodeWav16 } = require('./tarot-wav');
const { wavDurationSec } = require('./tarot-tts');
const { createIndexWriter } = require('./tarot-tts-progress');
const { createCapCapVoice } = require('./tarot-capcap');

const normText = (t) => String(t || '').normalize('NFC').replace(/\s+/g, ' ').trim();
const sha1 = (s) => crypto.createHash('sha1').update(s).digest('hex');

/** Đọc luồng SSE của Gradio → [{ event, data }]. */
function parseSse(text) {
  const events = [];
  for (const block of String(text).split(/\r?\n\r?\n+/)) {
    let event = null; const data = [];
    for (const line of block.split(/\r?\n/)) {
      if (line.startsWith('event:')) event = line.slice(6).trim();
      else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
    }
    if (event) events.push({ event, data: data.join('\n') });
  }
  return events;
}

function createOmniVoice({
  url = 'http://localhost:8001', lang = 'Vietnamese', steps = 32, cfg = 2.0, speed = 1.0,
  refAudio, refText = '', targetDb = -18, timeoutSec = 120, cacheDir, fetchImpl = globalThis.fetch, log = () => {}
}) {
  const base = String(url).replace(/\/+$/, '');
  let refInfo = null;            // { bytes, hash }
  let uploaded = null;           // đường dẫn file giọng mẫu trên máy chủ Gradio (promise)
  let lastError = null;
  let health = { at: 0, ok: false };
  const lanes = { live: [], background: [] };
  const inflight = new Map();    // khóa cache → job
  const index = createIndexWriter(cacheDir);   // bảng tra "tên file → câu" (_omni-index.json), ghi cùng thư mục cache
  let running = false;
  let current = null;

  function loadRef() {
    if (refInfo) return refInfo;
    if (!refAudio || !fs.existsSync(refAudio)) throw new Error(`Không thấy file giọng mẫu: ${refAudio || '(chưa cấu hình)'}`);
    const bytes = fs.readFileSync(refAudio);
    refInfo = { bytes, hash: sha1(bytes.toString('latin1')).slice(0, 10) };
    return refInfo;
  }

  function cacheFile(clean) {
    const key = `omni1::${lang}::s${steps}::g${cfg}::sp${speed}::db${targetDb}::${loadRef().hash}::${clean}`;
    return `omni_${sha1(key).slice(0, 20)}.wav`;
  }

  const sig = () => AbortSignal.timeout(timeoutSec * 1000);

  function ensureRefUploaded() {
    if (uploaded) return uploaded;
    uploaded = (async () => {
      const { bytes } = loadRef();
      const fd = new FormData();
      fd.append('files', new Blob([bytes], { type: 'audio/wav' }), 'ref.wav');
      const res = await fetchImpl(`${base}/gradio_api/upload`, { method: 'POST', body: fd, signal: sig() });
      if (!res.ok) throw new Error(`Tải giọng mẫu lên OmniVoice lỗi (HTTP ${res.status})`);
      const arr = await res.json();
      if (!Array.isArray(arr) || !arr[0]) throw new Error('OmniVoice không trả đường dẫn giọng mẫu');
      return arr[0];
    })();
    uploaded.catch(() => { uploaded = null; });
    return uploaded;
  }

  async function generate(clean) {
    const refPath = await ensureRefUploaded();
    const body = {
      data: [clean, lang, { path: refPath, meta: { _type: 'gradio.FileData' } }, refText, '', steps, cfg, true, speed, null, true, true]
    };
    const call = await fetchImpl(`${base}/gradio_api/call/_clone_fn`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: sig() });
    if (!call.ok) throw new Error(`OmniVoice từ chối yêu cầu (HTTP ${call.status})`);
    const { event_id: eventId } = await call.json();
    if (!eventId) throw new Error('OmniVoice không trả event_id');
    const sse = await fetchImpl(`${base}/gradio_api/call/_clone_fn/${eventId}`, { signal: sig() });
    if (!sse.ok) throw new Error(`Đọc kết quả OmniVoice lỗi (HTTP ${sse.status})`);
    const events = parseSse(await sse.text());
    const err = events.find((e) => e.event === 'error');
    if (err) { let m = err.data; try { m = JSON.parse(err.data); } catch (_) {} throw new Error(`OmniVoice báo lỗi${m && m !== 'null' ? `: ${String(m).slice(0, 120)}` : ''}`); }
    const done = events.find((e) => e.event === 'complete');
    if (!done) throw new Error('OmniVoice không trả kết quả');
    let payload; try { payload = JSON.parse(done.data); } catch (_) { throw new Error('Kết quả OmniVoice không đọc được'); }
    const file = Array.isArray(payload) ? payload[0] : payload;
    if (!file || (!file.url && !file.path)) throw new Error('OmniVoice không trả file âm thanh');
    let fileUrl = file.url || `${base}/gradio_api/file=${file.path}`;
    const k = fileUrl.indexOf('/gradio_api/file=');
    if (k >= 0) fileUrl = base + fileUrl.slice(k);   // luôn gọi đúng địa chỉ đã cấu hình
    const wav = await fetchImpl(fileUrl, { signal: sig() });
    if (!wav.ok) throw new Error(`Tải âm thanh OmniVoice lỗi (HTTP ${wav.status})`);
    return Buffer.from(await wav.arrayBuffer());
  }

  async function run(job) {
    const t0 = Date.now();
    let raw;
    try { raw = await generate(job.clean); }
    catch (e) {
      // Có thể Gradio đã khởi động lại (mất file giọng mẫu): tải lại giọng mẫu và thử đúng một lần nữa.
      uploaded = null;
      raw = await generate(job.clean);
    }
    const { sampleRate, samples } = parseWav(raw);
    const wav = encodeWav16(normalizeLoudness(samples, sampleRate, { targetDb }), sampleRate);
    const out = path.join(cacheDir, job.file);
    const tmp = `${out}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, wav);
    fs.renameSync(tmp, out);
    index.add(job.file, job.clean);
    return { ok: true, cached: false, voice: 'omnivoice', file: job.file, url: `/tts-cache/${job.file}`, synthSec: Math.round((Date.now() - t0) / 10) / 100, durationSec: wavDurationSec(out) || samples.length / sampleRate };
  }

  async function pump() {
    if (running) return;
    running = true;
    try {
      while (lanes.live.length || lanes.background.length) {
        const job = lanes.live.shift() || lanes.background.shift();
        current = job;
        try { job.resolve(await run(job)); lastError = null; }
        catch (e) {
          lastError = e.message;
          log(`[OmniVoice] Lỗi tạo giọng: ${e.message}`);
          job.resolve({ ok: false, error: e.message });
        } finally { inflight.delete(job.file); current = null; }
      }
    } finally { running = false; }
  }

  /** Cùng giao diện với ZeroTTSManager.synthesize; opts.priority: 'live' (mặc định) | 'background'. */
  function synthesize(text, _voice, opts = {}) {
    const clean = normText(text);
    if (!clean) return Promise.resolve({ ok: false, error: 'Câu rỗng' });
    let file;
    try { file = cacheFile(clean); } catch (e) { return Promise.resolve({ ok: false, error: e.message }); }
    const out = path.join(cacheDir, file);
    try {
      if (fs.statSync(out).size > 200) {
        return Promise.resolve({ ok: true, cached: true, voice: 'omnivoice', file, url: `/tts-cache/${file}`, synthSec: 0, durationSec: wavDurationSec(out) });
      }
    } catch (_) { /* chưa có cache */ }
    const lane = opts.priority === 'background' ? 'background' : 'live';
    const existing = inflight.get(file);
    if (existing) {
      // Câu đang chờ ở hàng nền mà giờ phiên live cần → đưa lên hàng live.
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
    let refOk = true; let refErr = null;
    try { loadRef(); } catch (e) { refOk = false; refErr = e.message; }
    if (Date.now() - health.at > 3000) {
      try { const r = await fetchImpl(`${base}/`, { signal: AbortSignal.timeout(3000) }); health = { at: Date.now(), ok: r.ok }; }
      catch (_) { health = { at: Date.now(), ok: false }; }
    }
    const ready = health.ok && refOk;
    return {
      engine: 'omnivoice', ready, status: ready ? 'ready' : (!health.ok ? 'offline' : 'error'),
      url: base, lang, queued: lanes.live.length + lanes.background.length + (current ? 1 : 0),
      error: refErr || (health.ok ? lastError : `Không kết nối được OmniVoice tại ${base} (đã bật omnivoice-demo chưa?)`)
    };
  }

  return { synthesize, status, cacheFile: (t) => cacheFile(normText(t)), flushIndex: index.flush };
}

/** Tùy chọn OmniVoice từ config.tts.omnivoice (đường dẫn giọng mẫu tính từ data/tarot/). */
function omniOptions(config, dataDir) {
  const o = (config.tts && config.tts.omnivoice) || {};
  const ref = o.refAudio ? (path.isAbsolute(o.refAudio) ? o.refAudio : path.join(dataDir, o.refAudio)) : path.join(dataDir, 'voice', 'ref.wav');
  return { ...o, refAudio: ref };
}

/** Hàm "câu → tên file cache" của OmniVoice (không cần OmniVoice đang chạy); null nếu engine không phải omnivoice. */
function omniCacheNamer(config, dataDir, cacheDir) {
  if (!config.tts || config.tts.engine !== 'omnivoice') return null;
  return createOmniVoice({ ...omniOptions(config, dataDir), cacheDir, fetchImpl: async () => { throw new Error('offline'); } }).cacheFile;
}

/**
 * Chọn bộ đọc theo config.tts.engine ('zerotts' | 'omnivoice' | 'capcap').
 * @returns {{ engine, synthesize(text, voice, opts), status(): Promise<object> }}
 */
function createTarotSynth({ config, zeroTts, cacheDir, dataDir, log = () => {}, fetchImpl }) {
  const tts = config.tts || {};
  if (tts.engine === 'capcap') {
    const capcap = createCapCapVoice({ ...(tts.capcap || {}), cacheDir, log, fetchImpl });
    log(`[Tarot] Giọng đọc: CapCapTTS (${(tts.capcap && tts.capcap.url) || 'http://localhost:8002'}), giọng ${(tts.capcap && tts.capcap.voice) || 'Ngọc Linh'}`);
    return { engine: 'capcap', synthesize: capcap.synthesize, status: capcap.status };
  }
  if (tts.engine === 'omnivoice') {
    const opts = omniOptions(config, dataDir);
    const omni = createOmniVoice({ ...opts, cacheDir, log, fetchImpl });
    log(`[Tarot] Giọng đọc: OmniVoice (${opts.url || 'http://localhost:8001'}), giọng mẫu ${path.relative(dataDir, opts.refAudio)}`);
    return { engine: 'omnivoice', synthesize: omni.synthesize, status: omni.status };
  }
  log('[Tarot] Giọng đọc: ZeroTTS');
  return {
    engine: 'zerotts',
    synthesize: (text, voice) => zeroTts.synthesize(text, voice),
    status: async () => ({ engine: 'zerotts', ...zeroTts.getStatus() })
  };
}

module.exports = { createOmniVoice, createTarotSynth, omniCacheNamer, omniOptions, parseSse };
