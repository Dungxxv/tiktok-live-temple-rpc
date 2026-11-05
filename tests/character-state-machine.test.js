import { describe, expect, it } from 'bun:test';
import { CharacterStateMachine } from '../public/js/character-state-machine.js';

const devotee = (user) => ({ type: 'burnIncense', user });

describe('CharacterStateMachine', () => {
  it('grants one character exclusive ownership and queues later devotees FIFO', () => {
    const machine = new CharacterStateMachine();
    expect(machine.request(devotee('A')).started).toBe(true);
    expect(machine.request(devotee('B')).queued).toBe(true);
    expect(machine.request(devotee('C')).queued).toBe(true);
    expect(machine.snapshot().active.user).toBe('A');
    expect(machine.completeActive().event.user).toBe('B');
    expect(machine.completeActive().event.user).toBe('C');
    expect(machine.completeActive().started).toBe(false);
    expect(machine.snapshot().state).toBe('IDLE');
  });

  it('tracks the approach, offering and bow phases in order', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    expect(machine.snapshot().state).toBe('APPROACHING');
    expect(machine.transition('OFFERING')).toBe(true);
    expect(machine.transition('BOWING')).toBe(true);
    expect(machine.transition('OFFERING')).toBe(false);
    expect(machine.snapshot().state).toBe('BOWING');
  });

  it('interrupts the active devotee and puts that same devotee at the front of the queue', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.request(devotee('B'));
    const result = machine.interrupt('rocket', { giftName: 'Rocket' });
    expect(result.interrupted).toBe(true);
    expect(machine.snapshot()).toMatchObject({
      state: 'INTERRUPTED',
      active: null,
      queueLength: 2,
      effect: 'rocket'
    });
    machine.finishEffect();
    expect(machine.finishCooldown().event.user).toBe('A');
  });

  it('starts a world gift effect when the altar is idle and no devotee is active', () => {
    const machine = new CharacterStateMachine();
    const result = machine.interrupt('rocket', { giftName: 'Rocket' });
    expect(result).toMatchObject({
      interrupted: true,
      startsWithoutCharacter: true,
      action: 'rocket'
    });
    expect(machine.snapshot()).toMatchObject({
      state: 'INTERRUPTED',
      active: null,
      effect: 'rocket',
      queueLength: 0
    });
    expect(machine.finishEffect()).toMatchObject({ cooldown: true });
    expect(machine.finishCooldown()).toMatchObject({ started: false });
    expect(machine.snapshot().state).toBe('IDLE');
  });

  it('keeps a gift arriving during cooldown as an effect and resumes the interrupted devotee afterward', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.request(devotee('B'));
    machine.interrupt('rocket', { giftName: 'Rocket' });
    expect(machine.finishEffect()).toMatchObject({ cooldown: true });
    expect(machine.snapshot().state).toBe('COOLDOWN');

    const result = machine.interrupt('dragon', { giftName: 'Dragon' });
    expect(result).toMatchObject({
      interrupted: true,
      resumesCooldown: true,
      action: 'dragon'
    });
    expect(machine.snapshot()).toMatchObject({
      state: 'INTERRUPTED',
      active: null,
      effect: 'dragon',
      queueLength: 2
    });

    machine.finishEffect();
    expect(machine.finishCooldown().event.user).toBe('A');
    expect(machine.snapshot().active.user).toBe('A');
  });

  it('prioritizes Rocket over Donut while an effect is already playing', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.interrupt('donut', { giftName: 'Donut' });
    const result = machine.interrupt('rocket', { giftName: 'Rocket' });
    expect(result).toMatchObject({ interrupted: true, superseded: true, previous: 'donut' });
    expect(machine.snapshot().effect).toBe('rocket');
  });

  it('keeps Dragon above Donut and Rocket above Dragon', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.interrupt('donut', { giftName: 'Donut' });
    expect(machine.interrupt('dragon', { giftName: 'Dragon' }).superseded).toBe(true);
    expect(machine.snapshot().effect).toBe('dragon');
    expect(machine.interrupt('rocket', { giftName: 'Rocket' }).superseded).toBe(true);
    expect(machine.snapshot().effect).toBe('rocket');
  });

  it('queues lower-priority effects behind the current higher-priority effect', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.interrupt('rocket', { giftName: 'Rocket' });
    const result = machine.interrupt('donut', { giftName: 'Donut' });
    expect(result.queuedEffect).toBe(true);
    expect(machine.finishEffect().nextEffect.action).toBe('donut');
    expect(machine.finishEffect().cooldown).toBe(true);
    expect(machine.finishCooldown().event.user).toBe('A');
  });

  it('rejects new devotees when the bounded queue is full', () => {
    const machine = new CharacterStateMachine({ maxQueue: 1 });
    machine.request(devotee('A'));
    expect(machine.request(devotee('B')).queued).toBe(true);
    expect(machine.request(devotee('C'))).toMatchObject({ accepted: false, reason: 'queue_full' });
    expect(machine.snapshot().queueLength).toBe(1);
  });

  it('recovers the interrupted devotee after a chain of effect supersessions', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.request(devotee('B'));
    machine.interrupt('donut', { giftName: 'Donut' });
    machine.interrupt('dragon', { giftName: 'Dragon' });
    machine.interrupt('rocket', { giftName: 'Rocket' });
    expect(machine.snapshot()).toMatchObject({
      state: 'INTERRUPTED',
      active: null,
      effect: 'rocket',
      queueLength: 2
    });
    machine.finishEffect();
    expect(machine.finishCooldown().event.user).toBe('A');
    expect(machine.snapshot().active.user).toBe('A');
  });

  it('bounds the queued gift effects and reports overflow without losing the active effect', () => {
    const machine = new CharacterStateMachine({ maxQueue: 1 });
    machine.request(devotee('A'));
    machine.interrupt('rocket', { giftName: 'Rocket' });
    expect(machine.interrupt('donut', { giftName: 'Donut' }).queuedEffect).toBe(true);
    expect(machine.interrupt('rose', { giftName: 'Rose' })).toMatchObject({
      interrupted: false,
      reason: 'effect_queue_full'
    });
    expect(machine.interrupt('donut', { giftName: 'Donut', sequence: 2 })).toMatchObject({
      interrupted: false,
      reason: 'effect_queue_full'
    });
    expect(machine.snapshot()).toMatchObject({
      effect: 'rocket',
      queuedEffects: ['donut']
    });
  });

  it('replaces the lowest-priority queued effect when a stronger gift arrives at capacity', () => {
    const machine = new CharacterStateMachine({ maxQueue: 1 });
    machine.request(devotee('A'));
    machine.interrupt('rocket', { giftName: 'Rocket' });
    machine.interrupt('rose', { giftName: 'Rose', sequence: 'rose' });
    const result = machine.interrupt('donut', { giftName: 'Donut', sequence: 'donut' });
    expect(result).toMatchObject({
      interrupted: false,
      queuedEffect: true,
      evictedAction: 'rose'
    });
    expect(machine.snapshot()).toMatchObject({
      effect: 'rocket',
      queuedEffects: ['donut']
    });
    expect(machine.finishEffect().nextEffect.event.sequence).toBe('donut');
  });

  it('preserves the interrupted devotee at the front when evicting overflow from a full queue', () => {
    const machine = new CharacterStateMachine({ maxQueue: 2 });
    machine.request(devotee('A'));
    machine.request(devotee('B'));
    machine.request(devotee('C'));
    machine.interrupt('rocket', { giftName: 'Rocket' });

    expect(machine.snapshot()).toMatchObject({
      active: null,
      queueLength: 2,
      effect: 'rocket'
    });
    machine.finishEffect();
    expect(machine.finishCooldown().event.user).toBe('A');
    expect(machine.snapshot().queueLength).toBe(1);
    expect(machine.completeActive().event.user).toBe('B');
  });

  it('supports a zero-capacity queue without throwing or retaining waiting work', () => {
    const machine = new CharacterStateMachine({ maxQueue: 0 });
    machine.request(devotee('A'));
    machine.interrupt('rocket', { giftName: 'Rocket' });
    expect(machine.request(devotee('B'))).toMatchObject({
      accepted: false,
      reason: 'queue_full'
    });
    expect(machine.interrupt('donut', { giftName: 'Donut' })).toMatchObject({
      interrupted: false,
      reason: 'effect_queue_full'
    });
    expect(machine.snapshot()).toMatchObject({
      active: null,
      queueLength: 0,
      effect: 'rocket',
      queuedEffects: []
    });
  });

  it('falls back to the default queue limit when the configured limit is invalid', () => {
    const machine = new CharacterStateMachine({ maxQueue: -1 });
    machine.request(devotee('A'));
    expect(machine.request(devotee('B'))).toMatchObject({ accepted: true, queued: true });
    expect(machine.snapshot().queueLength).toBe(1);
  });

  it('does not mutate character ownership for an unknown gift action', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    expect(machine.interrupt('unknown', { giftName: 'Mystery' })).toMatchObject({
      interrupted: false,
      reason: 'unknown_action'
    });
    expect(machine.snapshot()).toMatchObject({
      state: 'APPROACHING',
      active: { user: 'A' },
      effect: null
    });
  });
});


describe('gift priority tiers', () => {
  it('keeps Rose below Donut, Dragon and Rocket', () => {
    const machine = new CharacterStateMachine();
    machine.request({ type: 'burnIncense', user: 'A' });
    expect(machine.interrupt('rose', { giftName: 'Rose' }).interrupted).toBe(true);
    expect(machine.interrupt('donut', { giftName: 'Donut' }).superseded).toBe(true);
    expect(machine.interrupt('rose', { giftName: 'Rose' }).queuedEffect).toBe(true);
    expect(machine.interrupt('dragon', { giftName: 'Dragon' }).superseded).toBe(true);
    expect(machine.interrupt('rocket', { giftName: 'Rocket' }).superseded).toBe(true);
    expect(machine.snapshot().effect).toBe('rocket');
    expect(machine.snapshot().queuedEffects).toContain('rose');
  });
  it('queues equal-priority gifts in arrival order instead of superseding the active effect', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.interrupt('dragon', { giftName: 'Dragon', sequence: 1 });
    const first = machine.interrupt('dragon', { giftName: 'Dragon', sequence: 2 });
    const second = machine.interrupt('dragon', { giftName: 'Dragon', sequence: 3 });
    expect(first).toMatchObject({ interrupted: false, queuedEffect: true });
    expect(second).toMatchObject({ interrupted: false, queuedEffect: true });
    expect(machine.snapshot()).toMatchObject({
      effect: 'dragon',
      queuedEffects: ['dragon', 'dragon']
    });
    expect(machine.finishEffect().nextEffect.event.sequence).toBe(2);
    expect(machine.finishEffect().nextEffect.event.sequence).toBe(3);
  });

  it('orders queued effects by priority while preserving arrival order within each tier', () => {
    const machine = new CharacterStateMachine();
    machine.request(devotee('A'));
    machine.interrupt('rocket', { giftName: 'Rocket' });
    machine.interrupt('rose', { giftName: 'Rose', sequence: 'rose' });
    machine.interrupt('donut', { giftName: 'Donut', sequence: 'donut-1' });
    machine.interrupt('dragon', { giftName: 'Dragon', sequence: 'dragon' });
    machine.interrupt('donut', { giftName: 'Donut', sequence: 'donut-2' });
    expect(machine.snapshot().queuedEffects).toEqual(['dragon', 'donut', 'donut', 'rose']);
    expect(machine.finishEffect().nextEffect.event.sequence).toBe('dragon');
    expect(machine.finishEffect().nextEffect.event.sequence).toBe('donut-1');
    expect(machine.finishEffect().nextEffect.event.sequence).toBe('donut-2');
    expect(machine.finishEffect().nextEffect.event.sequence).toBe('rose');
  });

});
