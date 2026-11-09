import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createTarotService, parseComment, displayName } = require('../lib/tarot-rpc.js');
const { createTtsProvider, wavDurationSec } = require('../lib/tarot-tts.js');
const { loadDeck } = require('../lib/tarot-deck.js');
const { DEFAULT_CONFIG, validateConfig, mergeConfig } = require('../lib/tarot-config.js');

const deck = loadDeck(path.join(import.meta.dir, '..', 'data', 'tarot', 'cards.json'));
const cfg = (o = {}) => validateConfig(mergeConfig(DEFAULT_CONFIG, o));

function fakeClock(start = 5_000_000) {
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
  const sent = [];
  const svc = createTarotService({
    config: cfg(over), deck, clock, rng: () => 0.37,
    broadcast: (m, p) => sent.push([m, p]),
    sanitizeUserName: (s) => String(s || '').replace(/[^\p{L}\p{N}\s._-]/gu, '').trim() || 'Thí Chủ Hữu Duyên',
    isBlocked: (t) => /địt/i.test(t),
    ...deps
  });
  return { svc, clock, sent };
}

describe('parseComment', () => {
  const c = cfg();
  it('khớp từ khóa, không phân biệt hoa thường', () => {
    expect(parseComment('Mình muốn BÓI nha', c).match).toBe(true);
    expect(parseComment('xem bài giúp mình', c).match).toBe(true);
    expect(parseComment('+1', c).match).toBe(true);
    expect(parseComment('Tarot', c).match).toBe(true);
  });
  it('không khớp bình luận thường, "+1" lẫn trong câu không tính', () => {
    expect(parseComment('chào mọi người', c).match).toBe(false);
    expect(parseComment('giá 3+10 nhé', c).match).toBe(false);
    expect(parseComment('', c).match).toBe(false);
  });
  it('nhận chủ đề', () => {
    expect(parseComment('bói tình yêu', c)).toEqual({ match: true, topic: 'love' });
    expect(parseComment('tarot công việc', c).topic).toBe('career');
    expect(parseComment('bói', c).topic).toBe('general');
  });
});

describe('displayName', () => {
  const san = (s) => String(s);
  it('cắt 14 ký tự, bỏ link và số điện thoại', () => {
    expect(Array.from(displayName('A'.repeat(30), san)).length).toBe(14);
    expect(displayName('Lan 0912345678', san)).toBe('Lan');
    expect(displayName('Mai http://x.vn/abc', san)).toBe('Mai');
  });
  it('tên rỗng sau khi lọc dùng tên mặc định', () => {
    expect(displayName('0912345678', san)).toBe('Bạn hữu duyên');
  });
});

describe('tarot rpc: bình luận và quà', () => {
  it('bình luận có từ khóa thì vào hàng và bắt đầu phiên; bình luận thường chỉ vào sảnh', async () => {
    const { svc } = make();
    expect((await svc.rpc('tarot.simulateComment', { name: 'An', text: 'xin chào' })).joined).toBe(false);
    expect(svc.getState().lobby.map((x) => x.name)).toEqual(['An']);
    const r = await svc.rpc('tarot.simulateComment', { name: 'An', text: 'bói giúp mình' });
    expect(r.joined).toBe(true);
    const st = svc.getState();
    expect(st.phase).toBe('CALLING');
    expect(st.seat.name).toBe('An');
    expect(st.lobby).toEqual([]);   // đã vào ghế nên rời sảnh
  });

  it('bình luận độc hại bị chặn và không vào hàng', async () => {
    const { svc } = make();
    const r = await svc.rpc('tarot.simulateComment', { name: 'X', text: 'địt bói' });
    expect(r.reason).toBe('blocked');
    expect(svc.getState().queueTotal).toBe(0);
  });

  it('người chưa trong hàng tặng quà thì vào làn quà và nhảy bậc', async () => {
    const { svc } = make();
    for (let i = 0; i < 8; i++) await svc.rpc('tarot.simulateComment', { name: `U${i}`, text: 'bói' });
    const r = await svc.rpc('tarot.simulateGift', { name: 'Vip', giftName: 'Rose', coins: 10 });
    expect(r.ok).toBe(true);
    expect(r.joined).toBe(true);
    expect(r.jumped).toBe(3);
    const q = svc.getState().queue;
    expect(q.some((e) => e.name === 'Vip' && e.lane === 'gift')).toBe(true);
  });

  it('repeat nhân số xu: 5 xu x 2 = 10 xu → mức vừa', async () => {
    const { svc } = make();
    for (let i = 0; i < 8; i++) await svc.rpc('tarot.simulateComment', { name: `U${i}`, text: 'bói' });
    const r = await svc.rpc('tarot.simulateGift', { name: 'Vip', giftName: 'Rose', coins: 5, repeat: 2 });
    expect(r.tier).toBe('medium');
  });

  it('quà khi đang ngồi ghế: không vào hàng, quà lớn thêm lá', async () => {
    const { svc } = make();
    await svc.rpc('tarot.simulateComment', { name: 'An', text: 'bói' });
    const r = await svc.rpc('tarot.simulateGift', { name: 'An', coins: 200 });
    expect(r.seated).toBe(true);
    expect(r.bonus.ok).toBe(true);
    expect(svc.getState().seat.cardsPlanned).toBe(3);
    expect(svc.getState().queueTotal).toBe(0);
  });

  it('phát tarot.state, tarot.queue, tarot.phase, tarot.reaction', async () => {
    const { svc, sent } = make();
    await svc.rpc('tarot.simulateComment', { name: 'An', text: 'bói' });
    await svc.rpc('tarot.simulateGift', { name: 'Bo', coins: 1 });
    const kinds = new Set(sent.map((x) => x[0]));
    for (const k of ['tarot.state', 'tarot.queue', 'tarot.phase', 'tarot.reaction']) expect(kinds.has(k)).toBe(true);
    const q = sent.find((x) => x[0] === 'tarot.queue' && x[1].reason.startsWith('gift:'));
    expect(q).toBeTruthy();
  });

  it('người vừa bói xong phải đợi cooldown mới vào lại bằng bình luận', async () => {
    const { svc, clock } = make();
    await svc.rpc('tarot.simulateComment', { name: 'An', text: 'bói' });
    clock.advance(60_000);
    expect(svc.getState().phase).toBe('IDLE');
    const r = await svc.rpc('tarot.simulateComment', { name: 'An', text: 'bói' });
    expect(r.reason).toBe('cooldown');
  });
});

describe('tarot rpc: tham số, quản trị, giới hạn', () => {
  it('kiểm tra tham số và phương thức lạ', async () => {
    const { svc } = make();
    await expect(svc.rpc('tarot.simulateComment', { name: 'A' })).rejects.toThrow('text');
    await expect(svc.rpc('tarot.boost', {})).rejects.toThrow('viewerId');
    await expect(svc.rpc('tarot.khong-co', {})).rejects.toThrow();
    await expect(svc.rpc('tarot.getState', null)).rejects.toThrow();
  });

  it('có ADMIN_TOKEN: phương thức quản trị cần token đúng, getState thì không', async () => {
    const { svc } = make({}, { env: { ADMIN_TOKEN: 's3cret' } });
    await expect(svc.rpc('tarot.skip', {})).rejects.toThrow('token');
    await expect(svc.rpc('tarot.simulateComment', { name: 'A', text: 'bói' })).rejects.toThrow('token');
    await expect(svc.rpc('tarot.stop', { token: 'sai' })).rejects.toThrow('token');
    expect((await svc.rpc('tarot.simulateComment', { name: 'A', text: 'bói', token: 's3cret' })).joined).toBe(true);
    expect((await svc.rpc('tarot.getState', {})).phase).toBe('CALLING');
  });

  it('production không có token: khóa mọi phương thức quản trị và simulate', async () => {
    const { svc } = make({}, { env: { NODE_ENV: 'production' } });
    await expect(svc.rpc('tarot.simulateGift', { name: 'A', coins: 5 })).rejects.toThrow('production');
    await expect(svc.rpc('tarot.setConfig', { config: {} })).rejects.toThrow('production');
    expect((await svc.rpc('tarot.getState', {})).phase).toBe('IDLE');
  });

  it('giới hạn tốc độ tarot.join: 60 lần mỗi 10 giây', async () => {
    const { svc, clock } = make();
    for (let i = 0; i < 60; i++) await svc.rpc('tarot.join', { viewerId: `v${i}`, name: `V${i}` });
    await expect(svc.rpc('tarot.join', { viewerId: 'vx', name: 'X' })).rejects.toThrow('Quá nhiều');
    clock.advance(10_001);
    await expect(svc.rpc('tarot.join', { viewerId: 'vy', name: 'Y' })).resolves.toBeTruthy();
  });

  it('setConfig đổi cấu hình trong phiên và từ chối giá trị sai', async () => {
    const { svc } = make();
    await svc.rpc('tarot.setConfig', { config: { defaultCards: 3 } });
    await svc.rpc('tarot.simulateComment', { name: 'A', text: 'bói' });
    expect(svc.getState().seat.cardsPlanned).toBe(3);
    await expect(svc.rpc('tarot.setConfig', { config: { reversedChance: 5 } })).rejects.toThrow();
  });

  it('remove, skip, stop, start', async () => {
    const { svc } = make();
    await svc.rpc('tarot.simulateComment', { name: 'A', text: 'bói' });
    await svc.rpc('tarot.simulateComment', { name: 'B', text: 'bói' });
    await svc.rpc('tarot.simulateComment', { name: 'C', text: 'bói' });
    expect((await svc.rpc('tarot.remove', { viewerId: 'sim:C' })).ok).toBe(true);
    expect(svc.getState().queueTotal).toBe(1);
    expect((await svc.rpc('tarot.skip', {})).ok).toBe(true);
    expect(svc.getState().seat.name).toBe('B');
    await svc.rpc('tarot.stop', {});
    expect(svc.getState().enabled).toBe(false);
    await svc.rpc('tarot.start', {});
    expect(svc.getState().enabled).toBe(true);
  });
});

describe('tarot rpc: lưu và khôi phục', () => {
  it('lưu trạng thái (debounce) và khởi động lại không mất hàng chờ', async () => {
    let saved = null;
    const a = make({}, { persist: (s) => { saved = JSON.parse(JSON.stringify(s)); } });
    for (const n of ['A', 'B', 'C']) await a.svc.rpc('tarot.simulateComment', { name: n, text: 'bói' });
    a.clock.advance(1000);
    expect(saved).not.toBeNull();
    const b = make({}, { loadSaved: () => saved });
    b.svc.boot();
    const st = b.svc.getState();
    expect(st.seat.name).toBe('A');                       // người dở dang được gọi lại đầu tiên
    expect(st.queue.map((e) => e.name)).toEqual(['B', 'C']);
  });
});

describe('tarot-tts', () => {
  it('wavDurationSec đọc đúng thời lượng từ tiêu đề WAV', () => {
    const rate = 16000; const secs = 2;
    const data = Buffer.alloc(rate * 2 * secs);
    const head = Buffer.alloc(44);
    head.write('RIFF', 0); head.writeUInt32LE(36 + data.length, 4); head.write('WAVE', 8);
    head.write('fmt ', 12); head.writeUInt32LE(16, 16); head.writeUInt16LE(1, 20); head.writeUInt16LE(1, 22);
    head.writeUInt32LE(rate, 24); head.writeUInt32LE(rate * 2, 28); head.writeUInt16LE(2, 32); head.writeUInt16LE(16, 34);
    head.write('data', 36); head.writeUInt32LE(data.length, 40);
    const f = path.join(os.tmpdir(), `tarot-test-${process.pid}.wav`);
    fs.writeFileSync(f, Buffer.concat([head, data]));
    expect(wavDurationSec(f)).toBe(2);
    fs.unlinkSync(f);
    expect(wavDurationSec(f)).toBe(null);
  });

  it('prepare gom url và thời lượng; trả null nếu một câu lỗi', async () => {
    const ok = createTtsProvider({ synthesize: async (t) => ({ ok: true, url: `/tts-cache/${t.length}.wav`, durationSec: 2.5, cached: true }), cacheDir: os.tmpdir() });
    expect(await ok.prepare(['aa', 'bbb'])).toEqual({ urls: ['/tts-cache/2.wav', '/tts-cache/3.wav'], durations: [2.5, 2.5] });
    const bad = createTtsProvider({ synthesize: async () => ({ ok: false, error: 'x' }), cacheDir: os.tmpdir() });
    expect(await bad.prepare(['aa'])).toBe(null);
  });
});
