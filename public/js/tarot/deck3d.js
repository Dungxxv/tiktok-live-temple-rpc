// Bộ bài 3D trên mặt bàn (Three.js, nạp tại chỗ từ /vendor/three — không phụ thuộc CDN khi phát OBS).
// - Chờ / mời khách / đếm ngược: bộ bài nằm úp trên bàn (chồng lá có độ dày). Avatar trên bệ đá được phép đè lên.
// - SHUFFLING: xáo NGAY TRÊN MẶT BÀN (tách hai nửa → xòe như lật trang → đổ vào đan xen → dồn lại, hai lượt, giống video mẫu),
//   rồi trải bộ bài thành hình quạt trên bàn.
// - DRAWING: mặt bàn tỏa nguồn sáng vàng + hạt năng lượng bay lên → 3 lá nhấc khỏi hình quạt, bay xoáy lên đúng 3 ô (Figma),
//   vừa bay vừa lật mặt cho người xem thấy luôn → phần bài còn lại trên bàn tan biến.
//   Lá HTML (ui-cards.js) tiếp quản đúng lúc lá 3D chạm ô (đã ngửa mặt): nhãn, thu vào khung đọc.
// - FAREWELL: bộ bài hiện lại trên bàn.
// Mọi tư thế là hàm của (pha, tuổi pha theo giờ server) → mở trang muộn vẫn khớp.
const THREE_URL = '/vendor/three/three.module.min.js';
const CARD_DIR = '/assets/tarot/cards/';

// Mốc thời gian (giây, tính từ đầu pha). ui-cards.js dùng chung để biết lúc lá chạm ô.
const SH = { start: 0.4, cycles: 2, cycleLen: 1.75, spreadAt: 4.4, spreadLen: 1.3 };
const DR = { light: 0.1, t0: 1.1, gap: 0.5, rise: 0.4, fly: 1.35, vanishAfter: 0.35, vanishLen: 1.0 };
export const FW_AWAY = 0.9;            // FAREWELL: lá HTML thu nhỏ bay về bàn
const FW_BACK = 1.3, FW_BACK_LEN = 1.0; // FAREWELL: bộ bài hiện lại

/** Mốc của lá thứ i trong pha DRAWING: nhấc lên, bắt đầu bay, chạm ô. */
export function drawTimes(i) {
  const rise = DR.t0 + i * DR.gap;
  return { rise, fly: rise + DR.rise, land: rise + DR.rise + DR.fly };
}

const clamp01 = (x) => Math.max(0, Math.min(1, x));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeSoft = (t) => 0.5 - 0.5 * Math.cos(Math.PI * t);   // sin vào – sin ra: mềm, không giật
const seg = (age, a, len) => clamp01((age - a) / len);

export async function createDeck3d({ stage, before, layout, store, fx }) {
  let THREE;
  try { THREE = await import(THREE_URL); } catch (e) { console.warn('[Tarot] Không nạp được Three.js, bỏ bộ bài 3D:', e.message); return null; }
  const W = layout.canvas.width, H = layout.canvas.height;
  const cfg = { cardW: 170, tiltDeg: 72, count: 36, fov: 30, thick: 1.4, spreadRadius: 520, spreadDeg: 42, ...(layout.deck3d || {}) };
  const CW = cfg.cardW, CH = cfg.cardW * (460.476 / 279.517), TH = cfg.thick, N = cfg.count;
  const deckPos = layout.deck;

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  } catch (e) { console.warn('[Tarot] WebGL không dùng được, bỏ bộ bài 3D:', e.message); return null; }
  renderer.setPixelRatio(1);
  renderer.setSize(W, H, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const canvas = renderer.domElement;
  canvas.id = 'deck3d';
  canvas.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none`;
  stage.insertBefore(canvas, before || null);

  // Máy quay phối cảnh đặt sao cho mặt phẳng z=0 trùng đúng pixel khung thiết kế (x = cột, y = -hàng).
  const D = (H / 2) / Math.tan((cfg.fov * Math.PI) / 360);
  const camera = new THREE.PerspectiveCamera(cfg.fov, W / H, 10, D * 4);
  camera.position.set(W / 2, -H / 2, D);
  camera.lookAt(W / 2, -H / 2, 0);
  const scene = new THREE.Scene();

  // Hệ tọa độ mặt bàn: gốc tại chỗ đặt bộ bài, mặt phẳng XY là mặt bàn (nghiêng tiltDeg so với màn hình), +Z hướng lên khỏi bàn,
  // +Y hướng vào trong (phía nữ tư tế), -Y hướng về người xem.
  const TILT = (cfg.tiltDeg * Math.PI) / 180;
  const Tbase = new THREE.Matrix4().makeTranslation(deckPos.x, -deckPos.y, 0).multiply(new THREE.Matrix4().makeRotationX(-TILT));

  // ---- Vật liệu ----
  const loadImg = async (url) => { const img = new Image(); img.src = url; await img.decode(); return img; };
  function canvasTex(c) {
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = renderer.capabilities.getMaxAnisotropy();
    return t;
  }
  function radialTexture(stops) {
    const c = document.createElement('canvas'); c.width = c.height = 256;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    stops.forEach(([o, col]) => gr.addColorStop(o, col));
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    return canvasTex(c);
  }
  const TEX_W = 512, TEX_H = Math.round(512 * (CH / CW));
  const backC = document.createElement('canvas'); backC.width = TEX_W; backC.height = TEX_H;
  backC.getContext('2d').drawImage(await loadImg(layout.cards?.back || '/assets/tarot/ui/w-back-card.svg'), 0, 0, TEX_W, TEX_H);
  // Lá nằm trên bàn hơi trầm xuống cho hợp ánh sáng tối của bàn (lá bay lên dùng mặt trước riêng, giữ sáng).
  const backMat = new THREE.MeshBasicMaterial({ map: canvasTex(backC), transparent: true, alphaTest: 0.04, color: 0xb4abc4 });   // góc bo tròn trong suốt
  // Mép lá: màu giấy kem, xen hai sắc để chồng bài có vân lá như bài thật.
  const edgeA = new THREE.MeshBasicMaterial({ color: 0xcdbf9f, transparent: true });
  const edgeB = new THREE.MeshBasicMaterial({ color: 0xa8956f, transparent: true });
  const fadeMats = [backMat, edgeA, edgeB];
  const geo = new THREE.BoxGeometry(CW, CH, TH);

  /** Mặt trước lá (giống lá HTML: nền trắng bo góc + ảnh lá; lá ngược thì xoay ảnh 180°). */
  async function frontMaterial(card) {
    const c = document.createElement('canvas'); c.width = TEX_W; c.height = TEX_H;
    const g = c.getContext('2d');
    const r = TEX_W * (21.7 / 268);
    g.fillStyle = '#fff';
    g.beginPath(); g.roundRect(0, 0, TEX_W, TEX_H, r); g.fill();
    try {
      const img = await loadImg(`${CARD_DIR}${card.id}.jpg`);
      const x = TEX_W * 0.0405, y = TEX_H * 0.0246, w = TEX_W * 0.9075, h = TEX_H * 0.9439;
      g.save();
      g.beginPath(); g.roundRect(x, y, w, h, TEX_W * (12.4 / 268)); g.clip();
      if (card.reversed) { g.translate(x + w / 2, y + h / 2); g.rotate(Math.PI); g.drawImage(img, -w / 2, -h / 2, w, h); }
      else g.drawImage(img, x, y, w, h);
      g.restore();
    } catch (_) { /* thiếu ảnh: để nền trắng */ }
    return new THREE.MeshBasicMaterial({ map: canvasTex(c), transparent: true, alphaTest: 0.04 });
  }

  const cards = Array.from({ length: N }, (_, i) => {
    const e = i % 2 ? edgeA : edgeB;
    const m = new THREE.Mesh(geo, [e, e, e, e, backMat, backMat]);
    m.matrixAutoUpdate = false;
    m.renderOrder = 2;
    scene.add(m);
    return m;
  });

  // Bóng in trên bàn, quầng sáng vàng và vòng sáng lan trên mặt bàn.
  const flat = (tex, w, h, additive, order) => {
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, ...(additive ? { blending: THREE.AdditiveBlending } : {}) });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    m.matrixAutoUpdate = false; m.renderOrder = order; scene.add(m);
    return { m, mat };
  };
  const glow = flat(radialTexture([[0, 'rgba(255,232,160,1)'], [0.3, 'rgba(255,196,90,0.7)'], [0.6, 'rgba(200,120,255,0.25)'], [1, 'rgba(120,60,220,0)']]), CW * 6.5, CH * 3.2, true, 1);
  const ring = flat(radialTexture([[0, 'rgba(255,220,140,0)'], [0.72, 'rgba(255,220,140,0)'], [0.84, 'rgba(255,236,170,0.95)'], [0.92, 'rgba(255,200,110,0.35)'], [1, 'rgba(255,200,110,0)']]), CW * 3, CW * 3, true, 1);

  // ---- Tư thế (trong hệ mặt bàn) ----
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const Q = () => new THREE.Quaternion();
  const qAxis = (ax, ay, az, a) => new THREE.Quaternion().setFromAxisAngle(V(ax, ay, az), a);
  const jitter = (s) => ({ x: (((s * 37) % 7) - 3) * 0.45, y: (((s * 11) % 5) - 2) * 0.45, rz: ((((s * 53) % 9) - 4) * 0.18 * Math.PI) / 180 });
  const mix = (a, b, t) => ({ p: a.p.clone().lerp(b.p, t), q: a.q.clone().slerp(b.q, t), s: a.s + (b.s - a.s) * t });

  /** Lá ở vị trí s trong chồng (0 = dưới cùng). */
  function stackPose(s, lift = 0, spread = 1) {
    const j = jitter(s);
    return { p: V(j.x, j.y, lift + (s * TH + TH / 2) * spread), q: qAxis(0, 0, 1, j.rz), s: 1 };
  }
  /** Lá thứ s trên hình quạt trải trên bàn (s = 0 bên trái → N-1 bên phải); hai đầu quạt cong về phía người xem. */
  // spreadShift: dời cả hình quạt về phía người xem (âm = xuống dưới màn hình, gần bệ đá, không che tay nữ tư tế).
  const R = cfg.spreadRadius, PHI = (cfg.spreadDeg * Math.PI) / 180, SHIFT = cfg.spreadShift ?? 0;
  function fanSpreadPose(s, lift = 0) {
    const phi = -PHI + (2 * PHI * s) / Math.max(1, N - 1);
    // các lá chỉ cách nhau 0,3px theo chiều cao (đủ để chồng đúng thứ tự) → hai đầu quạt cân, không bị nghiêng lệch
    return { p: V(R * Math.sin(phi), R * Math.cos(phi) - R + CH * 0.12 + SHIFT, lift + TH / 2 + s * 0.3), q: qAxis(0, 0, 1, -phi), s: 1 };
  }

  // ---- Bóng đổ trên mặt bàn theo đúng hình các lá (vẽ dấu chân lá lên canvas rồi làm mờ) ----
  const SH_OFF = { x: 6, y: -22 };   // bóng sát lá (lệch nhiều trông như lá bay lên)   // ánh sáng chếch từ phía nữ tư tế → bóng lệch về phía người xem
  function footprintShadow(poses, alpha) {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const rr = Math.hypot(CW, CH) / 2;
    for (const p of poses) { minX = Math.min(minX, p.p.x - rr); maxX = Math.max(maxX, p.p.x + rr); minY = Math.min(minY, p.p.y - rr); maxY = Math.max(maxY, p.p.y + rr); }
    const pad = 40; minX -= pad; maxX += pad; minY -= pad; maxY += pad;
    const k = 512 / Math.max(maxX - minX, maxY - minY);
    const w = Math.ceil((maxX - minX) * k), h = Math.ceil((maxY - minY) * k);
    const a = document.createElement('canvas'); a.width = w; a.height = h;
    const g = a.getContext('2d');
    g.fillStyle = '#000';
    for (const p of poses) {
      const rz = 2 * Math.atan2(p.q.z, p.q.w);
      g.save();
      g.translate((p.p.x - minX) * k, (maxY - p.p.y) * k);   // canvas y ngược với y mặt bàn
      g.rotate(-rz);
      g.beginPath(); g.roundRect((-CW / 2) * k, (-CH / 2) * k, CW * k, CH * k, 14 * k); g.fill();
      g.restore();
    }
    const b = document.createElement('canvas'); b.width = w; b.height = h;
    const gb = b.getContext('2d');
    gb.filter = `blur(${Math.max(3, 10 * k)}px)`;
    gb.globalAlpha = alpha;
    gb.drawImage(a, 0, 0);   // hai lớp: bóng mềm rộng + lõi đậm sát lá
    gb.filter = `blur(${Math.max(2, 6 * k)}px)`;
    gb.globalAlpha = alpha;
    gb.drawImage(a, 0, 0);
    const mat = new THREE.MeshBasicMaterial({ map: canvasTex(b), transparent: true, depthWrite: false, depthTest: false, color: 0x000000 });
    const m = new THREE.Mesh(new THREE.PlaneGeometry(maxX - minX, maxY - minY), mat);
    m.matrixAutoUpdate = false; m.renderOrder = 0; scene.add(m);
    m.matrix.copy(Tbase.clone().multiply(new THREE.Matrix4().makeTranslation((minX + maxX) / 2 + SH_OFF.x, (minY + maxY) / 2 + SH_OFF.y, 0.2)));
    return { m, mat };
  }

  const stackShadow = footprintShadow([{ p: V(0, 0, 0), q: Q(), s: 1 }], 0.38);
  const spreadShadow = footprintShadow(Array.from({ length: N }, (_, s) => fanSpreadPose(s)), 0.3);

  // Thứ tự chồng bài qua từng lượt xáo (đan xen hai nửa).
  const half = Math.floor(N / 2);
  const orders = [Array.from({ length: N }, (_, i) => i)];
  const mergedIndex = (s) => (s < half ? 2 * s : 2 * (s - half) + 1);
  for (let k = 0; k < SH.cycles; k++) orders.push(orders[k].map((s) => mergedIndex(s)));

  const SPLIT = CW * 0.72, FANMAX = (70 * Math.PI) / 180;
  function fanPose(s, x, z, theta) {
    if (s < half) {   // nửa trái: bản lề ở mép trái, mép phải vểnh lên
      const r = qAxis(0, 1, 0, -theta);
      const c = V(CW / 2, 0, 0).applyQuaternion(r);
      return { p: V(x - CW / 2 + c.x, 0, z + c.z), q: r, s: 1 };
    }
    const r = qAxis(0, 1, 0, theta);   // nửa phải: bản lề ở mép phải
    const c = V(-CW / 2, 0, 0).applyQuaternion(r);
    return { p: V(x + CW / 2 + c.x, 0, z + c.z), q: r, s: 1 };
  }

  /** Một lá trong lượt xáo trên mặt bàn: u = thời gian trong lượt, s = vị trí trong chồng đầu lượt. */
  function rifflePose(s, u) {
    const left = s < half;
    const j = left ? s : s - half;
    const jn = half > 1 ? j / (half - 1) : 0;
    const side = left ? -1 : 1;
    const zHalf = j * TH + TH / 2;
    if (u < 0.3) {   // tách hai nửa trượt sang hai bên trên mặt bàn; nửa trên nhấc nhẹ qua rồi đặt xuống
      const e = ease(u / 0.3);
      const z0 = s * TH + TH / 2;
      return { p: V(side * SPLIT * e, 0, z0 + (zHalf - z0) * e + Math.sin(Math.PI * e) * 22 * (left ? 0 : 1)), q: Q(), s: 1 };
    }
    const theta = FANMAX * (0.15 + 0.85 * Math.pow(jn, 0.85));
    if (u < 0.75) return fanPose(s, side * SPLIT, zHalf, theta * ease((u - 0.3) / 0.45));   // xòe như lật trang
    const m = mergedIndex(s);
    const final = { p: V(0, 0, m * TH + TH / 2), q: Q(), s: 1 };
    if (u < 1.35) {  // đổ vào giữa đan xen, từng lá một từ dưới lên
      const slide = ease(clamp01((u - 0.75) / 0.5));
      const e = ease(clamp01((u - (0.75 + (m / N) * 0.42)) / 0.2));
      return mix(fanPose(s, side * SPLIT * (1 - 0.4 * slide), zHalf, theta), final, e);
    }
    const v = clamp01((u - 1.35) / 0.4);   // dồn lại, nảy nhẹ
    return { p: V(0, 0, (m * TH + TH / 2) * (1 + 0.9 * Math.sin(Math.PI * v) * (1 - v))), q: Q(), s: 1 };
  }

  const slotPose = (i) => { const r = layout.cardSlots[i] || layout.cardSlots[1]; return { world: true, p: V(r.x + r.w / 2, -(r.y + r.h / 2), 0), q: Q(), s: r.w / CW }; };
  const toWorld = (pose) => {
    const m = new THREE.Matrix4().compose(pose.p, pose.q, V(pose.s, pose.s, pose.s));
    return pose.world ? m : Tbase.clone().multiply(m);
  };
  const worldPose = (localPose) => { const p = V(0, 0, 0), q = Q(), sc = V(1, 1, 1); toWorld(localPose).decompose(p, q, sc); return { world: true, p, q, s: sc.x }; };

  /** Vị trí trên hình quạt của lá rút thứ i (trái / giữa / phải → Quá khứ / Hiện tại / Tương lai). */
  const pickIndex = (i, n) => Math.round((N - 1) * (n === 1 ? 0.5 : 0.2 + (0.6 * i) / (n - 1)));

  /** Lá rút thứ i trong DRAWING: nhấc khỏi quạt → bay xoáy lên ô, lật ngửa mặt khi bay. null = đã giao cho lá HTML. */
  function drawPose(i, n, age) {
    const s = pickIndex(i, n);
    const t = drawTimes(i);
    const base = fanSpreadPose(s);
    if (age < t.rise) return base;
    const riseEnd = { p: base.p.clone().add(V(0, -CH * 0.2, 90)), q: base.q.clone().multiply(qAxis(1, 0, 0, (30 * Math.PI) / 180)), s: 1 };
    if (age < t.fly) return mix(base, riseEnd, easeOut((age - t.rise) / DR.rise));
    if (age >= t.land + 0.12) return null;
    const k = clamp01((age - t.fly) / DR.fly);
    const e = easeSoft(k);
    const a = worldPose(riseEnd), b = slotPose(i);
    // bay nhẹ nhàng: vòng cung thấp, chỉ hơi tiến về phía người xem rồi lơ lửng hạ vào ô
    const ctrl = a.p.clone().lerp(b.p, 0.5).add(V((i - 1) * -30, 70, 180));
    const u = 1 - e;
    const p = a.p.clone().multiplyScalar(u * u).add(ctrl.clone().multiplyScalar(2 * u * e)).add(b.p.clone().multiplyScalar(e * e));
    p.y += Math.sin(Math.PI * k) * 10 * Math.sin(k * Math.PI * 3);   // chao nhẹ như lơ lửng
    // lật nửa vòng (mặt trước nằm ở mặt -Z của lá), chậm, giữa đường bay → chạm ô là đã ngửa mặt
    const flip = easeSoft(clamp01((k - 0.2) / 0.65));
    const q = a.q.clone().slerp(b.q, e).multiply(qAxis(0, 1, 0, Math.PI * flip));
    return { world: true, p, q, s: a.s + (b.s - a.s) * e };
  }

  // ---- Mặt trước của 3 lá rút (nạp theo phiên) ----
  let frontKey = '';
  let fronts = [];
  function ensureFronts(st) {
    const k = (st.cards || []).map((c) => c.id + (c.reversed ? 'r' : '')).join(',');
    if (k === frontKey) return;
    frontKey = k; fronts = [];
    const n = Math.min(3, st.cards?.length || 0);
    for (let i = 0; i < n; i++) {
      const c = st.cards[i];
      frontMaterial(c).then((mat) => { if (frontKey === k) { fronts[i] = mat; needFrame = true; } });
    }
  }

  // ---- Hạt sáng (lớp fx HTML) theo điểm chiếu ----
  function project(m) { const v = V(0, 0, 0).applyMatrix4(m).project(camera); return { x: ((v.x + 1) / 2) * W, y: ((1 - v.y) / 2) * H }; }
  const tablePoint = (x, y) => project(toWorld({ p: V(x, y, 0), q: Q(), s: 1 }));
  const fired = new Set();
  const once = (key, fn) => { if (!fired.has(key)) { fired.add(key); fn(); } };
  let sparkAt = -1;
  /** Hạt năng lượng bay lên từ mặt bàn quanh hình quạt. */
  function energy(count, spread = 1) {
    for (let k = 0; k < count; k++) {
      const phi = (Math.random() * 2 - 1) * PHI * spread;
      const c = tablePoint(R * Math.sin(phi) * (0.6 + Math.random() * 0.45), R * Math.cos(phi) - R + (Math.random() - 0.5) * CH * 0.4);
      fx.spark(c.x, c.y, (Math.random() - 0.5) * 60, -140 - Math.random() * 260, 'spark trail', 1100);
    }
  }

  // ---- Vẽ theo trạng thái ----
  let lastKey = '';
  let needFrame = true;
  function frame() {
    requestAnimationFrame(frame);
    const st = store.get();
    if (!st) return;
    const age = store.phaseAge();
    const ph = st.phase;
    const sk = `${st.seat?.viewerId || '-'}:${st.seat?.since || 0}:${ph}:${st.phaseStartedAt}`;
    if (sk !== lastKey) { lastKey = sk; needFrame = true; if (fired.size > 200) fired.clear(); sparkAt = -1; }
    ensureFronts(st);
    const n = Math.min(3, st.cards?.length || 3);
    const animating = (ph === 'SHUFFLING' && age < SH.spreadAt + SH.spreadLen + 0.5) ||
      (ph === 'DRAWING' && age < drawTimes(n - 1).land + DR.vanishAfter + DR.vanishLen + 0.4) ||
      (ph === 'FAREWELL' && age < FW_BACK + FW_BACK_LEN + 0.6);
    if (!animating && !needFrame) return;
    needFrame = false;
    draw(st, ph, age, sk, n);
    renderer.render(scene, camera);
  }

  function setFade(a) { for (const m of fadeMats) m.opacity = a; for (const m of fronts) if (m) m.opacity = 1; }

  function draw(st, ph, age, sk, n) {
    let visible = !(ph === 'REVEALING' || ph === 'READING');
    let fade = 1, glowA = 0, ringT = -1;
    let stackSh = 1, spreadSh = 0, stackSX = 1;   // độ đậm bóng chồng bài / bóng quạt bài, bề ngang bóng chồng (lúc tách đôi)
    const poses = new Array(N);
    const mats = new Array(N).fill(null);   // mặt trước riêng cho lá rút

    if (ph === 'SHUFFLING') {
      const c0 = SH.start;
      const k = Math.floor((age - c0) / SH.cycleLen);
      const cyclesEnd = c0 + SH.cycles * SH.cycleLen;
      if (age >= c0 && k < SH.cycles) {
        const u = age - c0 - k * SH.cycleLen;
        for (let i = 0; i < N; i++) poses[i] = rifflePose(orders[k][i], u);
        glowA = 0.35 + 0.15 * Math.sin(age * 7);
        const meanX = poses.reduce((a, p) => a + Math.abs(p.p.x), 0) / N;
        stackSX = 1 + 1.6 * clamp01(meanX / SPLIT);
      } else if (age < SH.spreadAt) {
        const ord = age < c0 ? orders[0] : orders[SH.cycles];
        for (let i = 0; i < N; i++) poses[i] = stackPose(ord[i]);
        glowA = age < c0 ? 0 : 0.3 * (1 - seg(age, cyclesEnd, 0.4));
      } else {
        // trải thành hình quạt trên bàn: quét từ trái sang phải
        let sum = 0;
        for (let s = 0; s < N; s++) {
          const e = ease(clamp01((age - SH.spreadAt - (s / N) * SH.spreadLen * 0.55) / (SH.spreadLen * 0.45)));
          poses[s] = mix(stackPose(s), fanSpreadPose(s), e);
          sum += e;
        }
        spreadSh = sum / N; stackSh = 1 - spreadSh;
        glowA = 0.25 * Math.sin(Math.PI * seg(age, SH.spreadAt, SH.spreadLen + 0.3));
      }
      if (age >= c0 && age < cyclesEnd && age - sparkAt > 0.15) {
        sparkAt = age;
        const c = project(Tbase);
        for (let q = 0; q < 2; q++) fx.spark(c.x + (Math.random() - 0.5) * CW * 2.2, c.y - Math.random() * 60, (Math.random() - 0.5) * 50, -40 - Math.random() * 70, 'spark trail', 900);
      }
    } else if (ph === 'DRAWING') {
      const picks = new Map(Array.from({ length: n }, (_, i) => [pickIndex(i, n), i]));
      const vs = drawTimes(n - 1).land + DR.vanishAfter;
      const vanish = ease(seg(age, vs, DR.vanishLen));
      for (let s = 0; s < N; s++) {
        if (picks.has(s)) {
          const i = picks.get(s);
          const p = drawPose(i, n, age);
          poses[s] = p || 'hide';
          mats[s] = fronts[i] || null;
          continue;
        }
        const d = clamp01(vanish * 1.4 - (Math.abs(s - (N - 1) / 2) / N) * 0.4);
        poses[s] = fanSpreadPose(s, d * 70);
      }
      fade = 1 - vanish;
      stackSh = 0; spreadSh = 1;
      // nguồn sáng vàng trên mặt bàn: bừng lên, giữ trong lúc rút, tắt khi bài tan
      const lightUp = ease(seg(age, DR.light, 0.9));
      glowA = lightUp * (0.85 + 0.15 * Math.sin(age * 9)) * (1 - vanish) + vanish * (1 - vanish) * 1.6;
      ringT = seg(age, DR.light, 1.4);
      if (age >= DR.light && age < vs + 0.4 && age - sparkAt > 0.07) { sparkAt = age; energy(age < DR.t0 ? 5 : 3); }
      if (age >= DR.light) once(`${sk}:light`, () => { const c = project(Tbase); fx.flash(c.x, c.y); fx.burst(c.x, c.y, 24, 180); });
      for (let i = 0; i < n; i++) {
        const t = drawTimes(i);
        if (age >= t.rise) once(`${sk}:rise${i}`, () => { const c = project(toWorld(fanSpreadPose(pickIndex(i, n), 30))); fx.burst(c.x, c.y, 14, 80); });
        if (age >= t.land) once(`${sk}:land${i}`, () => { const r = layout.cardSlots[i]; if (r) { fx.flash(r.x + r.w / 2, r.y + r.h / 2); fx.burst(r.x + r.w / 2, r.y + r.h / 2, 24, 160); } });
      }
      if (age >= vs) once(`${sk}:vanish`, () => energy(26, 1.1));
      if (vanish >= 1) visible = false;
    } else if (ph === 'FAREWELL') {
      const e = ease(seg(age, FW_BACK, FW_BACK_LEN));
      if (e <= 0) visible = false;
      for (let s = 0; s < N; s++) poses[s] = stackPose(s, (1 - ease(clamp01(e * 1.5 - (s / N) * 0.5))) * 140);
      fade = e; stackSh = e; glowA = Math.sin(Math.PI * e) * 0.7;
      if (age >= FW_BACK) once(sk + ':back', () => { const c = project(Tbase); fx.burst(c.x, c.y, 16, 110); });
    } else {
      for (let s = 0; s < N; s++) poses[s] = stackPose(s);
    }

    setFade(fade);
    cards.forEach((m, i) => {
      const p = poses[i];
      m.visible = visible && !!p && p !== 'hide';
      if (!m.visible) return;
      const front = mats[i];
      if (m.material[5] !== (front || backMat)) m.material = [m.material[0], m.material[1], m.material[2], m.material[3], backMat, front || backMat];
      m.matrix.copy(toWorld(p));
    });
    // bóng đổ trên mặt bàn (chồng bài ↔ quạt bài)
    stackShadow.m.visible = visible && stackSh > 0.01;
    stackShadow.m.matrix.copy(Tbase.clone().multiply(new THREE.Matrix4().compose(V(SH_OFF.x, SH_OFF.y, 0.2), Q(), V(stackSX, 1, 1))));
    stackShadow.mat.opacity = fade * stackSh;
    spreadShadow.m.visible = visible && spreadSh > 0.01;
    spreadShadow.mat.opacity = fade * spreadSh;
    glow.m.visible = visible && glowA > 0.01;
    glow.m.matrix.copy(Tbase.clone().multiply(new THREE.Matrix4().compose(V(0, -CH * 0.1, 0.6), Q(), V(1, 1, 1))));
    glow.mat.opacity = Math.min(1, glowA) * Math.max(fade, 0.4);
    ring.m.visible = visible && ringT >= 0 && ringT < 1;
    const rs = 0.3 + 2.6 * easeOut(Math.max(0, ringT));
    ring.m.matrix.copy(Tbase.clone().multiply(new THREE.Matrix4().compose(V(0, -CH * 0.1, 0.8), Q(), V(rs, rs, 1))));
    ring.mat.opacity = Math.max(0, 1 - ringT);
  }

  requestAnimationFrame(frame);
  return { canvas, refresh() { needFrame = true; } };
}
