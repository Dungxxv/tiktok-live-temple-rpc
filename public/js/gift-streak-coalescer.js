/**
 * Bounded deduplication for cumulative TikTok gift streak frames.
 * Only streakable gifts with a connector group ID are coalesced.
 */
export class GiftStreakCoalescer {
  constructor({ ttlMs = 5000, maxEntries = 200 } = {}) {
    this.ttlMs = Math.max(0, Number(ttlMs) || 0);
    this.maxEntries = Math.max(1, Math.floor(Number(maxEntries) || 1));
    this.recent = new Map();
  }

  shouldCoalesce(event, now = Date.now()) {
    if (!event || event.giftStreakable !== true || event.giftGroupId == null || String(event.giftGroupId) === '') {
      return false;
    }

    const key = String(event.giftGroupId);
    for (const [entryKey, timestamp] of this.recent) {
      if (now - timestamp > this.ttlMs) this.recent.delete(entryKey);
    }

    const previous = this.recent.get(key);
    const duplicate = previous !== undefined && now - previous <= this.ttlMs;
    if (event.giftRepeatEnd === true) {
      this.recent.delete(key);
    } else {
      this.recent.set(key, now);
    }

    while (this.recent.size > this.maxEntries) {
      this.recent.delete(this.recent.keys().next().value);
    }
    return duplicate;
  }

  clearStreak(groupId) {
    if (groupId == null || String(groupId) === '') return false;
    return this.recent.delete(String(groupId));
  }

  clear() {
    this.recent.clear();
  }

  snapshot() {
    return { size: this.recent.size, keys: [...this.recent.keys()] };
  }
}
