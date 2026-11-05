import { describe, expect, it } from 'bun:test';
import { GiftStreakCoalescer } from '../public/js/gift-streak-coalescer.js';

const frame = (overrides = {}) => ({
  giftStreakable: true,
  giftGroupId: 'group-1',
  giftRepeatEnd: false,
  ...overrides
});

describe('GiftStreakCoalescer', () => {
  it('allows the first streak frame and coalesces later frames in the same group', () => {
    const coalescer = new GiftStreakCoalescer();
    expect(coalescer.shouldCoalesce(frame(), 1000)).toBe(false);
    expect(coalescer.shouldCoalesce(frame(), 1400)).toBe(true);
    expect(coalescer.shouldCoalesce(frame(), 1800)).toBe(true);
  });

  it('does not coalesce non-streakable gifts or events without a group ID', () => {
    const coalescer = new GiftStreakCoalescer();
    expect(coalescer.shouldCoalesce(frame({ giftStreakable: false }), 1000)).toBe(false);
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: '' }), 1100)).toBe(false);
    expect(coalescer.snapshot().size).toBe(0);
  });

  it('keeps different group IDs independent', () => {
    const coalescer = new GiftStreakCoalescer();
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: 'A' }), 1000)).toBe(false);
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: 'B' }), 1100)).toBe(false);
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: 'A' }), 1200)).toBe(true);
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: 'B' }), 1300)).toBe(true);
  });

  it('expires a group after the configured TTL', () => {
    const coalescer = new GiftStreakCoalescer({ ttlMs: 5000 });
    expect(coalescer.shouldCoalesce(frame(), 1000)).toBe(false);
    expect(coalescer.shouldCoalesce(frame(), 6001)).toBe(false);
  });

  it('coalesces the final duplicate frame and clears the key for a fresh streak', () => {
    const coalescer = new GiftStreakCoalescer();
    expect(coalescer.shouldCoalesce(frame(), 1000)).toBe(false);
    expect(coalescer.shouldCoalesce(frame({ giftRepeatEnd: true }), 1200)).toBe(true);
    expect(coalescer.snapshot().size).toBe(0);
    expect(coalescer.shouldCoalesce(frame(), 1300)).toBe(false);
  });

  it('does not retain a first frame marked final', () => {
    const coalescer = new GiftStreakCoalescer();
    expect(coalescer.shouldCoalesce(frame({ giftRepeatEnd: true }), 1000)).toBe(false);
    expect(coalescer.snapshot().size).toBe(0);
  });

  it('bounds retained group IDs and supports explicit clearing', () => {
    const coalescer = new GiftStreakCoalescer({ maxEntries: 2 });
    coalescer.shouldCoalesce(frame({ giftGroupId: 'A' }), 1000);
    coalescer.shouldCoalesce(frame({ giftGroupId: 'B' }), 1100);
    coalescer.shouldCoalesce(frame({ giftGroupId: 'C' }), 1200);
    expect(coalescer.snapshot()).toEqual({ size: 2, keys: ['B', 'C'] });
    coalescer.clear();
    expect(coalescer.snapshot().size).toBe(0);
    // A reused TikTok group ID after reconnect must be treated as a new streak.
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: 'C' }), 1250)).toBe(false);
  });

  it('clears only the matching group when a duplicate final frame is dropped upstream', () => {
    const coalescer = new GiftStreakCoalescer();
    coalescer.shouldCoalesce(frame({ giftGroupId: 'A' }), 1000);
    coalescer.shouldCoalesce(frame({ giftGroupId: 'B' }), 1100);

    expect(coalescer.clearStreak('A')).toBe(true);
    expect(coalescer.snapshot()).toEqual({ size: 1, keys: ['B'] });
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: 'A' }), 1200)).toBe(false);
    expect(coalescer.clearStreak('missing')).toBe(false);
  });

  it('clears one streak without disturbing other active groups', () => {
    const coalescer = new GiftStreakCoalescer();
    coalescer.shouldCoalesce(frame({ giftGroupId: 'A' }), 1000);
    coalescer.shouldCoalesce(frame({ giftGroupId: 'B' }), 1100);

    expect(coalescer.clearStreak('A')).toBe(true);
    expect(coalescer.snapshot()).toEqual({ size: 1, keys: ['B'] });
    expect(coalescer.shouldCoalesce(frame({ giftGroupId: 'A' }), 1200)).toBe(false);
    expect(coalescer.clearStreak('missing')).toBe(false);
    expect(coalescer.clearStreak('')).toBe(false);
  });

  it('handles a zero timestamp without treating it as a missing entry', () => {
    const coalescer = new GiftStreakCoalescer();
    expect(coalescer.shouldCoalesce(frame(), 0)).toBe(false);
    expect(coalescer.shouldCoalesce(frame(), 1)).toBe(true);
  });
});
