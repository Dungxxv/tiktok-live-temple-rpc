// Trình phát clip nữ tư tế (chống giật):
// - Nạp sẵn mọi clip vào bộ nhớ (blob) ngay từ đầu, mỗi file có thẻ <video> riêng đã giải mã khung đầu → đổi clip tức thì,
//   không còn khựng hình chờ tải như khi gán lại src.
// - Mọi clip bắt đầu/kết thúc cùng một tư thế (hai tay mở): nối ở biên clip gần như liền mạch.
//   Khi server đổi pha mà clip nền (idle/talk) sắp hết thì chờ hết clip rồi mới chuyển; còn lại thì mờ chéo mềm.
// - Lặp tự quản (không dùng loop gốc của trình duyệt) để chủ động chèn clip phản ứng quà ở biên clip.
// Chưa có clip (manifest 404) thì tự tắt và để giao diện dùng ảnh tĩnh.
const PHASE_CLIP = {
  // CALLING: giữ clip chờ (avatar đang bay vào bệ), chào bằng clip nói cùng nhịp — clip gật chào phải đợi mốc nhịp
  // mới vào được (không giật) nên trễ, làm miệng nói muộn. Gật chào vẫn dùng cho phản ứng quà (react_big).
  IDLE: 'idle_wait', INTERMISSION: 'idle_wait', CALLING: 'idle_wait', BREAK: 'idle_wait', SHUFFLING: 'shuffle',
  DRAWING: 'draw_card', REVEALING: 'reveal', FAREWELL: 'farewell'
};
const FILLERS = new Set(['idle_wait', 'invite', 'talk_a', 'talk_b']);
const FADE_CUT_MS = 420;       // chuyển giữa chừng (chỉ khi buộc phải cắt ngang clip hành động)
// Nối clip chồng lấn: clip sau bắt đầu sớm SEAM_OVERLAP_S và hiện dần trong lúc clip trước chạy nốt,
// che độ lệch tư thế giữa khung cuối/khung đầu (đo SSIM chỉ 0,76–0,95 ở các chỗ nối).
const SEAM_OVERLAP_S = 0.4;
const FADE_SEAM_MS = 380;
const REACTION_TTL_MS = 180000; // giữ phản ứng chờ tới lúc trải bài xong (một phiên có thể dài 1–2 phút)
// Không bộc lộ cảm xúc vui khi đang trải bài: phản ứng quà chỉ phát lúc rảnh / chuyển khách (sau khi xong phiên).
const REACTION_PHASES = new Set(['IDLE', 'INTERMISSION']);

export function createClipPlayer(root, { basePath = '/assets/tarot/clips/', onCue = () => {}, onStats = () => {} } = {}) {
  let manifest = null;
  let active = false;
  const pools = new Map();        // file → [video, (video đôi)]
  let cur = null;                 // { name, info, el }
  let pending = null;             // clip chờ phát ở biên clip hiện tại
  let token = 0;
  let speakingNow = false;        // nữ tư tế đang có thoại (theo tiếng thật đang phát) → miệng nói; hết thoại → về clip chờ
  let silentSince = 0;            // lúc bắt đầu im (chống chập chờn giữa hai câu liền nhau)
  let talkToggle = false;
  const wantTalk = () => speakingNow;
  // Clip hành động được nhường cho miệng nói khi có thoại; riêng xáo bài (mắt sáng) giữ nguyên.
  const KEEP_WHILE_TALKING = new Set(['shuffle']);
  const TALK_CLIPS = new Set(['talk_a', 'talk_b', 'reveal']);
  const EXPECT_TALK_MS = 1200;    // đầu pha có lời: chờ tiếng phát tối đa chừng này trước khi coi là im
  let expectTalkUntil = 0;
  const STOP_TALK_AFTER_MS = 250; // im quá chừng này mới thôi nhép miệng (khoảng nghỉ giữa hai câu ngắn hơn)
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
    if (wantTalk()) { talkToggle = !talkToggle; return talkToggle ? 'talk_b' : 'talk_a'; }
    if (cur && cur.info.loop) return cur.name;
    return PHASE_CLIP[phaseNow] && clipInfo(PHASE_CLIP[phaseNow])?.loop ? PHASE_CLIP[phaseNow] : base();
  }

  function start(name, fadeMs, offset = 0) {
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
    try { el.currentTime = offset; } catch (_) {}
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
  let markTimer = null;
  function request(name) {
    if (!active) return;
    clearTimeout(markTimer);
    cancelSwitch();
    if (!cur) { start(name, 0); return; }
    if (cur.name === name && cur.info.loop) { pending = null; return; }
    const remain = (cur.el.duration || 0) - cur.el.currentTime;
    if (FILLERS.has(cur.name)) {
      // Clip hành động bắt đầu ở tư thế đầu nhịp → vào đúng mốc tròn nhịp 3 giây gần nhất của clip đang lặp (không giật).
      const toMark = CYCLE_S - (cur.el.currentTime % CYCLE_S);
      if (remain <= toMark + 0.05) { pending = name; return; }   // mốc gần nhất chính là cuối clip: nối tự nhiên
      pending = name;
      const my = token;
      markTimer = setTimeout(() => { if (my === token && pending === name) { stats.cuts++; if (!start(name, 120)) pending = null; } }, Math.max(0, toMark * 1000 - 60));
      return;
    }
    stats.cuts++;
    if (!start(name, FADE_CUT_MS)) pending = null;
  }

  // Chuyển động nền (thở, tóc, đồ treo, sao) của mọi clip lặp chu kỳ 3 giây. Clip chờ ↔ clip nói ở CÙNG NHỊP giống nhau
  // 98–99% (đo SSIM; chỉ khác miệng), lệch nhịp chỉ 89–92% → giật. Vì vậy đổi qua lại luôn vào đúng nhịp đang chạy.
  const CYCLE_S = 3;
  const LOOP_CLIPS = new Set(['idle_wait', 'invite', 'talk_a', 'talk_b']);
  const IN_PHASE_FADE_MS = 120;   // cùng nhịp đã giống 98–99%: mờ chéo ngắn là đủ, dài thì dễ lộ hai lớp
  const phaseOf = (el) => ((el.currentTime % CYCLE_S) + CYCLE_S) % CYCLE_S;

  // Hai clip chớp mắt ở thời điểm khác nhau (manifest "blinks"): đổi giữa lúc đang chớp → mắt nhắm/mở ngang. Né khoảng đó.
  // Giây còn lại tới hết khoảng chớp mắt đang diễn ra ở thời điểm t (0 = không đang chớp).
  const blinkLeft = (info, t) => { for (const [a, b] of info?.blinks || []) if (t >= a && t <= b) return b - t; return 0; };
  let switchTimer = null;
  let switchTarget = null;

  /** Đổi giữa hai clip lặp (chờ ↔ nói) ở cùng nhịp, né lúc chớp mắt: không giật.
   *  maxWait: chờ hết cái chớp mắt tối đa bấy nhiêu giây (bắt đầu nói: ngắn để miệng khớp lời). */
  function switchInPhase(name, maxWait = 1.0) {
    const info = clipInfo(name);
    if (!info || !pools.get(info.file)) return false;
    const off = cur ? phaseOf(cur.el) : 0;
    const dur = info.duration || CYCLE_S;
    if (dur - off < 0.3) { pending = name; return true; }   // sát cuối clip đích: để nối tự nhiên ở biên
    const wait = cur ? Math.max(blinkLeft(cur.info, cur.el.currentTime), blinkLeft(info, off)) : 0;
    if (wait > 0 && wait <= maxWait) {
      if (switchTarget !== name) {
        clearTimeout(switchTimer);
        switchTarget = name;
        switchTimer = setTimeout(() => { const n = switchTarget; switchTarget = null; switchTimer = null; if (n) switchInPhase(n, 0); }, wait * 1000 + 30);
      }
      return true;
    }
    cancelSwitch();
    stats.cuts++;
    // Không né kịp cái chớp mắt: cắt gọn (không mờ chéo) để không hiện mắt hai lớp.
    return start(name, wait > 0 ? 0 : IN_PHASE_FADE_MS, off);
  }
  /** Bỏ lượt đổi đang chờ (vd. vừa định về clip chờ thì lại nói tiếp). */
  function cancelSwitch() { clearTimeout(switchTimer); switchTimer = null; switchTarget = null; }

  /** Vào clip nói: từ clip chờ → đổi cùng nhịp ngay; từ clip hành động (gật chào, cảm ơn…) → chờ nó xong ở chỗ nối. */
  function startTalk() {
    if (!active) return;
    if (cur && TALK_CLIPS.has(cur.name)) return;
    talkToggle = false;
    if (!cur || LOOP_CLIPS.has(cur.name)) { if (!switchInPhase('talk_a', 0.65)) pending = null; return; }
    pending = 'talk_a';   // clip hành động: phát nốt rồi nói (không cắt ngang → không giật)
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
    /** opts.speaks = pha mở đầu bằng lời nói ngay (không có khoảng chờ): dùng clip nói luôn thay clip hành động,
     *  tránh vừa vào clip hành động đã phải đổi sang clip nói (đổi hai lần → giật). Xáo bài (mắt sáng) giữ nguyên. */
    setPhase(phase, opts = {}) {
      if (!active) return;
      phaseNow = phase;
      if (REACTION_PHASES.has(phase)) { const r = takeReaction(); if (r) { request(r); return; } }
      const want = phase === 'READING' ? base() : PHASE_CLIP[phase] || base();
      // Pha mở đầu bằng lời: vào clip nói sẵn và chờ tiếng bắt đầu (tải/giải mã ~0,1–1 giây) — không quay về chờ ngay.
      if (opts.speaks) expectTalkUntil = performance.now() + EXPECT_TALK_MS;
      if ((opts.speaks || speakingNow) && !KEEP_WHILE_TALKING.has(want)) { startTalk(); return; }
      if (cur && TALK_CLIPS.has(cur.name) && LOOP_CLIPS.has(want)) return;   // đang nói: hết thoại sẽ tự về clip chờ cùng nhịp
      if (cur && LOOP_CLIPS.has(cur.name) && LOOP_CLIPS.has(want)) { if (cur.name !== want) switchInPhase(want); return; }
      request(want);
    },
    /** Gọi định kỳ (~100ms) theo tiếng đang phát thật. Có thoại → sang clip nói cùng nhịp (trừ lúc xáo bài);
     *  hết thoại (im > 250ms) → về clip chờ cùng nhịp. Đổi cùng nhịp nên không giật. */
    setSpeaking(v) {
      if (!active) return;
      const now = performance.now();
      if (v) { speakingNow = true; silentSince = 0; expectTalkUntil = 0; }
      else if (now < expectTalkUntil) return;   // đầu pha có lời, tiếng chưa kịp phát: giữ clip nói
      else if (speakingNow) {
        if (!silentSince) silentSince = now;
        if (now - silentSince >= STOP_TALK_AFTER_MS) speakingNow = false;
      }
      if (!cur) return;
      // lượt đổi đang chờ (né chớp mắt) mà ngược hướng hiện tại thì bỏ
      if (switchTarget && switchTarget.startsWith('talk') !== speakingNow) cancelSwitch();
      if (speakingNow) {
        if (!TALK_CLIPS.has(cur.name) && !KEEP_WHILE_TALKING.has(cur.name) && !(pending && pending.startsWith('talk'))) startTalk();
      } else {
        if (pending && pending.startsWith('talk')) pending = null;   // chưa kịp nói đã im: bỏ lượt nói chờ
        if (cur.name === 'talk_a' || cur.name === 'talk_b') {
          const back = PHASE_CLIP[phaseNow] && clipInfo(PHASE_CLIP[phaseNow])?.loop ? PHASE_CLIP[phaseNow] : base();
          switchInPhase(back);
        }
      }
    },
    /** Phản ứng quà: chỉ phát khi đã trải bài xong (rảnh / chuyển khách); nhiều quà gộp thành một lần. */
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
    holdIdle() { if (active) { speakingNow = false; phaseNow = 'IDLE'; reactions.length = 0; request(base()); } },
    /** Một số nền (OBS) có thể tạm dừng video: gọi định kỳ để phát lại nếu bị dừng bất ngờ. */
    ensurePlaying() {
      if (!active || !cur) return;
      const v = cur.el;
      if (v.paused && !v.ended) v.play().catch(() => {});
    },
    getStats: snapshotStats
  };
}
