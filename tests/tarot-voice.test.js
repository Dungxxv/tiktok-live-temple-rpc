import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { parseWav, encodeWav16, voicedRmsDb, normalizeLoudness } = require('../lib/tarot-wav.js');
const { createOmniVoice, createTarotSynth, parseSse } = require('../lib/tarot-voice.js');
const { createTtsProvider } = require('../lib/tarot-tts.js');
const { DEFAULT_CONFIG, mergeConfig, validateConfig } = require('../lib/tarot-config.js');

const SR = 24000;
const tone = (sec, amp, sr = SR) => Float32Array.from({ length: Math.round(sec * sr) }, (_, i) => amp * Math.sin((2 * Math.PI * 220 * i) / sr));
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-voice-'));

describe('tarot-wav: đọc/ghi và chuẩn hóa độ to', () => {
  it('ghi rồi đọc lại PCM16 cho cùng nội dung (sai số lượng tử hóa)', () => {
    const x = tone(0.2, 0.5);
    const { sampleRate, samples } = parseWav(encodeWav16(x, SR));
    expect(sampleRate).toBe(SR);
    expect(samples.length).toBe(x.length);
    expect(Math.abs(samples[1234] - x[1234])).toBeLessThan(1e-3);
  });

  it('đọc được WAV float32 và stereo (trộn thành mono)', () => {
    const n = 100; const buf = Buffer.alloc(44 + n * 2 * 4);
    buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 8, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
    buf.writeUInt16LE(3, 20); buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 8, 28); buf.writeUInt16LE(8, 32); buf.writeUInt16LE(32, 34);
    buf.write('data', 36); buf.writeUInt32LE(n * 8, 40);
    for (let i = 0; i < n; i++) { buf.writeFloatLE(0.5, 44 + i * 8); buf.writeFloatLE(-0.1, 48 + i * 8); }
    const { samples } = parseWav(buf);
    expect(samples.length).toBe(n);
    expect(samples[0]).toBeCloseTo(0.2, 5);
  });

  it('từ chối file không phải WAV hoặc định dạng chưa hỗ trợ', () => {
    expect(() => parseWav(Buffer.from('không phải wav'.repeat(10)))).toThrow();
    const b = encodeWav16(tone(0.1, 0.3), SR); b.writeUInt16LE(24, 34);   // 24 bit
    expect(() => parseWav(b)).toThrow();
  });

  it('đưa câu nhỏ và câu to về cùng một mức (±0,5 dB quanh -18 dBFS)', () => {
    for (const amp of [0.02, 0.1, 0.4]) {
      const out = normalizeLoudness(tone(1.5, amp), SR, { targetDb: -18 });
      expect(Math.abs(voicedRmsDb(out, SR) - -18)).toBeLessThan(0.5);
    }
  });

  it('không méo: đỉnh luôn dưới 0.9, kể cả khi phải khuếch đại mạnh', () => {
    const peaky = tone(1, 0.05); peaky[500] = 0.9;
    const out = normalizeLoudness(peaky, SR, { targetDb: -12 });
    expect(Math.max(...out.map(Math.abs))).toBeLessThan(0.9);
  });

  it('vào/ra mềm: mẫu đầu và cuối về 0 (không bị "bụp")', () => {
    const out = normalizeLoudness(tone(0.5, 0.3), SR);
    expect(Math.abs(out[0])).toBeLessThan(1e-4);
    expect(Math.abs(out[out.length - 1])).toBeLessThan(0.01);
  });

  it('im lặng hoàn toàn: không sinh NaN/vô cực', () => {
    const out = normalizeLoudness(new Float32Array(SR), SR);
    expect(out.every(Number.isFinite)).toBe(true);
    expect(out.every((v) => v === 0)).toBe(true);
  });
});

// Máy chủ OmniVoice giả theo giao thức Gradio: upload → /call/_clone_fn → SSE → file.
function fakeGradio({ amp = 0.1, failTimes = 0, dropRefOnce = false } = {}) {
  const calls = []; let uploads = 0; let events = 0; let fails = failTimes; let refValid = true;
  const files = new Map();
  const fetchImpl = async (url, init = {}) => {
    const u = String(url);
    if (u.endsWith('/gradio_api/upload')) { uploads++; refValid = true; return new Response(JSON.stringify([`C:\\tmp\\ref${uploads}.wav`]), { status: 200 }); }
    if (u.endsWith('/gradio_api/call/_clone_fn')) {
      const body = JSON.parse(init.body);
      if (dropRefOnce && uploads === 1 && !globalThis.__dropped) { globalThis.__dropped = true; refValid = false; }
      calls.push({ text: body.data[0], lang: body.data[1], refPath: body.data[2].path, refText: body.data[3], steps: body.data[5], cfg: body.data[6] });
      const id = `ev${++events}`; files.set(id, body.data[0]);
      return new Response(JSON.stringify({ event_id: id }), { status: 200 });
    }
    if (u.includes('/gradio_api/call/_clone_fn/')) {
      if (!refValid) return new Response('event: error\ndata: null\n\n', { status: 200 });
      if (fails > 0) { fails--; return new Response('event: error\ndata: "boom"\n\n', { status: 200 }); }
      const id = u.split('/').pop();
      return new Response(`event: complete\ndata: [{"path":"C:\\\\tmp\\\\${id}.wav","url":"http://localhost:7777/gradio_api/file=C:\\\\tmp\\\\${id}.wav","meta":{"_type":"gradio.FileData"}},"Done."]\n\n`, { status: 200 });
    }
    if (u.includes('/gradio_api/file=')) return new Response(encodeWav16(tone(1.2 + (files.size % 3) * 0.1, amp), SR), { status: 200 });
    if (u.endsWith('/')) return new Response('ok', { status: 200 });
    return new Response('?', { status: 404 });
  };
  return { fetchImpl, calls, uploads: () => uploads };
}

function make(over = {}, gradioOpts = {}) {
  const dir = tmp();
  const ref = path.join(dir, 'ref.wav'); fs.writeFileSync(ref, encodeWav16(tone(1, 0.2), 48000));
  const g = fakeGradio(gradioOpts);
  const omni = createOmniVoice({ url: 'http://localhost:8001', refAudio: ref, refText: 'Câu mẫu.', cacheDir: dir, fetchImpl: g.fetchImpl, ...over });
  return { omni, g, dir, ref };
}

describe('tarot-voice: OmniVoice qua HTTP Gradio', () => {
  it('tạo giọng: gọi đúng tham số, lưu cache PCM16 24 kHz đã chuẩn hóa, trả url + thời lượng', async () => {
    const { omni, g, dir } = make({ steps: 16, cfg: 2.5 });
    const r = await omni.synthesize('Chào bạn, mời bạn ngồi nhé.');
    expect(r).toMatchObject({ ok: true, cached: false, voice: 'omnivoice' });
    expect(r.url).toBe(`/tts-cache/${r.file}`);
    expect(r.durationSec).toBeGreaterThan(1);
    expect(g.calls[0]).toMatchObject({ text: 'Chào bạn, mời bạn ngồi nhé.', lang: 'Vietnamese', refText: 'Câu mẫu.', steps: 16, cfg: 2.5 });
    const { samples, sampleRate } = parseWav(fs.readFileSync(path.join(dir, r.file)));
    expect(sampleRate).toBe(SR);
    expect(Math.abs(voicedRmsDb(samples, SR) - -18)).toBeLessThan(0.7);
  });

  it('câu đã có cache: trả ngay, không gọi OmniVoice nữa', async () => {
    const { omni, g } = make();
    await omni.synthesize('Câu này.');
    const again = await omni.synthesize('  Câu   này.  ');   // khoảng trắng thừa không đổi khóa cache
    expect(again.cached).toBe(true);
    expect(g.calls.length).toBe(1);
  });

  it('giọng mẫu chỉ tải lên một lần cho nhiều câu', async () => {
    const { omni, g } = make();
    await Promise.all(['Một.', 'Hai.', 'Ba.'].map((t) => omni.synthesize(t)));
    expect(g.uploads()).toBe(1);
    expect(new Set(g.calls.map((c) => c.refPath)).size).toBe(1);   // mọi câu bám cùng một giọng mẫu
  });

  it('đổi giọng mẫu hoặc cấu hình thì khóa cache đổi (tạo lại, không dùng nhầm giọng cũ)', () => {
    const a = make(); const b = make({ steps: 16 });
    fs.writeFileSync(b.ref, encodeWav16(tone(1, 0.3), 48000));
    expect(a.omni.cacheFile('Câu.')).not.toBe(b.omni.cacheFile('Câu.'));
  });

  it('hàng đợi tuần tự có ưu tiên: câu của phiên live chen lên trước bộ đọc sẵn chạy nền', async () => {
    const { omni, g } = make();
    const p = [
      omni.synthesize('nền 1', 'v', { priority: 'background' }),
      omni.synthesize('nền 2', 'v', { priority: 'background' }),
      omni.synthesize('nền 3', 'v', { priority: 'background' }),
      omni.synthesize('LIVE', 'v', { priority: 'live' })
    ];
    await Promise.all(p);
    expect(g.calls.map((c) => c.text)).toEqual(['nền 1', 'LIVE', 'nền 2', 'nền 3']);
  });

  it('câu đang chờ ở hàng nền mà phiên live cần: được đẩy lên hàng live, chỉ tạo một lần', async () => {
    const { omni, g } = make();
    const p = [
      omni.synthesize('đang chạy', 'v', { priority: 'background' }),
      omni.synthesize('nền A', 'v', { priority: 'background' }),
      omni.synthesize('nền B', 'v', { priority: 'background' }),
      omni.synthesize('nền B', 'v', { priority: 'live' })
    ];
    const res = await Promise.all(p);
    expect(g.calls.map((c) => c.text)).toEqual(['đang chạy', 'nền B', 'nền A']);
    expect(res[2].file).toBe(res[3].file);
  });

  it('lỗi từ OmniVoice: tự thử lại một lần (tải lại giọng mẫu); lỗi liên tục thì báo ok:false kèm lý do', async () => {
    const one = make({}, { failTimes: 1 });
    expect((await one.omni.synthesize('Thử lại.')).ok).toBe(true);
    const bad = make({}, { failTimes: 5 });
    const r = await bad.omni.synthesize('Hỏng.');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('OmniVoice báo lỗi');
  });

  it('OmniVoice không chạy: ok:false (không treo, không ném lỗi); status báo offline', async () => {
    const dir = tmp(); const ref = path.join(dir, 'r.wav'); fs.writeFileSync(ref, encodeWav16(tone(1, 0.2), 48000));
    const down = createOmniVoice({ refAudio: ref, refText: 'x', cacheDir: dir, fetchImpl: async () => { throw new Error('ECONNREFUSED'); } });
    expect((await down.synthesize('Câu.')).ok).toBe(false);
    expect(await down.status()).toMatchObject({ engine: 'omnivoice', ready: false, status: 'offline' });
  });

  it('thiếu file giọng mẫu: báo lỗi rõ ràng', async () => {
    const dir = tmp();
    const o = createOmniVoice({ refAudio: path.join(dir, 'khong-co.wav'), refText: 'x', cacheDir: dir, fetchImpl: fakeGradio().fetchImpl });
    const r = await o.synthesize('Câu.');
    expect(r.ok).toBe(false);
    expect(r.error).toContain('giọng mẫu');
    expect((await o.status()).ready).toBe(false);
  });

  it('status khi sẵn sàng', async () => {
    const { omni } = make();
    expect(await omni.status()).toMatchObject({ engine: 'omnivoice', ready: true, status: 'ready', lang: 'Vietnamese' });
  });

  it('parseSse đọc được sự kiện complete/error', () => {
    expect(parseSse('event: complete\ndata: [1]\n\nevent: error\ndata: null\n\n')).toEqual([{ event: 'complete', data: '[1]' }, { event: 'error', data: 'null' }]);
  });
});

describe('tarot-voice: chọn bộ đọc và provider', () => {
  const cfg = (engine, extra = {}) => validateConfig(mergeConfig(DEFAULT_CONFIG, { tts: { engine, omnivoice: { refText: 'Câu mẫu.', ...extra } } }));

  it('config: engine hợp lệ; omnivoice bắt buộc có refText (nội dung giọng mẫu)', () => {
    expect(() => cfg('zerotts')).not.toThrow();
    expect(() => cfg('omnivoice')).not.toThrow();
    expect(() => cfg('abc')).toThrow();
    expect(() => validateConfig(mergeConfig(DEFAULT_CONFIG, { tts: { engine: 'omnivoice' } }))).toThrow(/refText/);
  });

  it('engine zerotts: dùng ZeroTTSManager; omnivoice: dùng OmniVoice', async () => {
    const zero = { synthesize: async (t) => ({ ok: true, url: `/z/${t}.wav` }), getStatus: () => ({ ready: true, status: 'ready' }) };
    const z = createTarotSynth({ config: cfg('zerotts'), zeroTts: zero, cacheDir: tmp(), dataDir: tmp() });
    expect(z.engine).toBe('zerotts');
    expect((await z.synthesize('a', 'maichi')).url).toBe('/z/a.wav');
    const dir = tmp(); fs.mkdirSync(path.join(dir, 'voice')); fs.writeFileSync(path.join(dir, 'voice', 'ref.wav'), encodeWav16(tone(1, 0.2), 48000));
    const o = createTarotSynth({ config: cfg('omnivoice'), zeroTts: zero, cacheDir: tmp(), dataDir: dir, fetchImpl: fakeGradio().fetchImpl });
    expect(o.engine).toBe('omnivoice');
    expect((await o.synthesize('Xin chào.')).voice).toBe('omnivoice');
  });

  it('provider.prepare gọi bộ đọc với ưu tiên live; provider.speak cho phép ưu tiên nền; status đi qua', async () => {
    const seen = [];
    const p = createTtsProvider({
      synthesize: async (t, _v, opts) => { seen.push([t, opts?.priority]); return { ok: true, url: `/x/${t}.wav`, durationSec: 2, cached: true }; },
      cacheDir: os.tmpdir(), status: async () => ({ engine: 'omnivoice', ready: true })
    });
    await p.prepare(['một', 'hai']);
    await p.speak('ba', { priority: 'background' });
    expect(seen).toEqual([['một', 'live'], ['hai', 'live'], ['ba', 'background']]);
    expect(await p.status()).toEqual({ engine: 'omnivoice', ready: true });
  });
});
