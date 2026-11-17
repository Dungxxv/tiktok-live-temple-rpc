// Popup khách trên admin: lịch sử bình luận/quà, kế hoạch trả lời, câu hỏi + lời giải riêng (tarot.getViewer / tarot.setCustom).
import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createTarotService } = require('../lib/tarot-rpc.js');
const { loadDeck } = require('../lib/tarot-deck.js');
const { DEFAULT_CONFIG, validateConfig, mergeConfig } = require('../lib/tarot-config.js');

const dir = path.join(import.meta.dir, '..', 'data', 'tarot');
const deck = loadDeck(path.join(dir, 'cards.json'));
const readings = JSON.parse(fs.readFileSync(path.join(dir, 'readings.json'), 'utf8'));
const giftTopics = JSON.parse(fs.readFileSync(path.join(dir, 'gift-topics.json'), 'utf8'));
const fixedLines = JSON.parse(fs.readFileSync(path.join(dir, 'fixed-lines.json'), 'utf8'));
const CODES = { '01': { topic: 'overview', label: 'Tổng Quan' }, '02': { topic: 'love', label: 'Tình Yêu' }, '03': { topic: 'finance', label: 'Tài Chính' } };
const PH = { CALLING: 5, SHUFFLING: 5, DRAWING: 5, REVEALING: 5, FAREWELL: 5, INTERMISSION: 0 };
const cfg = () => validateConfig(mergeConfig(DEFAULT_CONFIG, {
  queueOrder: 'lanes', phaseSec: PH, skipPhases: [], singleCardSessions: false, commentTopicCodes: CODES, firstJoinGraceSec: 0
}));

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

function make() {
  const clock = fakeClock();
  const svc = createTarotService({
    config: cfg(), deck, clock, rng: () => 0.37, readings, giftTopics, fixedLines,
    sanitizeUserName: (s) => String(s || '').trim(), isBlocked: (t) => /cấmxx/i.test(t)
  });
  svc.session.stop();
  const say = (name, text) => svc.onComment({ viewerId: name, name, text });
  const st = () => svc.getState();
  const finishSession = () => {
    const since = st().seat?.since;
    for (let i = 0; i < 12 && st().seat && st().seat.since === since; i++) { const s = st(); clock.advance(Math.max(1, s.phaseEndsAt - s.serverTime)); }
  };
  return { svc, clock, say, st, finishSession };
}

describe('tarot.getViewer', () => {
  it('trả lịch sử bình luận + quà (mới nhất trước), vị trí, và kế hoạch xem trước theo mã chủ đề', async () => {
    const { svc, say } = make();
    say('An', 'chào chị');
    say('Bình', '03');
    svc.onGift({ viewerId: 'Bình', name: 'Bình', giftName: 'Rose', coins: 1 });
    const d = await svc.rpc('tarot.getViewer', { viewerId: 'Bình' });
    expect(d.status).toBe('queued');
    expect(d.entry).toMatchObject({ commentCode: '03', commentTopic: 'finance', lane: 'gift' });
    expect(d.history.map((h) => h.kind)).toEqual(['gift', 'comment']);
    expect(d.history[1].text).toBe('03');
    expect(d.history[0]).toMatchObject({ giftName: 'Rose', coins: 1 });
    expect(d.plan.source).toBe('preview');
    expect(d.plan.topic).toBe('finance');
    const row = readings.triple.finance[0];
    expect(d.plan.cards.map((c) => c.id)).toEqual(row.cards.map((c) => c.id));
    expect(d.plan.sheet.card1).toBe(row.card1);
    expect(d.custom).toBeNull();
  });

  it('xem trước không giữ chỗ: không đổi con trỏ sheet', async () => {
    const { svc, say } = make();
    say('An', '02');
    await svc.rpc('tarot.getViewer', { viewerId: 'An' });
    await svc.rpc('tarot.getViewer', { viewerId: 'An' });
    say('Chi', '02');
    const d = await svc.rpc('tarot.getViewer', { viewerId: 'Chi' });
    expect(d.plan.cards[0].id).toBe(readings.triple.love[0].cards[0].id);
  });

  it('khách không tồn tại → lỗi', async () => {
    const { svc } = make();
    await expect(svc.rpc('tarot.getViewer', { viewerId: 'ma' })).rejects.toThrow('Không tìm thấy');
  });
});

describe('tarot.setCustom', () => {
  it('câu hỏi + lời giải riêng thay phần tương ứng, giữ bài ngay (cùng bộ lá), dùng khi vào bệ rồi tự xóa', async () => {
    const { svc, say, st, finishSession } = make();
    say('An', '01');
    say('Bình', '02');
    const before = await svc.rpc('tarot.getViewer', { viewerId: 'Bình' });
    const d = await svc.rpc('tarot.setCustom', {
      viewerId: 'Bình', question: 'Người ấy có nhớ mình không?',
      lines: { card2: 'Hiện tại, lá này gợi ý người ấy vẫn còn để ý tới bạn.', card1: '   ' }
    });
    expect(d.plan.source).toBe('reserved');
    expect(d.plan.cards.map((c) => c.id)).toEqual(before.plan.cards.map((c) => c.id));
    expect(d.plan.speech.CALLING.join(' ')).toContain('Câu hỏi của bạn là: Người ấy có nhớ mình không?');
    expect(d.plan.speech.READING.join(' ')).toContain('vẫn còn để ý tới bạn');
    expect(d.plan.speech.READING.join(' ')).toContain(readings.triple.love[0].card1.split('.')[0]);   // phần để trống giữ nguyên sheet
    expect(d.custom).toMatchObject({ question: 'Người ấy có nhớ mình không?', cardsChanged: false });
    expect(d.custom.lines).toEqual({ card2: 'Hiện tại, lá này gợi ý người ấy vẫn còn để ý tới bạn.' });

    // Lượt bốc đã giữ: người kế tiếp cùng chủ đề nhận dòng sau.
    say('Chi', '02');
    expect((await svc.rpc('tarot.getViewer', { viewerId: 'Chi' })).plan.cards[0].id).toBe(readings.triple.love[1].cards[0].id);

    svc.session.start();
    expect(st().seat.viewerId).toBe('An');
    await expect(svc.rpc('tarot.setCustom', { viewerId: 'An', question: 'x' })).rejects.toThrow('đang ngồi');
    finishSession();
    expect(st().seat.viewerId).toBe('Bình');
    expect(st().cards.map((c) => c.id)).toEqual(before.plan.cards.map((c) => c.id));
    const seated = await svc.rpc('tarot.getViewer', { viewerId: 'Bình' });
    expect(seated.plan.source).toBe('seated');
    expect(seated.plan.speech.READING.join(' ')).toContain('vẫn còn để ý tới bạn');
    expect(seated.custom).toBeNull();   // dùng một lần
  });

  it('để trống hết → xóa lời giải riêng, quay về sheet', async () => {
    const { svc, say } = make();
    say('Bình', '02');
    await svc.rpc('tarot.setCustom', { viewerId: 'Bình', question: 'Hỏi thử' });
    const d = await svc.rpc('tarot.setCustom', { viewerId: 'Bình', question: '', lines: {} });
    expect(d.custom).toBeNull();
    expect(d.plan.speech.CALLING.join(' ')).not.toContain('Câu hỏi của bạn');
  });

  it('chặn từ cấm, khách chưa vào hàng, và xóa khách thì bỏ lời giải riêng', async () => {
    const { svc, say } = make();
    say('Bình', '02');
    await expect(svc.rpc('tarot.setCustom', { viewerId: 'Bình', question: 'cấmxx' })).rejects.toThrow('bị chặn');
    svc.noteActivity({ viewerId: 'Dạo', name: 'Dạo' });
    await expect(svc.rpc('tarot.setCustom', { viewerId: 'Dạo', question: 'hỏi' })).rejects.toThrow('chưa vào hàng');
    await svc.rpc('tarot.setCustom', { viewerId: 'Bình', question: 'Hỏi thử' });
    await svc.rpc('tarot.remove', { viewerId: 'Bình' });
    say('Bình', '02');
    expect((await svc.rpc('tarot.getViewer', { viewerId: 'Bình' })).custom).toBeNull();
  });

  it('bảng phòng có cả người trong hàng mà server chưa thấy (khôi phục sau khởi động lại); xóa ở phòng = xóa khỏi hàng', async () => {
    const { svc } = make();
    svc.queue.requeueFront({ viewerId: 'Cũ', name: 'Khách cũ', avatar: '', lane: 'free', topic: 'overview', joinedAt: 0, boost: 0 });
    const room = await svc.rpc('tarot.getRoom', {});
    expect(room.viewers.find((v) => v.viewerId === 'Cũ')).toMatchObject({ status: 'queued', position: 1 });
    await svc.rpc('tarot.removeRoom', { viewerId: 'Cũ' });
    expect(svc.queue.has('Cũ')).toBe(false);
    expect((await svc.rpc('tarot.getRoom', {})).viewers.find((v) => v.viewerId === 'Cũ')).toBeUndefined();
  });

  it('là phương thức quản trị', () => {
    const { ADMIN_METHODS } = require('../lib/tarot-rpc.js');
    expect(ADMIN_METHODS.has('tarot.setCustom')).toBe(true);
    expect(ADMIN_METHODS.has('tarot.getViewer')).toBe(false);
  });
});
