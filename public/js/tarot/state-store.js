// Giữ trạng thái tarot do server gửi và đồng bộ giờ server (client tự tính thời gian còn lại).
export function createStore() {
  let state = null;
  let offset = 0;                 // serverTime - Date.now()
  const listeners = new Set();

  return {
    /** Nhận trạng thái; bỏ gói cũ (version nhỏ hơn), trừ khi server đã khởi động lại (giờ nhảy tới). */
    set(next) {
      if (!next || typeof next.version !== 'number') return false;
      if (state && next.version < state.version && next.serverTime - state.serverTime < 2000) return false;
      offset = next.serverTime - Date.now();
      const prev = state;
      state = next;
      listeners.forEach((fn) => fn(state, prev));
      return true;
    },
    get: () => state,
    now: () => Date.now() + offset,
    /** Số giây đã trôi qua trong pha hiện tại. */
    phaseAge() { return state ? (this.now() - state.phaseStartedAt) / 1000 : 0; },
    /** Số giây còn lại của pha hiện tại, null nếu IDLE. */
    phaseLeft() { return state && state.phaseEndsAt ? Math.max(0, (state.phaseEndsAt - this.now()) / 1000) : null; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };
}

export function sessionKey(state) {
  return state && state.seat ? `${state.seat.viewerId}:${state.seat.since}` : null;
}
