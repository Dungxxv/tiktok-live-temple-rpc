// Phòng Tarot — khởi động: nạp layout.json (khung Figma 900x1600), nối WebSocket, gắn trạng thái server vào giao diện.
import { setupCalibrate } from './calibrate.js';
import { createStore } from './state-store.js';
import { createClipPlayer } from './clip-player.js';
import { createQueueUi, avatarEl } from './ui-queue.js';
import { createSeatUi } from './ui-seat.js';
import { createCardsUi } from './ui-cards.js';
import { createDeck3d } from './deck3d.js';
import { createReadingUi } from './reading.js';
import { createFx } from './fx.js';
import { createSfx } from './sfx.js';
import { createGiftFloat } from './gift-float.js';

const UI = '/assets/tarot/ui/';
const params = new URLSearchParams(location.search);
const isObs = params.get('obs') === '1';
const isCalibrate = params.get('calibrate') === '1';
const showStats = params.get('stats') === '1';
const isMuted = params.get('mute') === '1';   // khung xem trước ở trang admin: không phát tiếng (tránh 2 nơi cùng nói)
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
  stage.classList.toggle('witch', !!L.banner);   // giao diện phù thủy (Figma 1080x1920): CSS "#stage.witch" trong tarot-witch.css
  if (L.shade) place($('shade'), L.shade);       // lớp chuyển tối ở đáy

  // Phần nào layout đánh dấu "hidden" thì ẩn (bản thiết kế phù thủy không dùng tiêu đề chữ, ảnh bàn, cột quà, nền phòng).
  const hide = (el, r) => { el.style.display = r?.hidden ? 'none' : ''; };
  hide($('bg'), L.bg);
  place($('title'), L.title);
  hide($('title'), L.title);
  $('title').textContent = L.title.text || 'Phòng TAROT';
  place($('video'), L.video);
  // Vùng cắt clip trong khung video (clip dọc 9:16 cắt lấy phần nhân vật), vd. "50% 28%".
  $('video').style.setProperty('--video-pos', L.video.objectPosition || '50% 50%');
  $('video').classList.toggle('no-mask', !!L.video.noMask);
  place($('table'), L.table);
  hide($('table'), L.table);
  hide($('giftMenu'), L.giftMenu);
  hide($('arcLayer'), L.arc?.hideDeck ? { hidden: true } : null);
  // Bảng giấy da trên cùng: lời mời + dải "Mã bình luận" (dòng chạy đặt bằng queue.marquee).
  if (L.banner) {
    place($('banner'), L.banner);
    $('banner').querySelector('.headline').textContent = L.banner.text || '';
  }
  hide($('banner'), L.banner ? null : { hidden: true });
  // Pha READING: khung giấy "Thông điệp nhận được"; lời giải, lá bài và ghế chuyển vào vị trí trong khung (CSS theo data-phase).
  const R = L.readingPanel;
  if (R) {
    place($('readingPanel'), R);
    const st = $('stage').style;
    st.setProperty('--rp-text-x', R.text.x + 'px'); st.setProperty('--rp-text-y', R.text.y + 'px'); st.setProperty('--rp-text-w', R.text.w + 'px');
    if (R.seat) st.setProperty('--seat-reading', `translate(${R.seat.x - L.seat.x}px, ${R.seat.y - L.seat.y}px) scale(${R.seat.scale})`);
  }
  hide($('readingPanel'), R ? null : { hidden: true });
  // Bong bóng thoại: cỡ chữ cố định, khung giãn theo chiều dọc (chiều cao trong layout là chiều cao tối thiểu).
  place($('bubble'), { x: L.bubble.x, y: L.bubble.y, w: L.bubble.w });
  $('bubble').style.minHeight = L.bubble.h + 'px';
  // Nhãn phần đang đọc (Quá khứ/Hiện tại/Tương lai/Lời kết) ngay trên mép bong bóng.
  place($('bubbleTag'), L.bubbleTag || { x: L.bubble.x + 18, y: L.bubble.y - 24 });
  place($('seat'), L.seat);
  // Ghế thu nhỏ quanh mép trên-giữa (giữ nguyên vị trí theo chiều ngang). Ghế bệ pha lê (có seat.face) thu nhỏ quanh góc trên-trái.
  $('seat').style.transformOrigin = L.seat.face ? '0 0' : '50% 0';
  $('seat').style.setProperty('--seat-base', `scale(${L.seat.scale || 1})`);
  $('seat').classList.toggle('pedestal', !!L.seat.face);
  place($('queueLabel'), L.queue.label);
  place($('queuePanel'), L.queue.panel);
  place($('queueMore'), L.queue.more);
  place($('toast'), L.toast);
  if (L.welcome) place($('welcomePopup'), L.welcome);
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

/** Nhãn cột quà = chủ đề mà quà mở (từ data/tarot/gift-topics.json); "+N ⭐" thành dòng phụ nhỏ mờ. */
async function applyGiftTopics(L) {
  if (L.giftMenu.showTopicLabel === false) return;
  try {
    const res = await fetch('/rpc', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tarot.giftMenu', params: {} }) });
    const menu = (await res.json()).result?.menu || [];
    document.querySelectorAll('#giftMenu .gift-item').forEach((d, i) => {
      const m = menu[i];
      const item = L.giftMenu.items[i];
      if (!m) return;
      const pill = d.querySelector('.pill');
      pill.innerHTML = `<b class="topic">${m.label}</b>`;
      d.classList.toggle('unassigned', !m.topic);
      if (L.giftMenu.showStarsSub !== false && item?.label) {
        const sub = document.createElement('div'); sub.className = 'sub'; sub.textContent = `${item.label} ⭐`;
        d.appendChild(sub);
      }
    });
  } catch (e) { console.warn('[Tarot] Không lấy được nhãn chủ đề quà:', e.message); }
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
  applyGiftTopics(layout);
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
  // Quà bay lên liên tục từ góc dưới-phải (998, 1920), mờ dần ở giữa màn; layout.giftFloat ghi đè thông số (false = tắt).
  const giftFloat = layout.giftFloat === false || !layout.banner ? null : createGiftFloat($('giftFloat'), layout.giftFloat || {});
  giftFloat?.start();
  // Bộ bài 3D (Three.js): nằm trên bàn, xáo bài, 3 lá bay lên. Không nạp được thì lá HTML vẫn hiện bình thường.
  if (layout.deck3d) createDeck3d({ stage: $('stage'), before: $('cardLayer'), layout, store, fx }).then((d) => { window.tarotDebug = { ...(window.tarotDebug || {}), deck3d: d }; });

  // Hiệu ứng âm thanh (ít tiếng, chỉ khoảnh khắc chính): summon, đếm 3-2-1, xáo bài, bàn sáng, lá bay, mở khung thông điệp.
  const sfx = createSfx({ store });
  window.tarotDebug = { ...(window.tarotDebug || {}), sfx };   // thử: tarotDebug.sfx.play('summon')
  const seatUi = createSeatUi({
    seatEl: $('seat'), faceEl: document.querySelector('#seat .seat-face'), nameEl: $('seatName'), topicEl: $('seatTopic'),
    fxEl: $('fxLayer'), layout, store, fx, sfx,
    getFlyFrom: () => queueUi.avatarRect(0),   // khách kế tiếp luôn đứng ô 1 trước khi vào ghế
    // Khách vừa xem xong được xếp lại cuối hàng: đốm sáng bay về ô của họ (hàng dài quá số ô → bay vào nút "+N").
    getFlyTo: (id) => {
      const i = queueUi.slotOf(id);
      if (i !== null) return queueUi.avatarRect(i);
      const st = store.get();
      if (!(st?.queue || []).some((e) => e.viewerId === id)) return null;   // không được xếp lại
      const m = layout.queue.more; return { x: m.x + m.w / 2, y: m.y + m.h / 2, d: 48 };
    },
    onLeft: (id, flew) => queueUi.release(id, flew)
  });
  // Ghế vừa trống mà khách đó có mặt trong hàng → giữ ô trống tới lúc đốm sáng từ bệ bay về (không hiện trước).
  let seatedId = null;
  const holdRequeued = (st) => {
    const id = st.seat?.viewerId || null;
    if (seatedId && !id && (st.queue || []).some((e) => e.viewerId === seatedId)) queueUi.hold(seatedId, 4500);
    seatedId = id;
  };
  // Nhạc nền: lặp liên tục, tự nhỏ lại (duck) khi nữ tư tế đang nói. Bật/tắt + âm lượng chỉnh từ /tarot/admin.
  const bgm = new Audio('/assets/tarot/audio/bgm.ogg');
  bgm.loop = true; bgm.preload = 'auto'; bgm.volume = 0;
  window.tarotDebug = { ...(window.tarotDebug || {}), bgm };
  let audioCfg = { musicOn: true, musicVolume: 0.35, voiceOn: true, voiceVolume: 1, duck: 0.35, sfxOn: true, sfxVolume: 0.4 };
  let speakingNow = false;
  let bgmTarget = 0;
  // Nhiều tab /tarot cùng một trình duyệt → tiếng chồng nhau nghe như vọng. Chỉ tab mở SAU CÙNG được phát tiếng, các tab cũ tự im.
  let superseded = false;
  try {
    const tabId = Math.random().toString(36).slice(2);
    const ch = new BroadcastChannel('tarot-audio');
    ch.onmessage = (e) => { if (e.data && e.data.claim && e.data.claim !== tabId && !isMuted) { superseded = true; applyAudio(); } };
    if (!isMuted) ch.postMessage({ claim: tabId });
  } catch (_) { /* trình duyệt không hỗ trợ BroadcastChannel: bỏ qua */ }
  const applyAudio = () => {
    bgmTarget = isMuted || superseded || !audioCfg.musicOn ? 0 : audioCfg.musicVolume * (speakingNow ? audioCfg.duck : 1);
    if (bgmTarget > 0 && bgm.paused) bgm.play().catch(() => { if (!isObs) $('audioHint').classList.add('show'); });
    readingUi?.setVolume(isMuted || superseded || !audioCfg.voiceOn ? 0 : audioCfg.voiceVolume);
    // Hiệu ứng: khi nữ tư tế đang nói thì nhỏ lại (không xuống dưới 50%) để không lấn giọng.
    sfx.setConfig({ on: !isMuted && !superseded && audioCfg.sfxOn !== false, vol: audioCfg.sfxVolume ?? 0.4, duck: Math.max(0.5, audioCfg.duck) });
    sfx.setSpeaking(speakingNow);
  };
  // Đổi âm lượng nhạc mượt (không giật khi nói/ngừng nói).
  setInterval(() => {
    const d = bgmTarget - bgm.volume;
    if (Math.abs(d) > 0.005) bgm.volume = Math.max(0, Math.min(1, bgm.volume + Math.sign(d) * Math.min(Math.abs(d), 0.03)));
    else if (bgmTarget === 0 && !bgm.paused) bgm.pause();
  }, 50);

  const readingUi = createReadingUi({
    muted: isMuted,
    panelPages: !!layout.readingPanel,   // khung "Thông điệp nhận được": hiện cả đoạn đang đọc, không chỉ một câu
    onSpeaking: (v) => { speakingNow = v; applyAudio(); },
    subEl: $('subtitle'), boxEl: $('bubble'), tagEl: $('bubbleTag'), store,
    // Đang đọc phần của lá nào thì lá đó sáng (chỉ trong pha đọc bài).
    onSection: (_section, cardIndex) => cardsUi.setFocus(store.get()?.phase === 'READING' ? cardIndex : null),
    onAudioBlocked: () => { if (!isObs) $('audioHint').classList.add('show'); }
  });
  $('audioHint').addEventListener('click', () => { $('audioHint').classList.remove('show'); applyAudio(); });

  const clips = createClipPlayer($('video'), {
    basePath: layout.video?.clipsPath || '/assets/tarot/clips/',   // bộ clip chọn trong layout.json
    onCue: (cue) => cardsUi.cue(cue),
    onStats: () => {}
  });
  window.tarotDebug = { ...(window.tarotDebug || {}), clips, store };   // tiện kiểm tra trong DevTools: tarotDebug.clips.getStats()
  const clipsReady = clips.init().then((ok) => { if (ok) $('video').classList.add('has-clips'); return ok; });

  // Bộ hẹn giờ dự phòng cho cue khi chưa có clip: "touch" và "point" theo thời điểm mặc định.
  let cueTimers = [];
  let lastPhaseKey = null;
  const onPhaseChange = (st) => {
    cueTimers.forEach(clearTimeout); cueTimers = [];
    // Pha mở đầu bằng lời nói ngay (không có khoảng chờ) → clip nói luôn, khỏi vào clip hành động rồi lại đổi.
    const sp = st.speech?.phases?.[st.phase];
    const lead = Number(st.config?.speechLeadSec?.[st.phase]) || 0;
    clips.setPhase(st.phase, { speaks: !isMuted && !!sp?.lines?.length && lead === 0 });
    sfx.onPhase(st);
    if (clips.isActive()) return;
    const age = store.phaseAge();
    const t = cardsUi.cueTimes;
    if (st.phase === 'DRAWING') cueTimers.push(setTimeout(() => cardsUi.cue('touch'), Math.max(0, (t.touch - age) * 1000)));
    if (st.phase === 'REVEALING') cueTimers.push(setTimeout(() => cardsUi.cue('point'), Math.max(0, (t.point - age) * 1000)));
  };

  store.subscribe((st) => {
    if (st.audio && JSON.stringify(st.audio) !== JSON.stringify(audioCfg)) { audioCfg = { ...audioCfg, ...st.audio }; applyAudio(); }
    $('stage').dataset.phase = st.phase;   // CSS đổi bố cục theo pha (vd. READING: khung "Thông điệp nhận được")
    holdRequeued(st);
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

  // Chào người vào phòng: xếp hàng, mỗi người một lượt, tối đa 4 người chờ (không dồn ứ khi phòng đông).
  // Bố cục phù thủy: avatar + "Chào …!" thay chỗ dòng mời trên bảng giấy, rồi avatar bay vào hàng chờ;
  // hết người chào thì dòng mời hiện lại. Dải "Mã bình luận" vẫn chạy bình thường.
  // Bố cục cũ (không có banner): popup chào ở giữa màn như trước.
  const welcomeQueue = [];
  let welcomeBusy = false;
  const banner = $('banner');
  const useBanner = !!layout.banner;
  const GREET_MS = 2600, WFLY_MS = 1000;

  /** Avatar trên bảng giấy bay vào hàng chờ: đáp vào đúng ô của người đó (ô được giữ trống tới lúc đáp, không đè ai);
   *  người đó nằm ngoài các ô đang hiện (hàng dài) → bay vào nút "+N người". */
  const flyToQueue = (w, gav, done) => {
    const st = store.get();
    const sr = $('stage').getBoundingClientRect();
    const k = sr.width / canvas.width || 1;
    const r = gav.getBoundingClientRect();
    const finish = () => { queueUi.release(w.viewerId); done(); };
    if (!st || st.phase === 'READING' || !r.width) { queueUi.release(w.viewerId, false); setTimeout(done, 200); return; }   // pha đọc bài bảng giấy đang ẩn
    const from = { x: (r.left + r.width / 2 - sr.left) / k, y: (r.top + r.height / 2 - sr.top) / k, d: r.width / k };
    const i = queueUi.slotOf(w.viewerId);
    const hiddenInQueue = i === null && st.seat?.viewerId !== w.viewerId && (st.queueTotal ?? 0) > layout.queue.grid.count;
    if (i === null && !hiddenInQueue) { queueUi.release(w.viewerId, false); setTimeout(done, 200); return; }   // đã lên bệ / không vào hàng: khỏi bay
    let to;
    if (i !== null) to = queueUi.avatarRect(i);
    else { const m = layout.queue.more; to = { x: m.x + m.w / 2, y: m.y + m.h / 2, d: 48 }; }
    const f = document.createElement('div');
    f.className = 'flyer';
    f.style.cssText = `left:${from.x - from.d / 2}px;top:${from.y - from.d / 2}px;width:${from.d}px;height:${from.d}px`;
    f.appendChild(avatarEl(w, 'av'));
    $('fxLayer').appendChild(f);
    gav.classList.add('gone');
    const dx = to.x - from.x, dy = to.y - from.y, k1 = to.d / from.d;
    const anim = f.animate([
      { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
      { transform: `translate(${dx * 0.45}px, ${dy * 0.3 - 60}px) scale(${(1 + k1) / 2 + 0.12}) rotate(-10deg)`, opacity: 1, offset: 0.45 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k1}) rotate(0deg)`, opacity: 0.15 }
    ], { duration: WFLY_MS, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
    fx.trail(f, WFLY_MS - 100, 50);
    anim.onfinish = () => { f.remove(); fx.burst(to.x, to.y, 16, 60); queueUi.release(w.viewerId); setTimeout(finish, 250); };
  };

  const greetNext = () => {
    const w = welcomeQueue.shift();
    if (!w) { welcomeBusy = false; banner.classList.remove('greeting'); return; }   // hết người: dòng mời hiện lại
    welcomeBusy = true;
    const gav = banner.querySelector('.gav');
    gav.innerHTML = ''; gav.classList.remove('gone');
    gav.appendChild(avatarEl(w, 'av'));
    banner.querySelector('.gtext b').textContent = `Chào ${w.name}!`;
    banner.classList.add('greeting');
    gav.animate([{ transform: 'scale(.3)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }], { duration: 600, easing: 'cubic-bezier(.2,1.5,.4,1)' });
    setTimeout(() => flyToQueue(w, gav, greetNext), GREET_MS);
  };

  const showWelcome = () => {
    const el = $('welcomePopup');
    const w = welcomeQueue.shift();
    if (!w || !el) { welcomeBusy = false; return; }
    welcomeBusy = true;
    el.querySelector('b').textContent = `Chào ${w.name}!`;
    el.classList.remove('hide'); void el.offsetWidth;   // chạy lại hiệu ứng
    el.classList.add('show');
    setTimeout(() => {
      el.classList.remove('show'); el.classList.add('hide');
      setTimeout(() => { el.classList.remove('hide'); showWelcome(); }, 450);
    }, 3200);
  };
  const queueWelcome = (p) => {
    if (welcomeQueue.length < 4) {
      welcomeQueue.push({ viewerId: p?.viewerId, name: p?.name || 'bạn', avatar: p?.avatar || '' });
      if (useBanner && p?.viewerId) queueUi.hold(p.viewerId, (welcomeQueue.length + 1) * (GREET_MS + WFLY_MS + 600));   // ô để trống chờ avatar bay tới
    }
    if (!welcomeBusy) (useBanner ? greetNext : showWelcome)();
  };
  window.tarotDebug = { ...(window.tarotDebug || {}), welcome: queueWelcome };   // thử: tarotDebug.welcome({ name: 'Minh Anh' })

  connectSocket({
    onMessage(method, p) {
      if (method === 'tarot.state') store.set(p);
      else if (method === 'tarot.welcome') queueWelcome(p);
      else if (method === 'tarot.reaction') {
        clips.queueReaction(p.kind);
        giftFloat?.burst(p.kind === 'big' ? 6 : 3);   // có quà thật: bung thêm một chùm
        toast(`${p.kind === 'big' ? '🌟' : '🌹'} ${p.name} vừa tặng quà${p.giftName ? ': ' + p.giftName : ''}`);
      }
    },
    onStatus(ok) {
      $('conn').classList.toggle('show', !ok);
      if (!ok) clips.holdIdle();
    }
  });

  setInterval(() => clips.ensurePlaying(), 2000);
  // Có thoại (chào, chủ đề, chuẩn bị, tạm biệt…) → clip nữ tư tế chuyển sang miệng nói.
  setInterval(() => clips.setSpeaking(readingUi.isTalking()), 100);   // theo tiếng đang phát thật → miệng khớp lời

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
