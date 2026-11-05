/**
 * Deterministic single-character state machine.
 * Visual orchestration only: it never changes server merit/reward data.
 */
export const GIFT_PRIORITY = Object.freeze({ rocket: 100, dragon: 80, donut: 60, rose: 30 });

export class CharacterStateMachine {
  constructor({ maxQueue = 40 } = {}) {
    // A zero-capacity queue is valid (reject all waiting work); malformed
    // limits fall back to the safe default instead of breaking interrupt().
    this.maxQueue = Number.isInteger(maxQueue) && maxQueue >= 0 ? maxQueue : 40;
    this.state = 'IDLE';
    this.active = null;
    this.queue = [];
    this.effect = null;
    this.effectQueue = [];
  }

  transition(nextState) {
    const allowed = {
      APPROACHING: ['OFFERING', 'INTERRUPTED'],
      OFFERING: ['BOWING', 'INTERRUPTED'],
      BOWING: ['RETURNING', 'INTERRUPTED'],
      RETURNING: ['IDLE'],
      INTERRUPTED: ['COOLDOWN'],
      COOLDOWN: ['IDLE']
    };
    if (!allowed[this.state]?.includes(nextState)) return false;
    this.state = nextState;
    return true;
  }

  request(event) {
    if (!event || typeof event !== 'object') return { accepted: false };
    if (!this.active && !this.effect && this.state === 'IDLE') {
      this.active = event;
      this.state = 'APPROACHING';
      return { accepted: true, started: true, event };
    }
    if (this.queue.length >= this.maxQueue) return { accepted: false, reason: 'queue_full' };
    this.queue.push(event);
    return { accepted: true, queued: true, position: this.queue.length };
  }

  interrupt(action, giftEvent) {
    const priority = GIFT_PRIORITY[action] || 0;
    if (!priority) return { interrupted: false, reason: 'unknown_action' };

    if (this.effect) {
      if (priority > this.effect.priority) {
        const previous = this.effect;
        this.effect = { action, priority, event: giftEvent };
        this.state = 'INTERRUPTED';
        return { interrupted: true, superseded: true, previous: previous.action, action };
      }
      let evicted = null;
      if (this.effectQueue.length >= this.maxQueue) {
        // The queue is already priority-sorted (highest first), so its tail
        // is the lowest-priority waiting effect. Replace it only when the
        // incoming gift has strictly higher priority; equal-tier arrivals
        // retain FIFO order and lower tiers cannot displace earlier gifts.
        const lowest = this.effectQueue[this.effectQueue.length - 1];
        if (!lowest || priority <= lowest.priority) {
          return { interrupted: false, reason: 'effect_queue_full' };
        }
        evicted = this.effectQueue.pop();
      }
      this.effectQueue.push({ action, priority, event: giftEvent });
      this.effectQueue.sort((a, b) => b.priority - a.priority);
      return {
        interrupted: false,
        queuedEffect: true,
        position: this.effectQueue.findIndex((item) => item.event === giftEvent) + 1,
        ...(evicted ? { evictedAction: evicted.action } : {})
      };
    }

    // The short cooldown after a gift still belongs to the interrupted
    // devotee's handoff. A gift arriving in this window must remain a gift
    // effect, not fall through and become an ordinary queued visit.
    if (!this.active && this.state === 'COOLDOWN') {
      this.effect = { action, priority, event: giftEvent };
      this.state = 'INTERRUPTED';
      return { interrupted: true, resumesCooldown: true, action };
    }

    if (!this.active && this.state === 'IDLE') {
      // Gifts remain first-class world actions even when nobody is at the altar.
      // The normal effect/cooldown lifecycle still serializes incoming gifts.
      this.effect = { action, priority, event: giftEvent };
      this.state = 'INTERRUPTED';
      return { interrupted: true, startsWithoutCharacter: true, action };
    }

    if (!this.active) return { interrupted: false, reason: 'no_active_character' };

    // Preserve the interrupted devotee only when the waiting queue has
    // capacity. With maxQueue=0 the gift still takes ownership, but the
    // interrupted visit is intentionally not retained as waiting work.
    if (this.maxQueue > 0) {
      if (this.queue.length >= this.maxQueue) this.queue.pop();
      this.queue.unshift(this.active);
    }
    this.active = null;
    this.effect = { action, priority, event: giftEvent };
    this.state = 'INTERRUPTED';
    return { interrupted: true, action };
  }

  finishEffect() {
    if (this.effectQueue.length) {
      this.effect = this.effectQueue.shift();
      this.state = 'INTERRUPTED';
      return { nextEffect: this.effect };
    }
    this.effect = null;
    this.state = 'COOLDOWN';
    return { cooldown: true };
  }

  finishCooldown() {
    this.state = 'IDLE';
    return this.startNext();
  }

  completeActive() {
    this.active = null;
    this.state = 'IDLE';
    return this.startNext();
  }

  startNext() {
    if (this.state !== 'IDLE' || this.active || this.effect || !this.queue.length) {
      return { started: false };
    }
    this.active = this.queue.shift();
    this.state = 'APPROACHING';
    return { started: true, event: this.active };
  }

  snapshot() {
    return {
      state: this.state,
      active: this.active,
      queueLength: this.queue.length,
      effect: this.effect?.action || null,
      queuedEffects: this.effectQueue.map((item) => item.action)
    };
  }
}
