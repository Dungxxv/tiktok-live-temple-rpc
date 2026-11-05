import { describe, expect, it } from 'bun:test';
import { normalizeGiftName, resolveGiftAction, resolveGiftReactionProfile } from '../public/js/gift-action-rules.js';

describe('gift action name resolver', () => {
  it.each([
    ['Rocket', 'rocket'],
    ['Tên Lửa', 'rocket'],
    ['Dragon', 'dragon'],
    ['Rồng', 'dragon'],
    ['Donut', 'donut'],
    ['Doughnut', 'donut'],
    ['Rose', 'rose'],
    ['Hoa Hồng', 'rose']
  ])('maps the observed display-name alias %s to %s', (giftName, expected) => {
    expect(resolveGiftAction({ giftName })).toBe(expected);
  });

  it('normalizes Vietnamese accents and case without mutating the source event', () => {
    const event = { giftName: 'HOA HỒNG', giftId: 'unchanged-id' };
    expect(normalizeGiftName(event)).toBe('hoa hong');
    expect(event).toEqual({ giftName: 'HOA HỒNG', giftId: 'unchanged-id' });
  });

  it('returns null for unknown, missing or non-string gift names', () => {
    expect(resolveGiftAction({ giftName: 'Galaxy' })).toBeNull();
    expect(resolveGiftAction({})).toBeNull();
    expect(resolveGiftAction(null)).toBeNull();
    expect(resolveGiftAction({ giftName: 123 })).toBeNull();
  });

  it('does not match partial words that merely contain an alias', () => {
    expect(resolveGiftAction({ giftName: 'Rocketship' })).toBeNull();
    expect(resolveGiftAction({ giftName: 'Dragonfruit' })).toBeNull();
  });
});


describe('gift reaction value tiers', () => {
  it('maps diamond value to increasingly expressive acknowledgements', () => {
    expect(resolveGiftReactionProfile({ diamondCount: 1 }).tier).toBe('small');
    expect(resolveGiftReactionProfile({ diamondCount: 100 }).tier).toBe('medium');
    expect(resolveGiftReactionProfile({ diamondCount: 500 }).tier).toBe('large');
    expect(resolveGiftReactionProfile({ diamondCount: 1000 }).tier).toBe('special');
    expect(resolveGiftReactionProfile({ diamondCount: 1000 }).bowAmount)
      .toBeGreaterThan(resolveGiftReactionProfile({ diamondCount: 1 }).bowAmount);
  });

  it('uses incremental streak deltas and safely bounds malformed values', () => {
    expect(resolveGiftReactionProfile({ diamondCount: 10, giftComboDelta: 50 }).totalDiamonds).toBe(500);
    expect(resolveGiftReactionProfile({ diamondCount: 10, giftComboDelta: 50 }).tier).toBe('large');
    expect(resolveGiftReactionProfile({ diamondCount: -2, giftComboDelta: Number.NaN }).totalDiamonds).toBe(1);
    expect(resolveGiftReactionProfile({ diamondCount: 9999999, giftComboDelta: 9999999 }).totalDiamonds).toBe(1000000);
  });
});
