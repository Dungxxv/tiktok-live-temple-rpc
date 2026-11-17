// Bảng "Kế tiếp": lưới ô đi hình chữ S (hàng lẻ trái→phải, hàng chẵn phải→trái), khung ô đứng yên,
// mỗi khách là một "thẻ" trượt giữa các ô khi hàng dịch chuyển:
// - khách mới vào: bật lên từ dưới + hạt sáng;
// - được đẩy lên nhờ quà: hào quang + xoay avatar + vệt sáng + "↑ +N";
// - chuyển khách (INTERMISSION): nhãn "Kế tiếp" thành đếm ngược 5..1, khách ô 1 nhấp nháy.
const UI = '/assets/tarot/ui/';
const FRAME_AV = { cx: 46.19, cy: 85.97, d: 71.38 };   // tâm/đường kính avatar trong ô (đơn vị ô gốc Figma)

export function avatarEl(person, cls = 'av') {
  const wrap = document.createElement('div');
  wrap.className = cls;
  const initial = Array.from(person?.name || '?')[0] || '?';
  const showInitial = () => { wrap.textContent = initial.toUpperCase(); wrap.classList.add('initial'); };
  if (person?.avatar) {
    const img = document.createElement('img');
    img.referrerPolicy = 'no-referrer';
    img.alt = '';
    img.onerror = () => { img.remove(); showInitial(); };
    img.src = person.avatar;
    wrap.appendChild(img);
  } else if (person) showInitial();
  return wrap;
}

/** Vị trí ô thứ i (0-based) trong lưới chữ S, tọa độ trong bảng. */
export function slotPosition(i, g) {
  const row = Math.floor(i / g.cols);
  const inRow = i % g.cols;
  const col = row % 2 === 0 ? inRow : g.cols - 1 - inRow;
  return { x: g.x + col * g.colStep, y: g.y + row * g.rowStep };
}

// Nhãn chủ đề (cột hàng chờ dọc kiểu phù thủy) theo mã chủ đề của khách.
const TOPIC_LABEL = { general: 'Tổng Quan', overview: 'Tổng Quan', love: 'Tình Yêu', money: 'Tài Chính', finance: 'Tài Chính', career: 'Sự Nghiệp', study: 'Học Tập', specific: 'Hỏi cụ thể' };

export function createQueueUi({ slotsEl, tokensEl, pointerEl, moreEl, labelEl, layout, store, fx }) {
  const g = layout.queue.grid;
  const panel = layout.queue.panel;
  const s = g.scale || 1;
  const FRAME_AV_ = g.av || FRAME_AV;              // tâm/đường kính avatar trong ô (layout có thể ghi đè)
  const COIN = g.coinIcon ? UI + g.coinIcon : UI + 'coin.svg';
  const vertical = g.cols === 1;                   // cột dọc bên trái: không kẻ ngang, không mũi tên
  slotsEl.parentElement?.classList.toggle('vertical', vertical);
  const tokens = new Map();   // viewerId → { el, idx, coins }
  // Người đang được chào trên bảng giấy: ô của họ để trống (thẻ ẩn) cho tới khi avatar bay tới nơi → không đè lên ai.
  const held = new Map();     // viewerId → hạn tự mở (ms)
  let firstRender = true;
  let lastCount = null;

  // Khung ô cố định + đường kẻ giữa các hàng + mũi tên chỉ ô 1
  slotsEl.innerHTML = '';
  const slots = Array.from({ length: g.count }, (_, i) => {
    const p = slotPosition(i, g);
    const d = document.createElement('div');
    d.className = 'qslot';
    d.dataset.slot = String(i + 1);   // màu theo ô (cột dọc kiểu phù thủy: ô trống hiện vòng nét đứt + "Trống")
    d.style.cssText = `left:${p.x}px;top:${p.y}px;transform:scale(${s})`;
    d.innerHTML = `
      <div class="coins"><b>0</b><img src="${COIN}" alt=""></div>
      <div class="frame"><img src="${UI}slot-frame.svg" alt=""><div class="av"></div></div>
      <div class="nm"><b>${i + 1}</b><span class="empty-label">.Trống</span></div>`;
    slotsEl.appendChild(d);
    return d;
  });
  const rows = vertical ? 0 : Math.ceil(g.count / g.cols);
  for (let r = 1; r < rows; r++) {
    const y = (g.y + (r - 1) * g.rowStep + g.slotH * s + g.y + r * g.rowStep) / 2;
    const line = document.createElement('img');
    line.className = 'divider';
    line.src = UI + 'divider.svg';
    line.alt = '';
    line.style.top = `${y - 1}px`;
    slotsEl.appendChild(line);
  }
  const p0 = slotPosition(0, g);
  pointerEl.style.left = `${p0.x + (g.slotW * s) / 2 - 12}px`;
  pointerEl.style.top = `${Math.max(2, g.y - 32)}px`;

  /** Tâm + đường kính avatar ô thứ i theo tọa độ khung (dùng cho hiệu ứng bay vào ghế). */
  function avatarRect(i) {
    const p = slotPosition(i, g);
    return { x: panel.x + p.x + FRAME_AV_.cx * s, y: panel.y + p.y + FRAME_AV_.cy * s, d: FRAME_AV_.d * s };
  }

  function makeToken(e) {
    const el = document.createElement('div');
    el.className = 'qtoken';
    el.style.transform = `scale(${s})`;
    el.innerHTML = `
      <div class="coins"><b>0</b><img src="${COIN}" alt=""></div>
      <div class="frame"></div>
      <div class="nm"><b></b><span></span></div>
      <div class="tp"><span></span></div>`;
    el.querySelector('.frame').appendChild(avatarEl(e));
    el.querySelector('.nm span').textContent = `.${e.name}`;
    tokensEl.appendChild(el);
    return { el, idx: -1, coins: 0 };
  }

  function sparkleAt(i, n = 10, dist = 46) {
    if (!fx) return;
    const a = avatarRect(i);
    fx.burst(a.x, a.y, n, dist);
  }

  function render(state) {
    const q = (state.queue || []).slice(0, g.count);
    const seen = new Set();
    q.forEach((e, i) => {
      seen.add(e.viewerId);
      let t = tokens.get(e.viewerId);
      const p = slotPosition(i, g);
      if (!t) {
        t = makeToken(e);
        tokens.set(e.viewerId, t);
        t.el.style.transition = 'none';
        t.el.style.left = p.x + 'px'; t.el.style.top = p.y + 'px';
        void t.el.offsetWidth; t.el.style.transition = '';
        if (held.has(e.viewerId)) t.el.classList.add('held');   // chờ avatar từ bảng giấy bay tới
        else if (!firstRender) {
          t.el.classList.add('enter');
          setTimeout(() => t.el.classList.remove('enter'), 900);
          setTimeout(() => sparkleAt(i, 10, 44), 350);
        }
      } else if (t.idx !== i) {
        t.el.style.left = p.x + 'px'; t.el.style.top = p.y + 'px';
        const jumped = t.idx - i;
        // Nhảy hơn 1 bậc (quà) → hiệu ứng "được đẩy lên"; dịch 1 bậc khi hàng tiến lên thì chỉ trượt.
        // Được đẩy lên: nhảy hơn 1 bậc, hoặc lên bậc nhờ vừa được cộng sao (tặng quà).
        if (!firstRender && (jumped > 1 || (jumped >= 1 && (e.stars ?? 0) > t.coins))) {
          t.el.classList.remove('boosted'); void t.el.offsetWidth; t.el.classList.add('boosted');
          setTimeout(() => t.el.classList.remove('boosted'), 1900);
          t.el.querySelector('.rise')?.remove();
          const r = document.createElement('div');
          r.className = 'rise'; r.textContent = `↑ +${jumped}`;
          t.el.appendChild(r);
          setTimeout(() => r.remove(), 2000);
          if (fx) fx.trail(t.el.querySelector('.frame'), 750, 30);
          setTimeout(() => sparkleAt(i, 16, 60), 700);
        }
      }
      t.idx = i;
      t.el.dataset.slot = String(i + 1);   // màu viền + tên theo ô (Figma)
      t.el.querySelector('.nm b').textContent = String(i + 1);
      // Số sao: bình luận +1, quà + sao tương ứng. Tăng sao → "+N⭐" bay lên.
      const stars = e.stars ?? e.coins ?? 0;
      if (stars !== t.coins) {
        const gain = stars - t.coins;
        const box = t.el.querySelector('.coins');
        box.querySelector('b').textContent = String(stars);
        if (!firstRender && gain > 0 && t.idx !== -1 && t.seenOnce) {
          const g = document.createElement('div');
          g.className = 'gain'; g.textContent = `+${gain}⭐`;
          t.el.appendChild(g);
          setTimeout(() => g.remove(), 1800);
          box.classList.remove('bump'); void box.offsetWidth; box.classList.add('bump');
        }
        t.coins = stars;
      }
      t.seenOnce = true;
      t.el.classList.toggle('gift', e.lane === 'gift');
      const topic = e.commentTopic || e.topic || 'general';
      if (t.el.dataset.topic !== topic) { t.el.dataset.topic = topic; t.el.querySelector('.tp span').textContent = TOPIC_LABEL[topic] || topic; }
      t.el.classList.toggle('locked', !!e.locked);
      t.el.classList.toggle('next', i === 0 && state.phase === 'INTERMISSION');
    });
    for (const [id, t] of tokens) {
      if (seen.has(id)) continue;
      tokens.delete(id);
      // Người vào ghế: thẻ tắt nhanh, avatar bay sang ghế do ui-seat vẽ. Người khác rời hàng: mờ dần.
      t.el.style.transition = state.seat?.viewerId === id ? 'opacity .15s' : '';
      t.el.classList.add('leave');
      setTimeout(() => t.el.remove(), 450);
    }
    // ô đang chờ avatar bay xuống (held) vẫn hiện như ô trống cho tới khi avatar đáp
    slots.forEach((d, i) => d.classList.toggle('taken', i < q.length && !held.has(q[i].viewerId)));
    firstRender = false;

    const hidden = Math.max(0, (state.queueTotal ?? q.length) - q.length);
    moreEl.textContent = hidden > 0 ? (vertical ? `+${hidden} người` : `+${hidden} người nữa đang chờ`) : '';
    pointerEl.style.visibility = q.length ? 'visible' : 'hidden';
    renderLabel(state);
  }

  function renderLabel(state) {
    // Ghế bệ đá (layout.seat.face) đã có số đếm ngược 3-2-1 trên bệ → nhãn hàng chờ giữ nguyên "Kế tiếp".
    if (state.phase === 'INTERMISSION' && state.phaseEndsAt && !layout.seat?.face) {
      const n = Math.max(1, Math.min(9, Math.ceil(store.phaseLeft() ?? 1)));
      labelEl.classList.remove('hint');
      labelEl.classList.add('count');
      if (n !== lastCount) {
        lastCount = n;
        labelEl.textContent = String(n);
        labelEl.classList.remove('tick'); void labelEl.offsetWidth; labelEl.classList.add('tick');
      }
      return;
    }
    lastCount = null;
    labelEl.classList.remove('count', 'tick', 'hint');
    if (labelEl.textContent !== 'Kế tiếp') labelEl.textContent = 'Kế tiếp';
  }

  // Đếm ngược chạy theo giờ server, không chờ gói trạng thái.
  setInterval(() => { const st = store.get(); if (st && st.phase === 'INTERMISSION') renderLabel(st); }, 100);

  /** Giữ trống ô của người này (avatar đang chuẩn bị bay từ bảng giấy xuống). Tự mở sau ttlMs nếu không ai mở. */
  function hold(viewerId, ttlMs = 20000) {
    if (!viewerId) return;
    held.set(viewerId, Date.now() + ttlMs);
    tokens.get(viewerId)?.el.classList.add('held');
    setTimeout(() => { if (held.has(viewerId) && held.get(viewerId) <= Date.now()) release(viewerId, false); }, ttlMs + 50);
  }
  /** Avatar đã bay tới: hiện thẻ trong ô (kèm hạt sáng). */
  function release(viewerId, sparkle = true) {
    held.delete(viewerId);
    const t = tokens.get(viewerId);
    if (t && t.idx >= 0) slots[t.idx]?.classList.add('taken');
    if (!t || !t.el.classList.contains('held')) return;
    t.el.classList.remove('held');
    if (sparkle && t.idx >= 0) {
      t.el.classList.add('landed');
      setTimeout(() => t.el.classList.remove('landed'), 700);
      sparkleAt(t.idx, 12, 50);
    }
  }
  /** Ô đích cho avatar bay từ bảng giấy: ô hiện tại của người đó; không thấy trong các ô hiển thị → null. */
  function slotOf(viewerId) {
    const t = tokens.get(viewerId);
    return t && t.idx >= 0 && t.idx < g.count ? t.idx : null;
  }

  return { render, avatarRect, hold, release, slotOf };
}
