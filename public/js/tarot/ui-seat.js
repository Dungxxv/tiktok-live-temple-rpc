// Ghế khách (Figma: avatar tròn trong khung vàng + tên).
// - Khách rời đi: avatar thu nhỏ, bay lên và tan thành hạt sáng.
// - Khách kế tiếp: avatar bay từ ô 1 của bảng "Kế tiếp" theo đường vòng vào ghế, để lại vệt sáng; chạm ghế thì khung nảy + vòng sáng lan ra.
import { avatarEl } from './ui-queue.js';

const FLY_MS = 1150;
const FACE_D = 158.38;

export function createSeatUi({ seatEl, faceEl, nameEl, topicEl, fxEl, layout, store, fx, sfx, getFlyFrom, getFlyTo, onLeft }) {
  let shownId;
  let shownSeat = null;
  const k = layout.seat.scale || 1;
  // Ghế bệ pha lê (layout.seat.face): tâm/đường kính avatar lấy từ layout; ghế khung vàng cũ: vòng 200px ở giữa.
  const F = layout.seat.face;
  const seatC = F ? { x: layout.seat.x + F.cx * k, y: layout.seat.y + F.cy * k } : { x: layout.seat.x + 100, y: layout.seat.y + 100 * k };
  const faceD = (F ? F.d : FACE_D) * k;

  function setFace(seat) {
    faceEl.innerHTML = '';
    faceEl.style.opacity = '';   // bỏ trạng thái "đã tan" của khách trước
    if (seat) faceEl.appendChild(avatarEl(seat, 'av'));
  }

  // Hết phiên (sau lời cảm ơn): avatar sáng dần rồi tan thành hạt sáng bay lên; nếu khách được xếp lại
  // cuối hàng chờ thì một đốm sáng mang avatar bay về đúng ô đó (ô được giữ trống tới lúc đốm sáng đáp).
  // Tan biến bắt đầu trước khi pha FAREWELL hết (sau lời cảm ơn), để lúc ghế trống thì đếm ngược khách sau không chồng lên.
  const DISSOLVE_MS = 1300, ORB_MS = 1000;
  let dissolving = null;   // { id, done: Promise }
  function leave(prev) {
    const go = () => {
      dissolving = null;
      if (!store.get()?.seat) setFace(null);
      const to = prev && getFlyTo?.(prev.viewerId);
      if (to) orbTo(prev, to); else if (prev) onLeft?.(prev.viewerId, false);
    };
    if (dissolving && prev && dissolving.id === prev.viewerId) { dissolving.done.then(go); return; }
    if (!faceEl.firstChild) { go(); return; }
    dissolve(prev?.viewerId).then(go);
  }

  function dissolve(id) {
    let resolve;
    dissolving = { id, done: new Promise((r) => (resolve = r)) };
    const anim = faceEl.animate([
      { filter: 'brightness(1) blur(0px)', transform: 'none', opacity: 1 },
      { filter: 'brightness(1.7) blur(1px)', transform: 'scale(1.04)', opacity: 1, offset: 0.35 },
      { filter: 'brightness(2.6) blur(9px)', transform: 'translateY(-26px) scale(1.12)', opacity: 0 }
    ], { duration: DISSOLVE_MS, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' });
    // hạt sáng bốc lên từ khắp mặt avatar trong lúc tan
    const r = faceD / 2;
    const t0 = performance.now();
    const rise = () => {
      if (performance.now() - t0 > DISSOLVE_MS) return;
      for (let i = 0; i < 4; i++) {
        const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r;
        fx.spark(seatC.x + Math.cos(a) * d, seatC.y + Math.sin(a) * d, (Math.random() - 0.5) * 50, -(70 + Math.random() * 110), 'spark trail', 1100);
      }
      setTimeout(rise, 40);
    };
    setTimeout(rise, DISSOLVE_MS * 0.25);
    setTimeout(() => { fx.flash(seatC.x, seatC.y); fx.burst(seatC.x, seatC.y, 20, 110); }, DISSOLVE_MS * 0.7);
    anim.onfinish = () => { faceEl.style.opacity = '0'; anim.cancel(); resolve(); };
    return dissolving.done;
  }

  // Cuối pha FAREWELL: còn ~1,4 giây thì avatar bắt đầu tan (theo giờ server).
  setInterval(() => {
    const st = store.get();
    if (!st?.seat || st.phase !== 'FAREWELL' || dissolving || !faceEl.firstChild) return;
    const left = store.phaseLeft();
    if (left != null && left <= DISSOLVE_MS / 1000 + 0.1 && left > 0.2) dissolve(st.seat.viewerId);
  }, 100);

  /** Đốm sáng nhỏ mang avatar bay từ bệ về ô cuối hàng chờ. */
  function orbTo(prev, to) {
    const d0 = faceD * 0.42;
    const f = document.createElement('div');
    f.className = 'flyer magic';
    f.style.cssText = `left:${seatC.x - d0 / 2}px;top:${seatC.y - d0 / 2}px;width:${d0}px;height:${d0}px`;
    f.innerHTML = '<i class="halo"></i>';
    f.appendChild(avatarEl(prev, 'av'));
    fxEl.appendChild(f);
    const dx = to.x - seatC.x, dy = to.y - seatC.y, k1 = to.d / d0;
    const anim = f.animate([
      { transform: 'translate(0px, -20px) scale(.2)', opacity: 0 },
      { transform: 'translate(0px, -40px) scale(1)', opacity: 1, offset: 0.18 },
      { transform: `translate(${dx * 0.5 + 120}px, ${dy * 0.5 - 140}px) scale(${(1 + k1) / 2 + 0.1})`, opacity: 1, offset: 0.6 },
      { transform: `translate(${dx}px, ${dy}px) scale(${k1})`, opacity: 0.9 }
    ], { duration: ORB_MS, easing: 'cubic-bezier(.45,.05,.35,1)', fill: 'forwards' });
    setTimeout(() => fx.trail(f, ORB_MS * 0.8, 40), ORB_MS * 0.18);
    anim.onfinish = () => { f.remove(); fx.burst(to.x, to.y, 16, 60); onLeft?.(prev.viewerId, true); };
  }

  function land() {
    seatEl.classList.remove('land'); void seatEl.offsetWidth; seatEl.classList.add('land');
    setTimeout(() => seatEl.classList.remove('land'), 1000);
    if (!F) fx.burst(seatC.x, seatC.y, 22, 120);
  }

  // Ghế bệ pha lê: bay "phép thuật" (tụ sáng → bay vòng cung có vòng phù văn → cột sáng + sóng sáng ở bệ). Ghế cũ: bay đơn giản.
  function flyIn(seat, from) {
    if (F) { flyInMagic(seat, from); return; }
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

  const MAGIC_MS = 2300;      // tổng thời gian bay
  const CHARGE = 0.16;        // phần đầu: tụ sáng tại ô hàng chờ
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const bez = (a, b, c, d, t) => { const u = 1 - t; return u * u * u * a + 3 * u * u * t * b + 3 * u * t * t * c + t * t * t * d; };

  function flyInMagic(seat, from) {
    setFace(null);
    const f = document.createElement('div');
    f.className = 'flyer magic';
    f.style.cssText = `left:${seatC.x - faceD / 2}px;top:${seatC.y - faceD / 2}px;width:${faceD}px;height:${faceD}px`;
    f.innerHTML = '<i class="halo"></i><i class="aura"></i><i class="aura aura2"></i>';
    f.appendChild(avatarEl(seat, 'av'));
    fxEl.appendChild(f);

    // Đường bay: cung bezier vút lên khoảng trời trống rồi hạ thẳng xuống bệ từ phía trên.
    const k0 = from.d / faceD;
    const p0 = { x: from.x - seatC.x, y: from.y - seatC.y };
    const c1 = { x: p0.x + 230, y: p0.y - 360 };
    const c2 = { x: 0, y: -460 };
    const frames = [
      { offset: 0, transform: `translate(${p0.x}px, ${p0.y}px) scale(${k0})`, opacity: 0.9 },
      { offset: CHARGE * 0.6, transform: `translate(${p0.x}px, ${p0.y - 10}px) scale(${k0 * 1.35})`, opacity: 1 },
      { offset: CHARGE, transform: `translate(${p0.x}px, ${p0.y - 18}px) scale(${k0 * 1.2})`, opacity: 1 }
    ];
    const N = 44;
    for (let i = 1; i <= N; i++) {
      const t = easeInOut(i / N);
      const x = bez(p0.x, c1.x, c2.x, 0, t);
      const y = bez(p0.y - 18, c1.y, c2.y, 0, t);
      const s = k0 * 1.2 + (1 - k0 * 1.2) * t + Math.sin(Math.PI * t) * 0.28;   // phình nhẹ giữa đường
      const rot = Math.sin(Math.PI * t) * -14;
      frames.push({ offset: CHARGE + (1 - CHARGE) * (i / N), transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) scale(${s.toFixed(3)}) rotate(${rot.toFixed(1)}deg)`, opacity: 1 });
    }
    // Chớp sáng + hạt bung ra tại ô hàng chờ lúc tụ sáng
    sfx?.play('summon');
    fx.flash(from.x, from.y);
    fx.burst(from.x, from.y, 14, 70);
    const anim = f.animate(frames, { duration: MAGIC_MS, easing: 'linear', fill: 'forwards' });
    setTimeout(() => fx.trail(f, MAGIC_MS * (1 - CHARGE) - 150, 64), MAGIC_MS * CHARGE);
    setTimeout(() => beam(), MAGIC_MS * 0.72);   // cột sáng dựng lên trước, avatar hạ vào trong cột sáng
    anim.onfinish = () => {
      if (store.get()?.seat?.viewerId === seat.viewerId) { setFace(seat); land(); shock(); }
      // tắt dần lớp bay cho liền mạch với avatar thật trên bệ
      f.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 260, fill: 'forwards' }).onfinish = () => f.remove();
    };
  }

  /** Cột sáng từ bệ đá vút lên rồi tan. */
  function beam() {
    const b = document.createElement('div');
    b.className = 'seat-beam';
    b.style.cssText = `left:${seatC.x}px;top:${seatC.y + 150 - 820}px`;
    fxEl.appendChild(b);
    b.animate([
      { transform: 'translateX(-50%) scaleY(0) scaleX(.4)', opacity: 0 },
      { transform: 'translateX(-50%) scaleY(1) scaleX(1)', opacity: 1, offset: 0.3 },
      { transform: 'translateX(-50%) scaleY(1) scaleX(.85)', opacity: 0.9, offset: 0.6 },
      { transform: 'translateX(-50%) scaleY(1.05) scaleX(.2)', opacity: 0 }
    ], { duration: 1500, easing: 'ease-out', fill: 'forwards' }).onfinish = () => b.remove();
  }

  /** Sóng sáng lan ra quanh avatar + hạt sáng bung khi chạm bệ. */
  function shock() {
    for (let i = 0; i < 3; i++) {
      const r = document.createElement('div');
      r.className = 'seat-shock';
      r.style.cssText = `left:${seatC.x}px;top:${seatC.y}px;width:${faceD}px;height:${faceD}px;margin:${-faceD / 2}px 0 0 ${-faceD / 2}px`;
      fxEl.appendChild(r);
      r.animate([{ transform: 'scale(.7)', opacity: 1 }, { transform: `scale(${2.4 + i * 0.6})`, opacity: 0 }],
        { duration: 1100 + i * 200, delay: i * 160, easing: 'cubic-bezier(.2,.7,.3,1)', fill: 'both' }).onfinish = () => r.remove();
    }
    fx.burst(seatC.x, seatC.y, 30, 170);
    setTimeout(() => fx.burst(seatC.x, seatC.y + 110, 16, 120), 180);
  }

  function render(state) {
    const seat = state.seat;
    const id = seat ? seat.viewerId + ':' + seat.since : null;
    if (id !== shownId) {
      const firstTime = shownId === undefined;
      shownId = id;
      const prev = shownSeat;
      shownSeat = seat || null;
      if (firstTime) setFace(seat);
      else if (!seat) leave(prev);
      else {
        const from = getFlyFrom?.();
        if (from && state.phase === 'CALLING' && store.phaseAge() < 1.5) flyIn(seat, from);
        else { setFace(seat); land(); }
      }
    }
    seatEl.classList.toggle('empty', !seat);
    // Đếm ngược: dưới bệ hiện tên người sắp vào (Figma), trên bệ là số 3-2-1.
    const incoming = !seat && state.phase === 'INTERMISSION' ? state.queue?.[0]?.name : null;
    seatEl.classList.toggle('incoming', !!incoming);
    nameEl.textContent = seat ? seat.name : incoming || (state.phase === 'INTERMISSION' ? 'Mời khách kế tiếp…' : 'Ghế đang trống');
    renderCount(state);
    // Thẻ chủ đề: phiên quà → "Chủ đề: …"; phiên vào phòng → "Tổng quan · 1 lá".
    if (topicEl) {
      const t = !seat ? '' : seat.sessionType === 'gift' ? `Chủ đề: ${seat.topicLabel || seat.topic}` : seat.sessionType === 'join' ? `${seat.topicLabel || 'Tổng quan'} · 1 lá` : '';
      topicEl.firstElementChild.textContent = t;
      topicEl.classList.toggle('show', !!t);
    }
  }

  // Số đếm ngược trên bệ: mỗi giây một số nảy ra + vòng sáng lan; theo giờ server (không chờ gói trạng thái).
  const countEl = seatEl.querySelector('.seat-count');
  let lastN = null;
  function renderCount(state) {
    if (!countEl) return;
    const on = state && state.phase === 'INTERMISSION' && !state.seat && state.phaseEndsAt && (state.queue?.length || 0) > 0;
    countEl.classList.toggle('show', !!on);
    if (!on) { lastN = null; return; }
    const n = Math.max(1, Math.min(9, Math.ceil(store.phaseLeft() ?? 1)));
    if (n === lastN) return;
    lastN = n;
    countEl.querySelector('b').textContent = String(n);
    countEl.classList.remove('tick'); void countEl.offsetWidth; countEl.classList.add('tick');
    sfx?.play('countdown-tick');
    fx.burst(seatC.x, seatC.y, 10, 90);
  }
  setInterval(() => { const st = store.get(); if (st) renderCount(st); }, 100);

  return { render };
}
