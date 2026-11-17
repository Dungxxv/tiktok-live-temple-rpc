'use strict';
// Dịch vụ Tarot: gắn hàng chờ + phiên + sảnh + bộ bài vào RPC (tarot.*) và vào sự kiện TikTok (bình luận, quà).
// Mọi phụ thuộc bên ngoài (broadcast, TTS, lưu file, đồng hồ) được tiêm vào để test không cần mạng.
const { createQueue } = require('./tarot-queue');
const { createSession } = require('./tarot-session');
const { createLobby } = require('./tarot-lobby');
const { mergeConfig, validateConfig } = require('./tarot-config');
const { createReadingPicker } = require('./tarot-readings');
const { createGiftTopics } = require('./tarot-gifts');
const { createFixedLines, buildScript, safeName, CUSTOM_SECTIONS } = require('./tarot-speech');
const { splitSentences } = require('./tarot-sheet');
const { detectTopic } = require('./tarot-topic');
const { draw, withKeywords } = require('./tarot-deck');

const ADMIN_METHODS = new Set([
  'tarot.skip', 'tarot.remove', 'tarot.setConfig', 'tarot.start', 'tarot.stop', 'tarot.setCustom', 'tarot.aiDraft', 'tarot.setTopic',
  'tarot.scheduleBreak', 'tarot.cancelBreak', 'tarot.aiBreak', 'tarot.aiConfig',
  'tarot.simulateComment', 'tarot.simulateGift', 'tarot.simulateEnter', 'tarot.setAudio', 'tarot.speak', 'tarot.removeIdle', 'tarot.removeRoom'
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

/** Mã chủ đề ở đầu bình luận: "02", "2", "02 tình yêu" → { code: '02', topic, label }. Không có / tắt → null. */
function parseTopicCode(text, codes) {
  if (!codes || !Object.keys(codes).length) return null;
  const m = String(text || '').trim().match(/^0?(\d)(?!\d)/);
  if (!m) return null;
  const code = '0' + m[1];
  return codes[code]?.topic ? { code, ...codes[code] } : null;
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
  tts = null, persist = null, loadSaved = null, log = () => {}, env = {},
  readings = null, giftTopics = null, fixedLines = null, aiWriter = null
}) {
  const config = validateConfig(mergeConfig(initialConfig, {}));
  const queue = createQueue(config);
  const lobby = createLobby(config);
  let persistTimer = null;
  let lastQueueNote = null;
  const rate = new Map();

  // Nội dung từ Google Sheet (data/tarot/readings.json) + quà → chủ đề + câu cố định.
  const gifts = createGiftTopics(giftTopics || {});
  const picker = createReadingPicker({ readings, rng, log });
  let readingsData = readings;   // nội dung sheet hiện tại (đổi khi reloadReadings)
  const fixed = createFixedLines(fixedLines || {});
  // Tên lá hiển thị theo sheet (readings.cardNames) nếu có, để khớp với lời đọc; không có thì theo cards.json.
  let deckById = new Map();
  const buildDeckIndex = (r) => { deckById = new Map((deck || []).map((c) => [c.id, r?.cardNames?.[c.id] ? { ...c, name_vi: r.cardNames[c.id] } : c])); };
  buildDeckIndex(readings);
  // Người tặng quà chờ được cảm ơn (gom lại, cảm ơn chung cuối phiên — không ngắt lúc đang trải bài).
  let gifters = [];
  // Câu hỏi / lời giải riêng admin viết cho từng khách (trường hợp đặc biệt): viewerId → { question, lines, at, cardsKey }.
  // Dùng một lần: xóa khi khách vào bệ (kịch bản đã dựng) hoặc bị xóa khỏi hàng.
  const customs = new Map();
  let aiModelSaved = null;   // model Claude admin đã chọn (lưu qua khởi động lại)
  const scripts = {
    picker,
    build: (reservation, entry) => {
      // Phiên theo mã bình luận → "Chủ đề bạn bình luận là 02: Tình Yêu" (Figma).
      const info = entry.commentTopic && reservation.type === 'triple' && reservation.requestedTopic === entry.commentTopic
        ? config.commentTopicCodes?.[entry.commentCode] : null;
      const commented = info ? { code: entry.commentCode, label: info.label || gifts.label(info.topic) } : null;
      const custom = customs.get(String(entry.viewerId)) || null;
      return buildScript({ reservation, deckById, name: entry.name, fixed, isBlocked, topicLabel: gifts.label, commented, custom });
    },
    thanks() {
      if (!gifters.length) return null;
      const taken = gifters; gifters = [];
      const names = [...new Set(taken.map((n) => safeName(n, isBlocked)).filter(Boolean))].slice(0, 3);
      const text = names.length ? fixed.pick('thanksNamed', { names: names.join(', ') }) : fixed.pick('thanksGeneric');
      return text ? { text, gifters: taken } : null;
    },
    /** Câu chào ngay khi người đầu tiên vào (trong lúc chờ xem có quà không), trước khi mời ngồi. */
    welcome(entry) {
      const spoken = safeName(entry.name, isBlocked);
      return spoken ? fixed.pick('welcomeNamed', { name: spoken }) : fixed.pick('welcome');
    },
    thanksRestore(t) { gifters = [...(t?.gifters || []), ...gifters].slice(-30); },
    /** Phiên riêng: admin đã lưu câu hỏi đặc biệt + bộ lá + lời Claude soạn → lượt bốc không dùng sheet. */
    customReservation(entry) {
      const c = customs.get(String(entry.viewerId));
      if (!c?.cards?.length || !c.question) return null;
      const topic = entry.commentTopic || 'overview';
      return { type: 'triple', topic, requestedTopic: topic, fallback: null, index: -1, custom: true, row: { row: null, cards: c.cards, ...c.lines } };
    }
  };
  // Quà thật đã thấy trên live (để điền giftId/xu thật vào gift-topics.json).
  const giftsSeen = {};
  // Âm thanh màn live (chỉnh từ /tarot/admin): nhạc nền + giọng đọc + hiệu ứng. duck = mức nhạc khi đang nói.
  const AUDIO_DEFAULT = { musicOn: true, musicVolume: 0.35, voiceOn: true, voiceVolume: 1, duck: 0.35, sfxOn: true, sfxVolume: 0.4 };
  const audio = { ...AUDIO_DEFAULT };
  function setAudio(patch = {}) {
    const vol = (v, d) => (v === undefined ? d : Math.max(0, Math.min(1, Number(v))));
    for (const k of ['musicOn', 'voiceOn', 'sfxOn']) if (patch[k] !== undefined) audio[k] = !!patch[k];
    for (const k of ['musicVolume', 'voiceVolume', 'duck', 'sfxVolume']) { const v = vol(patch[k], audio[k]); if (Number.isFinite(v)) audio[k] = v; }
    return { ...audio };
  }

  const session = createSession({
    config, queue, deck, rng, clock, tts, scripts,
    onChange: (reason) => {
      broadcast('tarot.state', getState());
      armAutoPick();
      if (reason.startsWith('phase:')) {
        const st = session.getState();
        broadcast('tarot.phase', { phase: st.phase, phaseStartedAt: st.phaseStartedAt, phaseEndsAt: st.phaseEndsAt, serverTime: st.serverTime });
      }
      schedulePersist();
    },
    onEvent: (name, p) => {
      log(`[Tarot] ${name} ${p?.viewerId || ''}`);
      if (name === 'session.start' && p?.viewerId && customs.delete(String(p.viewerId))) log(`[Tarot] Phiên dùng lời giải riêng của admin cho ${p.viewerId}`);
    }
  });

  function schedulePersist() {
    if (!persist || persistTimer) return;
    persistTimer = clock.setTimeout(() => {
      persistTimer = null;
      try { persist({ ...session.exportState(), giftsSeen, audio, customs: Object.fromEntries(customs), aiModel: aiModelSaved }); } catch (e) { log(`[Tarot] Lỗi lưu trạng thái: ${e.message}`); }
    }, 400);
  }

  function getState() {
    const st = session.getState();
    const exclude = new Set(queue.ids());
    if (st.seat) exclude.add(st.seat.viewerId);
    return { ...st, queue: withIdle(st.queue), config: { ...st.config, idleAfterSec: config.idleAfterSec }, lobby: lobby.snapshot(clock.now(), exclude), queueNote: lastQueueNote, audio: { ...audio },
      // Server chạy sai chế độ (APP_MODE ≠ tarot/both) thì TikTok không vào phòng Tarot → admin hiện cảnh báo.
      appMode: env.APP_MODE ?? null, tiktokToTarot: env.TAROT_ON ?? null };
  }

  /** Thêm idleSec (số giây kể từ lần hoạt động cuối) cho từng người trong hàng. */
  function withIdle(list) {
    const now = clock.now();
    return list.map((e) => ({ ...e, idleSec: Math.max(0, Math.floor((now - (e.lastActiveAt ?? e.joinedAt ?? now)) / 1000)) }));
  }

  // Toàn bộ khách đã thấy trong phòng (vào phòng, bình luận, thả tim, quà...) cho trang admin; không phụ thuộc hàng chờ.
  const room = new Map();   // viewerId → { viewerId, name, avatar, firstAt, lastAt, enters, comments, likes, coins }
  const history = new Map();   // viewerId → [{ at, kind: 'enter'|'comment'|'gift', text?, giftName?, coins? }] (tối đa HISTORY_MAX, cho popup admin)
  const ROOM_WINDOW_SEC = 3600, ROOM_MAX = 1000, HISTORY_MAX = 40;
  function seenInRoom(viewer, kind, n = 1, detail = null) {
    const now = clock.now();
    let r = room.get(viewer.viewerId);
    if (!r) { r = { viewerId: viewer.viewerId, name: viewer.name, avatar: viewer.avatar, firstAt: now, lastAt: now, enters: 0, comments: 0, likes: 0, coins: 0 }; room.set(viewer.viewerId, r); }
    r.lastAt = now; if (viewer.name) r.name = viewer.name; if (viewer.avatar) r.avatar = viewer.avatar;
    if (kind === 'enter') r.enters += 1; else if (kind === 'comment') r.comments += 1; else if (kind === 'gift') r.coins += n; else r.likes += 1;
    if (kind === 'enter' || kind === 'comment' || kind === 'gift') {
      const h = history.get(viewer.viewerId) || [];
      h.push({ at: now, kind, ...(detail || {}) });
      if (h.length > HISTORY_MAX) h.splice(0, h.length - HISTORY_MAX);
      history.set(viewer.viewerId, h);
    }
    while (room.size > ROOM_MAX) { const k = room.keys().next().value; room.delete(k); history.delete(k); }
  }

  const cardsKeyOf = (reservation) => {
    const row = reservation?.row;
    if (!row) return '';
    const list = Array.isArray(row.cards) ? row.cards : [{ id: row.id, reversed: row.reversed }];
    return list.map((c) => `${c.id}${c.reversed ? 'R' : ''}`).join(',');
  };
  /** Chi tiết một khách cho popup admin: lịch sử bình luận/quà, vị trí, kế hoạch trả lời (lá + lời giải), lời giải riêng. */
  function viewerDetail(id) {
    const now = clock.now();
    const r = room.get(id);
    const entry = queue.get(id);
    const seatNow = session.getSeat();
    const seated = seatNow?.viewerId === id;
    if (!r && !entry && !seated) throw new Error('Không tìm thấy khách này');
    const position = entry ? queue.ids().indexOf(id) + 1 : null;
    const plan = session.planOf(entry || { viewerId: id, name: r?.name || seatNow?.name, lane: 'free', topic: 'overview' });
    const res = plan?.reservation;
    const row = res?.row || null;
    const type = res?.type || plan?.want?.type || null;
    // Lá: có kịch bản thì lấy từ kịch bản; chưa có thì dựng từ dòng sheet.
    let cards = plan?.script?.cards || null;
    if (!cards && row) {
      const list = type === 'triple' ? row.cards || [] : [{ id: row.id, reversed: row.reversed }];
      const labels = type === 'triple' ? ['Quá khứ', 'Hiện tại', 'Tương lai'] : [''];
      cards = list.map((c, i) => {
        const dk = deckById.get(c.id);
        return { id: c.id, name: dk?.name_vi || c.id, reversed: !!c.reversed, positionLabel: labels[i] || '', keywords: ((c.reversed ? dk?.keywords_rev : dk?.keywords_up) || []).slice(0, 3) };
      });
    }
    const keys = type === 'single' ? ['lead', 'present', 'advice'] : ['opening', 'card1', 'card2', 'card3', 'closing'];
    const sheet = {}; for (const k of keys) sheet[k] = row ? String(row[k] || '') : '';
    const custom = customs.get(id) || null;
    const curKey = cardsKeyOf(res);
    return {
      viewer: {
        viewerId: id, name: r?.name || entry?.name || seatNow?.name || id, avatar: r?.avatar || entry?.avatar || seatNow?.avatar || '',
        firstAt: r?.firstAt ?? null, lastAt: r?.lastAt ?? null, comments: r?.comments || 0, coins: r?.coins || 0, likes: r?.likes || 0
      },
      status: seated ? 'seated' : entry ? 'queued' : 'watching',
      position,
      entry: entry ? { lane: entry.lane, stars: entry.stars || 0, coins: entry.coins || 0, commentCode: entry.commentCode || null, commentTopic: entry.commentTopic || null, joinedAt: entry.joinedAt } : null,
      history: (history.get(id) || []).slice().reverse(),
      plan: {
        source: plan?.source || 'none',
        aiMode: !!(res?.custom || plan?.custom),   // phiên riêng: bộ lá + lời do Claude soạn, không dùng sheet
        type, sheetRow: row?.row ?? null,
        topic: res?.topic || plan?.want?.topic || null,
        topicLabel: gifts.label(res?.requestedTopic === 'specific' ? 'specific' : res?.topic || plan?.want?.topic || 'overview'),
        fallback: res?.fallback || null,
        cards: cards || [],
        sections: keys,
        sheet,
        // Câu nói thật (đã gồm lời giải riêng nếu có) khi kịch bản đã dựng.
        speech: plan?.script ? Object.fromEntries(['CALLING', 'READING'].map((ph) => [ph, plan.script.speech[ph].lines])) : null
      },
      custom: custom ? { question: custom.question || '', lines: custom.lines || {}, at: custom.at, cardsChanged: !!(custom.cardsKey && curKey && custom.cardsKey !== curKey) } : null,
      ai: !!aiWriter?.enabled?.(),
      topics: sheetTopics().map((t) => ({ topic: t, label: gifts.label(t), code: codeOfTopic(t) })),
      serverTime: now
    };
  }

  const SECTION_VI = { opening: 'Mở đầu', card1: 'Lá 1', card2: 'Lá 2', card3: 'Lá 3', closing: 'Lời kết' };
  /** (admin) Lưu câu hỏi / lời giải riêng cho khách trong hàng; giữ bài ngay để lá không đổi. Rỗng hết → xóa. */
  function setCustom(params) {
    const id = String(need(params, 'viewerId'));
    if (session.getSeat()?.viewerId === id) throw new Error('Khách đang ngồi trên bệ, không sửa được phiên đang đọc');
    const entry = queue.get(id);
    if (!entry) throw new Error('Khách chưa vào hàng chờ, hãy mời vào hàng trước');
    const clean = (s, max) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
    const question = clean(params.question, 150);
    const lines = {};
    for (const k of CUSTOM_SECTIONS) { const v = clean(params.lines?.[k], 800); if (v) lines[k] = v; }
    for (const t of [question, ...Object.values(lines)]) if (t && isBlocked(t)) throw new Error(`Có từ bị chặn trong: "${t.slice(0, 40)}…"`);
    // Bộ lá riêng (Claude bốc + soạn): chỉ nhận lá có trong bộ bài, đúng 3 lá, và phải có câu hỏi + đủ các phần lời.
    let cards = null;
    if (Array.isArray(params.cards) && params.cards.length && question) {
      const ids = new Set((deck || []).map((c) => c.id));
      cards = params.cards.slice(0, 3).map((c) => ({ id: String(c?.id || ''), reversed: !!c?.reversed }));
      if (cards.length !== 3 || cards.some((c) => !ids.has(c.id)) || new Set(cards.map((c) => c.id)).size !== 3) throw new Error('Bộ lá không hợp lệ');
      const missing = ['opening', 'card1', 'card2', 'card3', 'closing'].filter((k) => !lines[k]);
      if (missing.length) throw new Error(`Phiên riêng cần đủ lời các phần, còn trống: ${missing.map((k) => SECTION_VI[k]).join(', ')}`);
    }
    if (!question && !Object.keys(lines).length) customs.delete(id);
    else customs.set(id, { question, lines, at: clock.now(), cardsKey: '', ...(cards ? { cards } : {}) });
    const job = session.prepareNow(entry);   // dựng lại kịch bản + giữ lượt bốc (cùng bộ lá) + tạo giọng sẵn
    const c = customs.get(id);
    if (c) c.cardsKey = cardsKeyOf(job?.reservation);
    schedulePersist();
    broadcast('tarot.state', getState());
    return viewerDetail(id);
  }

  /** Mã bình luận của một chủ đề (vd. love → "02"), để nhãn hàng chờ / câu chủ đề khớp như khi khách tự bình luận mã. */
  const codeOfTopic = (topic) => Object.entries(config.commentTopicCodes || {}).find(([, v]) => v.topic === topic)?.[0] || '';
  const sheetTopics = () => Object.keys(readingsData?.triple || {}).filter((t) => picker.hasTopic(t));

  /** (admin) Đổi chủ đề cho khách trong hàng (như khách bình luận mã), rồi giữ bài ngay theo chủ đề mới. */
  function setTopic(id, topic) {
    if (session.getSeat()?.viewerId === id) throw new Error('Khách đang ngồi trên bệ, không đổi chủ đề được');
    const entry = queue.get(id);
    if (!entry) throw new Error('Khách chưa vào hàng chờ, hãy mời vào hàng trước');
    if (!picker.hasTopic(topic)) throw new Error(`Sheet chưa có tab chủ đề "${topic}"`);
    queue.setCommentTopic(id, topic, codeOfTopic(topic));
    session.prepareNow(queue.get(id));   // giữ lượt bốc theo chủ đề mới → bộ lá cố định
    schedulePersist();
    broadcast('tarot.state', getState());
    return viewerDetail(id);
  }

  /**
   * (admin) Câu hỏi đặc biệt → Claude soạn NHÁP cả phiên, KHÔNG dựa vào sheet: bốc 3 lá mới từ bộ bài, gửi câu hỏi + tên lá
   * + từ khóa lá (không gửi lời sheet). Chủ đề đoán từ câu hỏi bằng từ khóa (0 token). Chưa lưu: admin đọc, sửa rồi bấm Lưu
   * (gửi kèm bộ lá) → phiên của khách dùng đúng bộ lá + lời này, dòng sheet không bị dùng.
   */
  let aiBusy = false;
  async function aiDraft(params) {
    if (!aiWriter?.enabled?.()) throw new Error('Chưa bật Claude: không thấy Claude Code trên máy và chưa có ANTHROPIC_API_KEY trong .env');
    const id = String(need(params, 'viewerId'));
    const question = String(need(params, 'question')).replace(/\s+/g, ' ').trim().slice(0, 150);
    if (isBlocked(question)) throw new Error('Câu hỏi có từ bị chặn');
    let d = viewerDetail(id);
    if (d.status === 'seated') throw new Error('Khách đang ngồi trên bệ, không sửa được phiên đang đọc');
    if (d.status !== 'queued') throw new Error('Khách chưa vào hàng chờ, hãy mời vào hàng trước');
    if (!deck?.length) throw new Error('Chưa nạp bộ bài');
    if (aiBusy) throw new Error('Claude đang viết cho một khách khác, chờ chút rồi thử lại');
    let topicChanged = null;
    if (params.autoTopic !== false) {
      const guess = detectTopic(question, sheetTopics());
      if (guess && guess.topic !== d.plan.topic) {
        const from = d.plan.topicLabel;
        queue.setCommentTopic(id, guess.topic, codeOfTopic(guess.topic));   // chỉ đổi nhãn chủ đề, không giữ dòng sheet
        schedulePersist();
        d = viewerDetail(id);
        topicChanged = { from, to: gifts.label(guess.topic), hits: guess.hits };
      }
    }
    const topic = topicChanged ? detectTopic(question, sheetTopics()).topic : (d.entry?.commentTopic || d.plan.topic || 'overview');
    // Bộ lá mới cho phiên riêng (tên lá theo sheet nếu có, để khớp lời đọc).
    const labels = ['Quá khứ', 'Hiện tại', 'Tương lai'];
    const cards = withKeywords(deck, draw(deck, 3, { rng, reversedChance: config.reversedChance })).map((c, i) => ({
      id: c.id, name: deckById.get(c.id)?.name_vi || c.name, reversed: !!c.reversed, positionLabel: labels[i], keywords: c.keywords || []
    }));
    const sections = ['opening', 'card1', 'card2', 'card3', 'closing'];
    aiBusy = true;
    try {
      const r = await aiWriter.write({ question, topicLabel: gifts.label(topic), cards, sections, sheet: null });
      const blocked = Object.entries(r.lines).filter(([, t]) => t && isBlocked(t)).map(([k]) => k);
      return { ok: true, lines: r.lines, cards, topic, topicLabel: gifts.label(topic), warnings: r.warnings || [], blocked, model: r.model, usage: r.usage, stats: r.stats, topicChanged, detail: viewerDetail(id) };
    } finally { aiBusy = false; }
  }

  function roomSnapshot() {
    const now = clock.now();
    const seatId = session.getSeat()?.viewerId;
    const order = new Map(queue.ids().map((id, i) => [id, i + 1]));
    const out = [];
    const seen = new Set();
    for (const r of room.values()) {
      const listed = order.has(r.viewerId) || r.viewerId === seatId;
      if (!listed && now - r.lastAt > ROOM_WINDOW_SEC * 1000) { room.delete(r.viewerId); history.delete(r.viewerId); continue; }
      const status = r.viewerId === seatId ? 'seated' : order.has(r.viewerId) ? 'queued' : 'watching';
      seen.add(r.viewerId);
      out.push({ ...r, status, position: order.get(r.viewerId) || null, picked: autoPicked.has(r.viewerId), idleSec: Math.floor((now - r.lastAt) / 1000), sinceSec: Math.floor((now - r.firstAt) / 1000) });
    }
    // Người trong hàng chờ / trên bệ nhưng chưa có trong danh sách phòng (vd. khôi phục sau khởi động lại): vẫn hiện,
    // để xóa ở bảng phòng là xóa luôn khỏi hàng chờ.
    const seatNow = session.getSeat();
    const extra = [...queue.snapshot(config.queueMax).queue, ...(seatNow ? [{ ...seatNow, lastActiveAt: seatNow.since, joinedAt: seatNow.since }] : [])];
    for (const e of extra) {
      if (seen.has(e.viewerId)) continue;
      seen.add(e.viewerId);
      const last = e.lastActiveAt ?? e.joinedAt ?? now; const first = e.joinedAt || last;
      out.push({ viewerId: e.viewerId, name: e.name, avatar: e.avatar || '', firstAt: first, lastAt: last, enters: 0, comments: 0, likes: 0, coins: e.coins || 0,
        status: e.viewerId === seatId ? 'seated' : 'queued', position: order.get(e.viewerId) || null, picked: autoPicked.has(e.viewerId),
        idleSec: Math.max(0, Math.floor((now - last) / 1000)), sinceSec: Math.max(0, Math.floor((now - first) / 1000)) });
    }
    const rank = { seated: 0, queued: 1, watching: 2 };
    out.sort((a, b) => rank[a.status] - rank[b.status] || (a.position || 0) - (b.position || 0) || a.idleSec - b.idleSec);
    return { viewers: out, total: out.length, windowSec: ROOM_WINDOW_SEC, serverTime: now };
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

  const commentStarAt = new Map();   // viewerId → lần cuối được cộng sao bình luận

  // Không ai bình luận (hàng trống) → bốc ngẫu nhiên tối đa autoPickCount người đang trong phòng (sảnh) vào hàng.
  // Mỗi người chỉ được bốc MỘT lần (autoPicked), để không lặp lại người cũ.
  const autoPicked = new Set();
  let autoPickTimer = null;
  function armAutoPick() {
    if (autoPickTimer || !(config.autoPickCount > 0) || !session.isEnabled() || queue.size() > 0) return;
    autoPickTimer = clock.setTimeout(() => { autoPickTimer = null; autoPickNow(); armAutoPick(); }, Math.max(1, config.autoPickAfterSec) * 1000);
  }
  function autoPickNow() {
    if (!(config.autoPickCount > 0) || !session.isEnabled() || queue.size() > 0) return [];
    const exclude = new Set(queue.ids());
    const seat = session.getSeat();
    if (seat) exclude.add(seat.viewerId);
    const pool = lobby.snapshot(clock.now(), exclude).filter((v) => !autoPicked.has(v.viewerId));
    for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
    const picked = [];
    for (const v of pool) {
      if (picked.length >= config.autoPickCount) break;
      const r = queue.join({ ...v, topic: 'overview' }, clock.now());
      if (!r.ok) continue;
      autoPicked.add(v.viewerId);
      if (autoPicked.size > 5000) autoPicked.delete(autoPicked.values().next().value);
      lobby.remove(v.viewerId);
      note('join', v.viewerId, { name: v.name, via: 'auto' });
      picked.push(v.viewerId);
    }
    if (picked.length) { log(`[Tarot] Không ai bình luận: bốc ngẫu nhiên ${picked.length} người trong phòng vào hàng`); session.kick(); }
    return picked;
  }

  function onComment(ev) {
    const text = String(ev.text || ev.comment || ev.content || '');
    if (isBlocked(text)) return { ok: false, reason: 'blocked' };
    const viewer = viewerFrom(ev);
    seenInRoom(viewer, 'comment', 1, { text: text.slice(0, 200) });
    lobby.touch(viewer, clock.now());
    queue.touch(viewer.viewerId, clock.now());   // bình luận = còn ở trong phòng
    // Hai làn: MỌI bình luận được +commentStars sao (tối đa 1 lần / commentStarCooldownSec), chưa có trong hàng thì vào hàng.
    if (config.queueOrder === 'lanes') {
      const now = clock.now();
      const last = commentStarAt.get(viewer.viewerId);
      const canStar = config.commentStars > 0 && (last === undefined || now - last >= config.commentStarCooldownSec * 1000);
      const r = queue.addStars(viewer, canStar ? config.commentStars : 0, now);
      if (!r.ok) { if (r.reason === 'full') log(`[Tarot] Hàng đầy, bỏ qua ${viewer.name}`); schedulePersist(); return { ok: false, reason: r.reason }; }
      if (canStar) { commentStarAt.set(viewer.viewerId, now); if (commentStarAt.size > 5000) commentStarAt.delete(commentStarAt.keys().next().value); }
      lobby.remove(viewer.viewerId);
      if (r.joined || r.stars) note(r.joined ? 'join' : 'comment-star', viewer.viewerId, { name: viewer.name, stars: r.stars, via: 'comment' });
      // Mã chủ đề ("02" → Tình Yêu): khách được trải 3 lá theo chủ đề đó.
      const tc = parseTopicCode(text, config.commentTopicCodes);
      if (tc && queue.setCommentTopic(viewer.viewerId, tc.topic, tc.code)) note('comment-topic', viewer.viewerId, { name: viewer.name, code: tc.code, topic: tc.topic });
      session.refreshPrepared(queue.get(viewer.viewerId));
      session.kick();
      return { ok: true, joined: r.joined, position: r.position, stars: r.stars, totalStars: r.totalStars, ...(tc ? { topic: tc.topic, code: tc.code } : {}) };
    }
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
    seenInRoom(viewer, 'gift', coins, { giftName: String(ev.giftName || '').slice(0, 60), coins });
    lobby.touch(viewer, clock.now());
    const kind = coins >= config.bigGiftCoins ? 'big' : 'small';
    broadcast('tarot.reaction', { kind, name: viewer.name, giftName: ev.giftName || '', coins });
    const gt = gifts.topicFor({ giftId: ev.giftId, giftName: ev.giftName });
    recordGift(ev, coins, gt);
    if (!gifters.includes(viewer.name)) gifters.push(viewer.name);
    if (gifters.length > 30) gifters = gifters.slice(-30);

    if (session.getSeat() && session.getSeat().viewerId === viewer.viewerId) {
      const r = session.onSeatGift(viewer.viewerId, coins);
      return { ok: true, seated: true, bonus: r };
    }
    // giftSetsTopic = false: quà chỉ để ưu tiên hàng chờ, chủ đề chỉ đổi bằng mã bình luận.
    const r = queue.boost(viewer, coins, clock.now(), ev.giftName || '', config.giftSetsTopic === false ? {} : { topic: gt.topic });
    if (!r.ok) return r;
    queue.touch(viewer.viewerId, clock.now());
    lobby.remove(viewer.viewerId);
    session.refreshPrepared(queue.get(viewer.viewerId));
    note(`gift:${String(ev.giftName || 'gift').slice(0, 40)}`, viewer.viewerId, { name: viewer.name, jumped: r.jumped, from: r.from, to: r.to, stars: r.stars, topic: gt.topic, topicLabel: gt.label });
    session.kick();
    return { ok: true, ...r, topic: gt.topic, topicLabel: gt.label };
  }

  /** Ghi lại quà thật (giftId/tên/xu) — mỗi loại quà log một lần, đếm số lần. */
  function recordGift(ev, coins, gt) {
    const key = ev.giftId !== undefined && ev.giftId !== null && ev.giftId !== '' ? `id:${ev.giftId}` : `name:${ev.giftName || '?'}`;
    const cur = giftsSeen[key];
    if (!cur) {
      log(`[Tarot] Quà: giftId=${ev.giftId ?? '-'} tên="${ev.giftName || ''}" ${coins} xu → chủ đề ${gt.topic}${gt.unmapped ? ' (unmappedGift: chưa có luật, dùng chủ đề mặc định)' : ''}`);
    }
    giftsSeen[key] = { giftId: ev.giftId ?? null, giftName: ev.giftName || '', coins: cur ? cur.coins : coins, topic: gt.topic, unmapped: gt.unmapped, count: (cur?.count || 0) + 1, lastAt: clock.now() };
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
        if (ok) { session.release(String(params.viewerId)); customs.delete(String(params.viewerId)); note('remove', String(params.viewerId)); session.touch('remove'); }
        return { ok };
      }
      case 'tarot.removeRoom': {
        // Xóa khách khỏi danh sách phòng (và khỏi hàng chờ nếu đang chờ). Không bốc ngẫu nhiên lại người này; họ vẫn có thể bình luận để vào hàng.
        const id = String(need(params, 'viewerId'));
        if (session.getSeat()?.viewerId === id) throw new Error('Người này đang ngồi ghế, hãy dùng nút Bỏ qua');
        const inQueue = queue.remove(id);
        if (inQueue) { session.release(id); note('remove', id); session.touch('remove'); }
        lobby.remove(id);
        room.delete(id); history.delete(id); customs.delete(id);
        autoPicked.add(id);
        return { ok: true, removedFromQueue: inQueue };
      }
      case 'tarot.giftsSeen': return { gifts: Object.values(giftsSeen).sort((a, b) => b.lastAt - a.lastAt), menu: gifts.menu() };
      case 'tarot.giftMenu': return { menu: gifts.menu(), defaultTopic: gifts.defaultTopic };
      case 'tarot.getRoom': return roomSnapshot();
      case 'tarot.getViewer': return viewerDetail(String(need(params, 'viewerId')));
      case 'tarot.setCustom': return setCustom(params);
      case 'tarot.aiDraft': return await aiDraft(params);
      case 'tarot.setTopic': return setTopic(String(need(params, 'viewerId')), String(need(params, 'topic')));
      case 'tarot.scheduleBreak': {
        // Phiên nghỉ: lời admin viết (hoặc Claude soạn) → chia câu ngắn cho TTS, chặn từ cấm.
        const raw = Array.isArray(params.lines) ? params.lines.join(' ') : String(need(params, 'text'));
        const text = raw.replace(/\s+/g, ' ').trim().slice(0, 1500);
        if (!text) throw new Error('Chưa có lời cho phiên nghỉ');
        if (isBlocked(text)) throw new Error('Lời phiên nghỉ có từ bị chặn');
        const info = session.scheduleBreak({ lines: splitSentences(text), after: params.after ?? 2 });
        schedulePersist();
        return { ok: true, break: info };
      }
      case 'tarot.cancelBreak': { const r = session.cancelBreak(); schedulePersist(); return r; }
      case 'tarot.aiBreak': {
        if (!aiWriter?.enabled?.()) throw new Error('Chưa bật Claude: không thấy Claude Code trên máy và chưa có ANTHROPIC_API_KEY trong .env');
        if (aiBusy) throw new Error('Claude đang viết việc khác, chờ chút rồi thử lại');
        aiBusy = true;
        try {
          const r = await aiWriter.writeBreak({ idea: need(params, 'idea') });
          return { ok: true, ...r, blocked: isBlocked(r.text) };
        } finally { aiBusy = false; }
      }
      case 'tarot.aiConfig': {
        // Xem / đổi model Claude ("opus" | "sonnet") + số token đã dùng từ lúc server chạy.
        if (!aiWriter) return { enabled: false };
        if (params.model) { aiWriter.setModel(String(params.model)); aiModelSaved = aiWriter.modelKey(); schedulePersist(); }
        return { enabled: !!aiWriter.enabled(), model: aiWriter.modelKey(), stats: aiWriter.stats() };
      }
      case 'tarot.getQueue': {
        // Toàn bộ hàng chờ (không chỉ 21 người đầu) cho trang admin, kèm số giây không hoạt động của từng người.
        const snap = queue.snapshot(config.queueMax);
        return { queue: withIdle(snap.queue).map((e) => (customs.has(e.viewerId) ? { ...e, custom: true } : e)), total: snap.queueTotal, idleAfterSec: config.idleAfterSec, serverTime: clock.now() };
      }
      case 'tarot.removeIdle': {
        // Xóa mọi người không hoạt động từ minIdleSec giây (mặc định = idleAfterSec), trừ người đã bị khóa (sắp vào ghế).
        const min = Number(params.minIdleSec ?? config.idleAfterSec);
        if (!(min > 0)) throw new Error('minIdleSec phải lớn hơn 0');
        const gone = [];
        for (const e of withIdle(queue.snapshot(config.queueMax).queue)) {
          if (e.idleSec >= min && !e.locked && queue.remove(e.viewerId)) { session.release(e.viewerId); customs.delete(e.viewerId); gone.push(e.name); }
        }
        if (gone.length) { note('remove', '', { count: gone.length, via: 'idle' }); session.touch('remove'); }
        return { ok: true, removed: gone.length, names: gone.slice(0, 30) };
      }
      case 'tarot.ttsStatus': return tts?.status ? await tts.status() : { engine: 'none', ready: false, status: 'disabled' };
      case 'tarot.speak': {
        if (!tts?.speak) throw new Error('Chưa cấu hình bộ đọc giọng');
        // Dùng cho script đọc sẵn (scripts/prerender-tarot-tts.mjs): mặc định ưu tiên thấp, nhường phiên đang live.
        return await tts.speak(String(need(params, 'text')), { priority: params.priority === 'live' ? 'live' : 'background' });
      }
      case 'tarot.setAudio': {
        const a = setAudio(params.audio || params);
        broadcast('tarot.state', getState());
        schedulePersist();
        return { ok: true, audio: a };
      }
      case 'tarot.simulateEnter': {
        const name = need(params, 'name');
        return { ...noteActivity({ viewerId: params.viewerId || `sim:${name}`, name, avatar: params.avatar }), state: getState() };
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
        return { ...onGift({ viewerId: params.viewerId || `sim:${name}`, name, avatar: params.avatar, coins: total, giftName: params.giftName, giftId: params.giftId }), state: getState() };
      }
      default: throw new Error(`Không có phương thức: ${method}`);
    }
  }

  function boot() {
    if (loadSaved) {
      try {
        const saved = loadSaved();
        if (saved) {
          for (const [id, c] of Object.entries(saved.customs || {})) if (c && typeof c === 'object') customs.set(id, c);
          if (saved.aiModel && aiWriter?.setModel) { try { aiWriter.setModel(saved.aiModel); aiModelSaved = saved.aiModel; } catch (_) { /* model cũ không còn */ } }
          session.restore(saved); Object.assign(giftsSeen, saved.giftsSeen || {}); if (saved.audio) setAudio(saved.audio);
        }
      } catch (e) { log(`[Tarot] Không khôi phục được: ${e.message}`); }
    }
    session.kick();
    armAutoPick();
  }

  /** Người xem vừa vào phòng: joinOnEnter bật thì vào làn "vào phòng" (phiên 1 lá), không thì chỉ vào sảnh. */
  /** Người xem thả tim / chia sẻ / theo dõi: còn ở trong phòng (cập nhật mốc hoạt động, KHÔNG tự vào hàng). */
  function touch(ev) {
    const viewer = viewerFrom(ev);
    seenInRoom(viewer, 'like');
    lobby.touch(viewer, clock.now());
    const queued = queue.touch(viewer.viewerId, clock.now());
    if (queued) schedulePersist();
    return { ok: true, queued };
  }

  const welcomedAt = new Map();   // viewerId → lần cuối hiện popup chào
  function noteActivity(ev) {
    const viewer = viewerFrom(ev);
    seenInRoom(viewer, 'enter');
    // Popup chào người vừa vào phòng (chỉ là thông báo trên màn live, không đụng tới hàng chờ/ghế).
    if (config.welcomePopupCooldownSec > 0) {
      const now0 = clock.now();
      const last = welcomedAt.get(viewer.viewerId);
      if (last === undefined || now0 - last >= config.welcomePopupCooldownSec * 1000) {
        welcomedAt.set(viewer.viewerId, now0);
        if (welcomedAt.size > 5000) welcomedAt.delete(welcomedAt.keys().next().value);
        broadcast('tarot.welcome', { viewerId: viewer.viewerId, name: viewer.name, avatar: viewer.avatar });
      }
    }
    lobby.touch(viewer, clock.now());
    queue.touch(viewer.viewerId, clock.now());
    if (config.joinOnEnter) {
      const seat = session.getSeat();
      if (!(seat && seat.viewerId === viewer.viewerId)) {
        const r = queue.join({ ...viewer, topic: 'overview' }, clock.now());
        if (r.ok) {
          lobby.remove(viewer.viewerId);
          note('join', viewer.viewerId, { name: viewer.name, via: 'enter' });
          session.kick();
          return { ok: true, joined: true, position: r.position };
        }
        schedulePersist();
        return { ok: true, joined: false, reason: r.reason };
      }
    }
    schedulePersist();
    armAutoPick();
    return { ok: true, joined: false, reason: 'lobby' };
  }

  /** Nạp lại nội dung sheet (sau khi đồng bộ) — giữ con trỏ trong giới hạn số dòng mới. */
  function reloadReadings(r) {
    picker.setReadings(r);
    readingsData = r;
    buildDeckIndex(r);
    log(`[Tarot] Đã nạp lại readings.json: ${r?.single?.length || 0} dòng 1 lá, ` + Object.entries(r?.triple || {}).map(([t, l]) => `${t} ${l.length}`).join(', '));
    schedulePersist();
  }

  return { rpc, onComment, onGift, noteActivity, touch, getState, boot, reloadReadings, session, queue, lobby, config, autoPickNow };
}

module.exports = { createTarotService, parseComment, parseTopicCode, displayName, ADMIN_METHODS };
