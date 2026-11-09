// Phòng Tarot — khởi động: nạp layout.json (khung Figma 900x1600), nối WebSocket, gắn trạng thái server vào giao diện.
import { setupCalibrate } from './calibrate.js';
import { createStore } from './state-store.js';
import { createClipPlayer } from './clip-player.js';
import { createQueueUi } from './ui-queue.js';
import { createSeatUi } from './ui-seat.js';
import { createCardsUi } from './ui-cards.js';
import { createReadingUi } from './reading.js';
import { createFx } from './fx.js';

const UI = '/assets/tarot/ui/';
const params = new URLSearchParams(location.search);
const isObs = params.get('obs') === '1';
const isCalibrate = params.get('calibrate') === '1';
const showStats = params.get('stats') === '1';
if (isObs) document.body.classList.add('obs');

const $ = (id) => document.getElementById(id);
let canvas = { width: 900, height: 1600 };

export function place(el, r) {
  el.style.left = r.x + 'px';
  el.style.top = r.y + 'px';
  if (r.w !== undefined) el.style.width = r.w + 'px';
  if (r.h !== undefined) el.style.height = r.h + 'px';
}

function fitStage() {
  const s = Math.min(window.innerWidth / canvas.width, window.innerHeight / canvas.height);
  $('stage').style.transform = `scale(${s})`;
  return s;
}

export function applyLayout(L) {
  canvas = L.canvas || canvas;
  const stage = $('stage');
  stage.style.width = canvas.width + 'px';
  stage.style.height = canvas.height + 'px';

  place($('title'), L.title);
  $('title').textContent = L.title.text || 'Phòng TAROT';
  place($('video'), L.video);
  place($('table'), L.table);
  place($('bubble'), L.bubble);
  place($('seat'), L.seat);
  // Ghế thu nhỏ quanh mép trên-giữa (giữ nguyên vị trí theo chiều ngang).
  $('seat').style.transformOrigin = '50% 0';
  $('seat').style.transform = `scale(${L.seat.scale || 1})`;
  place($('queueLabel'), L.queue.label);
  place($('queuePanel'), L.queue.panel);
  place($('queueMore'), L.queue.more);
  place($('toast'), L.toast);
  place($('disclaimer'), L.disclaimer);
  if (L.queue.marquee) setupMarquee(L.queue.marquee);

  const menu = $('giftMenu');
  menu.style.inset = '0';
  menu.innerHTML = '';
  for (const it of L.giftMenu.items) {
    const d = document.createElement('div');
    d.className = 'gift-item';
    d.style.left = L.giftMenu.x + 'px';
    d.style.top = it.y + 'px';
    d.innerHTML = `<img class="icon" src="${UI}${it.icon}" alt=""><div class="pill"><b>${it.label}</b><img src="${UI}star.svg" alt=""></div>`;
    menu.appendChild(d);
  }
}

/** Dòng chữ chạy ngang phía trên bảng hàng chờ: hai bản sao nối nhau để chạy liền không đứt. */
function setupMarquee(m) {
  const box = $('marquee');
  place(box, m);
  const track = box.querySelector('.track');
  track.innerHTML = '';
  for (let k = 0; k < 2; k++) { const sp = document.createElement('span'); sp.textContent = m.text; track.appendChild(sp); }
  const setSpeed = () => {
    const w = track.firstChild.getBoundingClientRect().width / ($('stage').getBoundingClientRect().width / canvas.width || 1);
    track.style.setProperty('--dur', `${Math.max(12, w / (m.speed || 85)).toFixed(1)}s`);
  };
  setSpeed();
  if (document.fonts?.ready) document.fonts.ready.then(setSpeed);
}

function connectSocket({ onMessage, onStatus }) {
  let attempt = 0;
  const open = () => {
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
    ws.onopen = () => { attempt = 0; onStatus(true); };
    ws.onmessage = (ev) => {
      try { const m = JSON.parse(ev.data); if (m && m.method) onMessage(m.method, m.params); } catch (_) {}
    };
    ws.onclose = () => {
      onStatus(false);
      setTimeout(open, Math.min(8000, 500 * 2 ** attempt++));
    };
    ws.onerror = () => ws.close();
  };
  open();
}

async function boot() {
  let layout;
  try {
    layout = await (await fetch('/tarot/layout.json', { cache: 'no-store' })).json();
  } catch (e) {
    console.error('[Tarot] Không nạp được layout.json', e);
    return;
  }
  applyLayout(layout);
  fitStage();
  window.addEventListener('resize', fitStage);

  const store = createStore();
  const fx = createFx($('fxLayer'), $('stage'));
  const cardsUi = createCardsUi({ layer: $('cardLayer'), arcEl: $('arcLayer'), fx, store });
  cardsUi.setLayout(layout);
  const queueUi = createQueueUi({
    slotsEl: $('queueSlots'), tokensEl: $('queueTokens'), moreEl: $('queueMore'), labelEl: $('queueLabel'),
    pointerEl: document.querySelector('#queuePanel .pointer'), layout, store, fx
  });
  if (isCalibrate && !isObs) setupCalibrate(layout, { getScale: fitStage });
  if (isCalibrate) return;   // chế độ hiệu chuẩn chỉ cần bố cục, không nối dữ liệu

  const seatUi = createSeatUi({
    seatEl: $('seat'), faceEl: document.querySelector('#seat .seat-face'), nameEl: $('seatName'),
    fxEl: $('fxLayer'), layout, store, fx,
    getFlyFrom: () => queueUi.avatarRect(0)   // khách kế tiếp luôn đứng ô 1 trước khi vào ghế
  });
  const readingUi = createReadingUi({
    subEl: $('subtitle'), boxEl: $('bubble'), store,
    onAudioBlocked: () => { if (!isObs) $('audioHint').classList.add('show'); }
  });
  $('audioHint').addEventListener('click', () => $('audioHint').classList.remove('show'));

  const clips = createClipPlayer($('video'), {
    onCue: (cue) => cardsUi.cue(cue),
    onStats: () => {}
  });
  window.tarotDebug = { clips, store };   // tiện kiểm tra trong DevTools: tarotDebug.clips.getStats()
  const clipsReady = clips.init().then((ok) => { if (ok) $('video').classList.add('has-clips'); return ok; });

  // Bộ hẹn giờ dự phòng cho cue khi chưa có clip: "touch" và "point" theo thời điểm mặc định.
  let cueTimers = [];
  let lastPhaseKey = null;
  const onPhaseChange = (st) => {
    cueTimers.forEach(clearTimeout); cueTimers = [];
    clips.setPhase(st.phase);
    if (clips.isActive()) return;
    const age = store.phaseAge();
    const t = cardsUi.cueTimes;
    if (st.phase === 'DRAWING') cueTimers.push(setTimeout(() => cardsUi.cue('touch'), Math.max(0, (t.touch - age) * 1000)));
    if (st.phase === 'REVEALING') cueTimers.push(setTimeout(() => cardsUi.cue('point'), Math.max(0, (t.point - age) * 1000)));
  };

  store.subscribe((st) => {
    queueUi.render(st);
    seatUi.render(st);
    const pk = `${st.phase}:${st.phaseStartedAt}`;
    if (pk !== lastPhaseKey) { lastPhaseKey = pk; clipsReady.then(() => onPhaseChange(st)); }
    cardsUi.render(st);
    readingUi.render(st);
  });

  let toastTimer = null;
  const toast = (text) => {
    const el = $('toast');
    el.textContent = text; el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3500);
  };

  connectSocket({
    onMessage(method, p) {
      if (method === 'tarot.state') store.set(p);
      else if (method === 'tarot.reaction') {
        clips.queueReaction(p.kind);
        toast(`${p.kind === 'big' ? '🌟' : '🌹'} ${p.name} vừa tặng quà${p.giftName ? ': ' + p.giftName : ''}`);
      }
    },
    onStatus(ok) {
      $('conn').classList.toggle('show', !ok);
      if (!ok) clips.holdIdle();
    }
  });

  setInterval(() => clips.ensurePlaying(), 2000);

  if (showStats) {
    const el = $('stats');
    el.classList.add('show');
    setInterval(() => {
      const s = clips.getStats();
      const st = store.get();
      el.textContent = `pha=${st?.phase || '-'} clip=${s.current || '-'} bắt đầu=${s.lastStartMs}ms bỏ khung=${s.droppedFrames} lỗi=${s.errors}`;
    }, 500);
  }
}

boot();
