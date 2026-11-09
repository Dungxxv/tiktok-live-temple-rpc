// Chế độ hiệu chuẩn (?calibrate=1): lớp hướng dẫn vùng TikTok che + kéo-thả chỉnh tọa độ + xuất layout.json.
import { applyLayout } from './main.js';

const DRAGGABLE = [
  ['video', (L) => L.video],
  ['table', (L) => L.table],
  ['bubble', (L) => L.bubble],
  ['seat', (L) => L.seat],
  ['title', (L) => L.title],
  ['queuePanel', (L) => L.queue.panel],
];

export function setupCalibrate(layout, { getScale }) {
  const guides = document.getElementById('guides');

  // Lớp hướng dẫn vùng TikTok có thể che
  const showGuides = { v: true };
  function drawGuides() {
    guides.innerHTML = '';
    if (!showGuides.v) return;
    for (const g of layout.tiktokOverlays) {
      const d = document.createElement('div');
      d.className = 'guide-box';
      d.style.cssText = `left:${g.x}px;top:${g.y}px;width:${g.w}px;height:${g.h}px`;
      d.textContent = g.name;
      guides.appendChild(d);
    }
  }
  drawGuides();

  // Bảng điều khiển
  const panel = document.createElement('div');
  panel.id = 'calPanel';
  panel.innerHTML = `
    <b>Hiệu chuẩn</b><br>
    Kéo các khung viền xanh (video, bàn, bong bóng, ghế, tiêu đề, bảng hàng chờ). Phím mũi tên: chỉnh 1px (Shift = 10px) khung đang chọn.<br>
    <button id="calGuides">Bật/tắt vùng bị che</button>
    <button id="calCopy">Sao chép layout.json</button>
    <button id="calDownload">Tải layout.json</button>
    <div id="calInfo" style="margin-top:6px;color:#e8c874"></div>`;
  document.body.appendChild(panel);
  const info = panel.querySelector('#calInfo');

  let selected = null;
  const refresh = () => applyLayout(layout);

  for (const [id, get] of DRAGGABLE) {
    const el = document.getElementById(id);
    el.classList.add('drag');
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      selected = get(layout);
      const scale = getScale();
      const startX = e.clientX, startY = e.clientY;
      const ox = selected.x, oy = selected.y;
      el.setPointerCapture(e.pointerId);
      const move = (ev) => {
        selected.x = Math.round(ox + (ev.clientX - startX) / scale);
        selected.y = Math.round(oy + (ev.clientY - startY) / scale);
        refresh();
        info.textContent = `${id}: x=${selected.x} y=${selected.y}`;
      };
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }

  window.addEventListener('keydown', (e) => {
    if (!selected) return;
    const step = e.shiftKey ? 10 : 1;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (!d) return;
    e.preventDefault();
    selected.x += d[0]; selected.y += d[1];
    refresh();
    info.textContent = `x=${selected.x} y=${selected.y}`;
  });

  const json = () => JSON.stringify(layout, null, 2) + '\n';
  panel.querySelector('#calGuides').onclick = () => { showGuides.v = !showGuides.v; drawGuides(); };
  panel.querySelector('#calCopy').onclick = async () => {
    try { await navigator.clipboard.writeText(json()); info.textContent = 'Đã sao chép.'; }
    catch { info.textContent = 'Không sao chép được, dùng nút Tải.'; }
  };
  panel.querySelector('#calDownload').onclick = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json()], { type: 'application/json' }));
    a.download = 'layout.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
}
