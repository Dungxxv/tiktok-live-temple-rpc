// Ghế khách (Figma: avatar tròn trong khung vàng + tên).
// - Khách rời đi: avatar thu nhỏ, bay lên và tan thành hạt sáng.
// - Khách kế tiếp: avatar bay từ ô 1 của bảng "Kế tiếp" theo đường vòng vào ghế, để lại vệt sáng; chạm ghế thì khung nảy + vòng sáng lan ra.
import { avatarEl } from './ui-queue.js';

const FLY_MS = 1150;
const FACE_D = 158.38;

export function createSeatUi({ seatEl, faceEl, nameEl, fxEl, layout, store, fx, getFlyFrom }) {
  let shownId;
  const k = layout.seat.scale || 1;
  const seatC = { x: layout.seat.x + 100, y: layout.seat.y + 100 * k };   // tâm avatar sau khi thu nhỏ
  const faceD = FACE_D * k;

  function setFace(seat) {
    faceEl.innerHTML = '';
    if (seat) faceEl.appendChild(avatarEl(seat, 'av'));
  }

  function leave() {
    if (!faceEl.firstChild) return;
    const anim = faceEl.animate(
      [{ transform: 'none', opacity: 1 }, { transform: 'translateY(-70px) scale(.35)', opacity: 0 }],
      { duration: 700, easing: 'cubic-bezier(.5,0,.75,0)' });
    setTimeout(() => fx.burst(seatC.x, seatC.y - 70, 18, 80), 600);
    anim.onfinish = () => { if (!store.get()?.seat) setFace(null); };
  }

  function land() {
    seatEl.classList.remove('land'); void seatEl.offsetWidth; seatEl.classList.add('land');
    setTimeout(() => seatEl.classList.remove('land'), 1000);
    fx.burst(seatC.x, seatC.y, 22, 120);
  }

  function flyIn(seat, from) {
    setFace(null);
    const f = document.createElement('div');
    f.className = 'flyer';
    f.style.cssText = `left:${seatC.x - faceD / 2}px;top:${seatC.y - faceD / 2}px;width:${faceD}px;height:${faceD}px`;
    f.appendChild(avatarEl(seat, 'av'));
    fxEl.appendChild(f);
    const k0 = from.d / faceD;
    const dx = from.x - seatC.x; const dy = from.y - seatC.y;
    const anim = f.animate([
      { transform: `translate(${dx}px, ${dy}px) scale(${k0})`, opacity: 0.2 },
      { transform: `translate(${dx * 0.55}px, ${dy * 0.35 - 170}px) scale(${(k0 + 1) / 2 + 0.15}) rotate(-12deg)`, opacity: 1, offset: 0.55 },
      { transform: 'translate(0px, 0px) scale(1) rotate(0deg)', opacity: 1 }
    ], { duration: FLY_MS, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
    fx.trail(f, FLY_MS - 100, 70);
    anim.onfinish = () => {
      f.remove();
      if (store.get()?.seat?.viewerId === seat.viewerId) { setFace(seat); land(); }
    };
  }

  function render(state) {
    const seat = state.seat;
    const id = seat ? seat.viewerId + ':' + seat.since : null;
    if (id !== shownId) {
      const firstTime = shownId === undefined;
      shownId = id;
      if (firstTime) setFace(seat);
      else if (!seat) leave();
      else {
        const from = getFlyFrom?.();
        if (from && state.phase === 'CALLING' && store.phaseAge() < 1.5) flyIn(seat, from);
        else { setFace(seat); land(); }
      }
    }
    seatEl.classList.toggle('empty', !seat);
    nameEl.textContent = seat ? seat.name : state.phase === 'INTERMISSION' ? 'Mời khách kế tiếp…' : 'Ghế đang trống';
  }

  return { render };
}
