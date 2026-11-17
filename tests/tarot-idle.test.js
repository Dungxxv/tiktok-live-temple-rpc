// Phát hiện người "có thể đã rời phòng" (TikTok không báo sự kiện rời) qua việc không hoạt động; admin xem và xóa.
import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createTarotService } = require('../lib/tarot-rpc.js');
const { loadDeck } = require('../lib/tarot-deck.js');
const { DEFAULT_CONFIG, validateConfig, mergeConfig } = require('../lib/tarot-config.js');

const deck = loadDeck(path.join(import.meta.dir, '..', 'data', 'tarot', 'cards.json'));
const cfg = (o = {}) => validateConfig(mergeConfig(DEFAULT_CONFIG, { queueOrder: 'lanes', joinOnEnter: true, idleAfterSec: 600, ...o }));

function fakeClock(start = 1_000_000_000) {
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
  const svc = createTarotService({ config: cfg(over), deck, clock, rng: () => 0.4, sanitizeUserName: (s) => String(s || '').trim(), ...deps });
  svc.session.stop();   // giữ mọi người ở trong hàng, không ai lên ghế
  const enter = (n) => svc.noteActivity({ viewerId: n, name: n });
  const q = () => svc.rpc('tarot.getQueue').then((r) => r.queue);
  return { svc, clock, enter, q };
}

describe('tarot-idle: nhận biết người không hoạt động', () => {
  it('tarot.getQueue trả về TOÀN BỘ hàng (không chỉ 21 người đầu) kèm số giây không hoạt động', async () => {
    const { svc, clock, enter } = make({ queueVisible: 3 });
    for (let i = 0; i < 8; i++) enter(`K${i}`);
    clock.advance(65_000);
    const r = await svc.rpc('tarot.getQueue');
    expect(r.total).toBe(8);
    expect(r.queue.length).toBe(8);
    expect(r.queue[0].idleSec).toBe(65);
    expect(r.idleAfterSec).toBe(600);
    expect(svc.getState().queue.length).toBe(3);   // màn live vẫn chỉ hiện số ô quy định
    expect(svc.getState().queue[0].idleSec).toBe(65);
  });

  it('thả tim / chia sẻ (touch) làm người đó hết "không hoạt động"; không tự đưa họ vào hàng', async () => {
    const { svc, clock, enter, q } = make();
    enter('An'); enter('Bình');
    clock.advance(700_000);
    expect(svc.touch({ viewerId: 'An', name: 'An' })).toMatchObject({ ok: true, queued: true });
    expect(svc.touch({ viewerId: 'Lạ', name: 'Lạ' })).toMatchObject({ ok: true, queued: false });
    const list = await q();
    expect(list.find((e) => e.viewerId === 'An').idleSec).toBe(0);
    expect(list.find((e) => e.viewerId === 'Bình').idleSec).toBe(700);
    expect(list.find((e) => e.viewerId === 'Lạ')).toBeUndefined();
  });

  it('bình luận và tặng quà cũng đặt lại mốc hoạt động', async () => {
    const { svc, clock, enter, q } = make({ commentStarCooldownSec: 0 });
    enter('An'); enter('Bình');
    clock.advance(900_000);
    svc.onComment({ viewerId: 'An', name: 'An', text: 'xin chào' });
    svc.onGift({ viewerId: 'Bình', name: 'Bình', coins: 1, giftName: 'Rose' });
    for (const e of await q()) expect(e.idleSec).toBe(0);
  });

  it('người vào phòng lại (sự kiện vào phòng) cũng được coi là đang hoạt động', async () => {
    const { svc, clock, enter, q } = make();
    enter('An');
    clock.advance(800_000);
    enter('An');
    expect((await q())[0].idleSec).toBe(0);
  });

  it('tarot.removeIdle xóa người không hoạt động quá ngưỡng, giữ người còn hoạt động và người đã bị khóa', async () => {
    const { svc, clock, enter, q } = make();
    enter('Cũ1'); enter('Cũ2'); enter('Mới');
    clock.advance(700_000);
    svc.touch({ viewerId: 'Mới', name: 'Mới' });
    svc.queue.lockNext();   // người đầu hàng (Cũ1) sắp vào ghế → không được xóa
    const r = await svc.rpc('tarot.removeIdle', {});
    expect(r).toMatchObject({ ok: true, removed: 1, names: ['Cũ2'] });
    expect((await q()).map((e) => e.viewerId).sort()).toEqual(['Cũ1', 'Mới']);
  });

  it('removeIdle có thể đặt ngưỡng riêng; ngưỡng không hợp lệ bị từ chối', async () => {
    const { svc, clock, enter, q } = make();
    enter('A'); clock.advance(120_000); enter('B');
    expect((await svc.rpc('tarot.removeIdle', { minIdleSec: 60 })).removed).toBe(1);
    expect((await q()).map((e) => e.viewerId)).toEqual(['B']);
    await expect(svc.rpc('tarot.removeIdle', { minIdleSec: 0 })).rejects.toThrow();
  });

  it('removeIdle là lệnh quản trị: cần token khi server đặt ADMIN_TOKEN', async () => {
    const { svc, enter } = make({}, { env: { ADMIN_TOKEN: 'k' } });
    enter('A');
    await expect(svc.rpc('tarot.removeIdle', {})).rejects.toThrow();
    expect((await svc.rpc('tarot.removeIdle', { token: 'k', minIdleSec: 1 })).ok).toBe(true);
  });

  it('mốc hoạt động được lưu: sau khởi động lại người chờ lâu vẫn bị tính là không hoạt động', async () => {
    let saved = null;
    const a = make({}, { persist: (s) => { saved = JSON.parse(JSON.stringify(s)); } });
    a.enter('An');
    a.clock.advance(1000);
    const b = make({}, { loadSaved: () => saved });
    b.svc.boot();
    b.svc.session.stop();
    b.clock.advance(2_000_000);   // máy chạy lại sau một thời gian dài
    expect((await b.q())[0].idleSec).toBeGreaterThan(600);
  });

  it('idleAfterSec = 0 là hợp lệ (tắt nhãn); số âm bị từ chối', () => {
    expect(() => cfg({ idleAfterSec: 0 })).not.toThrow();
    expect(() => cfg({ idleAfterSec: -1 })).toThrow();
  });
});
