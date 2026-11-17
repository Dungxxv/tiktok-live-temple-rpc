'use strict';
// Chọn "lượt bốc" từ data/tarot/readings.json (đồng bộ từ Google Sheet) — logic thuần, rng tiêm vào.
// - Phiên quà (triple): lấy dòng TUẦN TỰ theo con trỏ riêng từng chủ đề, hết dòng cuối thì quay lại dòng đầu.
// - Phiên vào phòng (single): chọn NGẪU NHIÊN, tránh các dòng vừa dùng gần đây.
// - Đặt chỗ: khi khách thành người kế tiếp thì giữ sẵn dòng cho họ (để nạp trước TTS); khách rời hàng thì trả dòng
//   (lùi con trỏ nếu đó là dòng mới nhất được cấp, để không bỏ sót dòng).

function createReadingPicker({ readings = null, rng = Math.random, recentSingleMax = 10, fallbackTopic = 'overview', log = () => {} } = {}) {
  let data = { single: [], triple: {} };
  let cursors = {};             // topic → chỉ số dòng kế tiếp (0-based)
  let recentSingle = [];        // chỉ số dòng 1 lá vừa dùng
  const reservations = new Map();   // viewerId → { type, topic, index, row, fallback }

  function setReadings(r) {
    data = { single: Array.isArray(r?.single) ? r.single : [], triple: r?.triple && typeof r.triple === 'object' ? r.triple : {} };
    // Sheet đổi số dòng: giữ con trỏ trong giới hạn mới (vượt thì về dòng đầu).
    for (const t of Object.keys(cursors)) {
      const len = data.triple[t]?.length || 0;
      if (!len || cursors[t] >= len || cursors[t] < 0) cursors[t] = 0;
    }
    recentSingle = recentSingle.filter((i) => i < data.single.length);
  }
  setReadings(readings);

  const hasTopic = (t) => (data.triple[t]?.length || 0) > 0;

  function reserveTriple(topic) {
    let t = topic;
    let fallback = null;
    if (!hasTopic(t)) {
      fallback = t;
      t = hasTopic(fallbackTopic) ? fallbackTopic : Object.keys(data.triple).find(hasTopic);
      if (!t) return null;
      log(`[Tarot] ${topic === 'specific' ? 'specificFallback' : 'topicFallback'}: chủ đề "${topic}" chưa có tab 3 lá → đọc "${t}"`);
    }
    const list = data.triple[t];
    const index = (cursors[t] ?? 0) % list.length;
    cursors[t] = (index + 1) % list.length;
    return { type: 'triple', topic: t, requestedTopic: topic, fallback, index, row: list[index] };
  }

  function reserveSingle() {
    const n = data.single.length;
    if (!n) return null;
    const avoid = new Set(recentSingle.slice(-Math.min(recentSingleMax, n - 1)));
    const pool = [];
    for (let i = 0; i < n; i++) if (!avoid.has(i)) pool.push(i);
    const index = pool[Math.floor(rng() * pool.length)] ?? 0;
    recentSingle.push(index);
    if (recentSingle.length > recentSingleMax * 3) recentSingle = recentSingle.slice(-recentSingleMax);
    return { type: 'single', topic: 'overview', requestedTopic: 'overview', fallback: null, index, row: data.single[index] };
  }

  function release(viewerId) {
    const r = reservations.get(String(viewerId));
    if (!r) return false;
    reservations.delete(String(viewerId));
    if (r.type === 'triple') {
      const len = data.triple[r.topic]?.length || 0;
      if (len && cursors[r.topic] === (r.index + 1) % len) cursors[r.topic] = r.index;
    } else {
      const k = recentSingle.lastIndexOf(r.index);
      if (k >= 0) recentSingle.splice(k, 1);
    }
    return true;
  }

  return {
    hasData: () => data.single.length > 0 || Object.values(data.triple).some((l) => l?.length),
    hasTopic,
    setReadings,
    /** Giữ sẵn một lượt bốc cho khách. Gọi lại với cùng loại/chủ đề thì trả lại lượt đã giữ. */
    reserve(viewerId, { type, topic }) {
      const id = String(viewerId);
      const cur = reservations.get(id);
      if (cur && cur.type === type && (type === 'single' || cur.requestedTopic === topic)) return cur;
      if (cur) release(id);
      const r = type === 'triple' ? reserveTriple(topic) : reserveSingle();
      if (r) reservations.set(id, r);
      return r;
    },
    release,
    peek: (viewerId) => reservations.get(String(viewerId)) || null,
    /** Xem trước (KHÔNG giữ chỗ, không đổi con trỏ) dòng kế tiếp cho một lượt 3 lá. Phiên 1 lá chọn ngẫu nhiên → null. */
    preview({ type, topic }) {
      if (type !== 'triple') return null;
      let t = topic; let fallback = null;
      if (!hasTopic(t)) { fallback = t; t = hasTopic(fallbackTopic) ? fallbackTopic : Object.keys(data.triple).find(hasTopic); if (!t) return null; }
      const list = data.triple[t];
      const index = (cursors[t] ?? 0) % list.length;
      return { type: 'triple', topic: t, requestedTopic: topic, fallback, index, row: list[index] };
    },
    /** Khách vào ghế: lấy lượt đã giữ (hoặc cấp mới) và bỏ đặt chỗ. */
    take(viewerId, want) {
      const r = this.reserve(viewerId, want);
      reservations.delete(String(viewerId));
      return r;
    },
    exportState: () => ({ cursors: { ...cursors }, recentSingle: recentSingle.slice() }),
    importState(s) {
      cursors = {};
      for (const [t, v] of Object.entries(s?.cursors || {})) {
        const len = data.triple[t]?.length || 0;
        cursors[t] = Number.isInteger(v) && v >= 0 && v < len ? v : 0;
      }
      recentSingle = Array.isArray(s?.recentSingle) ? s.recentSingle.filter((i) => Number.isInteger(i) && i < data.single.length) : [];
    },
    cursorOf: (topic) => cursors[topic] ?? 0
  };
}

module.exports = { createReadingPicker };
