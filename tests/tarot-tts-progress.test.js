import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadSentences, scan, createIndexWriter, writeProgress, INDEX_FILE, PROGRESS_FILE } = require('../lib/tarot-tts-progress.js');
const { createOmniVoice, omniCacheNamer } = require('../lib/tarot-voice.js');
const { encodeWav16 } = require('../lib/tarot-wav.js');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tarot-prog-'));
const namer = (t) => `omni_${Buffer.from(t).toString('hex').slice(0, 12)}.wav`;
const touch = (dir, f) => fs.writeFileSync(path.join(dir, f), Buffer.alloc(500));

describe('tarot-tts-progress: biết đã đọc đến câu nào', () => {
  const sentences = [{ text: 'Một.', kind: 'fixed' }, { text: 'Hai.', kind: 'reading' }, { text: 'Ba.', kind: 'reading' }, { text: 'Bốn.', kind: 'reading' }];

  it('scan: đếm câu đã có file, tìm câu đầu tiên còn thiếu, thống kê theo loại', () => {
    const dir = tmp();
    touch(dir, namer('Một.')); touch(dir, namer('Hai.')); touch(dir, namer('Bốn.'));
    const sc = scan(sentences, namer, dir);
    expect(sc).toMatchObject({ total: 4, doneCount: 3, doneIdx: [0, 1, 3], missingIdx: [2], firstMissing: 2 });
    expect(sc.byKind).toEqual({ fixed: { done: 1, total: 1 }, reading: { done: 2, total: 3 } });
  });

  it('file rỗng/hỏng (dưới 200 byte) không tính là đã xong → sẽ được tạo lại', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, namer('Một.')), Buffer.alloc(10));
    expect(scan(sentences, namer, dir).doneCount).toBe(0);
  });

  it('đủ cả: firstMissing = null', () => {
    const dir = tmp(); sentences.forEach((s) => touch(dir, namer(s.text)));
    const sc = scan(sentences, namer, dir);
    expect(sc.firstMissing).toBeNull();
    expect(writeProgress(dir, sentences, sc)).toMatchObject({ done: 4, remaining: 0, percent: 100, nextPosition: null, nextSentence: null });
  });

  it('writeProgress ghi _omni-progress.json cùng thư mục cache: câu kế tiếp tính từ 1', () => {
    const dir = tmp(); touch(dir, namer('Một.'));
    const p = writeProgress(dir, sentences, scan(sentences, namer, dir), { engine: 'omnivoice', state: 'đang chạy' });
    expect(p).toMatchObject({ total: 4, done: 1, remaining: 3, percent: 25, nextPosition: 2, nextSentence: 'Hai.', state: 'đang chạy' });
    expect(JSON.parse(fs.readFileSync(path.join(dir, PROGRESS_FILE), 'utf8')).nextSentence).toBe('Hai.');
  });

  it('bảng tra tên file → câu: ghi cùng thư mục, gộp với dữ liệu cũ, không ghi lại khi không đổi', () => {
    const dir = tmp();
    const w1 = createIndexWriter(dir); w1.add('a.wav', 'Câu A.'); w1.flush();
    const w2 = createIndexWriter(dir); w2.add('b.wav', 'Câu B.'); w2.flush();
    expect(JSON.parse(fs.readFileSync(path.join(dir, INDEX_FILE), 'utf8')).entries).toEqual({ 'a.wav': 'Câu A.', 'b.wav': 'Câu B.' });
  });

  it('loadSentences: câu cố định trước, rồi lời giải; không trùng; bỏ câu có {tên}', () => {
    const dir = tmp();
    fs.writeFileSync(path.join(dir, 'fixed-lines.json'), JSON.stringify({ goodbye: ['Tạm biệt.', 'Chào {name}.'] }));
    fs.writeFileSync(path.join(dir, 'readings.json'), JSON.stringify({ single: [{ lead: 'Dẫn.', present: 'Nay. Tạm biệt.', advice: 'Khuyên.' }], triple: {} }));
    const s = loadSentences(dir);
    expect(s.map((x) => x.text)).toEqual(['Tạm biệt.', 'Dẫn.', 'Nay.', 'Khuyên.']);
    expect(s[0].kind).toBe('fixed');
    expect(s[1].kind).toBe('reading');
  });
});

describe('tarot-voice: mọi câu tạo ra đều được ghi vào bảng tra', () => {
  it('synthesize ghi "tên file → câu" vào _omni-index.json (cả câu tạo lúc live)', async () => {
    const dir = tmp(); const ref = path.join(dir, 'r.wav'); fs.writeFileSync(ref, encodeWav16(Float32Array.from({ length: 2400 }, (_, i) => 0.2 * Math.sin(i / 5)), 24000));
    const wav = encodeWav16(Float32Array.from({ length: 24000 }, (_, i) => 0.2 * Math.sin(i / 7)), 24000);
    const fetchImpl = async (u) => {
      u = String(u);
      if (u.endsWith('/upload')) return new Response('["x"]');
      if (u.endsWith('/_clone_fn') ) return new Response('{"event_id":"e"}');
      if (u.includes('/_clone_fn/')) return new Response('event: complete\ndata: [{"url":"http://h/gradio_api/file=a.wav"}]\n\n');
      if (u.includes('/gradio_api/file=')) return new Response(wav);
      return new Response('ok');
    };
    const omni = createOmniVoice({ refAudio: ref, refText: 'x', cacheDir: dir, fetchImpl });
    const r = await omni.synthesize('Xin chào bạn.');
    omni.flushIndex();
    expect(JSON.parse(fs.readFileSync(path.join(dir, INDEX_FILE), 'utf8')).entries[r.file]).toBe('Xin chào bạn.');
  });

  it('omniCacheNamer: cùng tên file với bộ đọc thật; null khi engine không phải omnivoice', () => {
    const dir = tmp(); fs.mkdirSync(path.join(dir, 'voice')); fs.writeFileSync(path.join(dir, 'voice', 'ref.wav'), encodeWav16(new Float32Array(2400), 24000));
    const cfg = { tts: { engine: 'omnivoice', omnivoice: { url: 'http://localhost:8001', lang: 'Vietnamese', steps: 32, cfg: 2, speed: 1, targetDb: -18, refAudio: 'voice/ref.wav', refText: 'x' } } };
    const f = omniCacheNamer(cfg, dir, tmp());
    expect(f('Câu.')).toMatch(/^omni_[0-9a-f]{20}\.wav$/);
    expect(omniCacheNamer({ tts: { engine: 'zerotts' } }, dir, tmp())).toBeNull();
  });
});
