export class GiftEffectRegistry {
  #entries = new Map();
  #maxEntries;

  constructor({ maxEntries = 120 } = {}) {
    const limit = Number.isFinite(maxEntries) ? Math.floor(maxEntries) : 120;
    this.#maxEntries = Math.max(1, limit);
  }

  track(element, animation) {
    if (!element || !animation || typeof animation.cancel !== 'function') return false;
    if (this.#entries.has(animation)) return false;

    this.#entries.set(animation, element);
    try {
      Promise.resolve(animation.finished).catch(() => {}).finally(() => {
        if (this.#entries.get(animation) !== element) return;
        this.#entries.delete(animation);
        this.#removeElement(element);
      });
    } catch {
      this.#entries.delete(animation);
      this.#removeElement(element);
      return false;
    }

    this.#enforceLimit();
    return true;
  }

  #removeElement(element) {
    try { element.remove?.(); } catch {}
  }

  #cancelEntry(animation, element) {
    try { animation.cancel(); } catch {}
    this.#removeElement(element);
  }

  #enforceLimit() {
    while (this.#entries.size > this.#maxEntries) {
      const oldest = this.#entries.entries().next().value;
      if (!oldest) break;
      const [animation, element] = oldest;
      this.#entries.delete(animation);
      this.#cancelEntry(animation, element);
    }
  }

  clear() {
    const entries = [...this.#entries.entries()];
    this.#entries.clear();
    for (const [animation, element] of entries) {
      this.#cancelEntry(animation, element);
    }
    return entries.length;
  }

  get size() { return this.#entries.size; }
  get maxEntries() { return this.#maxEntries; }
}
