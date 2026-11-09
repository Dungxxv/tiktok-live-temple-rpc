// Trình phát clip nữ tư tế (chống giật):
// - Nạp sẵn mọi clip vào bộ nhớ (blob) ngay từ đầu, mỗi file có thẻ <video> riêng đã giải mã khung đầu → đổi clip tức thì,
//   không còn khựng hình chờ tải như khi gán lại src.
// - Mọi clip bắt đầu/kết thúc cùng một tư thế (hai tay mở): nối ở biên clip gần như liền mạch.
//   Khi server đổi pha mà clip nền (idle/talk) sắp hết thì chờ hết clip rồi mới chuyển; còn lại thì mờ chéo mềm.
// - Lặp tự quản (không dùng loop gốc của trình duyệt) để chủ động chèn clip phản ứng quà ở biên clip.
// Chưa có clip (manifest 404) thì tự tắt và để giao diện dùng ảnh tĩnh.
const PHASE_CLIP = {
  IDLE: 'idle_wait', INTERMISSION: 'idle_wait', CALLING: 'call_name', SHUFFLING: 'shuffle',
  DRAWING: 'draw_card', REVEALING: 'reveal', FAREWELL: 'farewell'
};
const FILLERS = new Set(['idle_wait', 'invite', 'talk_a', 'talk_b']);
const BOUNDARY_WAIT_S = 2.0;   // clip nền còn ít hơn chừng này thì chờ tới chỗ nối mới chuyển
const FADE_CUT_MS = 420;       // chuyển giữa chừng
// Nối clip chồng lấn: clip sau bắt đầu sớm SEAM_OVERLAP_S và hiện dần trong lúc clip trước chạy nốt,
// che độ lệch tư thế giữa khung cuối/khung đầu (đo SSIM chỉ 0,76–0,95 ở các chỗ nối).
const SEAM_OVERLAP_S = 0.4;
const FADE_SEAM_MS = 380;
const REACTION_TTL_MS = 25000; // phản ứng quá cũ thì bỏ
const REACTION_PHASES = new Set(['IDLE', 'INTERMISSION', 'READING']);

export function createClipPlayer(root, { basePath = '/assets/tarot/clips/', onCue = () => {}, onStats = () => {} } = {}) {
  let manifest = null;
  let active = false;
  const pools = new Map();        // file → [video, (video đôi)]
  let cur = null;                 // { name, info, el }
  let pending = null;             // clip chờ phát ở biên clip hiện tại
  let token = 0;
  let talking = false;
  let talkToggle = false;
  let phaseNow = 'IDLE';
  const reactions = [];
  const stats = { starts: 0, lastStartMs: 0, droppedFrames: 0, errors: 0, seams: 0, cuts: 0 };

  const clipInfo = (name) => manifest?.clips?.[name] || null;
  const base = () => manifest?.base || 'idle_wait';

  function makeVideo(src) {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.controls = false; v.loop = false;
    v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    Object.assign(v.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', objectFit: 'cover', opacity: '0', zIndex: '1' });
    v.src = src;
    root.appendChild(v);
    return v;
  }

  // File cần thẻ đôi: dùng cho clip lặp hoặc cho nhiều tên clip (vd. talk.mp4 cho shuffle/reveal/talk_a/talk_b).
  function needsTwin(file) {
    const names = Object.entries(manifest.clips).filter(([, c]) => c.file === file);
    return names.length > 1 || names.some(([, c]) => c.loop);
  }

  async function loadFile(file) {
    if (pools.has(file)) return;
    const res = await fetch(basePath + file);
    if (!res.ok) throw new Error(`${file}: ${res.status}`);
    const url = URL.createObjectURL(await res.blob());
    const els = needsTwin(file) ? [makeVideo(url), makeVideo(url)] : [makeVideo(url)];
    await Promise.all(els.map((v) => new Promise((ok, bad) => {
      if (v.readyState >= 2) return ok();
      v.addEventListener('loadeddata', ok, { once: true });
      v.addEventListener('error', () => bad(new Error(`không giải mã được ${file}`)), { once: true });
    })));
    pools.set(file, els);
  }

  async function init() {
    try {
      const res = await fetch(basePath + 'manifest.json', { cache: 'no-store' });
      if (!res.ok) throw new Error(`manifest ${res.status}`);
      manifest = await res.json();
      const baseInfo = clipInfo(base());
      if (!baseInfo) throw new Error('manifest thiếu clip nền');
      await loadFile(baseInfo.file);
      active = true;
      start(base(), 0);
      // Nạp các clip còn lại tuần tự ở nền (tránh tranh băng thông với clip đang phát).
      const files = [...new Set(Object.values(manifest.clips).map((c) => c.file))];
      (async () => {
        for (const f of files) {
          try { await loadFile(f); } catch (e) { stats.errors++; console.warn('[Tarot] Lỗi nạp clip', e.message); }
        }
        console.info('[Tarot] Đã nạp sẵn', pools.size, 'file clip');
      })();
    } catch (e) {
      active = false;
      console.info('[Tarot] Chưa có clip nữ tư tế, dùng ảnh tĩnh:', e.message);
    }
    return active;
  }

  function takeReaction() {
    if (!REACTION_PHASES.has(phaseNow)) return null;
    const now = Date.now();
    while (reactions.length) {
      const r = reactions.shift();
      if (now - r.at <= REACTION_TTL_MS) return r.name;
    }
    return null;
  }

  function nextAfterEnd() {
    if (pending) return pending;
    const r = takeReaction();
    if (r) return r;
    if (talking) { talkToggle = !talkToggle; return talkToggle ? 'talk_b' : 'talk_a'; }
    if (cur && cur.info.loop) return cur.name;
    return PHASE_CLIP[phaseNow] && clipInfo(PHASE_CLIP[phaseNow])?.loop ? PHASE_CLIP[phaseNow] : base();
  }

  function start(name, fadeMs) {
    const info = clipInfo(name);
    const pool = info && pools.get(info.file);
    if (!pool) {
      if (info) console.info('[Tarot] Clip chưa nạp xong, giữ clip hiện tại:', name);
      else console.warn('[Tarot] Không có clip:', name);
      return false;
    }
    pending = null;
    const my = ++token;
    const prev = cur;
    const el = pool.find((v) => v !== prev?.el) || pool[0];
    const restartSame = el === prev?.el;
    el.onended = null;
    el.pause();
    try { el.currentTime = 0; } catch (_) {}
    cur = { name, info, el };
    const t0 = performance.now();

    // Thẻ mới nằm trên, hiện dần đè lên thẻ cũ (thẻ cũ vẫn sáng bên dưới → không bị tối chớp).
    pools.forEach((els) => els.forEach((v) => { if (v !== el) v.style.zIndex = '1'; }));
    el.style.zIndex = '2';
    el.style.transition = fadeMs && !restartSame ? `opacity ${fadeMs}ms linear` : 'none';

    el.play().then(() => {
      if (my !== token) return;
      stats.starts++;
      stats.lastStartMs = Math.round(performance.now() - t0);
      el.style.opacity = '1';
      if (prev && prev.el !== el) {
        setTimeout(() => {
          if (cur?.el === prev.el) return;
          prev.el.style.transition = 'none';
          prev.el.style.opacity = '0';
          prev.el.pause();
          try { prev.el.currentTime = 0; } catch (_) {}   // đỗ sẵn ở khung đầu cho lần sau
        }, (fadeMs || 0) + 40);
      }
      onStats(snapshotStats());
    }).catch((e) => { stats.errors++; console.warn('[Tarot] play() bị chặn:', e.message); });

    const fired = new Set();
    const cues = info.cues || {};
    let handedOff = false;
    // Sang clip kế tiếp. Clip kế chưa nạp xong: quay về clip nền, cùng lắm phát lại chính clip này — không đứng hình.
    const handOff = (fade) => {
      if (handedOff || my !== token) return;
      handedOff = true;
      stats.seams++;
      if (!start(nextAfterEnd(), fade)) { pending = null; if (!start(base(), fade)) start(name, 0); }
    };
    const dur = info.duration || el.duration || 0;
    const check = (t) => {
      for (const [cue, at] of Object.entries(cues)) if (!fired.has(cue) && t >= at) { fired.add(cue); onCue(cue, name); }
      if (dur && t >= dur - SEAM_OVERLAP_S) handOff(FADE_SEAM_MS);
    };
    if (el.requestVideoFrameCallback) {
      const watch = () => { if (my === token) el.requestVideoFrameCallback((_n, meta) => { check(meta.mediaTime); watch(); }); };
      watch();
    } else {
      el.ontimeupdate = () => { if (my === token) check(el.currentTime); };
    }
    el.onended = () => handOff(0);   // dự phòng nếu không bắt kịp mốc chồng lấn
    return true;
  }

  /** Yêu cầu chuyển clip: chờ biên clip nếu clip nền sắp hết, không thì mờ chéo ngay. */
  function request(name) {
    if (!active) return;
    if (!cur) { start(name, 0); return; }
    if (cur.name === name && cur.info.loop) { pending = null; return; }
    const remain = (cur.el.duration || 0) - cur.el.currentTime;
    if (FILLERS.has(cur.name) && remain <= BOUNDARY_WAIT_S) { pending = name; return; }
    stats.cuts++;
    if (!start(name, FADE_CUT_MS)) pending = null;
  }

  function snapshotStats() {
    const q = cur?.el.getVideoPlaybackQuality?.();
    if (q) stats.droppedFrames = q.droppedVideoFrames;
    return { ...stats, current: cur?.name || null, preloaded: pools.size };
  }

  return {
    init,
    isActive: () => active,
    /** Server đổi pha: chọn clip theo pha. READING phát talk_a/talk_b xen kẽ. */
    setPhase(phase) {
      if (!active) return;
      phaseNow = phase;
      talking = phase === 'READING';
      if (talking) {
        if (cur && FILLERS.has(cur.name) && cur.name.startsWith('talk_')) return;
        talkToggle = false; request('talk_a'); return;
      }
      if (REACTION_PHASES.has(phase)) { const r = takeReaction(); if (r) { request(r); return; } }
      request(PHASE_CLIP[phase] || base());
    },
    /** Phản ứng quà: phát ở biên clip kế tiếp khi đang rảnh/đọc bài (không chèn lúc xào, rút, lật bài). */
    queueReaction(kind) {
      if (!active) return;
      const name = kind === 'big' ? 'react_big' : 'react_small';
      if (!clipInfo(name)) return;
      if (kind === 'big') { const i = reactions.findIndex((r) => r.name === 'react_small'); if (i >= 0) reactions.splice(i, 1); }
      if (reactions.some((r) => r.name === name)) return;
      reactions.push({ name, at: Date.now() });
      if (reactions.length > 2) reactions.shift();
      if (phaseNow === 'IDLE' || phaseNow === 'INTERMISSION') { const r = takeReaction(); if (r) request(r); }
    },
    /** Mất kết nối: giữ lặp idle_wait. */
    holdIdle() { if (active) { talking = false; phaseNow = 'IDLE'; reactions.length = 0; request(base()); } },
    /** Một số nền (OBS) có thể tạm dừng video: gọi định kỳ để phát lại nếu bị dừng bất ngờ. */
    ensurePlaying() {
      if (!active || !cur) return;
      const v = cur.el;
      if (v.paused && !v.ended) v.play().catch(() => {});
    },
    getStats: snapshotStats
  };
}
