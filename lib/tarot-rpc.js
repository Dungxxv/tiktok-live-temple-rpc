'use strict';
// Dịch vụ Tarot: gắn hàng chờ + phiên + sảnh + bộ bài vào RPC (tarot.*) và vào sự kiện TikTok (bình luận, quà).
// Mọi phụ thuộc bên ngoài (broadcast, TTS, lưu file, đồng hồ) được tiêm vào để test không cần mạng.
const { createQueue } = require('./tarot-queue');
const { createSession } = require('./tarot-session');
const { createLobby } = require('./tarot-lobby');
const { mergeConfig, validateConfig } = require('./tarot-config');

const ADMIN_METHODS = new Set([
  'tarot.skip', 'tarot.remove', 'tarot.setConfig', 'tarot.start', 'tarot.stop',
  'tarot.simulateComment', 'tarot.simulateGift'
]);
const RATE_LIMITED = { 'tarot.join': 60, 'tarot.boost': 60 };   // số lần tối đa mỗi 10 giây
const MAX_NAME = 14;

function normalizeText(s) {
  return String(s || '').normalize('NFKC').normalize('NFC').toLowerCase().trim();
}

/** Bình luận có xin bói không, và chủ đề gì. Không khớp từ khóa thì không vào hàng. */
function parseComment(text, config) {
  const t = normalizeText(text);
  if (!t) return { match: false, topic: 'general' };
  const match = config.keywords.some((k) => {
    const kw = normalizeText(k);
    if (!kw) return false;
    return kw === '+1' ? t === '+1' || t.startsWith('+1 ') : t.includes(kw);
  });
  if (!match) return { match: false, topic: 'general' };
  let topic = 'general';
  for (const [name, words] of Object.entries(config.topicKeywords || {})) {
    if (words.some((w) => t.includes(normalizeText(w)))) { topic = name; break; }
  }
  return { match: true, topic };
}

/** Tên hiển thị: đã lọc bằng sanitizeUserName, bỏ dãy số dài (số điện thoại) và link, cắt 14 ký tự. */
function displayName(raw, sanitizeUserName) {
  const base = sanitizeUserName(raw)
    .replace(/https?:\/\/\S+|www\.\S+/gi, ' ')
    .replace(/\d{6,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const name = base || 'Bạn hữu duyên';
  return Array.from(name).slice(0, MAX_NAME).join('');
}

function createTarotService({
  config: initialConfig, deck, clock, rng = Math.random,
  broadcast = () => {}, sanitizeUserName = (s) => String(s || ''), isBlocked = () => false,
  tts = null, persist = null, loadSaved = null, log = () => {}, env = {}
}) {
  const config = validateConfig(mergeConfig(initialConfig, {}));
  const queue = createQueue(config);
  const lobby = createLobby(config);
  let persistTimer = null;
  let lastQueueNote = null;
  const rate = new Map();

  const session = createSession({
    config, queue, deck, rng, clock, tts,
    onChange: (reason) => {
      broadcast('tarot.state', getState());
      if (reason.startsWith('phase:')) {
        const st = session.getState();
        broadcast('tarot.phase', { phase: st.phase, phaseStartedAt: st.phaseStartedAt, phaseEndsAt: st.phaseEndsAt, serverTime: st.serverTime });
      }
      schedulePersist();
    },
    onEvent: (name, p) => log(`[Tarot] ${name} ${p?.viewerId || ''}`)
  });

  function schedulePersist() {
    if (!persist || persistTimer) return;
    persistTimer = clock.setTimeout(() => {
      persistTimer = null;
      try { persist(session.exportState()); } catch (e) { log(`[Tarot] Lỗi lưu trạng thái: ${e.message}`); }
    }, 400);
  }

  function getState() {
    const st = session.getState();
    const exclude = new Set(queue.ids());
    if (st.seat) exclude.add(st.seat.viewerId);
    return { ...st, lobby: lobby.snapshot(clock.now(), exclude), queueNote: lastQueueNote };
  }

  function viewerFrom(ev) {
    const name = displayName(ev.name || ev.user || ev.uniqueId, sanitizeUserName);
    const raw = ev.viewerId || ev.uniqueId || `n:${name}`;
    return { viewerId: String(raw).slice(0, 80), name, avatar: String(ev.avatar || '') };
  }

  function note(reason, viewerId, extra = {}) {
    lastQueueNote = { reason, viewerId, at: clock.now(), ...extra };
    broadcast('tarot.queue', { reason, viewerId, ...extra, queue: getState().queue, queueMore: queue.snapshot().queueMore });
  }

  function onComment(ev) {
    const text = String(ev.text || ev.comment || ev.content || '');
    if (isBlocked(text)) return { ok: false, reason: 'blocked' };
    const viewer = viewerFrom(ev);
    lobby.touch(viewer, clock.now());
    const parsed = parseComment(text, config);
    if (!parsed.match) { schedulePersist(); return { ok: true, joined: false, reason: 'no_keyword' }; }
    const r = queue.join({ ...viewer, topic: parsed.topic }, clock.now());
    if (!r.ok) {
      if (r.reason === 'full') log(`[Tarot] Hàng đầy, bỏ qua ${viewer.name}`);
      return { ok: false, reason: r.reason };
    }
    lobby.remove(viewer.viewerId);
    note('join', viewer.viewerId, { name: viewer.name });
    session.kick();
    return { ok: true, joined: true, position: r.position, topic: parsed.topic };
  }

  function onGift(ev) {
    const coins = Math.max(0, Math.floor(Number(ev.coins) || 0));
    if (coins < 1) return { ok: false, reason: 'no_coins' };
    const viewer = viewerFrom(ev);
    lobby.touch(viewer, clock.now());
    const kind = coins >= config.bigGiftCoins ? 'big' : 'small';
    broadcast('tarot.reaction', { kind, name: viewer.name, giftName: ev.giftName || '', coins });

    if (session.getSeat() && session.getSeat().viewerId === viewer.viewerId) {
      const r = session.onSeatGift(viewer.viewerId, coins);
      return { ok: true, seated: true, bonus: r };
    }
    const r = queue.boost(viewer, coins, clock.now(), ev.giftName || '');
    if (!r.ok) return r;
    lobby.remove(viewer.viewerId);
    note(`gift:${String(ev.giftName || 'gift').slice(0, 40)}`, viewer.viewerId, { name: viewer.name, jumped: r.jumped, from: r.from, to: r.to, stars: r.stars });
    session.kick();
    return { ok: true, ...r };
  }

  function checkRate(method) {
    const limit = RATE_LIMITED[method];
    if (!limit) return;
    const now = clock.now();
    const arr = (rate.get(method) || []).filter((t) => now - t < 10000);
    if (arr.length >= limit) throw new Error('Quá nhiều yêu cầu, thử lại sau ít giây');
    arr.push(now);
    rate.set(method, arr);
  }

  function checkAdmin(method, params) {
    if (!ADMIN_METHODS.has(method)) return;
    const token = env.ADMIN_TOKEN;
    if (token) {
      if (params.token !== token) throw new Error('Cần token quản trị hợp lệ');
    } else if (env.NODE_ENV === 'production') {
      throw new Error('Phương thức quản trị bị khóa ở production khi chưa đặt ADMIN_TOKEN');
    }
  }

  const need = (params, key) => {
    if (params[key] === undefined || params[key] === null || params[key] === '') throw new Error(`Thiếu tham số "${key}"`);
    return params[key];
  };

  async function rpc(method, params = {}) {
    if (params === null || typeof params !== 'object') throw new Error('params phải là object');
    checkAdmin(method, params);
    checkRate(method);
    switch (method) {
      case 'tarot.getState': return getState();
      case 'tarot.join': {
        const r = onComment({ ...params, text: params.text || config.keywords[0] });
        return { ...r, state: getState() };
      }
      case 'tarot.boost': {
        need(params, 'viewerId');
        const r = onGift({ viewerId: params.viewerId, name: params.name, avatar: params.avatar, coins: params.coins, giftName: params.giftName });
        return { ...r, state: getState() };
      }
      case 'tarot.skip': return session.skip();
      case 'tarot.remove': {
        const ok = queue.remove(String(need(params, 'viewerId')));
        if (ok) { note('remove', String(params.viewerId)); session.touch('remove'); }
        return { ok };
      }
      case 'tarot.setConfig': {
        const patch = { ...(params.config || {}) };
        const next = validateConfig(mergeConfig(config, patch));
        Object.assign(config, next);
        session.touch('config');
        return { ok: true, config };
      }
      case 'tarot.start': session.start(); return { ok: true, state: getState() };
      case 'tarot.stop': session.stop(); return { ok: true, state: getState() };
      case 'tarot.simulateComment': {
        const name = need(params, 'name');
        return { ...onComment({ viewerId: params.viewerId || `sim:${name}`, name, avatar: params.avatar, text: need(params, 'text') }), state: getState() };
      }
      case 'tarot.simulateGift': {
        const name = need(params, 'name');
        const total = Number(params.coins || 1) * Math.max(1, Number(params.repeat || 1));
        return { ...onGift({ viewerId: params.viewerId || `sim:${name}`, name, avatar: params.avatar, coins: total, giftName: params.giftName }), state: getState() };
      }
      default: throw new Error(`Không có phương thức: ${method}`);
    }
  }

  function boot() {
    if (loadSaved) {
      try { const saved = loadSaved(); if (saved) session.restore(saved); } catch (e) { log(`[Tarot] Không khôi phục được: ${e.message}`); }
    }
    session.kick();
  }

  /** Người xem vừa vào phòng/thích: đưa vào sảnh (chưa xếp hàng). */
  function noteActivity(ev) {
    const viewer = viewerFrom(ev);
    lobby.touch(viewer, clock.now());
    schedulePersist();
  }

  return { rpc, onComment, onGift, noteActivity, getState, boot, session, queue, lobby, config };
}

module.exports = { createTarotService, parseComment, displayName, ADMIN_METHODS };
