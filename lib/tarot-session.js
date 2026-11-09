'use strict';
// Máy trạng thái phiên Tarot. Server là nguồn sự thật; client chỉ vẽ theo `phase` + `phaseStartedAt`.
// Đồng hồ và hẹn giờ được tiêm vào (clock = { now, setTimeout, clearTimeout }) nên test được bằng đồng hồ giả.
const { draw, withKeywords, pickReading } = require('./tarot-deck');

const ALL_PHASES = ['CALLING', 'SHUFFLING', 'DRAWING', 'REVEALING', 'READING', 'FAREWELL'];

function createSession({ config, queue, deck, rng = Math.random, clock, tts = null, onChange = () => {}, onEvent = () => {} }) {
  let version = 0;
  let enabled = true;
  let phase = 'IDLE';
  let phaseStartedAt = 0;
  let phaseEndsAt = null;
  let seat = null;
  let cards = [];
  let reading = null;
  let recent = [];            // id các lá của vài phiên gần nhất (mảng các mảng)
  let phaseTimer = null;
  let lockTimer = null;
  let sessionToken = 0;       // vô hiệu hóa callback cũ khi phiên đổi
  let prepared = null;

  // Thời gian chuyển khách (đếm ngược trên màn hình) giữa hai phiên; 0 = gọi người kế tiếp ngay.
  const intermissionSec = () => Math.max(0, Number(config.phaseSec.INTERMISSION) || 0);
  const phases = () => ALL_PHASES.filter((p) => !config.skipPhases.includes(p) || p === 'CALLING' || p === 'READING' || p === 'FAREWELL');

  function emit(reason) {
    version += 1;
    onChange(reason);
  }

  function clearTimers() {
    if (phaseTimer) clock.clearTimeout(phaseTimer);
    if (lockTimer) clock.clearTimeout(lockTimer);
    phaseTimer = lockTimer = null;
  }

  function estimateSec(lines) {
    return lines.reduce((s, l) => s + Math.max(1, l.length / config.ttsCharsPerSec), 0);
  }

  function ensureCards() {
    if (cards.length || !seat) return;
    const exclude = new Set(recent.flat());
    cards = withKeywords(deck, draw(deck, seat.cardsPlanned, { rng, exclude, reversedChance: config.reversedChance }));
    const lines = pickReading(deck, cards, seat.topic);
    reading = { lines, ttsUrls: [], durations: [], totalSec: Math.round(estimateSec(lines) * 10) / 10, ready: false };
    prepareTts(lines);
  }

  function prepareTts(lines) {
    if (!tts || !config.ttsEnabled) return;
    const token = sessionToken;
    prepared = Promise.resolve()
      .then(() => tts.prepare(lines))
      .then((res) => {
        if (!res || token !== sessionToken || !reading) return;
        const total = res.durations.reduce((s, d) => s + d, 0);
        reading.ttsUrls = res.urls;
        reading.durations = res.durations;
        reading.totalSec = Math.round(total * 10) / 10;
        reading.ready = true;
        emit('tts-ready');
      })
      .catch(() => {});
  }

  function enter(next) {
    const now = clock.now();
    phase = next;
    phaseStartedAt = now;
    if (phaseTimer) clock.clearTimeout(phaseTimer);

    if (next === 'IDLE') {
      phaseEndsAt = null;
      phaseTimer = null;
      emit('phase:IDLE');
      return;
    }

    // Chuyển khách: ghế trống, đếm ngược rồi mới gọi người kế tiếp.
    if (next === 'INTERMISSION') {
      const ms = Math.round(intermissionSec() * 1000);
      phaseEndsAt = now + ms;
      const token = sessionToken;
      phaseTimer = clock.setTimeout(() => {
        if (token !== sessionToken) return;
        if (enabled && queue.size() > 0) beginSession();
        else enter('IDLE');
      }, ms);
      emit('phase:INTERMISSION');
      return;
    }

    if (next === 'DRAWING' || next === 'REVEALING' || next === 'READING') ensureCards();
    if (next === 'REVEALING' || next === 'READING') cards = cards.map((c) => ({ ...c, revealed: true }));

    let durMs;
    if (next === 'READING') {
      const total = reading ? reading.totalSec : 0;
      const sec = Math.min(config.readingMaxSec, Math.max(config.readingMinSec, total + config.readingBufferSec));
      durMs = Math.round(sec * 1000);
      scheduleLock(durMs);
    } else {
      durMs = Math.round((config.phaseSec[next] ?? 5) * 1000);
    }
    phaseEndsAt = now + durMs;
    const token = sessionToken;
    phaseTimer = clock.setTimeout(() => { if (token === sessionToken) advance(); }, durMs);
    emit(`phase:${next}`);
  }

  // Khóa người kế tiếp khi phiên hiện tại còn <= lockBeforeEndSec (D2).
  function scheduleLock(readingMs) {
    if (lockTimer) clock.clearTimeout(lockTimer);
    const remainingAfterReadingStart = readingMs + (config.phaseSec.FAREWELL ?? 5) * 1000;
    const lockAt = Math.max(0, remainingAfterReadingStart - config.lockBeforeEndSec * 1000);
    const token = sessionToken;
    lockTimer = clock.setTimeout(() => {
      if (token !== sessionToken) return;
      if (queue.size() > 0 && !queue.getLockedId()) {
        queue.lockNext();
        emit('lock');
      }
    }, lockAt);
  }

  function advance() {
    const list = phases();
    const i = list.indexOf(phase);
    const next = list[i + 1];
    if (next) enter(next);
    else finishSession();
  }

  function finishSession() {
    clearTimers();
    const now = clock.now();
    if (cards.length) {
      recent.push(cards.map((c) => c.id));
      recent = recent.slice(-config.recentSessionsNoRepeat);
    }
    queue.endSeat(now);
    onEvent('session.end', { viewerId: seat?.viewerId });
    sessionToken += 1;
    seat = null; cards = []; reading = null; prepared = null;
    if (enabled && queue.size() > 0) {
      if (intermissionSec() > 0) enter('INTERMISSION');
      else beginSession();
    } else enter('IDLE');
  }

  function beginSession() {
    const e = queue.popNext();
    if (!e) { enter('IDLE'); return; }
    sessionToken += 1;
    seat = {
      viewerId: e.viewerId, name: e.name, avatar: e.avatar, since: clock.now(),
      topic: e.topic || 'general', lane: e.lane,
      cardsPlanned: Math.min(config.maxCardsPerSession, config.defaultCards), bonusUsed: false
    };
    cards = []; reading = null;
    onEvent('session.start', { viewerId: e.viewerId });
    enter('CALLING');
  }

  return {
    /** Gọi sau mỗi lần có người vào hàng: nếu đang rảnh thì bắt đầu phiên. */
    kick() {
      if (enabled && phase === 'IDLE' && queue.size() > 0) beginSession();
      else emit('queue');
    },

    start() { enabled = true; this.kick(); },
    stop() { enabled = false; emit('stopped'); },
    isEnabled: () => enabled,

    /** Quà lớn khi đang ngồi ghế: thêm lá bài, chỉ khi chưa rút (D4/D9), tối đa 1 lần mỗi phiên. */
    onSeatGift(viewerId, coins) {
      if (!seat || seat.viewerId !== String(viewerId)) return { ok: false, reason: 'not_seated' };
      if (coins < config.bigGiftCoins) return { ok: false, reason: 'small_gift' };
      if (seat.bonusUsed) return { ok: false, reason: 'already_bonus' };
      if (!['CALLING', 'SHUFFLING'].includes(phase)) return { ok: false, reason: 'too_late' };
      seat.bonusUsed = true;
      seat.cardsPlanned = Math.min(config.maxCardsPerSession, seat.cardsPlanned + config.bonusCardsOnBigGift);
      emit('bonus-card');
      return { ok: true, cardsPlanned: seat.cardsPlanned };
    },

    /** (admin) kết thúc phiên hiện tại ngay. */
    skip() {
      if (!seat) return { ok: false, reason: 'no_session' };
      finishSession();
      return { ok: true };
    },

    /** Khôi phục sau khởi động lại: người đang ngồi (nếu có) về đầu hàng, pha về IDLE. */
    restore(saved) {
      queue.importState(saved?.queue);
      if (saved?.seat && saved.seat.viewerId && !queue.has(saved.seat.viewerId)) {
        queue.requeueFront({
          viewerId: saved.seat.viewerId, name: saved.seat.name, avatar: saved.seat.avatar || '',
          lane: saved.seat.lane || 'free', topic: saved.seat.topic || 'general', joinedAt: 0, boost: 0
        });
      }
      recent = Array.isArray(saved?.recent) ? saved.recent.slice(-config.recentSessionsNoRepeat) : [];
      enabled = saved?.enabled !== false;
      phase = 'IDLE'; phaseStartedAt = clock.now(); phaseEndsAt = null;
      seat = null; cards = []; reading = null;
    },

    exportState() {
      return { queue: queue.exportState(), seat: seat ? { ...seat } : null, recent, enabled };
    },

    getState() {
      const q = queue.snapshot();
      return {
        version,
        serverTime: clock.now(),
        enabled,
        phase,
        phaseStartedAt,
        phaseEndsAt,
        seat: seat ? { viewerId: seat.viewerId, name: seat.name, avatar: seat.avatar, since: seat.since, topic: seat.topic, cardsPlanned: seat.cardsPlanned } : null,
        cards,
        reading: reading && ['READING', 'FAREWELL'].includes(phase) ? reading : (reading ? { totalSec: reading.totalSec, lines: [], ttsUrls: [], durations: [], ready: reading.ready } : null),
        queue: q.queue,
        queueMore: q.queueMore,
        queueTotal: q.queueTotal,
        config: { sessionTargetSec: config.sessionTargetSec, queueVisible: config.queueVisible }
      };
    },

    /** Phát lại trạng thái (khi hàng chờ đổi ngoài máy trạng thái). */
    touch(reason = 'touch') { emit(reason); },
    getPhase: () => phase,
    getSeat: () => seat,
    getVersion: () => version
  };
}

module.exports = { createSession, ALL_PHASES };
