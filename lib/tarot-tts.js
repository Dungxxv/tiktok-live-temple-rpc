'use strict';
// Cầu nối giữa phiên Tarot và ZeroTTS có sẵn của repo (giọng "maichi").
// Mỗi câu của lời giải được tổng hợp riêng; worker tự cache theo SHA1 của "v3::voice::text" trong data/tts-cache/.
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

function createTtsProvider({ synthesize, cacheDir, log = () => {}, voice = 'maichi' }) {
  return {
    /** @returns {Promise<{urls:string[], durations:number[]}|null>} null nếu có câu không tổng hợp được. */
    async prepare(lines) {
      const urls = []; const durations = [];
      for (const line of lines) {
        const res = await synthesize(line, voice);
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
