import { CharacterStateMachine } from './character-state-machine.js';
import { resolveGiftAction, resolveGiftReactionProfile } from './gift-action-rules.js';
import { GiftStreakCoalescer } from './gift-streak-coalescer.js';
import { GiftEffectRegistry } from './gift-effect-registry.js';

/**
 * Single-owner visual controller for the central devotee.
 * Server rewards remain event-driven and are deliberately not changed here.
 */
(() => {
  const stage = document.getElementById('stage9x16');
  if (!stage) return;

  const layer = document.createElement('div');
  layer.className = 'gift-action-layer';
  const rig = stage.querySelector(':scope > .temple-camera-rig') || stage;
  rig.appendChild(layer);

  const machine = new CharacterStateMachine({ maxQueue: 40 });
  const WALK_EVENTS = new Set(['burnIncense', 'sendPrayer', 'offerGift', 'grandCeremony', 'ringBell', 'drawFortune']);
  const EFFECT_DURATION = { rocket: 4050, dragon: 4200, donut: 3650, rose: 2600 };
  const streakCoalescer = new GiftStreakCoalescer({ ttlMs: 5000, maxEntries: 200 });
  let activeTimer = 0;
  let phaseTimers = [];
  // Generation tokens make already-queued callbacks harmless after ownership changes.
  let ritualToken = 0;
  let effectTimer = 0;
  let cooldownTimer = 0;
  let delayedEffectTimers = [];
  let effectToken = 0;
  let characterAnimation = null;
  const effectRegistry = new GiftEffectRegistry();

  function playGiftSound(type, effectId) {
    window.dispatchEvent(new CustomEvent('temple:gift-sfx', { detail: { type, effectId } }));
  }

  function createEffect(className, symbol, x, y) {
    const el = document.createElement('div');
    el.className = `gift-action-fx ${className}`;
    el.textContent = symbol;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    layer.appendChild(el);
    return el;
  }

  function removeAfter(el, animation) {
    effectRegistry.track(el, animation);
  }

  function clearActiveEffects() {
    effectRegistry.clear();
  }

  function clearDelayedEffectTimers() {
    delayedEffectTimers.forEach(clearTimeout);
    delayedEffectTimers = [];
  }

  function scheduleEffectCallback(token, callback, delay) {
    const timer = window.setTimeout(() => {
      delayedEffectTimers = delayedEffectTimers.filter((id) => id !== timer);
      if (token !== effectToken) return;
      callback();
    }, delay);
    delayedEffectTimers.push(timer);
    return timer;
  }

  function animateCharacter(keyframes, duration) {
    const sprite = document.getElementById('centralSpriteStack');
    if (!sprite) return;
    characterAnimation?.cancel();
    characterAnimation = sprite.animate(keyframes, {
      duration,
      easing: 'cubic-bezier(0.18, 0.72, 0.24, 1)',
      fill: 'none'
    });
  }

  function playRocket(token) {
    playGiftSound('rocket-launch', token);
    const rocket = createEffect('gift-rocket', '', 95, 1010);
    const flight = rocket.animate([
      { transform: 'translate3d(0, 0, 0) rotate(-24deg) scale(.65)', opacity: 0 },
      { transform: 'translate3d(180px, -40px, 0) rotate(-10deg) scale(1)', opacity: 1, offset: .3 },
      { transform: 'translate3d(430px, -20px, 0) rotate(8deg) scale(1.25)', opacity: 1 },
      { transform: 'translate3d(500px, 0, 0) rotate(14deg) scale(.4)', opacity: 0 }
    ], { duration: 850, easing: 'ease-in', fill: 'forwards' });
    removeAfter(rocket, flight);

    // Procedural exhaust trail: warm flame cores with soft smoke tails.
    for (let i = 0; i < 10; i++) {
      const trail = createEffect('gift-rocket-trail', '', 82 + i * 12, 1005 + (Math.random() - 0.5) * 24);
      const drift = -90 - Math.random() * 120;
      const rise = -22 - Math.random() * 52;
      const trailAnim = trail.animate([
        { transform: 'translate3d(0,0,0) scale(.55)', opacity: .92 },
        { transform: `translate3d(${drift}px,${rise}px,0) scale(1.6)`, opacity: 0 }
      ], { duration: 520 + Math.random() * 240, delay: i * 28, easing: 'ease-out', fill: 'forwards' });
      removeAfter(trail, trailAnim);
    }

    scheduleEffectCallback(token, () => {
      playGiftSound('explosion', token);
      const blast = createEffect('gift-blast', '💥', 595, 1010);
      blast.style.fontSize = '112px';
      blast.style.filter = 'drop-shadow(0 0 18px rgba(255,190,55,.95))';
      const flash = createEffect('gift-impact-flash', '', 595, 1010);
      const flashAnim = flash.animate([
        { transform: 'scale(.2)', opacity: .95 },
        { transform: 'scale(3.8)', opacity: 0 }
      ], { duration: 430, easing: 'ease-out', fill: 'forwards' });
      removeAfter(flash, flashAnim);

      const shockwave = createEffect('gift-shockwave', '', 595, 1010);
      Object.assign(shockwave.style, {
        width: '34px', height: '34px', margin: '-17px 0 0 -17px',
        border: '9px solid rgba(255,220,120,.95)', borderRadius: '50%',
        boxSizing: 'border-box', boxShadow: '0 0 30px rgba(255,110,25,.9)'
      });
      const wave = shockwave.animate([
        { transform: 'scale(.25)', opacity: .95, borderWidth: '9px' },
        { transform: 'scale(8)', opacity: 0, borderWidth: '1px' }
      ], { duration: 820, easing: 'cubic-bezier(.12,.72,.24,1)', fill: 'forwards' });
      removeAfter(shockwave, wave);

      // Soft smoke puffs and small debris add depth to the impact without a heavy texture.
      for (let i = 0; i < 7; i++) {
        const smoke = createEffect('gift-blast-smoke', '', 595 + (Math.random() - .5) * 70, 1010 + (Math.random() - .5) * 55);
        const smokeAnim = smoke.animate([
          { transform: 'scale(.35)', opacity: .48 },
          { transform: `translate3d(${(Math.random() - .5) * 120}px,-${70 + Math.random() * 90}px,0) scale(2.4)`, opacity: 0 }
        ], { duration: 1050 + Math.random() * 350, easing: 'ease-out', fill: 'forwards' });
        removeAfter(smoke, smokeAnim);
      }
      for (let i = 0; i < 8; i++) {
        const debris = createEffect('gift-blast-debris', '', 595, 1010);
        const angle = (Math.PI * 2 * i) / 8;
        const distance = 110 + Math.random() * 90;
        const debrisAnim = debris.animate([
          { transform: 'scale(.4) rotate(0deg)', opacity: 1 },
          { transform: `translate3d(${Math.cos(angle) * distance}px,${Math.sin(angle) * distance}px,0) scale(.2) rotate(220deg)`, opacity: 0 }
        ], { duration: 720 + Math.random() * 260, easing: 'ease-out', fill: 'forwards' });
        removeAfter(debris, debrisAnim);
      }

      for (let i = 0; i < 18; i++) {
        const spark = createEffect('gift-blast-spark', i % 3 === 0 ? '✦' : '•', 595, 1010);
        spark.style.color = i % 2 ? '#fff1a8' : '#ff8b35';
        spark.style.fontSize = i % 3 ? '28px' : '42px';
        const angle = (Math.PI * 2 * i) / 18;
        const distance = 90 + Math.random() * 170;
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;
        const sparkAnim = spark.animate([
          { transform: 'translate3d(0,0,0) scale(.3)', opacity: 1 },
          { transform: `translate3d(${dx}px,${dy}px,0) scale(1.15)`, opacity: 0 }
        ], { duration: 650 + Math.random() * 260, easing: 'ease-out', fill: 'forwards' });
        removeAfter(spark, sparkAnim);
      }
      const pop = blast.animate([
        { transform: 'translate3d(0,0,0) scale(.2)', opacity: 0 },
        { transform: 'translate3d(0,0,0) scale(1.55)', opacity: 1, offset: .35 },
        { transform: 'translate3d(0,0,0) scale(2.1)', opacity: 0 }
      ], { duration: 760, easing: 'ease-out', fill: 'forwards' });
      removeAfter(blast, pop);
      animateCharacter([
        { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' },
        { transform: 'translate3d(310px,-170px,0) rotate(28deg) scale(.82)', offset: .42 },
        { transform: 'translate3d(310px,-170px,0) rotate(28deg) scale(.82)', offset: .68 },
        { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' }
      ], 3300);
    }, 620);
  }

  function playDragon(token) {
    playGiftSound('dragon-whoosh', token);
    const dragon = createEffect('gift-dragon', '', 65, 820);
    const flight = dragon.animate([
      { transform: 'translate3d(0,0,0) scale(.35) rotate(-12deg)', opacity: 0 },
      { transform: 'translate3d(240px,-90px,0) scale(1.05) rotate(8deg)', opacity: 1, offset: .35 },
      { transform: 'translate3d(610px,-35px,0) scale(1.2) rotate(18deg)', opacity: 1, offset: .72 },
      { transform: 'translate3d(970px,25px,0) scale(.65) rotate(28deg)', opacity: 0 }
    ], { duration: 3100, easing: 'ease-in-out', fill: 'forwards' });
    removeAfter(dragon, flight);
    const wind = createEffect('gift-dragon-wind', '💨', 470, 930);
    const gust = wind.animate([
      { transform: 'translate3d(0,0,0) scale(.25)', opacity: 0 },
      { transform: 'translate3d(80px,-35px,0) scale(1.5)', opacity: .9, offset: .35 },
      { transform: 'translate3d(340px,-80px,0) scale(2.2)', opacity: 0 }
    ], { duration: 1700, delay: 650, easing: 'ease-out', fill: 'forwards' });
    removeAfter(wind, gust);
    scheduleEffectCallback(token, () => {
      playGiftSound('dragon-roar', token);
      const impact = createEffect('gift-dragon-impact', '', 540, 955);
      const impactAnim = impact.animate([
        { transform: 'scale(.25)', opacity: .9 },
        { transform: 'scale(5.2)', opacity: 0 }
      ], { duration: 780, easing: 'ease-out', fill: 'forwards' });
      removeAfter(impact, impactAnim);
    }, 850);
    animateCharacter([
      { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' },
      { transform: 'translate3d(175px,-85px,0) rotate(14deg) scale(.9)', offset: .38 },
      { transform: 'translate3d(175px,-85px,0) rotate(14deg) scale(.9)', offset: .65 },
      { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' }
    ], 3200);
  }

  function playRose(token) {
    playGiftSound('rose-chime', token);
    const rose = createEffect('gift-rose-main', '🌹', 540, 850);
    const main = rose.animate([
      { transform: 'translate3d(0,35px,0) scale(.35) rotate(-18deg)', opacity: 0 },
      { transform: 'translate3d(0,-35px,0) scale(1.12) rotate(8deg)', opacity: 1, offset: .45 },
      { transform: 'translate3d(0,-130px,0) scale(.78) rotate(18deg)', opacity: 0 }
    ], { duration: 1900, easing: 'ease-out', fill: 'forwards' });
    removeAfter(rose, main);
    for (let i = 0; i < 9; i++) {
      const petal = createEffect('gift-rose-petal', i % 2 ? '🌸' : '🌺', 540, 860);
      const dx = (Math.random() - .5) * 330;
      const dy = -90 - Math.random() * 240;
      const spin = (Math.random() - .5) * 100;
      const anim = petal.animate([
        { transform: 'translate3d(0,0,0) rotate(0deg) scale(.35)', opacity: 0 },
        { transform: `translate3d(${dx * .45}px,${dy * .45}px,0) rotate(${spin}deg) scale(.8)`, opacity: .95, offset: .4 },
        { transform: `translate3d(${dx}px,${dy}px,0) rotate(${spin * 2}deg) scale(.45)`, opacity: 0 }
      ], { duration: 1800 + Math.random() * 500, delay: i * 35, easing: 'ease-out', fill: 'forwards' });
      removeAfter(petal, anim);
    }
  }

  function showComboPulse(count) {
    const pulse = createEffect('gift-combo-pulse', `COMBO ×${Math.max(1, count)}`, 540, 760);
    const anim = pulse.animate([
      { transform: 'translate3d(0,12px,0) scale(.65)', opacity: 0 },
      { transform: 'translate3d(0,-18px,0) scale(1.08)', opacity: 1, offset: .35 },
      { transform: 'translate3d(0,-58px,0) scale(.9)', opacity: 0 }
    ], { duration: 850, easing: 'ease-out', fill: 'forwards' });
    removeAfter(pulse, anim);
  }

  function playDonut(token) {
    playGiftSound('donut-chime', token);
    // Keep the treat on the upper-middle lane: it teases the devotee without
    // sweeping across the altar, Buddha focal point, or fixed HUD.
    const donut = createEffect('gift-donut', '', 70, 790);
    const fly = donut.animate([
      { transform: 'translate3d(0,34px,0) rotate(-35deg) scale(.48)', opacity: 0 },
      { transform: 'translate3d(205px,-42px,0) rotate(95deg) scale(1.02)', opacity: 1, offset: .22 },
      { transform: 'translate3d(430px,24px,0) rotate(230deg) scale(.92)', opacity: 1, offset: .48 },
      { transform: 'translate3d(660px,-38px,0) rotate(390deg) scale(1.04)', opacity: 1, offset: .76 },
      { transform: 'translate3d(850px,12px,0) rotate(560deg) scale(.62)', opacity: 0 }
    ], { duration: 2700, easing: 'cubic-bezier(.42,0,.24,1)', fill: 'forwards' });
    removeAfter(donut, fly);

    // A short sidestep and hop reads as a playful chase; avoid the previous
    // 300px translation which could push the character through scene props.
    animateCharacter([
      { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' },
      { transform: 'translate3d(18px,-16px,0) rotate(-5deg) scale(1.025)', offset: .2 },
      { transform: 'translate3d(42px,-4px,0) rotate(4deg) scale(1.015)', offset: .48 },
      { transform: 'translate3d(22px,-13px,0) rotate(-3deg) scale(1.02)', offset: .72 },
      { transform: 'translate3d(0,0,0) rotate(0deg) scale(1)' }
    ], 3100);
  }

  function showActionLabel(action) {
    const central = document.getElementById('centralWorshipper');
    if (!central) return;
    central.classList.remove('walking-up');
    const label = document.getElementById('centralAction');
    if (label) label.textContent = action === 'rocket'
      ? '🚀 Bị tên lửa đánh bật khỏi lư hương!'
      : action === 'dragon'
        ? '🐉 Long khí cuộn tới, thí chủ bị đẩy lùi!'
        : action === 'rose'
        ? '🌹 Hương hoa hồng bay quanh thí chủ!'
        : '🍩 Bị chiếc bánh donut dụ chạy khỏi lư hương!';
  }

  function startCharacterTimer(event) {
    clearTimeout(activeTimer);
    phaseTimers.forEach(clearTimeout);
    const token = ++ritualToken;
    phaseTimers = [
      window.setTimeout(() => {
        if (token !== ritualToken) return;
        machine.transition('OFFERING');
      }, 2100),
      window.setTimeout(() => {
        if (token !== ritualToken) return;
        machine.transition('BOWING');
      }, 2370)
    ];
    activeTimer = window.setTimeout(() => {
      if (token !== ritualToken) return;
      phaseTimers.forEach(clearTimeout);
      phaseTimers = [];
      const completedEvent = machine.snapshot().active;
      const next = machine.completeActive();
      if (completedEvent) window.dispatchEvent(new CustomEvent('temple:character-complete', { detail: completedEvent }));
      if (next.started) {
        window.dispatchEvent(new CustomEvent('temple:character-start', { detail: next.event }));
        startCharacterTimer(next.event);
      }
    }, event?.type === 'drawFortune' ? 18000 : 7600);
  }

  function beginEffect(action, giftEvent = null) {
    // Fade only the superseded gift's sound group; background music and TTS
    // remain on their independent playback paths.
    if (effectToken > 0) {
      window.dispatchEvent(new CustomEvent('temple:gift-sfx', { detail: { type: 'cancel', effectId: effectToken } }));
    }
    // Invalidate any ritual callback that may already be queued by the browser.
    ritualToken++;
    clearTimeout(activeTimer);
    phaseTimers.forEach(clearTimeout);
    phaseTimers = [];
    clearTimeout(effectTimer);
    clearTimeout(cooldownTimer);
    clearDelayedEffectTimers();
    const token = ++effectToken;
    window.dispatchEvent(new CustomEvent('temple:gift-action', { detail: { action, effectId: token, reactionProfile: resolveGiftReactionProfile(giftEvent || {}) } }));
    clearActiveEffects();
    // Every new gift action owns the central character animation. Cancel the
    // previous action's motion even when the incoming action (e.g. Rose) has
    // no replacement character animation of its own.
    characterAnimation?.cancel();
    characterAnimation = null;
    showActionLabel(action);
    if (action === 'rocket') playRocket(token);
    else if (action === 'dragon') playDragon(token);
    else if (action === 'donut') playDonut(token);
    else if (action === 'rose') playRose(token);

    effectTimer = window.setTimeout(() => {
      if (token !== effectToken) return;
      characterAnimation?.cancel();
      characterAnimation = null;
      const result = machine.finishEffect();
      if (result.nextEffect) {
        beginEffect(result.nextEffect.action, result.nextEffect.event);
        return;
      }
      cooldownTimer = window.setTimeout(() => {
        if (token !== effectToken) return;
        const next = machine.finishCooldown();
        if (next.started) {
          window.dispatchEvent(new CustomEvent('temple:character-start', { detail: next.event }));
          startCharacterTimer(next.event);
        }
      }, 650);
    }, EFFECT_DURATION[action] || 3500);
  }

  function handle(event) {
    if (!event || typeof event.type !== 'string') return { allowWalker: false };
    const action = ['offerGift', 'grandCeremony'].includes(event.type) ? resolveGiftAction(event) : null;

    if (action) {
      // Coalesce cumulative connector frames for a single streakable gift.
      if (streakCoalescer.shouldCoalesce(event)) {
        showComboPulse(event.giftComboDelta || 1);
        window.dispatchEvent(new CustomEvent('temple:gift-reaction', { detail: { action, reactionProfile: resolveGiftReactionProfile(event) } }));
        return { allowWalker: false, coalescedCombo: true, action, state: machine.snapshot() };
      }
      const interruptedEvent = machine.snapshot().active;
      const result = machine.interrupt(action, event);
      if (result.interrupted) {
        if (interruptedEvent && !result.superseded) {
          window.dispatchEvent(new CustomEvent('temple:character-interrupted', { detail: { event: interruptedEvent, action } }));
        }
        beginEffect(action, event);
        return { allowWalker: false, interruptsRitual: true, action, state: machine.snapshot() };
      }
      if (result.queuedEffect) {
        return { allowWalker: false, queuedEffect: true, action, state: machine.snapshot() };
      }
      // No character is currently at the altar: treat this gift as an ordinary visit.
    }

    if (!WALK_EVENTS.has(event.type)) return { allowWalker: false, state: machine.snapshot() };
    const result = machine.request(event);
    if (!result.accepted) return { allowWalker: false, dropped: true, state: machine.snapshot() };
    if (result.started) {
      startCharacterTimer(event);
      window.dispatchEvent(new CustomEvent('temple:character-start', { detail: event }));
    }
    return { allowWalker: false, started: Boolean(result.started), queued: Boolean(result.queued), state: machine.snapshot() };
  }

  window.TempleGiftActionEngine = {
    handle,
    resetStreaks: () => streakCoalescer.clear(),
    clearStreak: (groupId) => {
      if (groupId == null || String(groupId) === '') return false;
      return streakCoalescer.clearStreak(groupId);
    },
    snapshot: () => machine.snapshot()
  };
})();
