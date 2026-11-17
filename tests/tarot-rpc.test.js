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

describe('tarot-tts: chờ bộ đọc nạp xong', () => {
  it('worker đang "loading" thì thử lại tới khi sẵn sàng, không báo lỗi', async () => {
    let n = 0;
    const synth = async (t) => (++n < 3 ? { ok: false, error: 'ZeroTTS đang ở trạng thái: loading' } : { ok: true, url: `/tts-cache/${t.length}.wav`, durationSec: 2, cached: true });
    const p = createTtsProvider({ synthesize: synth, cacheDir: os.tmpdir(), sleep: async () => {} });
    const r = await p.prepare(['Câu một.']);
    expect(r).toEqual({ urls: ['/tts-cache/8.wav'], durations: [2] });
    expect(n).toBe(3);
  });

  it('chờ quá maxWaitMs thì bỏ cuộc (trả null)', async () => {
    let n = 0;
    const p = createTtsProvider({ synthesize: async () => { n++; return { ok: false, error: 'loading' }; }, cacheDir: os.tmpdir(), retryMs: 1000, maxWaitMs: 3000, sleep: async () => {} });
    expect(await p.prepare(['Câu.'])).toBeNull();
    expect(n).toBe(4);
  });

  it('lỗi khác (không phải đang nạp) thì không thử lại', async () => {
    let n = 0;
    const p = createTtsProvider({ synthesize: async () => { n++; return { ok: false, error: 'text rỗng' }; }, cacheDir: os.tmpdir(), sleep: async () => {} });
    expect(await p.prepare(['Câu.'])).toBeNull();
    expect(n).toBe(1);
  });
});

describe('tarot.setAudio: bật/tắt nhạc nền và giọng đọc từ trang admin', () => {
  it('mặc định nhạc + giọng bật; đổi được, âm lượng kẹp trong [0,1], phát lại trạng thái cho màn live', async () => {
    const { svc, sent } = make();
    expect(svc.getState().audio).toMatchObject({ musicOn: true, voiceOn: true });
    const r = await svc.rpc('tarot.setAudio', { audio: { musicOn: false, voiceVolume: 3, musicVolume: -1 } });
    expect(r.audio).toMatchObject({ musicOn: false, voiceOn: true, voiceVolume: 1, musicVolume: 0 });
    expect(svc.getState().audio.musicOn).toBe(false);
    expect(sent.some(([m, p]) => m === 'tarot.state' && p.audio?.musicOn === false)).toBe(true);
  });

  it('hiệu ứng âm thanh: mặc định bật 40%, tắt được, âm lượng kẹp trong [0,1]', async () => {
    const { svc } = make();
    expect(svc.getState().audio).toMatchObject({ sfxOn: true, sfxVolume: 0.4 });
    const r = await svc.rpc('tarot.setAudio', { audio: { sfxOn: false, sfxVolume: 2 } });
    expect(r.audio).toMatchObject({ sfxOn: false, sfxVolume: 1, musicOn: true });
  });

  it('là phương thức quản trị: cần token khi server đặt ADMIN_TOKEN', async () => {
    const { svc } = make({}, { env: { ADMIN_TOKEN: 'k' } });
    await expect(svc.rpc('tarot.setAudio', { audio: { voiceOn: false } })).rejects.toThrow();
    expect((await svc.rpc('tarot.setAudio', { audio: { voiceOn: false }, token: 'k' })).audio.voiceOn).toBe(false);
  });

  it('cài đặt âm thanh được lưu và khôi phục sau khởi động lại', async () => {
    let saved = null;
    const a = make({}, { persist: (s) => { saved = JSON.parse(JSON.stringify(s)); } });
    await a.svc.rpc('tarot.setAudio', { audio: { musicOn: false, voiceVolume: 0.5 } });
    a.clock.advance(1000);
    const b = make({}, { loadSaved: () => saved });
    b.svc.boot();
    expect(b.svc.getState().audio).toMatchObject({ musicOn: false, voiceVolume: 0.5 });
  });
});

describe('tarot-rpc: bốc ngẫu nhiên khi không ai bình luận (autoPickCount)', () => {
  const opts = { queueOrder: 'lanes', joinOnEnter: false, autoPickCount: 3, autoPickAfterSec: 10, firstJoinGraceSec: 0 };
  const enter = (svc, n) => { for (let i = 1; i <= n; i++) svc.noteActivity({ uniqueId: `u${i}`, name: `Khách ${i}` }); };

  it('vào phòng không tự vào hàng; hàng trống 10s thì bốc 3 người trong phòng', () => {
    const { svc, clock } = make(opts);
    enter(svc, 5);
    expect(svc.queue.size()).toBe(0);
    clock.advance(9000);
    expect(svc.queue.size()).toBe(0);
    clock.advance(1500);
    const total = svc.queue.size() + (svc.session.getSeat() ? 1 : 0);
    expect(total).toBe(3);
  });

  it('có người bình luận trong lúc chờ thì không bốc', () => {
    const { svc, clock } = make(opts);
    enter(svc, 5);
    clock.advance(5000);
    svc.onComment({ uniqueId: 'u1', name: 'Khách 1', text: 'xin chào' });
    expect(svc.session.getSeat()?.viewerId).toBe('u1');   // người bình luận được mời lên ghế, không bị bốc nhầm
    expect(svc.queue.size()).toBe(0);
  });

  it('mỗi người chỉ bị bốc một lần', () => {
    const { svc } = make(opts);
    enter(svc, 3);
    const first = svc.autoPickNow();
    expect(first.length).toBe(3);
    for (const id of first) svc.queue.remove(id);
    for (const id of first) svc.lobby.touch({ viewerId: id, name: 'x', avatar: '' }, 5_000_000);
    expect(svc.autoPickNow()).toEqual([]);
  });

  it('autoPickCount = 0: tắt', () => {
    const { svc, clock } = make({ ...opts, autoPickCount: 0 });
    enter(svc, 3);
    clock.advance(60000);
    expect(svc.queue.size() + (svc.session.getSeat() ? 1 : 0)).toBe(0);
  });
});

describe('tarot-rpc: câu chào người đầu tiên (welcome)', () => {
  const fixedLines = { welcomeNamed: ['Chào {name}, bạn chuẩn bị ngồi vào ghế để trải bài tarot nhé.'], welcome: ['Chào bạn, bạn chuẩn bị ngồi vào ghế nhé.'] };
  const opts = { queueOrder: 'lanes', joinOnEnter: false, firstJoinGraceSec: 5 };

  it('người đầu bình luận: state có lời chào trong lúc chờ, hết chờ thì mất', () => {
    const { svc, clock } = make(opts, { fixedLines });
    svc.onComment({ uniqueId: 'u1', name: 'Lan', text: 'hi' });
    const w = svc.getState().welcome;
    expect(w.line).toContain('Lan'); expect(w.line).toContain('chuẩn bị ngồi vào ghế');
    clock.advance(5200);
    expect(svc.getState().phase).toBe('CALLING');
    expect(svc.getState().welcome).toBe(null);
  });
});

describe('tarot-rpc: popup chào người vào phòng', () => {
  it('phát tarot.welcome một lần cho mỗi người trong thời gian cooldown, không đụng hàng chờ', () => {
    const { svc, clock, sent } = make({ queueOrder: 'lanes', joinOnEnter: false, welcomePopupCooldownSec: 60 });
    svc.noteActivity({ uniqueId: 'u1', name: 'Lan' });
    svc.noteActivity({ uniqueId: 'u1', name: 'Lan' });
    svc.noteActivity({ uniqueId: 'u2', name: 'Minh' });
    const w = sent.filter(([m]) => m === 'tarot.welcome').map(([, p]) => p.name);
    expect(w).toEqual(['Lan', 'Minh']);
    expect(svc.queue.size()).toBe(0);
    clock.advance(61000);
    svc.noteActivity({ uniqueId: 'u1', name: 'Lan' });
    expect(sent.filter(([m]) => m === 'tarot.welcome').length).toBe(3);
  });
  it('gói tarot.welcome kèm viewerId + avatar (để màn live hiện avatar và cho bay vào hàng chờ)', () => {
    const { svc, sent } = make({ welcomePopupCooldownSec: 60 });
    svc.noteActivity({ uniqueId: 'u9', name: 'Lan', avatar: 'https://x/a.jpg' });
    const p = sent.find(([m]) => m === 'tarot.welcome')[1];
    expect(p).toEqual({ viewerId: 'u9', name: 'Lan', avatar: 'https://x/a.jpg' });
  });
  it('welcomePopupCooldownSec = 0: tắt', () => {
    const { svc, sent } = make({ welcomePopupCooldownSec: 0 });
    svc.noteActivity({ uniqueId: 'u1', name: 'Lan' });
    expect(sent.some(([m]) => m === 'tarot.welcome')).toBe(false);
  });
});

describe('tarot-rpc: tarot.getRoom (toàn bộ khách trong phòng)', () => {
  it('liệt kê mọi khách đã thấy với trạng thái đang xem / trong hàng / ngồi ghế', async () => {
    const { svc, clock } = make({ queueOrder: 'lanes', joinOnEnter: false, firstJoinGraceSec: 5, autoPickCount: 0 });
    svc.noteActivity({ uniqueId: 'u1', name: 'Lan' });
    svc.noteActivity({ uniqueId: 'u2', name: 'Minh' });
    svc.touch({ uniqueId: 'u3', name: 'Hoa' });
    svc.onComment({ uniqueId: 'u2', name: 'Minh', text: 'hi' });
    clock.advance(1000);
    const r = await svc.rpc('tarot.getRoom', {});
    expect(r.total).toBe(3);
    const by = Object.fromEntries(r.viewers.map((v) => [v.viewerId, v]));
    expect(by.u2.status).toBe('queued'); expect(by.u2.position).toBe(1); expect(by.u2.comments).toBe(1);
    expect(by.u1.status).toBe('watching'); expect(by.u3.status).toBe('watching');
    expect(r.viewers[0].viewerId).toBe('u2');   // người trong hàng đứng trước
  });
});

describe('tarot-rpc: tarot.removeRoom (xóa khách khỏi danh sách phòng)', () => {
  const opts = { queueOrder: 'lanes', joinOnEnter: false, firstJoinGraceSec: 5, autoPickCount: 3, autoPickAfterSec: 10 };
  it('xóa khỏi danh sách phòng và hàng chờ; không bị bốc ngẫu nhiên lại', async () => {
    const { svc, clock } = make(opts);
    svc.noteActivity({ uniqueId: 'u1', name: 'Lan' });
    svc.onComment({ uniqueId: 'u2', name: 'Minh', text: 'hi' });
    const r = await svc.rpc('tarot.removeRoom', { viewerId: 'u2' }, { admin: true });
    expect(r.removedFromQueue).toBe(true);
    await svc.rpc('tarot.removeRoom', { viewerId: 'u1' }, { admin: true });
    const room = await svc.rpc('tarot.getRoom', {});
    expect(room.total).toBe(0);
    svc.noteActivity({ uniqueId: 'u1', name: 'Lan' });   // quay lại phòng
    clock.advance(30000);
    expect(svc.queue.has('u1')).toBe(false);   // không bị bốc
    expect((await svc.rpc('tarot.getRoom', {})).viewers[0].status).not.toBe('seated');
  });
  it('không xóa được người đang ngồi ghế', async () => {
    const { svc } = make({ ...opts, firstJoinGraceSec: 0 });
    svc.onComment({ uniqueId: 'u1', name: 'Lan', text: 'hi' });
    await expect(svc.rpc('tarot.removeRoom', { viewerId: 'u1' }, { admin: true })).rejects.toThrow(/ngồi ghế/);
  });
});
