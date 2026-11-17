import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createQueue } = require('../lib/tarot-queue.js');
const { createSession } = require('../lib/tarot-session.js');
const { createLobby } = require('../lib/tarot-lobby.js');
const { loadDeck } = require('../lib/tarot-deck.js');
const { DEFAULT_CONFIG, mergeConfig, validateConfig } = require('../lib/tarot-config.js');

const deck = loadDeck(path.join(import.meta.dir, '..', 'data', 'tarot', 'cards.json'));
const cfg = (o = {}) => validateConfig(mergeConfig(DEFAULT_CONFIG, o));
const v = (id) => ({ viewerId: id, name: `Người ${id}`, avatar: '' });

// Đồng hồ giả: advance(ms) chạy các hẹn giờ theo thứ tự thời gian.
function fakeClock(start = 1_000_000) {
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
        timers.delete(next.id);
        t = next.x.at;
        next.x.fn();
      }
      t = end;
    },
    pending: () => timers.size
  };
}

function setup(over = {}, ttsImpl = null) {
  const config = cfg(over);
  const clock = fakeClock();
  const queue = createQueue(config);
  const changes = [];
  const events = [];
  const s = createSession({
    config, queue, deck, rng: () => 0.5, clock, tts: ttsImpl,
    onChange: (r) => changes.push(r), onEvent: (n, p) => events.push([n, p])
  });
  const join = (id) => { const r = queue.join(v(id), clock.now()); s.kick(); return r; };
  return { config, clock, queue, s, join, changes, events };
}

describe('tarot-session: chuỗi pha và thời lượng', () => {
  it('IDLE khi không có ai; có người vào thì CALLING ngay', () => {
    const { s, join } = setup();
    expect(s.getPhase()).toBe('IDLE');
    join('a');
    expect(s.getPhase()).toBe('CALLING');
    expect(s.getState().seat.viewerId).toBe('a');
  });

  it('chuỗi mặc định (bỏ SHUFFLING): CALLING 5 → DRAWING 5 → REVEALING 5 → READING → FAREWELL 5 → IDLE', () => {
    const { s, clock, join } = setup();
    join('a');
    const seen = [];
    const step = () => { seen.push([s.getPhase(), s.getState().phaseEndsAt - s.getState().phaseStartedAt]); };
    step();
    clock.advance(5000); step();
    clock.advance(5000); step();
    clock.advance(5000); step();
    const readingMs = s.getState().phaseEndsAt - s.getState().phaseStartedAt;
    clock.advance(readingMs); step();
    clock.advance(5000);
    expect(seen.map((x) => x[0])).toEqual(['CALLING', 'DRAWING', 'REVEALING', 'READING', 'FAREWELL']);
    expect(seen[0][1]).toBe(5000);
    expect(seen[3][1]).toBeGreaterThanOrEqual(8000);
    expect(s.getPhase()).toBe('IDLE');
    expect(s.getState().seat).toBe(null);
  });

  it('bật SHUFFLING bằng cấu hình thì thêm pha 5 giây', () => {
    const { s, clock, join } = setup({ skipPhases: [] });
    join('a');
    clock.advance(5000);
    expect(s.getPhase()).toBe('SHUFFLING');
    clock.advance(5000);
    expect(s.getPhase()).toBe('DRAWING');
  });

  it('tổng thời gian ghế mặc định trong khoảng 25–40 giây', () => {
    const { s, clock, join } = setup();
    join('a');
    const t0 = clock.now();
    let guard = 0;
    while (s.getPhase() !== 'IDLE' && guard++ < 200) clock.advance(500);
    const total = (clock.now() - t0) / 1000;
    expect(total).toBeGreaterThanOrEqual(25);
    expect(total).toBeLessThanOrEqual(40);
  });

  it('phase/phaseStartedAt/phaseEndsAt và version tăng dần', () => {
    const { s, clock, join } = setup();
    const v0 = s.getVersion();
    join('a');
    const st = s.getState();
    expect(st.phaseStartedAt).toBe(clock.now());
    expect(st.phaseEndsAt).toBe(clock.now() + 5000);
    expect(s.getVersion()).toBeGreaterThan(v0);
    const v1 = s.getVersion();
    clock.advance(5000);
    expect(s.getVersion()).toBeGreaterThan(v1);
  });
});

describe('tarot-session: lá bài và lời giải', () => {
  it('rút 1 lá ở DRAWING (chưa lật), lật ở REVEALING', () => {
    const { s, clock, join } = setup();
    join('a');
    clock.advance(5000);
    expect(s.getPhase()).toBe('DRAWING');
    expect(s.getState().cards.length).toBe(1);
    expect(s.getState().cards[0].revealed).toBe(false);
    clock.advance(5000);
    expect(s.getPhase()).toBe('REVEALING');
    expect(s.getState().cards[0].revealed).toBe(true);
    expect(s.getState().cards[0].keywords.length).toBeGreaterThan(0);
  });

  it('thời lượng READING theo tổng TTS (+ đệm 1 giây)', async () => {
    const tts = { prepare: async (lines) => ({ urls: lines.map((_, i) => `/tts-cache/x${i}.wav`), durations: lines.map(() => 4) }) };
    const { s, clock, join } = setup({}, tts);
    join('a');
    clock.advance(5000);                    // DRAWING: gọi prepare
    await new Promise((r) => setTimeout(r, 0));
    clock.advance(5000);                    // REVEALING
    clock.advance(5000);                    // READING
    const st = s.getState();
    expect(st.phase).toBe('READING');
    const lines = st.reading.lines.length;
    expect(st.reading.ready).toBe(true);
    expect(st.reading.ttsUrls.length).toBe(lines);
    expect(st.phaseEndsAt - st.phaseStartedAt).toBe(Math.min(40, lines * 4 + 1) * 1000);
  });

  it('không có TTS thì ước lượng theo số ký tự, tối thiểu 8 giây', () => {
    const { s, clock, join } = setup();
    join('a');
    clock.advance(15000);
    const ms = s.getState().phaseEndsAt - s.getState().phaseStartedAt;
    expect(ms).toBeGreaterThanOrEqual(8000);
    expect(ms).toBeLessThanOrEqual(40000);
  });

  it('TTS lỗi thì phiên vẫn chạy bình thường', async () => {
    const tts = { prepare: async () => { throw new Error('boom'); } };
    const { s, clock, join } = setup({}, tts);
    join('a');
    clock.advance(5000);
    await new Promise((r) => setTimeout(r, 0));
    clock.advance(10000);
    expect(s.getPhase()).toBe('READING');
    expect(s.getState().reading.ttsUrls).toEqual([]);
  });

  it('không rút lại lá của 3 phiên gần nhất', () => {
    const ids = [];
    const { s, clock, join } = setup();
    for (let i = 0; i < 4; i++) {
      join(`u${i}`);
      clock.advance(5000);
      ids.push(s.getState().cards[0].id);
      let guard = 0; while (s.getPhase() !== 'IDLE' && guard++ < 300) clock.advance(500);
    }
    // rng cố định 0.5 sẽ luôn chọn cùng một lá nếu không có exclude
    expect(new Set(ids.slice(0, 3)).size).toBe(3);
  });
});

describe('tarot-session: nhiều người và hàng chờ', () => {
  it('hết phiên thì gọi người kế tiếp ngay, không qua IDLE', () => {
    const { s, clock, join } = setup();
    join('a'); join('b');
    let guard = 0;
    while (s.getState().seat?.viewerId === 'a' && guard++ < 300) clock.advance(500);
    expect(s.getPhase()).toBe('CALLING');
    expect(s.getState().seat.viewerId).toBe('b');
  });

  it('hết người thì về IDLE; người vào sau đó được gọi ngay', () => {
    const { s, clock, join } = setup();
    join('a');
    let guard = 0; while (s.getPhase() !== 'IDLE' && guard++ < 300) clock.advance(500);
    expect(s.getPhase()).toBe('IDLE');
    expect(clock.pending()).toBe(0);
    join('b');
    expect(s.getPhase()).toBe('CALLING');
  });

  it('khóa người kế tiếp khi phiên còn <= 10 giây; quà không vượt được người bị khóa', () => {
    const { s, clock, queue, join } = setup();
    join('a'); join('b'); join('c'); join('d');
    expect(queue.getLockedId()).toBe(null);
    clock.advance(15000);                        // tới READING
    const st = s.getState();
    const readingMs = st.phaseEndsAt - st.phaseStartedAt;
    clock.advance(readingMs + 5000 - 10000 - 100);
    expect(queue.getLockedId()).toBe(null);
    clock.advance(200);
    expect(queue.getLockedId()).toBe('b');
    queue.boost(v('d'), 100, clock.now());
    expect(queue.snapshot(10).queue[0].viewerId).toBe('b');
  });

  it('người ngồi ghế không thể xếp hàng lại; bói xong có cooldown', () => {
    const { clock, queue, join, s } = setup();
    join('a');
    expect(join('a').reason).toBe('seated');
    let guard = 0; while (s.getPhase() !== 'IDLE' && guard++ < 300) clock.advance(500);
    expect(join('a').reason).toBe('cooldown');
  });
});

describe('tarot-session: quà khi đang ngồi ghế (D4/D9)', () => {
  it('quà lớn trước khi rút bài: thêm lá, tối đa 3, chỉ 1 lần', () => {
    const { s, clock, join } = setup();
    join('a');
    expect(s.onSeatGift('a', 100)).toEqual({ ok: true, cardsPlanned: 3 });
    expect(s.onSeatGift('a', 100).reason).toBe('already_bonus');
    clock.advance(5000);
    expect(s.getState().cards.length).toBe(3);
  });

  it('quà nhỏ, người khác, hoặc quá muộn đều bị từ chối', () => {
    const { s, clock, join } = setup();
    join('a');
    expect(s.onSeatGift('a', 5).reason).toBe('small_gift');
    expect(s.onSeatGift('zzz', 500).reason).toBe('not_seated');
    clock.advance(5000);
    expect(s.onSeatGift('a', 500).reason).toBe('too_late');
  });
});

describe('tarot-session: điều khiển và khôi phục', () => {
  it('skip kết thúc phiên và gọi người kế tiếp', () => {
    const { s, join } = setup();
    join('a'); join('b');
    expect(s.skip().ok).toBe(true);
    expect(s.getState().seat.viewerId).toBe('b');
    expect(s.skip().ok).toBe(true);
    expect(s.getPhase()).toBe('IDLE');
    expect(s.skip().ok).toBe(false);
  });

  it('stop: phiên đang chạy xong rồi dừng ở IDLE, không gọi người tiếp theo; start gọi lại', () => {
    const { s, clock, join } = setup();
    join('a'); join('b');
    s.stop();
    let guard = 0; while (s.getState().seat && guard++ < 300) clock.advance(500);
    expect(s.getPhase()).toBe('IDLE');
    expect(s.getState().queueTotal).toBe(1);
    s.start();
    expect(s.getState().seat.viewerId).toBe('b');
  });

  it('khôi phục: hàng chờ giữ nguyên, người đang ngồi về đầu hàng, pha IDLE', () => {
    const a = setup();
    a.join('x'); a.join('y'); a.join('z');
    a.clock.advance(7000);
    const saved = JSON.parse(JSON.stringify(a.s.exportState()));
    const b = setup();
    b.s.restore(saved);
    expect(b.s.getPhase()).toBe('IDLE');
    expect(b.s.getState().queue.map((e) => e.viewerId)).toEqual(['x', 'y', 'z']);
    b.s.kick();
    expect(b.s.getState().seat.viewerId).toBe('x');
  });

  it('không còn hẹn giờ treo sau khi phiên kết thúc (không rò)', () => {
    const { s, clock, join } = setup();
    join('a');
    let guard = 0; while (s.getPhase() !== 'IDLE' && guard++ < 300) clock.advance(500);
    expect(clock.pending()).toBe(0);
  });
});

describe('tarot-lobby', () => {
  const lcfg = cfg({ lobbyWindowSec: 300, lobbyMax: 3 });
  it('mới nhất trước, loại trùng, loại người đang trong hàng/ghế, tối đa lobbyMax', () => {
    const l = createLobby(lcfg);
    l.touch(v('a'), 1000); l.touch(v('b'), 2000); l.touch(v('c'), 3000); l.touch(v('d'), 4000); l.touch(v('a'), 5000);
    expect(l.snapshot(6000).map((x) => x.viewerId)).toEqual(['a', 'd', 'c']);
    expect(l.snapshot(6000, new Set(['a'])).map((x) => x.viewerId)).toEqual(['d', 'c', 'b']);
  });
  it('bỏ người quá cửa sổ thời gian', () => {
    const l = createLobby(lcfg);
    l.touch(v('a'), 0); l.touch(v('b'), 290_000);
    expect(l.snapshot(301_000).map((x) => x.viewerId)).toEqual(['b']);
  });
});

describe('tarot-session: chuyển khách (INTERMISSION, đếm ngược trên màn hình)', () => {
  const over = { phaseSec: { CALLING: 5, SHUFFLING: 5, DRAWING: 5, REVEALING: 5, FAREWELL: 5, INTERMISSION: 5 } };
  const runToFarewellEnd = (s, clock) => {
    clock.advance(5000);    // đếm ngược trước người đầu tiên (INTERMISSION từ IDLE)
    clock.advance(15000);   // CALLING + DRAWING + REVEALING (bỏ SHUFFLING mặc định)
    const st = s.getState();
    clock.advance(st.phaseEndsAt - st.phaseStartedAt);   // READING
    clock.advance(5000);    // FAREWELL
  };

  it('hết phiên mà hàng còn người: INTERMISSION ghế trống 5 giây rồi mới CALLING người kế tiếp', () => {
    const { s, clock, join } = setup(over);
    join('a'); join('b');
    runToFarewellEnd(s, clock);
    const st = s.getState();
    expect(st.phase).toBe('INTERMISSION');
    expect(st.seat).toBeNull();
    expect(st.cards).toEqual([]);
    expect(st.phaseEndsAt - st.phaseStartedAt).toBe(5000);
    expect(st.queue.map((e) => e.viewerId)).toEqual(['b']);
    clock.advance(4999);
    expect(s.getPhase()).toBe('INTERMISSION');
    clock.advance(1);
    expect(s.getPhase()).toBe('CALLING');
    expect(s.getState().seat.viewerId).toBe('b');
  });

  it('hàng rỗng khi hết phiên: về IDLE ngay, không đếm ngược', () => {
    const { s, clock, join } = setup(over);
    join('a');
    runToFarewellEnd(s, clock);
    expect(s.getPhase()).toBe('IDLE');
  });

  it('người vào hàng trong lúc đếm ngược không cắt ngang (vẫn chờ hết INTERMISSION)', () => {
    const { s, clock, join } = setup(over);
    join('a'); join('b');
    runToFarewellEnd(s, clock);
    join('c');
    expect(s.getPhase()).toBe('INTERMISSION');
    clock.advance(5000);
    expect(s.getState().seat.viewerId).toBe('b');
  });

  it('người đầu tiên lúc ghế rảnh cũng được đếm ngược trước khi vào bệ, và bị khóa ở ô 1 (quà không chen được)', () => {
    const { s, clock, join, queue } = setup(over);
    join('a');
    expect(s.getPhase()).toBe('INTERMISSION');
    expect(s.getState().seat).toBeNull();
    expect(s.getState().queue[0]).toMatchObject({ viewerId: 'a', locked: true });
    expect(queue.getLockedId()).toBe('a');
    clock.advance(5000);
    expect(s.getPhase()).toBe('CALLING');
    expect(s.getState().seat.viewerId).toBe('a');
  });

  it('tắt phiên trong lúc đếm ngược: hết giờ thì về IDLE, không gọi ai', () => {
    const { s, clock, join } = setup(over);
    join('a'); join('b');
    runToFarewellEnd(s, clock);
    s.stop();
    clock.advance(5000);
    expect(s.getPhase()).toBe('IDLE');
    expect(s.getState().seat).toBeNull();
  });
});

describe('tarot-session: chờ giọng đọc (ttsWaitMaxSec) và bốc bài sớm (drawOnCalling)', () => {
  // TTS giả điều khiển tay: prepare() trả về promise, test tự quyết lúc nào xong.
  function manualTts() {
    const calls = [];
    return {
      calls,
      prepare(lines) { return new Promise((resolve, reject) => calls.push({ lines, resolve, reject })); },
      finish(i = calls.length - 1) { const c = calls[i]; c.resolve({ urls: c.lines.map((_, k) => `/tts-cache/x${k}.wav`), durations: c.lines.map(() => 3) }); },
      fail(i = calls.length - 1) { calls[i].reject(new Error('boom')); }
    };
  }
  const flush = () => new Promise((r) => setTimeout(r, 0));
  const over = { ttsWaitMaxSec: 20 };   // mặc định bỏ SHUFFLING: CALLING 5 → DRAWING 5 → REVEALING 5

  it('drawOnCalling + số lá tối đa: bốc bài và bắt đầu TTS ngay ở CALLING', async () => {
    const tts = manualTts();
    const { s, join } = setup({ drawOnCalling: true, defaultCards: 3, maxCardsPerSession: 3 }, tts);
    join('a');
    await flush();
    expect(s.getPhase()).toBe('CALLING');
    expect(s.getState().cards.length).toBe(3);
    expect(tts.calls.length).toBe(1);
  });

  it('drawOnCalling nhưng còn có thể được thêm lá nhờ quà: vẫn chờ tới DRAWING mới bốc', () => {
    const tts = manualTts();
    const { s, clock, join } = setup({ drawOnCalling: true, defaultCards: 1, maxCardsPerSession: 3 }, tts);
    join('a');
    expect(s.getState().cards).toEqual([]);
    clock.advance(5000);
    expect(s.getPhase()).toBe('DRAWING');
    expect(s.getState().cards.length).toBe(1);
  });

  it('TTS chưa xong khi hết REVEALING: giữ REVEALING, xong lúc nào vào READING lúc đó (đọc trọn từ câu đầu)', async () => {
    const tts = manualTts();
    const { s, clock, join } = setup(over, tts);
    join('a');
    clock.advance(15000);                    // hết CALLING + DRAWING + REVEALING
    await flush();
    expect(s.getPhase()).toBe('REVEALING');
    const st = s.getState();
    expect(st.phaseEndsAt - clock.now()).toBe(20000);   // báo client: chờ tối đa 20 giây
    clock.advance(4000);
    tts.finish();
    await flush();
    expect(s.getPhase()).toBe('READING');
    expect(s.getState().reading.ready).toBe(true);
  });

  it('TTS quá lâu: hết ttsWaitMaxSec thì vẫn vào READING (đọc bằng phụ đề)', () => {
    const tts = manualTts();
    const { s, clock, join } = setup(over, tts);
    join('a');
    clock.advance(15000);
    clock.advance(19999);
    expect(s.getPhase()).toBe('REVEALING');
    clock.advance(1);
    expect(s.getPhase()).toBe('READING');
    expect(s.getState().reading.ready).toBe(false);
  });

  it('TTS lỗi: không chờ, vào READING đúng giờ', async () => {
    const tts = manualTts();
    const { s, clock, join } = setup(over, tts);
    join('a');
    clock.advance(5000);                     // DRAWING: gọi prepare
    await flush();
    tts.fail();
    await flush();
    clock.advance(10000);                    // hết DRAWING + REVEALING
    expect(s.getPhase()).toBe('READING');
  });

  it('TTS xong trước khi hết REVEALING: không chờ thêm', async () => {
    const tts = manualTts();
    const { s, clock, join } = setup(over, tts);
    join('a');
    clock.advance(5000);
    await flush();
    tts.finish();
    await flush();
    clock.advance(10000);
    expect(s.getPhase()).toBe('READING');
  });

  it('ttsWaitMaxSec = 0 (mặc định): hành vi cũ, không chờ', () => {
    const tts = manualTts();
    const { s, clock, join } = setup({}, tts);
    join('a');
    clock.advance(15000);
    expect(s.getPhase()).toBe('READING');
  });
});

describe('tarot-session: chờ người đầu tiên (firstJoinGraceSec)', () => {
  it('người đầu vào lúc rảnh: chờ 5s mới lên ghế', () => {
    const { s, clock, join } = setup({ firstJoinGraceSec: 5 });
    join('a');
    expect(s.getPhase()).toBe('IDLE');
    clock.advance(4900);
    expect(s.getPhase()).toBe('IDLE');
    clock.advance(200);
    expect(s.getPhase()).toBe('CALLING');
    expect(s.getState().seat.viewerId).toBe('a');
  });

  it('trong lúc chờ có người tặng quà: người quà lên ghế ngay', () => {
    const { s, clock, queue, join } = setup({ firstJoinGraceSec: 5, queueOrder: 'lanes' });
    join('a');
    clock.advance(2000);
    queue.boost(v('b'), 100, clock.now());
    s.kick();
    expect(s.getPhase()).toBe('CALLING');
    expect(s.getState().seat.viewerId).toBe('b');
  });

  it('firstJoinGraceSec = 0: mời ngay như cũ', () => {
    const { s, join } = setup({ firstJoinGraceSec: 0 });
    join('a');
    expect(s.getPhase()).toBe('CALLING');
  });
});

describe('tarot-session: xem xong đẩy về cuối hàng (requeueAfterSession)', () => {
  // Thứ tự khách được mời lên ghế trong ~3 phút giả lập (clock giả, không chờ thật).
  const order = (over, ids, sec = 600) => {
    const { s, clock, join, events } = setup(over);
    ids.forEach(join);
    for (let t = 0; t < sec * 2; t++) clock.advance(500);
    return events.filter(([n]) => n === 'session.start').map(([, p]) => p.viewerId);
  };

  it('còn người chờ: người vừa xem xong về cuối hàng (a, b, c, rồi a lại)', () => {
    expect(order({ requeueAfterSession: true, idleAfterSec: 100000 }, ['a', 'b', 'c']).slice(0, 5)).toEqual(['a', 'b', 'c', 'a', 'b']);
  });

  it('tắt cấu hình: mỗi người một lần', () => {
    expect(order({ requeueAfterSession: false }, ['a', 'b', 'c'])).toEqual(['a', 'b', 'c']);
  });

  it('một mình thì không bị xếp lại', () => {
    expect(order({ requeueAfterSession: true, idleAfterSec: 100000 }, ['a'])).toEqual(['a']);
  });

  it('khách im quá idleAfterSec thì không xếp lại', () => {
    expect(order({ requeueAfterSession: true, idleAfterSec: 1 }, ['a', 'b'])).toEqual(['a', 'b']);
  });
});
