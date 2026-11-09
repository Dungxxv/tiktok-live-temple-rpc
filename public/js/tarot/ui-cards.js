// Bàn tarot 3D:
// - Bộ bài nằm úp trên mặt bàn (phối cảnh 3D, có độ dày) khi chờ / mời khách / chuyển khách.
// - SHUFFLING: chia đôi – trộn vài lượt rồi trải thành vòng cung nằm trên mặt bàn.
// - DRAWING: theo cue "touch" của video, từng lá được chọn nhấc lên khỏi bàn, phát sáng.
// - REVEALING: lá bay lên hàng trên (vệt sáng), dựng đứng; cue "point" → lật từng lá (chớp sáng + tia sáng xoay) và hiện tên.
// - READING: các lá còn lại vẫn úp trên bàn.
// - FAREWELL: lá úp lại, bay về chỗ cũ trên vòng cung, rồi cả bộ gom lại thành chồng bài.
// Mọi mốc tính theo phaseStartedAt của server nên client mở muộn vẫn khớp.
import { sessionKey } from './state-store.js';

const CARD_DIR = '/assets/tarot/cards/';
const BACK = '/assets/tarot/ui/back-card.svg';            // bản Figma (có bóng tím) — lá dựng đứng
const BACK_FLAT = '/assets/tarot/ui/back-card-flat.svg';  // cùng hình, bỏ bóng — lá nằm trên bàn (chồng nhiều lá không bị cộng sáng)
const SPREAD_LEAD = 2.6;        // giây trước khi hết SHUFFLING thì trải vòng cung
const STACK_UNTIL = 0.6;        // đầu SHUFFLING: chồng bài nằm yên
const FW_FLIP_BACK = 0.5;       // FAREWELL: úp lá lại
const FW_FLY_BACK = 1.6;        // FAREWELL: bay về vòng cung
const FW_GATHER = 3.4;          // FAREWELL: gom cả bộ về chồng bài

function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }

export function createCardsUi({ layer, arcEl, fx, store, cues = { touch: 1.5, point: 2.6 } }) {
  let L = null;
  let key = null;
  let els = [];               // [{ el, card, arcIdx, stage }]
  let arcCards = [];
  let arcMode = null;
  let deckGlow = null;
  let touchAt = null;         // tuổi pha khi video báo cue
  let pointAt = null;
  let firstPaint = true;

  const backImg = () => `<img class="back-img" src="${BACK_FLAT}" alt="">`;
  const backImgUpright = () => `<img class="back-img" src="${BACK_FLAT}" alt=""><img class="back-img glow" src="${BACK}" alt="">`;
  const T = () => L.tableScene.tiltDeg;

  function arcPoint(i) {
    const a = L.arc;
    const deg = a.fromDeg + ((a.toDeg - a.fromDeg) * i) / Math.max(1, a.count - 1);
    const rad = (deg * Math.PI) / 180;
    return { x: a.cx + a.rx * Math.sin(rad), y: a.cy - a.ry * Math.cos(rad), rz: deg * a.fanDeg };
  }

  // Tư thế lá nằm trên bàn, cho phần tử có tâm gốc (ox, oy) và tỉ lệ s so với lá trên bàn.
  function lyingTransform(p, ox, oy, s = 1, { lift = 0, dy = 0, z = 0, tilt = T(), scale = 1 } = {}) {
    return `translate3d(${p.x - ox}px, ${p.y - oy + dy}px, ${lift}px) rotateX(${tilt}deg) translateZ(${z}px) rotateZ(${p.rz}deg) scale(${s * scale})`;
  }

  function applyScene(el) {
    const sc = L.tableScene;
    el.style.perspective = sc.perspective + 'px';
    el.style.perspectiveOrigin = `${sc.originX}px ${sc.originY}px`;
  }

  function buildStatic() {
    applyScene(arcEl);
    applyScene(layer);
    arcEl.innerHTML = '';
    const a = L.arc; const d = L.deck;
    deckGlow = document.createElement('div');
    deckGlow.className = 'deck-glow';
    deckGlow.style.cssText = `left:${d.x - 150}px;top:${d.y - 55}px;width:300px;height:110px`;
    arcEl.appendChild(deckGlow);
    arcCards = Array.from({ length: a.count }, (_, i) => {
      const c = document.createElement('div');
      c.className = 'arc-card';
      c.style.cssText = `left:${d.x - a.cardW / 2}px;top:${d.y - a.cardH / 2}px;width:${a.cardW}px;height:${a.cardH}px;--side:${i % 2 ? 1 : -1};--d:${(i * 0.035).toFixed(3)}s;z-index:${i + 1}`;
      c.innerHTML = backImg();
      arcEl.appendChild(c);
      return c;
    });
    arcMode = null;
    setArc('stack', false);
  }

  /** stack | shuffle | spread */
  function setArc(mode, animated = true) {
    if (mode === arcMode) return;
    const prevMode = arcMode;
    arcMode = mode;
    const d = L.deck; const n = arcCards.length;
    arcEl.classList.toggle('shuffling', mode === 'shuffle');
    deckGlow.classList.toggle('strong', mode === 'shuffle');
    deckGlow.classList.toggle('dim', mode === 'spread');
    arcCards.forEach((c, i) => {
      c.style.transition = animated ? '' : 'none';
      if (mode === 'spread') {
        c.style.transitionDelay = animated ? `${(i * 0.045).toFixed(3)}s` : '0s';
        c.style.transform = lyingTransform(arcPoint(i), d.x, d.y);
      } else {
        // Gom về chồng: lá xa về sau, có độ dày (mỗi lá cao hơn 1,6px).
        const gatherDelay = prevMode === 'spread' ? Math.abs(i - (n - 1) / 2) * 0.04 : 0;
        c.style.transitionDelay = animated ? `${gatherDelay.toFixed(3)}s` : '0s';
        c.style.transform = lyingTransform({ x: d.x, y: d.y, rz: ((i * 37) % 7) - 3 }, d.x, d.y, 1, { z: i * 1.6 });
      }
      if (!animated) { void c.offsetWidth; c.style.transition = ''; }
    });
  }

  function slotRects(n) {
    const s = L.cardSlots;
    if (n >= s.length) return s.slice(0, n);
    const mid = Math.floor((s.length - 1) / 2);
    const start = Math.max(0, mid - Math.floor((n - 1) / 2));
    return s.slice(start, start + n);
  }

  function pickArcIndices(cards) {
    const n = L.arc.count;
    const used = new Set();
    return cards.map((c) => {
      let i = 2 + (hash(c.id + (c.reversed ? 'r' : '')) % (n - 4));   // tránh hai mép vòng cung
      while (used.has(i)) i = 2 + ((i - 2 + 3) % (n - 4));
      used.add(i);
      return i;
    }).sort((x, y) => x - y);
  }

  function clear() {
    els.forEach(({ el }) => { el.classList.add('leaving'); setTimeout(() => el.remove(), 450); });
    els = [];
    arcCards.forEach((c) => c.classList.remove('taken'));
  }

  function build(cards) {
    clear();
    if (!L || !cards.length) return;
    const rects = slotRects(cards.length);
    const idx = pickArcIndices(cards);
    els = cards.map((c, i) => {
      const r = rects[i];
      const el = document.createElement('div');
      el.className = 'tcard hidden' + (c.reversed ? ' reversed' : '');
      el.style.cssText = `left:${r.x}px;top:${r.y}px;width:${r.w}px;height:${r.h}px;`;
      el.innerHTML = `
        <div class="rays"></div>
        <div class="halo"></div>
        <div class="inner">
          <div class="face back">${backImgUpright()}</div>
          <div class="face front"><img src="${CARD_DIR}${c.id}.jpg" alt=""></div>
        </div>
        <div class="tlabel"><b>${c.name}</b>${c.reversed ? '<span>ngược</span>' : ''}</div>`;
      layer.appendChild(el);
      return { el, card: c, arcIdx: idx[i], rect: r, stage: null };
    });
  }

  const { stagePoint, burst, flash, trail } = fx;

  // ---- Tư thế từng lá theo pha + tuổi pha ----
  function cardStage(phase, age, i) {
    switch (phase) {
      case 'DRAWING': {
        // Chờ cue từ video (clip có thể bắt đầu muộn tới ~2 giây vì nối ở biên clip); không có cue thì tự chạy.
        const at = (touchAt ?? cues.touch + 3.0) + i * 0.35;
        return age >= at ? 'lift' : 'table';
      }
      case 'REVEALING': {
        const upAt = 0.2 + i * 0.28;
        const openAt = (pointAt ?? cues.point + 3.0) + i * 0.6;
        return age >= openAt ? 'open' : age >= upAt ? 'up' : 'lift';
      }
      case 'READING': return 'open';
      case 'FAREWELL': {
        if (age < FW_FLIP_BACK + i * 0.15) return 'open';
        if (age < FW_FLY_BACK + i * 0.2) return 'up';
        if (age < FW_GATHER) return 'table';
        return 'gone';
      }
      default: return 'gone';
    }
  }

  function applyStage(c, stage, animated) {
    if (c.stage === stage) return;
    const prev = c.stage;
    c.stage = stage;
    const { el, rect: r } = c;
    const p = arcPoint(c.arcIdx);
    const s = L.arc.cardW / r.w;
    const ox = r.x + r.w / 2; const oy = r.y + r.h / 2;
    el.style.transition = animated ? '' : 'none';
    el.dataset.stage = stage;
    if (stage === 'table' || stage === 'gone') el.style.transform = lyingTransform(p, ox, oy, s);
    else if (stage === 'lift') el.style.transform = lyingTransform(p, ox, oy, s, { dy: -34, lift: 30, tilt: T() * 0.55, scale: 1.18 });
    else el.style.transform = 'translate3d(0px, 0px, 0px) rotateX(0deg) translateZ(0px) rotateZ(0deg) scale(1)';
    el.classList.toggle('hidden', stage === 'gone');
    arcCards[c.arcIdx]?.classList.toggle('taken', stage !== 'gone');
    if (!animated) { void el.offsetWidth; el.style.transition = ''; return; }

    // Hiệu ứng khi đổi tư thế
    if (stage === 'lift' && prev === 'table') { const q = stagePoint(el); burst(q.x, q.y, 16, 60); }
    if (stage === 'up' && (prev === 'lift' || prev === 'table')) { el.classList.add('flying'); trail(el, 1000); setTimeout(() => el.classList.remove('flying'), 1100); }
    if (stage === 'open') {
      setTimeout(() => { if (!el.isConnected) return; const q = stagePoint(el); flash(q.x, q.y); burst(q.x, q.y, 22, 110); }, 260);
    }
    if (stage === 'table' && prev === 'up') { el.classList.add('flying'); trail(el, 800); setTimeout(() => el.classList.remove('flying'), 900); }
  }

  function arcModeFor(state, age) {
    const total = state.phaseEndsAt ? (state.phaseEndsAt - state.phaseStartedAt) / 1000 : 0;
    switch (state.phase) {
      case 'SHUFFLING': return age < STACK_UNTIL ? 'stack' : age < Math.max(STACK_UNTIL + 1, total - SPREAD_LEAD) ? 'shuffle' : 'spread';
      case 'DRAWING': case 'REVEALING': case 'READING': return 'spread';
      case 'FAREWELL': return age < FW_GATHER ? 'spread' : 'stack';
      default: return 'stack';
    }
  }

  function update(state, animated) {
    const age = store.phaseAge();
    setArc(arcModeFor(state, age), animated);
    els.forEach((c, i) => applyStage(c, cardStage(state.phase, age, i), animated));
  }

  function render(state) {
    if (!L) return;
    const k = state.cards.length ? `${sessionKey(state)}:${state.cards.map((c) => c.id + c.reversed).join(',')}` : null;
    if (k !== key) {
      key = k; touchAt = pointAt = null;
      build(state.cards);
    }
    update(state, !firstPaint);
    firstPaint = false;
  }

  // Các mốc trong pha chạy theo thời gian (không chờ gói trạng thái mới).
  setInterval(() => { const st = store.get(); if (st && L && !firstPaint) update(st, true); }, 100);

  return {
    setLayout(l) { L = l; buildStatic(); },
    render,
    /** Cue từ video (hoặc bộ hẹn giờ dự phòng khi chưa có clip). */
    cue(name) {
      const st = store.get();
      if (!st) return;
      if (name === 'touch' && st.phase === 'DRAWING' && touchAt === null) { touchAt = store.phaseAge(); update(st, true); }
      if (name === 'point' && st.phase === 'REVEALING' && pointAt === null) { pointAt = store.phaseAge(); update(st, true); }
    },
    cueTimes: cues
  };
}
