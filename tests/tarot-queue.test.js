import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createQueue } = require('../lib/tarot-queue.js');
const { DEFAULT_CONFIG, mergeConfig, validateConfig } = require('../lib/tarot-config.js');

const cfg = (o = {}) => validateConfig(mergeConfig(DEFAULT_CONFIG, o));
const v = (id, extra = {}) => ({ viewerId: id, name: `Người ${id}`, avatar: '', ...extra });
const ids = (q) => q.snapshot(50).queue.map((e) => e.viewerId);
const load = (q, rows) => q.importState({
  entries: rows.map(([viewerId, lane], i) => ({ viewerId, name: viewerId, avatar: '', lane, topic: 'general', joinedAt: i + 1, boost: 0 })),
  served: {}, giftStreak: 0, lockedId: null
});
const fill = (q, n, now = 0) => { for (let i = 1; i <= n; i++) q.join(v(`u${i}`), now + i); };

describe('tarot-queue: vào hàng', () => {
  it('xếp theo thứ tự vào, cuối hàng', () => {
    const q = createQueue(cfg());
    expect(q.join(v('a'), 1)).toEqual({ ok: true, position: 1 });
    expect(q.join(v('b'), 2)).toEqual({ ok: true, position: 2 });
    expect(ids(q)).toEqual(['a', 'b']);
  });

  it('mỗi người tối đa 1 chỗ (hàng và ghế)', () => {
    const q = createQueue(cfg());
    q.join(v('a'), 1);
    expect(q.join(v('a'), 2).reason).toBe('already');
    q.popNext();
    expect(q.getSeatId()).toBe('a');
    expect(q.join(v('a'), 3).reason).toBe('seated');
    expect(q.boost(v('a'), 5, 3).reason).toBe('seated');
  });

  it('cooldown sau khi bói xong chỉ chặn làn miễn phí, quà vẫn vào được', () => {
    const q = createQueue(cfg({ rejoinCooldownSec: 600 }));
    q.join(v('a'), 0);
    q.popNext();
    q.endSeat(1000);
    expect(q.join(v('a'), 2000).reason).toBe('cooldown');
    expect(q.boost(v('a'), 1, 2000).ok).toBe(true);
    q.remove('a');
    expect(q.join(v('a'), 1000 + 600 * 1000).ok).toBe(true);
  });

  it('từ chối khi hàng đầy (queueMax)', () => {
    const q = createQueue(cfg({ queueMax: 2 }));
    q.join(v('a'), 1); q.join(v('b'), 2);
    expect(q.join(v('c'), 3).reason).toBe('full');
    expect(q.boost(v('c'), 5, 3).reason).toBe('full');
  });

  it('từ chối dữ liệu không hợp lệ', () => {
    const q = createQueue(cfg());
    expect(q.join({}, 1).reason).toBe('invalid');
    expect(q.boost(null, 5, 1).reason).toBe('invalid');
    expect(q.boost(v('a'), 0, 1).reason).toBe('no_tier');
  });
});

describe('tarot-queue: nhảy bậc bằng quà', () => {
  it('đúng bảng mức quà: nhỏ +1, vừa +3, lớn +5', () => {
    const q = createQueue(cfg());
    fill(q, 20);
    expect(q.boost(v('u20'), 5, 100).jumped).toBe(1);
    expect(q.boost(v('u10'), 10, 100).jumped).toBe(3);
    expect(q.boost(v('u15'), 99, 100).jumped).toBe(5);
  });

  it('người ngoài hàng tặng quà: vào làn quà rồi nhảy', () => {
    const q = createQueue(cfg());
    fill(q, 10);
    const r = q.boost(v('newbie'), 10, 100);
    expect(r).toMatchObject({ ok: true, joined: true, from: 10, to: 7, jumped: 3 });
    expect(ids(q).indexOf('newbie')).toBe(7);
    expect(q.snapshot(50).queue[7].lane).toBe('gift');
  });

  it('không nhảy quá đầu hàng', () => {
    const q = createQueue(cfg());
    fill(q, 3);
    expect(q.boost(v('u2'), 99, 100)).toMatchObject({ from: 1, to: 0, jumped: 1 });
  });

  it('trần mỗi quà: tier tự cấu hình lớn hơn vẫn bị cắt ở maxJumpPerGift', () => {
    const q = createQueue(cfg({
      giftTiers: [{ name: 'x', minCoins: 1, maxCoins: null, jump: 9 }], maxJumpPerGift: 5
    }));
    fill(q, 30);
    expect(q.boost(v('u30'), 1, 100).jumped).toBe(5);
  });

  it('trần 60 giây: tổng nhảy không quá 10, hết cửa sổ thì nhảy lại được', () => {
    const q = createQueue(cfg());
    fill(q, 40);
    expect(q.boost(v('u40'), 99, 1000).jumped).toBe(5);
    expect(q.boost(v('u40'), 99, 2000).jumped).toBe(5);
    expect(q.boost(v('u40'), 99, 3000).jumped).toBe(0);
    expect(q.boost(v('u40'), 99, 1000 + 60000).jumped).toBe(5);   // log t=1000 hết hạn, còn t=2000 (5 bậc) nên được thêm 5
  });

  it('mức rất lớn lên vị trí thứ 2, bất kể xa bao nhiêu, không bị trần', () => {
    const q = createQueue(cfg());
    fill(q, 50);
    expect(q.boost(v('u50'), 100, 100)).toMatchObject({ from: 49, to: 1, jumped: 48 });
    expect(ids(q).slice(0, 3)).toEqual(['u1', 'u50', 'u2']);
  });

  it('mức rất lớn khi đã ở vị trí 1 hoặc 2 thì không bị đẩy xuống', () => {
    const q = createQueue(cfg());
    fill(q, 5);
    expect(q.boost(v('u1'), 100, 1).jumped).toBe(0);
    expect(ids(q)[0]).toBe('u1');
    expect(q.boost(v('u2'), 100, 1).jumped).toBe(0);
  });

  it('người bị khóa không bị vượt', () => {
    const q = createQueue(cfg());
    fill(q, 10);
    q.lockNext();
    expect(q.getLockedId()).toBe('u1');
    expect(q.boost(v('u3'), 99, 100)).toMatchObject({ to: 1 });
    expect(ids(q)[0]).toBe('u1');
    expect(q.boost(v('u10'), 100, 100).to).toBe(1);
    expect(ids(q)[0]).toBe('u1');
    expect(q.boost(v('u1'), 99, 100).jumped).toBe(0);
  });

  it('quà biến người ở làn miễn phí thành làn quà và cộng dồn boost', () => {
    const q = createQueue(cfg());
    fill(q, 10);
    q.boost(v('u10'), 5, 100);
    q.boost(v('u9'), 5, 100);
    const e = q.snapshot(50).queue.find((x) => x.viewerId === 'u10');
    expect(e.lane).toBe('gift');
    expect(e.boost).toBe(1);
  });
});

describe('tarot-queue: gọi người kế tiếp', () => {
  it('popNext lấy đúng thứ tự và đặt vào ghế', () => {
    const q = createQueue(cfg());
    fill(q, 3);
    expect(q.popNext().viewerId).toBe('u1');
    expect(q.getSeatId()).toBe('u1');
    expect(q.popNext().viewerId).toBe('u2');
    expect(q.popNext().viewerId).toBe('u3');
    expect(q.popNext()).toBe(null);
  });

  it('giữ chỗ miễn phí: sau 3 phiên làn quà, phiên thứ 4 lấy người miễn phí lâu nhất', () => {
    const q = createQueue(cfg({ freeReserveEvery: 4 }));
    load(q, [['g1', 'gift'], ['g2', 'gift'], ['g3', 'gift'], ['g4', 'gift'], ['f1', 'free'], ['f2', 'free']]);
    const order = [];
    for (let i = 0; i < 6; i++) order.push(q.popNext().viewerId);
    expect(order).toEqual(['g1', 'g2', 'g3', 'f1', 'g4', 'f2']);
  });

  it('giữ chỗ miễn phí không làm gì khi làn miễn phí rỗng', () => {
    const q = createQueue(cfg());
    load(q, [['g1', 'gift'], ['g2', 'gift'], ['g3', 'gift'], ['g4', 'gift'], ['g5', 'gift']]);
    const order = [];
    for (let i = 0; i < 5; i++) order.push(q.popNext().viewerId);
    expect(order).toEqual(['g1', 'g2', 'g3', 'g4', 'g5']);
  });

  it('lockNext áp dụng cả giữ chỗ miễn phí: người bị khóa là người miễn phí khi tới lượt', () => {
    const q = createQueue(cfg());
    load(q, [['g1', 'gift'], ['g2', 'gift'], ['g3', 'gift'], ['g4', 'gift'], ['f1', 'free']]);
    q.popNext(); q.popNext(); q.popNext();
    expect(q.lockNext().viewerId).toBe('f1');
    expect(ids(q)[0]).toBe('f1');
    expect(q.popNext().viewerId).toBe('f1');
  });

  it('remove xóa khỏi hàng và mở khóa nếu là người bị khóa', () => {
    const q = createQueue(cfg());
    fill(q, 3);
    q.lockNext();
    expect(q.remove('u1')).toBe(true);
    expect(q.getLockedId()).toBe(null);
    expect(q.remove('khong-co')).toBe(false);
  });
});

describe('tarot-queue: snapshot và khôi phục', () => {
  it('snapshot giới hạn 6 slot và đếm số còn lại', () => {
    const q = createQueue(cfg());
    fill(q, 10);
    const s = q.snapshot();
    expect(s.queue.length).toBe(6);
    expect(s.queueMore).toBe(4);
    expect(s.queueTotal).toBe(10);
  });

  it('exportState/importState giữ nguyên hàng chờ, cooldown và bộ đếm giữ chỗ', () => {
    const q = createQueue(cfg());
    fill(q, 4);
    q.popNext(); q.endSeat(5000);
    q.lockNext();
    const saved = JSON.parse(JSON.stringify(q.exportState()));
    const q2 = createQueue(cfg());
    q2.importState(saved);
    expect(ids(q2)).toEqual(['u2', 'u3', 'u4']);
    expect(q2.getLockedId()).toBe('u2');
    expect(q2.join(v('u1'), 6000).reason).toBe('cooldown');
    expect(q2.getSeatId()).toBe(null);
  });

  it('requeueFront đưa người phiên dở dang về đầu hàng', () => {
    const q = createQueue(cfg());
    fill(q, 2);
    const e = q.popNext();
    q.endSeat(1);
    q.requeueFront(e);
    expect(ids(q)).toEqual(['u1', 'u2']);
  });
});

describe('tarot-config', () => {
  it('từ chối cấu hình sai', () => {
    expect(() => validateConfig(mergeConfig(DEFAULT_CONFIG, { reversedChance: 2 }))).toThrow();
    expect(() => validateConfig(mergeConfig(DEFAULT_CONFIG, { queueMax: 0 }))).toThrow();
    expect(() => validateConfig(mergeConfig(DEFAULT_CONFIG, { keywords: [] }))).toThrow();
  });

  it('gộp sâu và bỏ qua khóa bắt đầu bằng _', () => {
    const c = mergeConfig(DEFAULT_CONFIG, { phaseSec: { CALLING: 3 }, _note: 'x' });
    expect(c.phaseSec.CALLING).toBe(3);
    expect(c.phaseSec.DRAWING).toBe(5);
    expect(c._note).toBeUndefined();
  });
});

describe('tarot-queue: tổng xu đã tặng (hiển thị ô "100⭐" trong hàng chờ)', () => {
  it('cộng dồn xu qua nhiều lần tặng, người chỉ bình luận có 0 xu', () => {
    const q = createQueue(cfg());
    q.join(v('a'), 1);
    q.join(v('b'), 2);
    q.boost(v('b'), 10, 3);
    q.boost(v('b'), 5, 4);
    q.boost(v('c'), 1, 5);
    const byId = Object.fromEntries(q.snapshot(50).queue.map((e) => [e.viewerId, e.coins]));
    expect(byId).toEqual({ a: 0, b: 15, c: 1 });
  });

  it('trạng thái cũ chưa có trường coins vẫn hiển thị 0', () => {
    const q = createQueue(cfg());
    load(q, [['x', 'free']]);
    expect(q.snapshot(50).queue[0].coins).toBe(0);
  });
});

describe('tarot-queue: luật sao (queueOrder = "stars")', () => {
  const sc = (o = {}) => cfg({ queueOrder: 'stars', ...o });
  const stars = (q) => Object.fromEntries(q.snapshot(50).queue.map((e) => [e.viewerId, e.stars]));

  it('bình luận vào hàng được 1 sao; bằng sao thì ai vào trước đứng trước', () => {
    const q = createQueue(sc());
    expect(q.join(v('a'), 1)).toMatchObject({ ok: true, position: 1, stars: 1 });
    expect(q.join(v('b'), 2)).toMatchObject({ ok: true, position: 2, stars: 1 });
    expect(ids(q)).toEqual(['a', 'b']);
    expect(stars(q)).toEqual({ a: 1, b: 1 });
  });

  it('bình luận lại khi đã trong hàng không cộng thêm sao', () => {
    const q = createQueue(sc());
    q.join(v('a'), 1);
    expect(q.join(v('a'), 2).reason).toBe('already');
    expect(stars(q).a).toBe(1);
  });

  it('quà cộng sao = xu × 10 (hoa hồng 1 xu → 10 sao) và đẩy lên theo tổng sao', () => {
    const q = createQueue(sc());
    q.join(v('a'), 1); q.join(v('b'), 2); q.join(v('c'), 3);
    const r = q.boost(v('c'), 1, 4, 'Rose');
    expect(r).toMatchObject({ ok: true, joined: false, from: 2, to: 0, jumped: 2, stars: 10, totalStars: 11 });
    expect(ids(q)).toEqual(['c', 'a', 'b']);
    q.boost(v('b'), 5, 5, 'Finger Heart');   // 50 sao → 51 > 11
    expect(ids(q)).toEqual(['b', 'c', 'a']);
    expect(stars(q)).toEqual({ b: 51, c: 11, a: 1 });
  });

  it('nhiều sao xếp trước; bằng sao thì ai VÀO HÀNG trước đứng trước (không tính lúc tặng)', () => {
    const q = createQueue(sc());
    q.join(v('a'), 1); q.join(v('b'), 2);
    q.boost(v('b'), 1, 3); q.boost(v('a'), 1, 4);   // cả hai 11 sao, a vào hàng trước
    expect(ids(q)).toEqual(['a', 'b']);
  });

  it('chỉ tặng quà (không bình luận) cũng vào hàng, sao = sao của quà', () => {
    const q = createQueue(sc());
    q.join(v('a'), 1);
    const r = q.boost(v('g'), 99, 2, 'Cap');
    expect(r).toMatchObject({ ok: true, joined: true, to: 0, stars: 990 });
    expect(stars(q)).toEqual({ g: 990, a: 1 });
    expect(q.snapshot(50).queue[0].lane).toBe('gift');
  });

  it('bảng giftStars ghi đè số sao theo tên quà (không phân biệt hoa thường)', () => {
    const q = createQueue(sc({ giftStars: { 'Ice Cream Cone': 25 } }));
    q.join(v('a'), 1);
    expect(q.boost(v('a'), 1, 2, 'ice cream cone').stars).toBe(25);
    expect(q.boost(v('a'), 1, 3, 'Rose').stars).toBe(10);
  });

  it('không ai vượt được người đã khóa (sắp vào ghế), kể cả tặng quà lớn', () => {
    const q = createQueue(sc());
    q.join(v('a'), 1); q.join(v('b'), 2);
    q.lockNext();
    q.boost(v('b'), 99, 3);
    expect(ids(q)).toEqual(['a', 'b']);
    expect(q.popNext().viewerId).toBe('a');
  });

  it('luôn gọi người nhiều sao nhất (không giữ chỗ cho làn miễn phí)', () => {
    const q = createQueue(sc({ freeReserveEvery: 2 }));
    q.join(v('a'), 1);
    q.boost(v('g1'), 1, 2); q.boost(v('g2'), 1, 3);
    expect(q.popNext().viewerId).toBe('g1');
    q.endSeat(10);
    expect(q.popNext().viewerId).toBe('g2');
  });

  it('khôi phục trạng thái cũ chưa có sao: mỗi người coi như 1 sao, giữ thứ tự', () => {
    const q = createQueue(sc());
    load(q, [['x', 'free'], ['y', 'free']]);
    expect(stars(q)).toEqual({ x: 1, y: 1 });
    expect(ids(q)).toEqual(['x', 'y']);
  });

  it('cấu hình sai queueOrder bị từ chối', () => {
    expect(() => cfg({ queueOrder: 'random' })).toThrow();
  });
});
