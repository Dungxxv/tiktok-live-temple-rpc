'use strict';
// Hàng chờ Tarot — logic thuần: không gọi mạng, không dùng đồng hồ thật (mọi hàm nhận `now` là mili giây).
// Thứ tự trong mảng `entries` chính là thứ tự được gọi. Mỗi người tối đa 1 chỗ (hàng + ghế).

function createQueue(config) {
  /** @type {Array<{viewerId:string,name:string,avatar:string,lane:'free'|'gift',topic:string,joinedAt:number,boost:number}>} */
  let entries = [];
  const served = new Map();   // viewerId -> thời điểm bói xong (để tính cooldown)
  const jumpLog = new Map();  // viewerId -> [{ t, n }] số bậc đã nhảy trong cửa sổ trượt
  let seatId = null;
  let lockedId = null;
  let giftStreak = 0;         // số phiên liên tiếp vừa phục vụ từ làn quà

  const indexOf = (id) => entries.findIndex((e) => e.viewerId === id);

  // ---- Chế độ "sao" (queueOrder = 'stars'): bình luận +commentStars, quà + sao tương ứng;
  // hàng xếp theo sao giảm dần, bằng sao thì ai vào trước đứng trước. Người đã khóa (sắp vào ghế) giữ đầu hàng.
  const starsMode = () => config.queueOrder === 'stars';
  const byStars = (a, b) => (b.stars || 0) - (a.stars || 0) || a.joinedAt - b.joinedAt;

  /** Số sao cho một món quà: theo tên quà (giftStars) nếu có, không thì xu × starsPerCoin. */
  function giftStarsFor(coins, giftName) {
    const table = config.giftStars || {};
    const key = String(giftName || '').trim().toLowerCase();
    const hit = Object.keys(table).find((k) => k.toLowerCase() === key);
    return hit ? Number(table[hit]) || 0 : Math.max(0, Math.round(coins * (config.starsPerCoin ?? 10)));
  }

  /** Đưa người thứ idx về đúng chỗ theo sao (không vượt người đã khóa). Trả về chỉ số mới. */
  function placeByStars(idx) {
    const e = entries[idx];
    if (e.viewerId === lockedId) return idx;
    entries.splice(idx, 1);
    const minIdx = lockedId && entries[0]?.viewerId === lockedId ? 1 : 0;
    let to = entries.length;
    for (let j = minIdx; j < entries.length; j++) { if (byStars(e, entries[j]) < 0) { to = j; break; } }
    entries.splice(to, 0, e);
    return to;
  }

  function findTier(coins) {
    return config.giftTiers.find((t) => coins >= t.minCoins && (t.maxCoins === null || coins <= t.maxCoins)) || null;
  }

  function remainingJump(viewerId, now) {
    const windowMs = config.jumpWindowSec * 1000;
    const log = (jumpLog.get(viewerId) || []).filter((x) => now - x.t < windowMs);
    jumpLog.set(viewerId, log);
    const used = log.reduce((s, x) => s + x.n, 0);
    return Math.max(0, config.maxJumpPer60s - used);
  }

  function move(from, to) {
    if (from === to) return;
    const [e] = entries.splice(from, 1);
    entries.splice(to, 0, e);
  }

  function makeEntry(v, lane, now) {
    return {
      viewerId: String(v.viewerId),
      name: String(v.name || ''),
      avatar: String(v.avatar || ''),
      lane,
      topic: v.topic || 'general',
      joinedAt: now,
      boost: 0,
      coins: 0,
      stars: 0
    };
  }

  function cooldownLeftMs(viewerId, now) {
    const at = served.get(viewerId);
    if (at === undefined) return 0;
    return Math.max(0, at + config.rejoinCooldownSec * 1000 - now);
  }

  return {
    has: (id) => indexOf(String(id)) >= 0,
    size: () => entries.length,
    ids: () => entries.map((e) => e.viewerId),
    getSeatId: () => seatId,
    getLockedId: () => lockedId,
    getGiftStreak: () => giftStreak,
    cooldownLeftMs,

    /** Vào hàng bằng bình luận (làn miễn phí). */
    join(v, now) {
      if (!v || !v.viewerId) return { ok: false, reason: 'invalid' };
      const id = String(v.viewerId);
      if (seatId === id) return { ok: false, reason: 'seated' };
      if (indexOf(id) >= 0) return { ok: false, reason: 'already' };
      if (cooldownLeftMs(id, now) > 0) return { ok: false, reason: 'cooldown' };
      if (entries.length >= config.queueMax) return { ok: false, reason: 'full' };
      const entry = makeEntry({ ...v, viewerId: id }, 'free', now);
      entries.push(entry);
      if (starsMode()) {
        entry.stars = config.commentStars ?? 1;
        return { ok: true, position: placeByStars(entries.length - 1) + 1, stars: entry.stars };
      }
      return { ok: true, position: entries.length };
    },

    /**
     * Áp dụng quà: vào hàng (làn quà) nếu chưa có, rồi nhảy bậc theo mức quà.
     * - Không vượt người bị khóa (đứng đầu).
     * - Mức thường: tối đa maxJumpPerGift bậc/quà và maxJumpPer60s bậc/60 giây cho mỗi người.
     * - Mức "second": lên vị trí thứ `secondPosition`, không tính vào trần bậc.
     */
    boost(v, coins, now, giftName = '') {
      if (!v || !v.viewerId) return { ok: false, reason: 'invalid' };
      const id = String(v.viewerId);
      if (seatId === id) return { ok: false, reason: 'seated' };
      if (starsMode()) {
        const add = giftStarsFor(coins, giftName);
        if (add <= 0) return { ok: false, reason: 'no_stars' };
        let idx = indexOf(id);
        let joined = false;
        if (idx < 0) {
          if (entries.length >= config.queueMax) return { ok: false, reason: 'full' };
          entries.push(makeEntry({ ...v, viewerId: id }, 'gift', now));
          idx = entries.length - 1;
          joined = true;
        }
        const e = entries[idx];
        e.lane = 'gift';
        e.stars = (e.stars || 0) + add;
        e.coins = (e.coins || 0) + Math.max(0, Number(coins) || 0);
        const to = placeByStars(idx);
        const from = joined ? to : idx;
        if (!joined && from > to) e.boost += from - to;
        return { ok: true, joined, from, to, jumped: Math.max(0, from - to), stars: add, totalStars: e.stars };
      }
      const tier = findTier(coins);
      if (!tier) return { ok: false, reason: 'no_tier' };

      let joined = false;
      let idx = indexOf(id);
      if (idx < 0) {
        if (entries.length >= config.queueMax) return { ok: false, reason: 'full' };
        entries.push(makeEntry({ ...v, viewerId: id }, 'gift', now));
        idx = entries.length - 1;
        joined = true;
      } else {
        entries[idx].lane = 'gift';
      }

      const minIdx = lockedId ? 1 : 0;
      const from = idx;
      let to = idx;
      if (entries[idx].viewerId !== lockedId) {
        if (tier.jump === 'second') {
          to = Math.min(idx, Math.max(minIdx, config.secondPosition - 1));
        } else {
          const allowed = Math.min(tier.jump, config.maxJumpPerGift, remainingJump(id, now));
          to = Math.max(minIdx, idx - allowed);
          if (idx - to > 0) {
            const log = jumpLog.get(id) || [];
            log.push({ t: now, n: idx - to });
            jumpLog.set(id, log);
          }
        }
        move(idx, to);
      }
      entries[to].boost += from - to;
      entries[to].coins = (entries[to].coins || 0) + Math.max(0, Number(coins) || 0);
      return { ok: true, joined, tier: tier.name, from, to, jumped: from - to };
    },

    /** Người sẽ được gọi tiếp theo (có tính giữ chỗ cho làn miễn phí). -1 nếu hàng rỗng. */
    peekNextIndex() {
      if (entries.length === 0) return -1;
      if (lockedId) return indexOf(lockedId);
      if (starsMode()) return 0;   // luật sao: người đứng đầu (nhiều sao nhất) luôn được gọi
      if (giftStreak >= config.freeReserveEvery - 1) {
        let best = -1;
        entries.forEach((e, i) => {
          if (e.lane === 'free' && (best < 0 || e.joinedAt < entries[best].joinedAt)) best = i;
        });
        if (best >= 0) return best;
      }
      return 0;
    },

    /** Khóa người kế tiếp: đưa lên đầu và không ai chen được nữa. */
    lockNext() {
      const i = this.peekNextIndex();
      if (i < 0) return null;
      move(i, 0);
      lockedId = entries[0].viewerId;
      return { ...entries[0] };
    },

    /** Lấy người kế tiếp ra khỏi hàng và đặt vào ghế. */
    popNext() {
      if (entries.length === 0) return null;
      if (!lockedId) this.lockNext();
      const e = entries.shift();
      lockedId = null;
      seatId = e.viewerId;
      giftStreak = e.lane === 'gift' ? giftStreak + 1 : 0;
      return e;
    },

    /** Kết thúc phiên: ghi nhận cooldown, trả ghế. */
    endSeat(now) {
      if (seatId) served.set(seatId, now);
      seatId = null;
    },

    /** Bỏ phiên dở dang (khôi phục sau khởi động lại): đưa người đó về đầu hàng. */
    requeueFront(e) {
      if (indexOf(e.viewerId) >= 0) return;
      entries.unshift({ ...e });
    },

    remove(id) {
      const i = indexOf(String(id));
      if (i < 0) return false;
      entries.splice(i, 1);
      if (lockedId === String(id)) lockedId = null;
      return true;
    },

    snapshot(limit = config.queueVisible) {
      return {
        queue: entries.slice(0, limit).map((e) => ({
          viewerId: e.viewerId, name: e.name, avatar: e.avatar, lane: e.lane,
          boost: e.boost, coins: e.coins || 0, stars: e.stars || 0, joinedAt: e.joinedAt, locked: e.viewerId === lockedId
        })),
        queueMore: Math.max(0, entries.length - limit),
        queueTotal: entries.length
      };
    },

    exportState() {
      return {
        entries: entries.map((e) => ({ ...e })),
        served: Object.fromEntries(served),
        giftStreak,
        lockedId
      };
    },

    importState(s) {
      entries = Array.isArray(s?.entries) ? s.entries.map((e) => ({ ...e, stars: e.stars ?? (starsMode() ? (config.commentStars ?? 1) : 0) })) : [];
      served.clear();
      for (const [k, v] of Object.entries(s?.served || {})) served.set(k, v);
      giftStreak = Number(s?.giftStreak) || 0;
      lockedId = s?.lockedId && indexOf(s.lockedId) >= 0 ? s.lockedId : null;
      seatId = null;
      jumpLog.clear();
    }
  };
}

module.exports = { createQueue };
