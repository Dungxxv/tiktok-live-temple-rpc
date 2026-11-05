import { describe, expect, it } from 'bun:test';
import { findBestAnimationClip } from '../public/js/three-animation-utils.js';

describe('GLB animation clip matching', () => {
  it('prefers explicit action names over generic synonyms and source order', () => {
    const generic = { name: 'Run Cycle' };
    const specific = { name: 'Walk Forward' };
    const actions = findBestAnimationClip([generic, specific]);
    expect(actions.walk).toBe(specific);
  });

  it('matches common exported clip separators and case variations', () => {
    const idle = { name: 'Armature|Mixamo.com|Idle' };
    const bow = { name: 'Prayer-Kneel' };
    const actions = findBestAnimationClip([idle, bow]);
    expect(actions.idle).toBe(idle);
    expect(actions.bow).toBe(bow);
  });

  it('normalizes repeated whitespace, tabs and newlines in exported clip names', () => {
    const idle = { name: 'Armature|Mixamo.com|  Idle\t\nLoop' };
    const actions = findBestAnimationClip([idle]);
    expect(actions.idle).toBe(idle);
  });

  it('recognizes gerund forms used by common animation exports', () => {
    const idle = { name: 'Breathing Loop' };
    const bow = { name: 'Bowing_Gently' };
    const actions = findBestAnimationClip([idle, bow]);
    expect(actions.idle).toBe(idle);
    expect(actions.bow).toBe(bow);
  });

  it('recognizes prayer and kneeling variants', () => {
    const prayer = { name: 'Praying Idle' };
    const kneel = { name: 'Kneeling Down' };
    const actions = findBestAnimationClip([prayer, kneel]);
    expect(actions.bow).toBe(prayer);
    expect(actions.idle).toBeNull();
    expect(actions.walk).toBeNull();
  });

  it('does not match generic aliases inside unrelated words', () => {
    const unrelated = { name: 'Remove Props' };
    const actions = findBestAnimationClip([unrelated]);
    expect(actions.walk).toBeNull();
    expect(actions.idle).toBeNull();
    expect(actions.bow).toBeNull();
  });

  it('never assigns the same ambiguous clip to multiple character states', () => {
    const ambiguous = { name: 'Idle Walk' };
    const dedicatedWalk = { name: 'Walk Forward' };
    const actions = findBestAnimationClip([ambiguous, dedicatedWalk]);
    expect(actions.idle).toBe(ambiguous);
    expect(actions.walk).toBe(dedicatedWalk);
    expect(actions.bow).toBeNull();
    expect(new Set(Object.values(actions).filter(Boolean)).size).toBe(2);
  });

  it('returns null for missing action categories without inventing clips', () => {
    const idle = { name: 'Idle' };
    const actions = findBestAnimationClip([idle]);
    expect(actions.idle).toBe(idle);
    expect(actions.walk).toBeNull();
    expect(actions.bow).toBeNull();
  });
});
