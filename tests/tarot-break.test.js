// Phiên nghỉ: nữ tư tế nói đoạn riêng sau N khách nữa; thoại do admin viết hoặc nhờ Claude; chọn model + đếm token.
import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createTarotService } = require('../lib/tarot-rpc.js');
const { createReadingWriter } = require('../lib/tarot-ai.js');
const { loadDeck } = require('../lib/tarot-deck.js');
const { DEFAULT_CONFIG, validateConfig, mergeConfig } = require('../lib/tarot-config.js');

const dir = path.join(import.meta.dir, '..', 'data', 'tarot');
const readJson = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const PH = { CALLING: 5, SHUFFLING: 5, DRAWING: 5, REVEALING: 5, FAREWELL: 5, INTERMISSION: 0 };

function fakeClock(start = 9_000_000) {
  let t = start; let seq = 0; const timers = new Map();
  return {
    now: () => t,
    setTimeout(fn, ms) { const id = ++seq; timers.set(id, { at: t + ms, fn }); return id; },
    clearTimeout(id) { timers.delete(id); },
    advance(ms) {
      const end = t + ms;
      for (;;) {
        let next = null;
        for (const [id, x] of timers) if (x.at <= end && (!next || x.at < next.x.at)) next = { id, x };
        if (!next) break;
        timers.delete(next.id); t = next.x.at; next.x.fn();
      }
      t = end;
    }
  };
}

function make({ aiWriter = null, tts = null, saved = null } = {}) {
  const clock = fakeClock();
  let persisted = null;
  const svc = createTarotService({
    config: validateConfig(mergeConfig(DEFAULT_CONFIG, { queueOrder: 'lanes', phaseSec: PH, skipPhases: [], singleCardSessions: false, firstJoinGraceSec: 0, requeueAfterSession: false })),
    deck: loadDeck(path.join(dir, 'cards.json')), clock, rng: () => 0.37,
    readings: readJson('readings.json'), giftTopics: readJson('gift-topics.json'), fixedLines: readJson('fixed-lines.json'),
    sanitizeUserName: (s) => s, isBlocked: (t) => /cấmxx/.test(t), aiWriter, tts,
    persist: (s) => { persisted = s; }, loadSaved: saved ? () => saved : null
  });
  const st = () => svc.getState();
  const say = (n) => svc.onComment({ viewerId: n, name: n, text: 'chào' });
  // Chạy tới khi đổi pha / đổi người (tối đa vài bước).
  const step = () => { const s = st(); clock.advance(Math.max(1, (s.phaseEndsAt || s.serverTime + 1000) - s.serverTime)); };
  const finishSeat = () => { const id = st().seat?.viewerId; for (let i = 0; i < 15 && st().seat?.viewerId === id && st().phase !== 'BREAK'; i++) step(); };
  return { svc, clock, st, say, step, finishSeat, persisted: () => persisted };
}

const TEXT = 'Phần đọc bài xin dừng một chút nhé. Bạn nào muốn tôi trả lời chi tiết thì bình luận câu hỏi để có cơ hội xem bài nha.';

describe('phiên nghỉ (tarot.scheduleBreak)', () => {
  it('"sau 2 khách nữa": khách đang ngồi không tính; đọc xong 2 khách kế tiếp mới phát, rồi mời khách tiếp như thường', async () => {
    const { svc, st, say, finishSeat, step } = make();
    ['An', 'Bình', 'Chi', 'Dũng'].forEach(say);
    expect(st().seat.viewerId).toBe('An');
    const r = await svc.rpc('tarot.scheduleBreak', { text: TEXT, after: 2 });
    expect(r.break).toMatchObject({ after: 2, done: 0, playing: false });
    expect(r.break.lines.length).toBeGreaterThanOrEqual(2);
    finishSeat(); expect(st().seat.viewerId).toBe('Bình');   // An không tính
    finishSeat(); expect(st().seat.viewerId).toBe('Chi');
    expect(st().break.done).toBe(1);
    finishSeat();
    expect(st().phase).toBe('BREAK');
    expect(st().seat).toBeNull();
    expect(st().speech.phases.BREAK.lines.join(' ')).toContain('xin dừng một chút');
    expect(st().break.playing).toBe(true);
    step();
    expect(st().seat.viewerId).toBe('Dũng');   // hết phiên nghỉ → khách kế tiếp
    expect(st().break).toBeNull();
  });

  it('"ngay" khi phòng rảnh → phát luôn; xong về IDLE', async () => {
    const { svc, st, step } = make();
    svc.session.start();
    await svc.rpc('tarot.scheduleBreak', { text: 'Lại một ngày sắp trôi qua. Bạn có mệt không?', after: 0 });
    expect(st().phase).toBe('BREAK');
    step();
    expect(st().phase).toBe('IDLE');
    expect(st().break).toBeNull();
  });

  it('"ngay" khi đang đọc → phát ngay sau phiên đang đọc', async () => {
    const { svc, st, say, finishSeat } = make();
    say('An'); say('Bình');
    await svc.rpc('tarot.scheduleBreak', { text: TEXT, after: 0 });
    finishSeat();
    expect(st().phase).toBe('BREAK');
  });

  it('có giọng đọc: tạo giọng ngay lúc lên lịch, pha kéo dài theo giọng', async () => {
    const tts = { prepare: async (lines) => ({ urls: lines.map((_, i) => `/tts/${i}.mp3`), durations: lines.map(() => 3) }) };
    const { svc, st } = make({ tts });
    svc.session.start();
    await svc.rpc('tarot.scheduleBreak', { text: TEXT, after: 1 });
    await new Promise((r) => setTimeout(r, 5));
    expect(st().break.ttsStatus).toBe('ready');
  });

  it('hủy, chặn từ cấm, lưu qua khởi động lại', async () => {
    const a = make();
    a.say('An');
    await expect(a.svc.rpc('tarot.scheduleBreak', { text: 'cấmxx', after: 1 })).rejects.toThrow('bị chặn');
    await a.svc.rpc('tarot.scheduleBreak', { text: TEXT, after: 3 });
    a.clock.advance(500);
    expect(a.persisted().pendingBreak).toMatchObject({ after: 3, done: 0 });
    const b = make({ saved: a.persisted() });
    b.svc.boot();
    expect(b.st().break).toMatchObject({ after: 3, done: 0 });
    expect((await b.svc.rpc('tarot.cancelBreak', {})).ok).toBe(true);
    expect(b.st().break).toBeNull();
  });
});

describe('thoại phiên nghỉ bằng Claude + chọn model + đếm token', () => {
  const fake = () => {
    const calls = [];
    return { calls, beta: { messages: { create: async (req) => { calls.push(req); return { model: req.model, stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ text: 'Các bạn ơi, nghỉ tay một chút nhé.  Ai muốn hỏi chi tiết thì bình luận nha.' }) }], usage: { input_tokens: 500, output_tokens: 120 } }; } } } };
  };

  it('tarot.aiBreak trả đoạn thoại (chưa lên lịch); đếm token cộng dồn', async () => {
    const client = fake();
    const { svc, st } = make({ aiWriter: createReadingWriter({ client }) });
    const r = await svc.rpc('tarot.aiBreak', { idea: 'xin quà để trả lời chi tiết' });
    expect(r.text).toBe('Các bạn ơi, nghỉ tay một chút nhé. Ai muốn hỏi chi tiết thì bình luận nha.');
    expect(client.calls[0].system).toContain('nghỉ giữa các lượt');
    expect(client.calls[0].messages[0].content).toContain('xin quà để trả lời chi tiết');
    expect(st().break).toBeNull();
    await svc.rpc('tarot.aiBreak', { idea: 'chúc cuối ngày' });
    const c = await svc.rpc('tarot.aiConfig', {});
    expect(c.stats).toMatchObject({ calls: 2, input: 1000, output: 240 });
  });

  it('tarot.aiConfig đổi sang Sonnet → gọi claude-sonnet-5-5; lưu lựa chọn', async () => {
    const client = fake();
    const { svc, clock, persisted } = make({ aiWriter: createReadingWriter({ client }) });
    expect((await svc.rpc('tarot.aiConfig', {})).model).toBe('opus');
    expect((await svc.rpc('tarot.aiConfig', { model: 'sonnet' })).model).toBe('sonnet');
    await svc.rpc('tarot.aiBreak', { idea: 'chào buổi tối' });
    expect(client.calls[0].model).toBe('claude-sonnet-5-5');
    clock.advance(500);
    expect(persisted().aiModel).toBe('sonnet');
    await expect(svc.rpc('tarot.aiConfig', { model: 'gpt' })).rejects.toThrow('không hỗ trợ');
  });
});
