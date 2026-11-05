/**
 * TempleAudioEngine
 * - Nhạc nền: Phát ambience tổng hợp lặp vô tận êm dịu (có thể thay bằng bản thu hợp lệ),
 *   tự động hạ nhỏ âm lượng (ducking) khi có giọng đọc lời khấn để không bị đè tiếng hay rè/xước.
 * - Pháp khí: Tổng hợp tiếng Mõ gỗ, Đại Hồng Chung, Ống xăm nhẹ nhàng, không vượt ngưỡng 0dBFS.
 * - Giọng đọc: Hàng đợi ZeroTTS phát tuần tự mượt mà.
 */
class TempleAudioEngine {
  constructor() {
    this.ctx = null;
    this.unlocked = false;
    this.sfxEnabled = localStorage.getItem('temple_sfx_enabled') !== 'false';
    this.sfxVolume = Math.max(0, Math.min(1, Number(localStorage.getItem('temple_sfx_vol') ?? 0.8) || 0));
    this.sfxGain = null;
    this.giftSfxGroups = new Map();
    this.bgMusicEnabled = true;
    this.ttsEnabled = true;
    this.ttsVoice = 'maichi';

    // Nhạc nền "Nam Mô A Di Đà Phật.m4a" — mặc định 65%, cho phép chỉnh trực tiếp 0% - 100%
    const savedMusicVol = parseFloat(localStorage.getItem('temple_music_vol'));
    const savedTtsVol = parseFloat(localStorage.getItem('temple_tts_vol'));
    this.bgBaseVolume = Number.isFinite(savedMusicVol) ? Math.max(0, Math.min(1, savedMusicVol)) : 0.65;
    this.ttsVolume = Number.isFinite(savedTtsVol) ? Math.max(0, Math.min(1, savedTtsVol)) : 0.95;

    // No bundled chant recording exists in public/assets yet. Use the
    // generated ambient loop directly instead of requesting a missing file.
    this.useSynthMusicFallback = true;
    this.synthBgTimer = null;
    this.bgAudio = null;
    this.ttsQueue = [];
    this.ttsPlaying = false;
    this.currentAudio = null;
    this.onTtsStateChange = null;
  }

  ensureContext() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    // Route every synthesized SFX through one shared dynamics stage. Several
    // layered sounds (e.g. explosion noise + sub, or a multi-part bell) can
    // otherwise sum above full scale when effects overlap.
    if (!this.sfxOutput) {
      if (typeof this.ctx.createDynamicsCompressor === 'function') {
        this.sfxOutput = this.ctx.createDynamicsCompressor();
        this.sfxOutput.threshold.setValueAtTime(-8, this.ctx.currentTime);
        this.sfxOutput.knee.setValueAtTime(12, this.ctx.currentTime);
        this.sfxOutput.ratio.setValueAtTime(10, this.ctx.currentTime);
        this.sfxOutput.attack.setValueAtTime(0.003, this.ctx.currentTime);
        this.sfxOutput.release.setValueAtTime(0.22, this.ctx.currentTime);
        this.sfxOutput.connect(this.ctx.destination);
      } else {
        this.sfxOutput = this.ctx.destination;
      }
    }
    if (!this.sfxGain) {
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.connect(this.sfxOutput);
    }
    this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? this.sfxVolume : 0, this.ctx.currentTime, 0.025);
    this.unlocked = true;
    if (this.bgMusicEnabled) {
      this.startZenAmbience();
    }
    return this.ctx;
  }

  // --------------------------------------------------------------------------
  // 1. NHẠC NỀN "NAM MÔ A DI ĐÀ PHẬT.M4A" (CÓ AUTO-DUCKING KHI ĐỌC LỜI KHẤN)
  // --------------------------------------------------------------------------
  getDuckedVolume() {
    return Math.max(0.08, +(this.bgBaseVolume * 0.35).toFixed(2));
  }

  setMusicVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.bgBaseVolume = v;
    try {
      localStorage.setItem('temple_music_vol', String(v));
    } catch (_) {}
    if (this.bgAudio && !this.useSynthMusicFallback) {
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
    }
  }

  setSfxEnabled(enabled) {
    this.sfxEnabled = Boolean(enabled);
    try { localStorage.setItem('temple_sfx_enabled', String(this.sfxEnabled)); } catch (_) {}
    if (this.ctx && this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? this.sfxVolume : 0, this.ctx.currentTime, 0.025);
    }
  }

  setSfxVolume(vol) {
    const value = Number(vol);
    if (!Number.isFinite(value)) return;
    this.sfxVolume = Math.max(0, Math.min(1, value));
    try { localStorage.setItem('temple_sfx_vol', String(this.sfxVolume)); } catch (_) {}
    if (this.ctx && this.sfxGain) {
      this.sfxGain.gain.setTargetAtTime(this.sfxEnabled ? this.sfxVolume : 0, this.ctx.currentTime, 0.025);
    }
  }

  setTtsVolume(vol) {
    const v = Math.max(0, Math.min(1, Number(vol)));
    if (!Number.isFinite(v)) return;
    this.ttsVolume = v;
    try {
      localStorage.setItem('temple_tts_vol', String(v));
    } catch (_) {}
    if (this.currentAudio) {
      this.currentAudio.volume = this.ttsVolume;
    }
  }

  startZenAmbience() {
    if (!this.bgMusicEnabled) return;
    if (this.useSynthMusicFallback) {
      this.startDefaultZenSynthLoop();
      return;
    }
    try {
      this.bgAudio.volume = this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume;
      if (this.bgAudio.paused) {
        const p = this.bgAudio.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (this.bgAudio.error) {
              this.useSynthMusicFallback = true;
              this.startDefaultZenSynthLoop();
            }
          });
        }
      }
    } catch (_) {
      this.useSynthMusicFallback = true;
      this.startDefaultZenSynthLoop();
    }
  }

  startDefaultZenSynthLoop() {
    if (!this.bgMusicEnabled || this.synthBgTimer) return;
    const PENTATONIC = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
    let step = 0;
    const playZenNote = () => {
      if (!this.bgMusicEnabled || !this.ctx) return;
      try {
        const now = this.ctx.currentTime;
        const freq = PENTATONIC[step % PENTATONIC.length];
        step++;
        const vol = (this.ttsPlaying ? this.getDuckedVolume() : this.bgBaseVolume) * 0.18;
        if (vol <= 0.002) return;

        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.linearRampToValueAtTime(vol, now + 0.6);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 4.2);

        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now);
        osc.stop(now + 4.25);
      } catch (_) {}
    };
    playZenNote();
    this.synthBgTimer = setInterval(playZenNote, 3600);
  }

  stopZenAmbience() {
    try {
      this.bgAudio.pause();
    } catch (_) {}
    if (this.synthBgTimer) {
      clearInterval(this.synthBgTimer);
      this.synthBgTimer = null;
    }
  }

  setBgDucking(ducked) {
    if (!this.bgMusicEnabled) return;
    try {
      if (!this.useSynthMusicFallback && this.bgAudio) {
        this.bgAudio.volume = ducked ? this.getDuckedVolume() : this.bgBaseVolume;
      }
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 2. TIẾNG MÕ GỖ TỤNG KINH (WOODEN FISH PERCUSSION SYNTH)
  // --------------------------------------------------------------------------
  playWoodenFish(pitchMultiplier = 1.0) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();

      const baseFreq = 620 * pitchMultiplier * (0.98 + Math.random() * 0.04);
      osc1.type = 'triangle';
      osc1.frequency.setValueAtTime(baseFreq * 1.4, now);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq, now + 0.018);
      osc1.frequency.exponentialRampToValueAtTime(baseFreq * 0.82, now + 0.14);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(baseFreq * 1.15, now);
      filter.Q.setValueAtTime(4.0, now);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.linearRampToValueAtTime(0.28, now + 0.006);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc1.connect(filter);
      filter.connect(gain);
      gain.connect(this.sfxGain || ctx.destination);

      osc1.onended = () => {
        osc1.disconnect();
        filter.disconnect();
        gain.disconnect();
      };

      osc1.start(now);
      osc1.stop(now + 0.16);
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 3. TIẾNG ĐẠI HỒNG CHUNG (TEMPLE BRONZE BELL)
  // --------------------------------------------------------------------------
  playTempleBell(intensity = 1.0) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;

      const base = 174;
      const partials = [
        { ratio: 0.5, amp: 0.22, decay: 4.2 },
        { ratio: 1.0, amp: 0.35, decay: 3.6 },
        { ratio: 1.506, amp: 0.16, decay: 2.4 },
        { ratio: 2.0, amp: 0.18, decay: 1.9 }
      ];

      const master = ctx.createGain();
      master.gain.setValueAtTime(0.28 * Math.min(1.0, intensity), now);
      master.connect(this.sfxGain || ctx.destination);

      partials.forEach((p, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(base * p.ratio, now);

        g.gain.setValueAtTime(0.0001, now);
        g.gain.linearRampToValueAtTime(p.amp, now + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, now + p.decay);

        osc.connect(g);
        g.connect(master);
        osc.onended = () => {
          osc.disconnect();
          g.disconnect();
          if (idx === 0) master.disconnect();
        };
        osc.start(now);
        osc.stop(now + p.decay + 0.05);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 4. TIẾNG LẮC ỐNG XĂM TRE (FORTUNE STICK SHAKER)
  // --------------------------------------------------------------------------
  playFortuneShake() {
    if (!this.sfxEnabled) return;
    for (let i = 0; i < 5; i++) {
      setTimeout(() => {
        this.playWoodenFish(1.32 + (i % 2) * 0.16);
      }, i * 120);
    }
  }

  // --------------------------------------------------------------------------
  // 5. TIẾNG CHUÔNG NGỌC DÂNG LỄ / THẮP HƯƠNG (SINGING CHIME)
  // --------------------------------------------------------------------------
  playIncenseChime() {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const notes = [528, 660];
      notes.forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.1);

        gain.gain.setValueAtTime(0.0001, now + idx * 0.1);
        gain.gain.linearRampToValueAtTime(0.10, now + idx * 0.1 + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.1 + 1.1);

        osc.connect(gain);
        gain.connect(this.sfxGain || ctx.destination);
        osc.onended = () => {
          osc.disconnect();
          gain.disconnect();
        };
        osc.start(now + idx * 0.1);
        osc.stop(now + idx * 0.1 + 1.15);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 6. GIFT GAMEPLAY SOUND EFFECTS (Web Audio synthesis; no external assets)
  // --------------------------------------------------------------------------
  getGiftSfxOutput(groupId) {
    if (groupId == null || groupId === '') return this.sfxGain || this.ctx.destination;
    const key = String(groupId);
    let group = this.giftSfxGroups.get(key);
    if (!group) {
      const gain = this.ctx.createGain();
      gain.gain.setValueAtTime(1, this.ctx.currentTime);
      gain.connect(this.sfxGain || this.ctx.destination);
      group = { gain, timer: null, sources: new Set() };
      this.giftSfxGroups.set(key, group);
    }
    clearTimeout(group.timer);
    group.timer = setTimeout(() => {
      if (this.giftSfxGroups.get(key) !== group) return;
      this.giftSfxGroups.delete(key);
      try { group.gain.disconnect(); } catch (_) {}
    }, 1800);
    return group.gain;
  }

  trackGiftSfxSource(groupId, source) {
    if (groupId == null || groupId === '' || !source) return false;
    const group = this.giftSfxGroups.get(String(groupId));
    if (!group) return false;
    group.sources.add(source);
    const onended = source.onended;
    source.onended = (event) => {
      group.sources.delete(source);
      if (typeof onended === 'function') onended.call(source, event);
    };
    return true;
  }

  cancelGiftSfxGroup(groupId) {
    if (groupId == null || groupId === '') return false;
    const key = String(groupId);
    const group = this.giftSfxGroups.get(key);
    if (!group) return false;
    clearTimeout(group.timer);
    const now = this.ctx?.currentTime || 0;
    for (const source of group.sources) {
      try { source.stop(now); } catch (_) {}
    }
    try {
      group.gain.gain.cancelScheduledValues(now);
      group.gain.gain.setValueAtTime(group.gain.gain.value, now);
      group.gain.gain.linearRampToValueAtTime(0.0001, now + 0.025);
    } catch (_) {}
    group.timer = setTimeout(() => {
      if (this.giftSfxGroups.get(key) !== group) return;
      this.giftSfxGroups.delete(key);
      try { group.gain.disconnect(); } catch (_) {}
    }, 40);
    return true;
  }

  createNoiseBuffer(seconds = 0.5) {
    const ctx = this.ensureContext();
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length * 0.18);
    return buffer;
  }

  playRocketLaunch(groupId) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const output = this.getGiftSfxOutput(groupId);
      const noise = ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(0.72);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(520, now + 0.68);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.16, now + 0.08);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.7);
      noise.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      noise.onended = () => { noise.disconnect(); filter.disconnect(); gain.disconnect(); };
      this.trackGiftSfxSource(groupId, noise);
      noise.start(now);
      noise.stop(now + 0.74);
    } catch (_) {}
  }

  playExplosion(intensity = 1, groupId) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const output = this.getGiftSfxOutput(groupId);
      const amount = Math.max(0.35, Math.min(1.25, Number(intensity) || 1));
      const noise = ctx.createBufferSource();
      noise.buffer = this.createNoiseBuffer(0.95);
      const lowpass = ctx.createBiquadFilter();
      const noiseGain = ctx.createGain();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(1450, now);
      lowpass.frequency.exponentialRampToValueAtTime(95, now + 0.82);
      noiseGain.gain.setValueAtTime(0.0001, now);
      noiseGain.gain.linearRampToValueAtTime(0.42 * amount, now + 0.018);
      noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.88);
      noise.connect(lowpass);
      lowpass.connect(noiseGain);
      noiseGain.connect(output);

      const sub = ctx.createOscillator();
      const subGain = ctx.createGain();
      sub.type = 'sine';
      sub.frequency.setValueAtTime(92, now);
      sub.frequency.exponentialRampToValueAtTime(34, now + 0.42);
      subGain.gain.setValueAtTime(0.0001, now);
      subGain.gain.linearRampToValueAtTime(0.34 * amount, now + 0.012);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
      sub.connect(subGain);
      subGain.connect(output);

      noise.onended = () => { noise.disconnect(); lowpass.disconnect(); noiseGain.disconnect(); };
      sub.onended = () => { sub.disconnect(); subGain.disconnect(); };
      this.trackGiftSfxSource(groupId, noise);
      this.trackGiftSfxSource(groupId, sub);
      noise.start(now);
      noise.stop(now + 0.92);
      sub.start(now);
      sub.stop(now + 0.54);
    } catch (_) {}
  }

  playDragonWhoosh(groupId) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const output = this.getGiftSfxOutput(groupId);
      const source = ctx.createBufferSource();
      source.buffer = this.createNoiseBuffer(1.15);
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      filter.type = 'bandpass';
      filter.Q.setValueAtTime(0.7, now);
      filter.frequency.setValueAtTime(260, now);
      filter.frequency.exponentialRampToValueAtTime(1250, now + 0.42);
      filter.frequency.exponentialRampToValueAtTime(180, now + 1.08);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.22, now + 0.24);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
      source.connect(filter);
      filter.connect(gain);
      gain.connect(output);
      source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); };
      this.trackGiftSfxSource(groupId, source);
      source.start(now);
      source.stop(now + 1.12);
    } catch (_) {}
  }

  playDragonRoar(groupId) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const output = this.getGiftSfxOutput(groupId);
      const filter = ctx.createBiquadFilter();
      const master = ctx.createGain();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(520, now);
      filter.frequency.exponentialRampToValueAtTime(155, now + 0.92);
      master.gain.setValueAtTime(0.0001, now);
      master.gain.linearRampToValueAtTime(0.11, now + 0.09);
      master.gain.exponentialRampToValueAtTime(0.0001, now + 0.98);
      filter.connect(master);
      master.connect(output);
      [
        { type: 'sawtooth', start: 118, end: 54, level: 0.55 },
        { type: 'triangle', start: 174, end: 82, level: 0.28 }
      ].forEach((part) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = part.type;
        osc.frequency.setValueAtTime(part.start, now);
        osc.frequency.exponentialRampToValueAtTime(part.end, now + 0.88);
        gain.gain.setValueAtTime(part.level, now);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.95);
        osc.connect(gain);
        gain.connect(filter);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        this.trackGiftSfxSource(groupId, osc);
        osc.start(now);
        osc.stop(now + 1.0);
      });
      setTimeout(() => { try { filter.disconnect(); master.disconnect(); } catch (_) {} }, 1150);
    } catch (_) {}
  }

  playRoseChime(groupId) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const output = this.getGiftSfxOutput(groupId);
      [659.25, 783.99, 987.77].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * 0.12;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.055, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.62);
        osc.connect(gain);
        gain.connect(output);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        this.trackGiftSfxSource(groupId, osc);
        osc.start(start);
        osc.stop(start + 0.66);
      });
    } catch (_) {}
  }

  playDonutChime(groupId) {
    if (!this.sfxEnabled) return;
    try {
      const ctx = this.ensureContext();
      const now = ctx.currentTime;
      const output = this.getGiftSfxOutput(groupId);
      [784, 988, 1175].forEach((freq, index) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const start = now + index * 0.09;
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, start);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.075, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
        osc.connect(gain);
        gain.connect(output);
        osc.onended = () => { osc.disconnect(); gain.disconnect(); };
        this.trackGiftSfxSource(groupId, osc);
        osc.start(start);
        osc.stop(start + 0.45);
      });
    } catch (_) {}
  }

  // --------------------------------------------------------------------------
  // 7. ZEROTTS VOICE QUEUE & PREFETCHER
  // --------------------------------------------------------------------------
  enqueueTts(text, options = {}) {
    const onStart = typeof options.onStart === 'function' ? options.onStart : null;
    const onEnd = typeof options.onEnd === 'function' ? options.onEnd : null;

    if (!this.ttsEnabled) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 5500);
      return;
    }
    const clean = String(text || '').trim();
    if (!clean) {
      if (onStart) onStart();
      if (onEnd) setTimeout(onEnd, 5500);
      return;
    }

    if (this.ttsQueue.length >= 6) {
      const dropped = this.ttsQueue.shift();
      if (dropped?.onStart) dropped.onStart();
      if (dropped?.onEnd) dropped.onEnd();
    }

    const item = {
      id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: clean,
      voice: (options.voice || this.ttsVoice || 'maichi').toLowerCase(),
      url: options.url || null,
      onStart,
      onEnd,
      fetchPromise: null
    };

    if (!item.url) {
      item.fetchPromise = this.fetchZeroTtsAudio(item.text, item.voice);
    }

    this.ttsQueue.push(item);
    this.processTtsQueue();
  }

  async fetchZeroTtsAudio(text, voice = 'maichi') {
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice })
      });
      const data = await res.json();
      if (data && data.ok && data.url) {
        return data;
      }
      return { ok: false, error: data?.error || 'ZeroTTS unavailable' };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async processTtsQueue() {
    if (this.ttsPlaying || this.ttsQueue.length === 0) return;
    this.ttsPlaying = true;
    const item = this.ttsQueue.shift();

    try {
      let audioUrl = item.url;
      if (!audioUrl && item.fetchPromise) {
        const res = await item.fetchPromise;
        if (res && res.ok && res.url) {
          audioUrl = res.url;
        }
      }

      if (audioUrl) {
        this.setBgDucking(true);
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: true, synthesizing: false, text: item.text });
        }
        if (item.onStart) item.onStart();
        await this.playWavUrl(audioUrl);
        if (item.onEnd) item.onEnd();
      } else {
        if (item.onStart) item.onStart();
        if (item.onEnd) setTimeout(item.onEnd, 5500);
      }
    } catch (err) {
      console.warn('[ZeroTTS Playback Warning]', err);
      if (item.onStart) item.onStart();
      if (item.onEnd) item.onEnd();
    } finally {
      this.ttsPlaying = false;
      if (this.ttsQueue.length === 0) {
        this.setBgDucking(false);
        if (this.onTtsStateChange) {
          this.onTtsStateChange({ speaking: false, synthesizing: false, text: '' });
        }
      } else {
        setTimeout(() => this.processTtsQueue(), 250);
      }
    }
  }

  playWavUrl(url) {
    return new Promise((resolve) => {
      try {
        const audio = new Audio(url);
        this.currentAudio = audio;
        audio.volume = this.ttsVolume;
        audio.onended = () => {
          this.currentAudio = null;
          resolve();
        };
        audio.onerror = () => {
          this.currentAudio = null;
          resolve();
        };
        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch(() => {
            this.currentAudio = null;
            resolve();
          });
        }
      } catch (_) {
        resolve();
      }
    });
  }
}

window.TempleAudioEngine = TempleAudioEngine;
