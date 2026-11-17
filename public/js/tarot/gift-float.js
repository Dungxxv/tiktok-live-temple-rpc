// Quà bay lên liên tục (Figma section 58:13): hoa hồng, kem, tim, tay bắn tim.
// Xuất phát quanh (998, 1920) ở mép dưới-phải, lượn nhẹ bay lên rồi mờ dần ở khoảng giữa màn hình.
// Lớp #giftFloat nằm trên cùng (không gì đè), không bắt chuột. Ngẫu nhiên quà, cỡ, đường lượn, thời gian, nhịp.
const ICONS = ['rose', 'icecream', 'heart', 'finger-heart'].map((n) => `/assets/tarot/ui/float/${n}.png`);
const rand = (a, b) => a + Math.random() * (b - a);

export function createGiftFloat(layer, opts = {}) {
  const o = {
    x: 998, y: 1920,          // điểm xuất phát (khung 1080x1920)
    endY: 960,                // mờ hẳn quanh giữa màn hình
    size: [130, 130],         // cỡ khung (px) — đúng Figma 58:13 (mọi quà khung 130x130, tỉ lệ hình trong khung theo Figma)
    life: [4800, 6800],       // thời gian bay (ms) — chậm, nhẹ nhàng
    gap: [1400, 2800],        // nhịp ra quà (ms) — thưa, khoảng 1 quà / 2 giây
    max: 5,                   // giới hạn số quà cùng lúc
    ...opts
  };
  ICONS.forEach((src) => { const i = new Image(); i.src = src; });   // nạp sẵn
  let live = 0, timer = null;

  function spawn() {
    if (live >= o.max || document.hidden) return;
    const el = document.createElement('img');
    el.className = 'gfloat';
    el.src = ICONS[Math.floor(Math.random() * ICONS.length)];
    el.alt = '';
    const s = rand(o.size[0], o.size[1]);
    el.style.cssText = `left:${o.x - s / 2}px;top:${o.y - s / 2}px;width:${s}px;height:${s}px`;
    layer.appendChild(el);
    live++;
    // Đường bay: gần như thẳng đứng lên tới quanh giữa màn, chỉ đung đưa rất nhẹ.
    const rise = o.y - o.endY + rand(-100, 100);
    const drift = rand(-40, 0), sway = rand(6, 14) * (Math.random() < 0.5 ? -1 : 1);
    const rot0 = rand(-6, 6), rot1 = rot0 + rand(-5, 5);
    const k = 1;
    const pt = (t, sc, op) => ({
      offset: t,
      transform: `translate(${(drift * t + Math.sin(t * Math.PI * 1.5) * sway).toFixed(1)}px, ${(-rise * t).toFixed(1)}px) scale(${sc}) rotate(${(rot0 + (rot1 - rot0) * t).toFixed(1)}deg)`,
      opacity: op
    });
    const anim = el.animate([
      pt(0, 0.3, 0), pt(0.08, k, 1), pt(0.3, k, 1), pt(0.55, k, 0.9), pt(0.8, k, 0.45), pt(1, k * 0.96, 0)
    ], { duration: rand(o.life[0], o.life[1]), easing: 'cubic-bezier(.25,.6,.45,1)', fill: 'forwards' });
    anim.onfinish = () => { el.remove(); live--; };
  }

  function loop() {
    spawn();
    timer = setTimeout(loop, rand(o.gap[0], o.gap[1]));
  }

  return {
    start() { if (!timer) loop(); },
    stop() { clearTimeout(timer); timer = null; },
    /** Có quà thật: bung thêm một chùm. */
    burst(n = 6) { for (let i = 0; i < n; i++) setTimeout(spawn, i * rand(220, 360)); }
  };
}
