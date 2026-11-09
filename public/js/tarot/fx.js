// Hiệu ứng ánh sáng dùng chung (lớp #fxLayer, tọa độ theo khung 900x1600): hạt sáng, chớp sáng, vệt sáng bám theo phần tử.
export function createFx(fxEl, stageEl) {
  /** Tâm phần tử theo tọa độ khung thiết kế (khung bị scale để vừa màn hình). */
  function stagePoint(el) {
    const sr = stageEl.getBoundingClientRect();
    const k = sr.width / stageEl.offsetWidth;
    const r = el.getBoundingClientRect();
    return { x: (r.left + r.width / 2 - sr.left) / k, y: (r.top + r.height / 2 - sr.top) / k };
  }
  function spark(x, y, sx, sy, cls = 'spark', life = 900) {
    const s = document.createElement('span');
    s.className = cls;
    s.style.cssText = `left:${x}px;top:${y}px;--sx:${sx}px;--sy:${sy}px;`;
    fxEl.appendChild(s);
    setTimeout(() => s.remove(), life);
  }
  function burst(x, y, n = 14, dist = 70) {
    for (let i = 0; i < n; i++) {
      const a = (Math.PI * 2 * i) / n + Math.random() * 0.3;
      const d = dist * (0.6 + Math.random() * 0.6);
      spark(x, y, Math.cos(a) * d, Math.sin(a) * d);
    }
  }
  function flash(x, y) {
    const f = document.createElement('div');
    f.className = 'flash';
    f.style.cssText = `left:${x}px;top:${y}px`;
    fxEl.appendChild(f);
    setTimeout(() => f.remove(), 900);
  }
  /** Vệt sáng bám theo phần tử đang bay trong `ms` mili giây. */
  function trail(el, ms = 1000, spread = 50) {
    const t0 = performance.now();
    const tick = () => {
      if (!el.isConnected) return;
      const p = stagePoint(el);
      for (let k = 0; k < 2; k++) {
        spark(p.x + (Math.random() - 0.5) * spread, p.y + (Math.random() - 0.5) * spread * 1.4, (Math.random() - 0.5) * 30, 30 + Math.random() * 40, 'spark trail', 800);
      }
      if (performance.now() - t0 < ms) setTimeout(tick, 45);
    };
    tick();
  }
  return { stagePoint, spark, burst, flash, trail };
}
