'use strict';
// Sảnh: người xem vừa có mặt/tương tác, chưa xếp hàng và chưa ngồi ghế. Hàm thuần, `now` truyền vào.

function createLobby(config) {
  const seen = new Map(); // viewerId -> { viewerId, name, avatar, at }
  const HARD_CAP = 500;

  return {
    touch(v, now) {
      if (!v || !v.viewerId) return;
      const id = String(v.viewerId);
      seen.delete(id); // đưa xuống cuối Map để giữ thứ tự theo lần thấy gần nhất
      seen.set(id, { viewerId: id, name: String(v.name || ''), avatar: String(v.avatar || ''), at: now });
      while (seen.size > HARD_CAP) seen.delete(seen.keys().next().value);
    },
    remove(id) { seen.delete(String(id)); },
    /** Mới nhất trước, loại trùng, loại người đang trong hàng/ghế, tối đa lobbyMax. */
    snapshot(now, excludeIds = new Set()) {
      const windowMs = config.lobbyWindowSec * 1000;
      const out = [];
      for (const e of Array.from(seen.values()).reverse()) {
        if (now - e.at > windowMs) continue;
        if (excludeIds.has(e.viewerId)) continue;
        out.push({ viewerId: e.viewerId, name: e.name, avatar: e.avatar });
        if (out.length >= config.lobbyMax) break;
      }
      return out;
    }
  };
}

module.exports = { createLobby };
