'use strict';
// Cầu nối giữa phiên Tarot và ZeroTTS có sẵn của repo (giọng "maichi").
// Mỗi câu của lời giải được tổng hợp riêng; worker tự cache theo SHA1 của "v4::voice::cfg::temp::text" trong data/tts-cache/ (xem tts_worker.py).
const fs = require('fs');
const path = require('path');

/** Đọc thời lượng (giây) từ tiêu đề WAV PCM; trả null nếu không đọc được. */
function wavDurationSec(file) {
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const head = Buffer.alloc(4096);
      const n = fs.readSync(fd, head, 0, head.length, 0);
      if (n < 44 || head.toString('ascii', 0, 4) !== 'RIFF' || head.toString('ascii', 8, 12) !== 'WAVE') return null;
      let off = 12; let byteRate = 0;
      while (off + 8 <= n) {
        const id = head.toString('ascii', off, off + 4);
        const size = head.readUInt32LE(off + 4);
        if (id === 'fmt ') byteRate = head.readUInt32LE(off + 16);
        if (id === 'data') {
          const total = fs.fstatSync(fd).size;
          const dataSize = Math.min(size, total - (off + 8));   // một số bộ ghi để size = 0xFFFFFFFF
          return byteRate > 0 ? Math.round((dataSize / byteRate) * 100) / 100 : null;
        }
        off += 8 + size + (size % 2);
      }
      return null;
    } finally { fs.closeSync(fd); }
  } catch (_) { return null; }
}

// Bộ đọc giọng còn đang nạp model (vd. vừa khởi động server): chờ thay vì báo lỗi ngay.
const NOT_READY_RE = /loading|init|starting|khởi|nạp/i;

function createTtsProvider({ synthesize, cacheDir, log = () => {}, voice = 'maichi', retryMs = 1000, maxWaitMs = 60000, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), status = null }) {
  async function synthWhenReady(line, opts = { priority: 'live' }) {
    let waited = 0;
    for (;;) {
      const res = await synthesize(line, voice, opts);
      if (res?.ok || !NOT_READY_RE.test(String(res?.error || '')) || waited >= maxWaitMs) return res;
      await sleep(retryMs);
      waited += retryMs;
    }
  }
  return {
    /** Tạo (hoặc lấy từ cache) một câu. opts.priority: 'live' (phiên đang chạy) | 'background' (đọc sẵn). */
    speak: (text, opts = {}) => synthesize(text, voice, opts),
    /** Trạng thái bộ đọc: { engine, ready, ... }. */
    status: async () => (status ? status() : { engine: 'unknown', ready: true }),
    /** @returns {Promise<{urls:string[], durations:number[]}|null>} null nếu có câu không tổng hợp được. */
    async prepare(lines) {
      const urls = []; const durations = [];
      // Gửi cả loạt cùng lúc: worker xử lý theo thứ tự đến, nên các câu của phiên live chiếm chỗ trước
      // câu kế tiếp của bộ đọc sẵn chạy nền (bộ đó gửi từng câu một).
      const results = await Promise.all(lines.map((line) => synthWhenReady(line)));
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const res = results[i];
        if (!res || !res.ok || !res.url) {
          log(`[Tarot TTS] Không có audio cho câu: "${line.slice(0, 40)}…" (${res?.error || 'không rõ lỗi'})`);
          return null;
        }
        let dur = Number(res.durationSec);
        if (!Number.isFinite(dur) || dur <= 0) dur = res.file ? wavDurationSec(path.join(cacheDir, res.file)) : null;
        if (!dur) dur = Math.max(1, line.length / 13);
        urls.push(res.url); durations.push(dur);
        if (res.cached === false) log(`[Tarot TTS] Cảnh báo: câu chưa có cache, phải render lúc live (${res.synthSec}s).`);
      }
      return { urls, durations };
    }
  };
}

module.exports = { wavDurationSec, createTtsProvider };
