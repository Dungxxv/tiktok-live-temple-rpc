import { describe, expect, it } from 'bun:test';
import { dispatchGiftSfx } from '../public/js/gift-sfx-dispatcher.js';

describe('dispatchGiftSfx', () => {
  it('routes each supported gift sound to its dedicated audio method', () => {
    const calls = [];
    const audio = Object.fromEntries([
      'playRocketLaunch', 'playExplosion', 'playDragonWhoosh',
      'playDragonRoar', 'playDonutChime', 'playRoseChime'
    ].map((name) => [name, (...args) => calls.push([name, ...args])]));

    const effectId = 42;
    for (const type of [
      'rocket-launch', 'explosion', 'dragon-whoosh',
      'dragon-roar', 'donut-chime', 'rose-chime'
    ]) expect(dispatchGiftSfx(audio, type, effectId)).toBe(true);

    expect(calls).toEqual([
      ['playRocketLaunch', effectId],
      ['playExplosion', 1, effectId],
      ['playDragonWhoosh', effectId],
      ['playDragonRoar', effectId],
      ['playDonutChime', effectId],
      ['playRoseChime', effectId]
    ]);
  });

  it('cancels only the requested gift sound group', () => {
    const cancelled = [];
    const audio = { cancelGiftSfxGroup: (id) => { cancelled.push(id); return true; } };
    expect(dispatchGiftSfx(audio, 'cancel', 7)).toBe(true);
    expect(cancelled).toEqual([7]);
    expect(dispatchGiftSfx({}, 'cancel', 7)).toBe(false);
  });

  it('ignores unknown sound names without invoking audio methods', () => {
    let called = false;
    expect(dispatchGiftSfx({ playRocketLaunch: () => { called = true; } }, 'rocket')).toBe(false);
    expect(called).toBe(false);
  });

  it('safely ignores missing audio engines and unavailable methods', () => {
    expect(dispatchGiftSfx(null, 'rocket-launch')).toBe(false);
    expect(dispatchGiftSfx({}, 'rose-chime')).toBe(false);
  });
});
