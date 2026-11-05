import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

function createEngineHarness() {
  let nextTimerId = 1;
  const timers = new Map();
  const cleared = [];
  const nodes = [];
  const timersApi = {
    setTimeout(callback, delay) {
      const id = nextTimerId++;
      timers.set(id, { callback, delay });
      return id;
    },
    clearTimeout(id) {
      cleared.push(id);
      timers.delete(id);
    }
  };
  const window = {};
  class FakeAudio {
    constructor() { this.paused = true; this.volume = 1; }
    pause() { this.paused = true; }
    play() { this.paused = false; return Promise.resolve(); }
  }
  const localStorage = { getItem: () => null, setItem: () => {} };
  const source = readFileSync(new URL('../public/js/audio.js', import.meta.url), 'utf8');
  runInNewContext(source, { window, Audio: FakeAudio, localStorage, ...timersApi });
  const engine = new window.TempleAudioEngine();
  const destination = { name: 'sfx-master' };
  const ctx = {
    currentTime: 10,
    destination,
    createGain() {
      const node = {
        connectedTo: null,
        disconnectCount: 0,
        gain: {
          value: 1,
          events: [],
          cancelScheduledValues(time) { this.events.push(['cancel', time]); },
          setValueAtTime(value, time) { this.value = value; this.events.push(['set', value, time]); },
          linearRampToValueAtTime(value, time) { this.events.push(['ramp', value, time]); }
        },
        connect(target) { this.connectedTo = target; },
        disconnect() { this.disconnectCount++; }
      };
      nodes.push(node);
      return node;
    }
  };
  engine.ctx = ctx;
  engine.sfxGain = { name: 'sfx-gain' };
  return { engine, timers, cleared, nodes, destination, timersApi };
}

describe('gift SFX group lifecycle', () => {
  it('reuses one output per effect and isolates concurrent effects', () => {
    const { engine, nodes } = createEngineHarness();
    const first = engine.getGiftSfxOutput(11);
    const same = engine.getGiftSfxOutput(11);
    const second = engine.getGiftSfxOutput(12);

    expect(first).toBe(same);
    expect(second).not.toBe(first);
    expect(nodes.length).toBe(2);
    expect(first.connectedTo).toBe(engine.sfxGain);
    expect(second.connectedTo).toBe(engine.sfxGain);
    expect(engine.giftSfxGroups.size).toBe(2);
  });

  it('fades and disconnects only the cancelled effect group', () => {
    const { engine, timers, nodes } = createEngineHarness();
    const first = engine.getGiftSfxOutput(21);
    const second = engine.getGiftSfxOutput(22);

    expect(engine.cancelGiftSfxGroup(21)).toBe(true);
    expect(first.gain.events).toContainEqual(['ramp', 0.0001, 10.025]);
    expect(engine.giftSfxGroups.has('22')).toBe(true);
    expect(engine.giftSfxGroups.has('21')).toBe(true);

    const cleanup = [...timers.entries()].find(([, timer]) => timer.delay === 40);
    expect(cleanup).toBeDefined();
    cleanup[1].callback();

    expect(engine.giftSfxGroups.has('21')).toBe(false);
    expect(engine.giftSfxGroups.has('22')).toBe(true);
    expect(first.disconnectCount).toBe(1);
    expect(second.disconnectCount).toBe(0);
    expect(engine.cancelGiftSfxGroup(21)).toBe(false);
  });

  it('stops only the cancelled effect sources and releases their references on ended', () => {
    const { engine } = createEngineHarness();
    engine.getGiftSfxOutput(25);
    engine.getGiftSfxOutput(26);
    let endedCount = 0;
    const firstSource = {
      stopCalls: [],
      onended() { endedCount++; },
      stop(time) { this.stopCalls.push(time); }
    };
    const otherSource = { stopCalls: [], stop(time) { this.stopCalls.push(time); } };

    expect(engine.trackGiftSfxSource(25, firstSource)).toBe(true);
    expect(engine.trackGiftSfxSource(26, otherSource)).toBe(true);
    expect(engine.giftSfxGroups.get('25').sources.has(firstSource)).toBe(true);

    expect(engine.cancelGiftSfxGroup(25)).toBe(true);
    expect(firstSource.stopCalls).toEqual([10]);
    expect(otherSource.stopCalls).toEqual([]);
    firstSource.onended({ type: 'ended' });
    expect(endedCount).toBe(1);
    expect(engine.giftSfxGroups.get('25').sources.size).toBe(0);
    expect(engine.giftSfxGroups.get('26').sources.has(otherSource)).toBe(true);
  });

  it('extends idle cleanup when another sound joins the same effect', () => {
    const { engine, timers, cleared, nodes } = createEngineHarness();
    const output = engine.getGiftSfxOutput(31);
    const firstTimer = [...timers.keys()][0];

    expect(engine.getGiftSfxOutput(31)).toBe(output);
    expect(cleared).toContain(firstTimer);
    const idleTimer = [...timers.values()][0];
    expect(idleTimer.delay).toBe(1800);
    idleTimer.callback();

    expect(engine.giftSfxGroups.size).toBe(0);
    expect(output.disconnectCount).toBe(1);
    expect(nodes.length).toBe(1);
  });

  it('ignores missing effect IDs and unknown groups safely', () => {
    const { engine, nodes } = createEngineHarness();
    expect(engine.getGiftSfxOutput(undefined)).toBe(engine.sfxGain);
    expect(engine.cancelGiftSfxGroup(undefined)).toBe(false);
    expect(engine.cancelGiftSfxGroup('missing')).toBe(false);
    expect(nodes).toHaveLength(0);
  });
});
