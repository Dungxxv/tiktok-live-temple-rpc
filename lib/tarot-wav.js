'use strict';
// Xử lý WAV thuần (không phụ thuộc thư viện ngoài): đọc, chuẩn hóa độ to, ghi lại PCM 16-bit.
// Dùng cho giọng đọc Tarot: mọi câu về cùng một mức to + vào/ra mềm, để các câu nghe đồng đều.

/** Đọc WAV PCM 16-bit hoặc float 32-bit → { sampleRate, samples: Float32Array (mono, -1..1) }. */
function parseWav(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 44 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Không phải file WAV');
  }
  let off = 12; let fmt = null; let data = null;
  while (off + 8 <= buf.length) {
    const id = buf.toString('ascii', off, off + 4);
    let size = buf.readUInt32LE(off + 4);
    if (id === 'fmt ') {
      fmt = { tag: buf.readUInt16LE(off + 8), channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bits: buf.readUInt16LE(off + 22) };
    } else if (id === 'data') {
      if (off + 8 + size > buf.length) size = buf.length - (off + 8);   // một số bộ ghi để size sai
      data = buf.subarray(off + 8, off + 8 + size);
      break;
    }
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error('WAV thiếu khối fmt/data');
  const { tag, channels, bits, sampleRate } = fmt;
  const isPcm16 = (tag === 1 || tag === 0xFFFE) && bits === 16;
  const isFloat32 = tag === 3 && bits === 32;
  if (!isPcm16 && !isFloat32) throw new Error(`Định dạng WAV chưa hỗ trợ (tag ${tag}, ${bits} bit)`);
  const bytes = bits / 8;
  const frames = Math.floor(data.length / (bytes * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i++) {
    let sum = 0;
    for (let c = 0; c < channels; c++) {
      const p = (i * channels + c) * bytes;
      sum += isPcm16 ? data.readInt16LE(p) / 32768 : data.readFloatLE(p);
    }
    samples[i] = sum / channels;
  }
  return { sampleRate, samples };
}

/** Ghi WAV mono PCM 16-bit. */
function encodeWav16(samples, sampleRate) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0, 'ascii'); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8, 'ascii');
  buf.write('fmt ', 12, 'ascii'); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22);
  buf.writeUInt32LE(sampleRate, 24); buf.writeUInt32LE(sampleRate * 2, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36, 'ascii'); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const v = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(v < 0 ? v * 32768 : v * 32767), 44 + i * 2);
  }
  return buf;
}

/** Độ to (dBFS) của phần có tiếng: RMS các khung 20 ms có năng lượng ≥ -20 dB so với khung to nhất. */
function voicedRmsDb(samples, sampleRate) {
  const hop = Math.max(1, Math.round(sampleRate * 0.02));
  const frames = [];
  for (let i = 0; i + hop <= samples.length; i += hop) {
    let s = 0;
    for (let k = i; k < i + hop; k++) s += samples[k] * samples[k];
    frames.push(s / hop);
  }
  if (!frames.length) return -Infinity;
  const peakMs = Math.max(...frames);
  if (peakMs <= 1e-10) return -Infinity;
  const voiced = frames.filter((m) => m >= peakMs * 0.01);   // -20 dB theo công suất
  const mean = voiced.reduce((a, b) => a + b, 0) / voiced.length;
  return 10 * Math.log10(mean);
}

/**
 * Chuẩn hóa: đưa độ to phần có tiếng về targetDb (dBFS), giới hạn mềm để không méo (đỉnh ≤ ~0.89),
 * vào/ra mềm fadeMs. Âm thanh gần như im lặng thì chỉ làm mềm, không khuếch đại.
 */
function normalizeLoudness(samples, sampleRate, { targetDb = -18, fadeMs = 8, maxGain = 10, minGain = 0.2 } = {}) {
  const out = new Float32Array(samples.length);
  const cur = voicedRmsDb(samples, sampleRate);
  let gain = Number.isFinite(cur) ? Math.pow(10, (targetDb - cur) / 20) : 1;
  gain = Math.max(minGain, Math.min(maxGain, gain));
  const knee = 0.8; const room = 0.09;   // trên 0.8 nén dần, tối đa 0.89
  for (let i = 0; i < samples.length; i++) {
    let v = samples[i] * gain;
    const a = Math.abs(v);
    if (a > knee) v = Math.sign(v) * (knee + room * Math.tanh((a - knee) / room));
    out[i] = v;
  }
  const fade = Math.min(Math.round(sampleRate * fadeMs / 1000), Math.floor(out.length / 2));
  for (let i = 0; i < fade; i++) {
    const g = i / fade;
    out[i] *= g; out[out.length - 1 - i] *= g;
  }
  return out;
}

/**
 * Cắt khoảng lặng đầu/cuối câu (giữ lại padSec mỗi đầu) để chữ chạy khớp lúc nói thật: mô hình hay chừa lặng,
 * làm chữ chạy lệch so với tiếng. Không cắt phần lặng ở giữa câu.
 */
function trimSilence(samples, sampleRate, { thresholdDb = -42, padSec = 0.08, windowMs = 10 } = {}) {
  const win = Math.max(1, Math.round(sampleRate * windowMs / 1000));
  const thr = Math.pow(10, thresholdDb / 20);
  const loud = (i) => { let e = 0; const end = Math.min(samples.length, i + win); for (let j = i; j < end; j++) e += samples[j] * samples[j]; return Math.sqrt(e / Math.max(1, end - i)) > thr; };
  let a = 0; while (a < samples.length && !loud(a)) a += win;
  if (a >= samples.length) return samples;   // toàn lặng: giữ nguyên
  let b = samples.length - win; while (b > a && !loud(b)) b -= win;
  const pad = Math.round(padSec * sampleRate);
  return samples.slice(Math.max(0, a - pad), Math.min(samples.length, b + win + pad));
}

module.exports = { parseWav, encodeWav16, voicedRmsDb, normalizeLoudness, trimSilence };
