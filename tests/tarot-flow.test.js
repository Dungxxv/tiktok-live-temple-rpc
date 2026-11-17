// Luồng mới: hai làn (quà / vào phòng), quà → chủ đề, lượt bốc từ Google Sheet (readings.json), lời nói theo pha.
import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createTarotService } = require('../lib/tarot-rpc.js');
const { loadDeck } = require('../lib/tarot-deck.js');
const { DEFAULT_CONFIG, validateConfig, mergeConfig } = require('../lib/tarot-config.js');
const { safeName, createFixedLines } = require('../lib/tarot-speech.js');

const dir = path.join(import.meta.dir, '..', 'data', 'tarot');
const deck = loadDeck(path.join(dir, 'cards.json'));
const readings = JSON.parse(fs.readFileSync(path.join(dir, 'readings.json'), 'utf8'));
const giftTopics = JSON.parse(fs.readFileSync(path.join(dir, 'gift-topics.json'), 'utf8'));
const fixedLines = JSON.parse(fs.readFileSync(path.join(dir, 'fixed-lines.json'), 'utf8'));
const PH = { CALLING: 5, SHUFFLING: 5, DRAWING: 5, REVEALING: 5, FAREWELL: 5, INTERMISSION: 0 };
const cfg = (o = {}) => validateConfig(mergeConfig(DEFAULT_CONFIG, { queueOrder: 'lanes', joinOnEnter: true, phaseSec: PH, skipPhases: [], ...o }));

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

function make(over = {}, deps = {}) {
  const clock = fakeClock();
  const logs = [];
  const svc = createTarotService({
    config: cfg(over), deck, clock, rng: () => 0.37, readings, giftTopics, fixedLines,
    sanitizeUserName: (s) => String(s || '').trim(), log: (m) => logs.push(m), ...deps
  });
  const enter = (name) => svc.noteActivity({ viewerId: name, name });
  const gift = (name, giftName, coins = 1, giftId) => svc.onGift({ viewerId: name, name, giftName, coins, giftId });
  const st = () => svc.getState();
  // Chạy hết phiên hiện tại (READING tính theo tổng TTS ước tính).
  const finishSession = () => {
    const since = st().seat?.since;
    for (let i = 0; i < 12 && st().seat && st().seat.since === since; i++) { const s = st(); clock.advance(Math.max(1, s.phaseEndsAt - s.serverTime)); }
  };
  return { svc, clock, logs, enter, gift, st, finishSession };
}

describe('tarot-flow: hai làn hàng chờ', () => {
  it('vào phòng → làn vào phòng (0⭐); quà → làn quà đứng trước, xếp theo ⭐', () => {
    const { svc, enter, gift, st } = make();
    svc.session.stop();
    enter('An'); enter('Bình');
    gift('Chi', 'Rose', 1);
    gift('Dũng', 'Finger Heart', 5);
    const q = st().queue.map((e) => [e.viewerId, e.lane, e.stars]);
    expect(q).toEqual([['Dũng', 'gift', 50], ['Chi', 'gift', 10], ['An', 'free', 0], ['Bình', 'free', 0]]);
  });

  it('người làn vào phòng tặng quà thì chuyển sang làn quà', () => {
    const { svc, enter, gift, st } = make();
    svc.session.stop();
    enter('An'); enter('Bình');
    gift('Bình', 'Rose', 1);
    expect(st().queue.map((e) => e.viewerId)).toEqual(['Bình', 'An']);
  });

  it('chống đói: sau 3 phiên quà liên tiếp, phiên thứ 4 cho người chờ lâu nhất làn vào phòng', () => {
    const { svc, enter, gift, st, finishSession } = make({ freeReserveEvery: 4 });
    svc.session.stop();
    enter('Free1');
    ['G1', 'G2', 'G3', 'G4'].forEach((g) => gift(g, 'Rose', 1));
    svc.session.start();
    const order = [];
    for (let i = 0; i < 5; i++) { order.push(st().seat.viewerId); finishSession(); }
    expect(order).toEqual(['G1', 'G2', 'G3', 'Free1', 'G4']);
  });
});

describe('tarot-flow: quà → chủ đề → phiên 3 lá từ sheet', () => {
  it('hoa hồng → phiên quà chủ đề Tổng quan, 3 lá đúng dòng 1 của tab tổng quan, có nhãn vị trí', () => {
    const { gift, st } = make();
    gift('Lan', 'Rose', 1);
    const s = st();
    expect(s.seat).toMatchObject({ viewerId: 'Lan', sessionType: 'gift', topic: 'overview', topicLabel: 'Tổng quan' });
    const row = readings.triple.overview[0];
    expect(s.cards.map((c) => [c.id, c.reversed, c.positionLabel])).toEqual(row.cards.map((c, i) => [c.id, c.reversed, ['Quá khứ', 'Hiện tại', 'Tương lai'][i]]));
    expect(s.cards.every((c) => !c.revealed)).toBe(true);
    // Tên lá hiển thị theo sheet (khớp lời đọc)
    if (readings.cardNames?.[row.cards[0].id]) expect(s.cards[0].name).toBe(readings.cardNames[row.cards[0].id]);
  });

  it('nước hoa → Tình Yêu; hai khách cùng chủ đề nhận hai dòng liên tiếp, hết dòng quay lại dòng 1', () => {
    const { gift, st, finishSession } = make();
    const n = readings.triple.love.length;
    const rows = [];
    for (let i = 0; i < n + 1; i++) gift(`K${i}`, 'Love in Scent', 5);
    for (let i = 0; i < n + 1; i++) { rows.push(st().seat.topic + ':' + st().cards[0].id + st().cards[1].id); finishSession(); }
    const expected = [...readings.triple.love, readings.triple.love[0]].map((r) => 'love:' + r.cards[0].id + r.cards[1].id);
    expect(rows).toEqual(expected);
  });

  it('lời đọc phiên quà: Câu mở đầu → lá 1 → lá 2 → lá 3 → Lời kết (mỗi câu ≤ 140 ký tự)', () => {
    const { gift, st } = make();
    gift('Lan', 'Rose', 1);
    const r = st().reading;
    const order = [...new Set(r.sections)];
    expect(order).toEqual(['opening', 'card1', 'card2', 'card3', 'closing']);
    expect(r.lines.every((l) => l.length <= 140)).toBe(true);
    const sp = st().speech.phases;
    // Thoại mở đầu theo Figma: "Chào Lan." → "Chủ đề của bạn là …"; xáo bài nhắc đúng chủ đề
    expect(sp.CALLING.sections).toEqual(['greeting', 'topic', 'intro']);   // câu xáo bài nói ngay trước khi xáo
    expect(sp.CALLING.lines[0]).toContain('Lan');
    expect(sp.CALLING.lines[1]).toMatch(/^Chủ đề của bạn là /);
    expect(sp.FAREWELL.sections.every((x) => x === 'goodbye')).toBe(true);
  });

  it('thoại Figma: quà chủ đề Học Tập → "Chủ đề của bạn là Học Tập." + "Hãy nghĩ đến chuyện học tập của bạn trong lúc xáo bài nhé!"', () => {
    const { gift, st } = make();
    gift('Lan', 'Ice Cream Cone', 1);
    const sp = st().speech.phases;
    expect(sp.CALLING.lines).toEqual(['Chào Lan.', 'Chủ đề của bạn là Học Tập.', 'Hãy nghĩ đến chuyện học tập của bạn trong lúc xáo bài nhé!']);
    expect(sp.SHUFFLING.lines).toEqual([]);   // lúc xáo bài (clip mắt sáng) không chồng thoại
  });

  it('mã bình luận "02" → 3 lá Tình Yêu; thoại Figma "Chủ đề bạn bình luận là 02: Tình Yêu."', () => {
    const codes = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).commentTopicCodes;
    const { svc, st } = make({ commentTopicCodes: codes, commentStars: 1 });
    svc.session.stop();
    svc.onComment({ viewerId: 'Lan', name: 'Lan', text: '02' });
    svc.onComment({ viewerId: 'Minh', name: 'Minh', text: 'chào chị' });
    expect(st().queue.find((e) => e.viewerId === 'Lan')).toMatchObject({ commentTopic: 'love', commentCode: '02' });
    expect(st().queue.find((e) => e.viewerId === 'Minh').commentTopic).toBeUndefined();
    svc.session.start();
    const sp = st().speech.phases;
    expect(st().seat).toMatchObject({ viewerId: 'Lan', topic: 'love' });
    expect(st().cards.length).toBe(3);
    expect(sp.CALLING.lines).toEqual(['Chào Lan.', 'Chủ đề bạn bình luận là 02: Tình Yêu.', 'Hãy nghĩ đến chuyện tình yêu của bạn trong lúc xáo bài nhé!']);
    expect(sp.SHUFFLING.lines).toEqual([]);
  });

  it('singleCardSessions=false + giftSetsTopic=false: vào phòng → 3 lá Tổng quan; quà chỉ ưu tiên, không đổi chủ đề; mã bình luận mới đổi', () => {
    const codes = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8')).commentTopicCodes;
    const { svc, enter, gift, st, finishSession } = make({ singleCardSessions: false, giftSetsTopic: false, commentTopicCodes: codes, intermission: 0 });
    svc.session.stop();
    enter('An');
    gift('Bình', 'Ice Cream Cone', 1);   // quà chủ đề Học Tập — không đổi chủ đề
    svc.onComment({ viewerId: 'Chi', name: 'Chi', text: '04' });
    expect(st().queue.find((e) => e.viewerId === 'Bình').topic).not.toBe('study');
    svc.session.start();
    const seen = {};
    for (let k = 0; k < 3 && st().seat; k++) {
      const s = st();
      seen[s.seat.viewerId] = { n: s.cards.length, topic: s.seat.topic, topicLine: s.speech.phases.CALLING.lines[1] };
      finishSession();
    }
    expect(seen['Bình']).toEqual({ n: 3, topic: 'overview', topicLine: 'Chủ đề của bạn là Tổng quan.' });   // quà không đổi chủ đề
    expect(seen['An']).toEqual({ n: 3, topic: 'overview', topicLine: 'Chủ đề của bạn là Tổng quan.' });     // không còn phiên 1 lá
    expect(seen['Chi']).toEqual({ n: 3, topic: 'career', topicLine: 'Chủ đề bạn bình luận là 04: Sự Nghiệp.' });
  });

  it('mã bình luận: "2" cũng nhận; số khác / không ở đầu câu thì bỏ qua', () => {
    const { parseTopicCode } = require('../lib/tarot-rpc.js');
    const codes = { '02': { topic: 'love', label: 'Tình Yêu' }, '05': { topic: 'study', label: 'Học Tập' } };
    expect(parseTopicCode('2', codes)).toMatchObject({ code: '02', topic: 'love' });
    expect(parseTopicCode(' 05 học hành', codes)).toMatchObject({ code: '05', topic: 'study' });
    expect(parseTopicCode('07', codes)).toBeNull();
    expect(parseTopicCode('25', codes)).toBeNull();
    expect(parseTopicCode('chị ơi 02', codes)).toBeNull();
    expect(parseTopicCode('02', {})).toBeNull();
  });

  it('quà chưa có luật → chủ đề mặc định (Tổng quan) + log unmappedGift; không sập', () => {
    const { gift, st, logs } = make();
    const r = gift('Lạ', 'Galaxy', 1000);
    expect(r).toMatchObject({ ok: true, topic: 'overview' });
    expect(st().seat.topic).toBe('overview');
    expect(logs.join('\n')).toContain('unmappedGift');
  });

  it('mũ (quà lớn) → Hỏi cụ thể; chưa có model → đọc tạm Tổng quan, log specificFallback', () => {
    const { gift, st, logs } = make();
    gift('Mũ', 'Cap', 99);
    expect(st().seat).toMatchObject({ topic: 'overview', topicLabel: 'Hỏi cụ thể', sessionType: 'gift' });
    expect(logs.join('\n')).toContain('specificFallback');
  });

  it('khớp giftId trước tên quà', () => {
    const gt = JSON.parse(JSON.stringify(giftTopics));
    gt.gifts[4].giftId = 999001;   // nước hoa (id thử, không trùng id thật trong file)
    const { gift, st } = make({}, { giftTopics: gt });
    gift('Id', 'Tên lạ', 20, 999001);
    expect(st().seat.topic).toBe('love');
  });

  it('chủ đề phiên = quà giá trị cao nhất khách đã tặng', () => {
    const { svc, gift, st } = make();
    svc.session.stop();
    gift('Lan', 'Love in Scent', 5); gift('Lan', 'Rose', 1);
    expect(st().queue[0].topic).toBe('love');
    gift('Lan', 'Cap', 99);
    expect(st().queue[0].topic).toBe('specific');
  });
});

describe('tarot-flow: phiên vào phòng 1 lá', () => {
  it('vào phòng → phiên join: 1 lá ở vị trí giữa, đọc Câu dẫn → Hiện tại → Lời khuyên → Lời mời', () => {
    const { enter, st } = make();
    enter('Minh');
    const s = st();
    expect(s.seat).toMatchObject({ sessionType: 'join', topic: 'overview' });
    expect(s.cards.length).toBe(1);
    expect(s.cards[0].position).toBe('center');
    expect([...new Set(s.reading.sections)]).toEqual(['lead', 'present', 'advice', 'invite']);
    const row = readings.single.find((r) => r.id === s.cards[0].id && r.reversed === s.cards[0].reversed);
    expect(row).toBeTruthy();
    expect(s.reading.lines[0]).toBe(row.lead);
  });

  it('bình luận từ khóa cũng vào làn vào phòng', () => {
    const { svc, st } = make();
    svc.onComment({ viewerId: 'X', name: 'X', text: 'bói giúp em' });
    expect(st().seat).toMatchObject({ viewerId: 'X', sessionType: 'join' });
  });
});

describe('tarot-flow: chuẩn bị trước khi khách lên ghế', () => {
  it('khách kế tiếp bị khóa → chọn sẵn dòng + gọi TTS (kể cả câu chào có tên) trước khi họ ngồi', async () => {
    const calls = [];
    const tts = { prepare: async (lines) => { calls.push(lines); return { urls: lines.map((_, i) => `/t/${i}.wav`), durations: lines.map(() => 2) }; } };
    const { gift, st, clock } = make({ lockBeforeEndSec: 10, ttsWaitMaxSec: 0 }, { tts });
    gift('An', 'Rose', 1);
    gift('Bình', 'Love in Scent', 5);
    await new Promise((r) => setTimeout(r, 0));
    expect(st().seat.viewerId).toBe('An');
    // chạy tới khi B bị khóa (còn ≤ 10 giây của phiên A)
    for (let i = 0; i < 60 && !st().queue[0]?.locked; i++) clock.advance(2000);
    await new Promise((r) => setTimeout(r, 0));
    expect(st().seat.viewerId).toBe('An');
    expect(st().queue[0]).toMatchObject({ viewerId: 'Bình', locked: true });
    expect(calls.some((c) => c[0].includes('Bình'))).toBe(true);
  });

  it('khách được giữ dòng rồi bị xóa khỏi hàng → trả dòng, người sau nhận đúng dòng đó', () => {
    const { svc, gift, st, finishSession, clock } = make({ lockBeforeEndSec: 60 });
    gift('A', 'Rose', 1);            // dòng 1 tổng quan
    gift('B', 'Rose', 1);
    clock.advance(1);
    // B đã bị khóa (lockBeforeEndSec lớn) → đã giữ dòng 2
    for (let i = 0; i < 40 && !st().queue[0]?.locked; i++) clock.advance(5000);
    expect(st().queue[0]).toMatchObject({ viewerId: 'B', locked: true });
    svc.rpc('tarot.remove', { viewerId: 'B' });
    gift('C', 'Rose', 1);
    finishSession();
    expect(st().seat.viewerId).toBe('C');
    expect(st().cards[0].id).toBe(readings.triple.overview[1].cards[0].id);
  });

  it('con trỏ từng chủ đề được lưu và khôi phục sau khởi động lại', () => {
    let saved = null;
    const persist = (s) => { saved = JSON.parse(JSON.stringify(s)); };
    const a = make({}, { persist });
    a.gift('A', 'Rose', 1);
    a.clock.advance(500);
    const b = make({}, { loadSaved: () => saved });
    b.svc.boot();
    b.gift('B', 'Rose', 1);
    expect(b.st().cards[0].id).toBe(readings.triple.overview[1].cards[0].id);
  });
});

describe('tarot-speech: tên đọc thành tiếng và câu cố định', () => {
  it('lọc tên: bỏ số/ký hiệu; tên rác, quá dài, lặp ký tự hoặc chữ ngoài tiếng Việt → null', () => {
    expect(safeName('Quốc Bảo 10')).toBe('Quốc Bảo');
    expect(safeName('🔥🔥')).toBeNull();
    expect(safeName('aaaaaa')).toBeNull();
    expect(safeName('Nguyễn Thị Phương Thảo Linh')).toBeNull();
    expect(safeName('李小龙')).toBeNull();
    expect(safeName('xấu', (t) => t === 'xấu')).toBeNull();
  });
  it('câu cố định xoay vòng, không lặp liền kề', () => {
    const f = createFixedLines({ goodbye: ['a', 'b', 'c'] });
    const got = Array.from({ length: 6 }, () => f.pick('goodbye'));
    expect(got).toEqual(['a', 'b', 'c', 'a', 'b', 'c']);
  });
  it('mọi câu cố định ≤ 140 ký tự và không có "sẽ"/"chắc chắn"/"Tôi rút"', () => {
    for (const [k, list] of Object.entries(fixedLines)) {
      if (k.startsWith('_')) continue;
      for (const l of list) {
        expect(l.length).toBeLessThanOrEqual(140);
        expect(/\bsẽ\b|chắc chắn|tôi rút/i.test(l)).toBe(false);
      }
    }
  });
});

describe('tarot-flow: không cắt câu và cảm ơn chung người tặng quà', () => {
  const ttsOk = () => ({ prepare: async (lines) => ({ urls: lines.map((_, i) => `/t/${i}.wav`), durations: lines.map(() => 4) }) });
  const flush = () => new Promise((r) => setTimeout(r, 0));

  it('pha có lời được kéo dài cho đủ nói hết (mời khách 1 câu 4 giây > 5 giây cấu hình? không; đọc bài không bị trần 40 giây)', async () => {
    const { gift, st, clock } = make({ phaseSec: { ...PH, CALLING: 2 }, readingMaxSec: 10, ttsWaitMaxSec: 30 }, { tts: ttsOk() });
    gift('Lan', 'Rose', 1);
    await flush();
    // CALLING có 3 câu (chào + chủ đề + nhắc xáo bài), mỗi câu 4 giây → khi giọng sẵn sàng, pha kéo dài 12 + 1,2 giây thay vì 2 giây cấu hình
    expect(st().phase).toBe('CALLING');
    expect(st().phaseEndsAt - st().phaseStartedAt).toBe(13200);
    for (let i = 0; i < 30 && st().phase !== 'READING'; i++) { clock.advance(1000); await flush(); }
    const s = st();
    const speechMs = (s.speech.phases.READING.durations.reduce((a, b) => a + b, 0) + 1.2) * 1000;
    expect(s.phaseEndsAt - s.phaseStartedAt).toBeGreaterThanOrEqual(Math.round(speechMs));
    expect(s.phaseEndsAt - s.phaseStartedAt).toBeGreaterThan(10000);   // không bị trần readingMaxSec
  });

  it('speechLeadSec.CALLING: chờ avatar vào bệ rồi mới chào → pha mời khách dài thêm đúng ngần ấy, màn live nhận được số giây chờ', async () => {
    const { gift, st } = make({ phaseSec: { ...PH, CALLING: 2 }, ttsWaitMaxSec: 30, speechLeadSec: { CALLING: 2.6 } }, { tts: ttsOk() });
    gift('Lan', 'Rose', 1);
    await flush();
    expect(st().phase).toBe('CALLING');
    expect(st().phaseEndsAt - st().phaseStartedAt).toBe(15800);   // 3 câu × 4 giây + 1,2 nghỉ + 2,6 chờ
    expect(st().config.speechLeadSec).toEqual({ CALLING: 2.6 });
  });

  it('quà tặng trong lúc trải bài: gom lại, cảm ơn chung (có tên) ở cuối FAREWELL', async () => {
    const { svc, gift, st, clock } = make({ ttsWaitMaxSec: 30 }, { tts: ttsOk() });
    gift('Lan', 'Rose', 1);
    await flush();
    svc.onGift({ viewerId: 'Minh', name: 'Minh', giftName: 'Rose', coins: 1 });
    svc.onGift({ viewerId: 'Hoa', name: 'Hoa', giftName: 'Cap', coins: 99 });
    for (let i = 0; i < 60 && st().phase !== 'FAREWELL'; i++) { clock.advance(1000); await flush(); }
    const fw = st().speech.phases.FAREWELL;
    expect(fw.sections.at(-1)).toBe('thanks');
    expect(fw.lines.at(-1)).toMatch(/Cảm ơn|cảm ơn/);
    expect(fw.lines.at(-1)).toContain('Minh');
    expect(fw.ttsUrls.length).toBe(fw.lines.length);
  });

  it('không có quà trong phiên → không có câu cảm ơn', async () => {
    const { enter, st, clock } = make({ ttsWaitMaxSec: 30 }, { tts: ttsOk() });
    enter('An');
    await flush();
    for (let i = 0; i < 60 && st().phase !== 'FAREWELL'; i++) { clock.advance(1000); await flush(); }
    expect(st().speech.phases.FAREWELL.sections).not.toContain('thanks');
  });
});

describe('tarot-flow: vào phòng là vào hàng, bình luận +1 sao', () => {
  it('vào phòng → có ô ngay (0⭐); bình luận bất kỳ → +1⭐ và đứng trước người chỉ vào phòng', () => {
    const { svc, enter, st } = make();
    svc.session.stop();
    enter('An'); enter('Bình');
    expect(st().queue.map((e) => [e.viewerId, e.stars])).toEqual([['An', 0], ['Bình', 0]]);
    const r = svc.onComment({ viewerId: 'Bình', name: 'Bình', text: 'chào mọi người' });
    expect(r).toMatchObject({ ok: true, joined: false, stars: 1, totalStars: 1 });
    expect(st().queue.map((e) => [e.viewerId, e.stars])).toEqual([['Bình', 1], ['An', 0]]);
  });

  it('chưa có trong hàng mà bình luận → vào hàng luôn với 1⭐', () => {
    const { svc, st } = make();
    svc.session.stop();
    const r = svc.onComment({ viewerId: 'Chi', name: 'Chi', text: 'hi' });
    expect(r).toMatchObject({ ok: true, joined: true, stars: 1 });
    expect(st().queue[0]).toMatchObject({ viewerId: 'Chi', lane: 'free', stars: 1 });
  });

  it('chống spam: tối đa 1⭐ mỗi commentStarCooldownSec giây', () => {
    const { svc, st, clock } = make({ commentStarCooldownSec: 30 });
    svc.session.stop();
    const c = () => svc.onComment({ viewerId: 'Dũng', name: 'Dũng', text: 'a' });
    c(); c(); c();
    expect(st().queue[0].stars).toBe(1);
    clock.advance(30000);
    c();
    expect(st().queue[0].stars).toBe(2);
  });

  it('làn quà vẫn luôn đứng trước, kể cả khi người làn vào phòng có nhiều sao bình luận', () => {
    const { svc, gift, st, clock } = make({ commentStarCooldownSec: 0 });
    svc.session.stop();
    for (let i = 0; i < 20; i++) svc.onComment({ viewerId: 'Nhiều', name: 'Nhiều', text: 'x' });
    gift('Quà', 'Rose', 1);
    expect(st().queue.map((e) => e.viewerId)).toEqual(['Quà', 'Nhiều']);
    expect(st().queue[1].stars).toBe(20);
  });

  it('bình luận của người đang ngồi ghế không đổi hàng chờ', () => {
    const { svc, enter, st } = make();
    enter('Ghế');
    expect(st().seat.viewerId).toBe('Ghế');
    expect(svc.onComment({ viewerId: 'Ghế', name: 'Ghế', text: 'cảm ơn' })).toMatchObject({ ok: false, reason: 'seated' });
    expect(st().queue).toEqual([]);
  });
});
