// Lời nói + bong bóng phụ đề:
// - Mỗi pha có lời (mời khách, xào bài, rút bài, lật bài, đọc bài, tạm biệt) phát TTS tuần tự.
// - KHÔNG cắt câu: đổi pha khi đang nói thì nói hết câu đang dở rồi mới sang lời của pha mới
//   (server đã kéo dài pha cho đủ nói hết). Pha mới vừa bắt đầu (< LATE_START_SEC) thì đọc từ câu đầu;
//   mở trang muộn giữa pha thì đọc tiếp từ đúng câu theo giờ server.
// - Bong bóng hiện câu đang nói kiểu karaoke; báo "phần đang đọc" ra ngoài để sáng lá và hiện nhãn.
import { sessionKey } from './state-store.js';

const CHARS_PER_SEC = 13;
const LATE_START_SEC = 4;  // khớp lib/tarot-session.js
const SECTION_TAG = { card1: 'Quá khứ', card2: 'Hiện tại', card3: 'Tương lai', closing: 'Lời kết' };
const SECTION_CARD = { card1: 0, card2: 1, card3: 2 };

/** Lời dẫn theo pha khi không có câu nói. */
export function phaseLine(state) {
  const name = state.seat?.name || 'bạn';
  const n = state.cards?.length || state.seat?.cardsPlanned || 3;
  switch (state.phase) {
    // Phòng trống: không hiện câu nào (bảng giấy trên cùng đã mời bình luận / tặng quà).
    case 'IDLE': return '';
    case 'CALLING': return `Mời ${name} ngồi xuống nào`;
    case 'SHUFFLING': return 'Bài đang được xáo…';
    case 'DRAWING': return n === 1 ? 'Cùng lật lá bài của bạn nhé' : `Cùng lật ${n} lá bài nhé`;
    case 'REVEALING': return 'Xem bài nói gì với bạn nào';
    case 'FAREWELL': return `Cảm ơn ${name} đã ghé xem bài!`;
    // Figma: "Nguyễn chuẩn bị vào phòng xem bài nha" (câu do server soạn, tên đã lọc)
    case 'INTERMISSION': return state.welcome?.line || (state.queue?.[0] ? `${state.queue[0].name} chuẩn bị vào phòng xem bài nha.` : 'Chuẩn bị đón khách kế tiếp…');
    default: return '';
  }
}

const PAGE_CHARS = 300;   // khung "Thông điệp nhận được": tối đa ngần này ký tự mỗi trang (vừa khung, không tràn xuống lá bài)

/** Trang chứa câu idx: gom các câu cùng phần (section) rồi chia trang tuần tự ≤ PAGE_CHARS ký tự. */
function pageOf(sp, idx) {
  const sec = sp.sections?.[idx];
  let a = idx, b = idx;
  while (a > 0 && sp.sections?.[a - 1] === sec) a--;
  while (b < sp.lines.length - 1 && sp.sections?.[b + 1] === sec) b++;
  let s = a, len = 0;
  for (let i = a; i <= b; i++) {
    const l = sp.lines[i].length + 1;
    if (i > s && len + l > PAGE_CHARS) { if (idx < i) return { start: s, end: i - 1 }; s = i; len = 0; }
    len += l;
  }
  return { start: s, end: b };
}

export function createReadingUi({ subEl, boxEl, tagEl, store, onAudioBlocked = () => {}, onSection = () => {}, onSpeaking = () => {}, muted = false, panelPages = false }) {
  let leadTimer = null;      // chờ đầu pha trước khi nói (speechLeadSec)
  // Số giây đã qua kể từ lúc được phép nói trong pha (âm = còn đang chờ, vd. avatar đang bay vào bệ đá).
  const speechAge = (st = store.get()) => store.phaseAge() - (Number(st?.config?.speechLeadSec?.[st?.phase]) || 0);
  let audio = null;          // câu đang phát: { el, key, index, text, section, sp }
  let chainKey = null;       // pha đang được đọc nối tiếp (null = dừng sau câu hiện tại)
  let startedKey = null;     // pha đã bắt đầu (hoặc đã xếp chờ) phát lời
  let pending = null;        // lời của pha mới chờ câu đang dở nói xong: { sp, key }
  let volume = 1;
  let speaking = false;
  let shownKey = '';
  let lastSection;
  let waitedKey = null;      // pha mà màn live đã thấy từ đầu nhưng giọng chưa sẵn sàng (xong muộn → đọc từ câu đầu)
  const setSpeaking = (v) => { if (v !== speaking) { speaking = v; onSpeaking(v); } };

  function phaseSpeech(state) {
    const sp = state.speech?.phases?.[state.phase];
    // Mỗi pha có cờ ready riêng (server tạo giọng theo từng pha): pha nào đủ tiếng là phát.
    if (sp && sp.lines.length) return { ...sp, ready: (sp.ready ?? !!state.speech.ready) && sp.ttsUrls?.length === sp.lines.length };
    const r = state.reading;
    if (state.phase === 'READING' && r && r.lines?.length) {
      return { lines: r.lines, sections: r.sections || [], ttsUrls: r.ttsUrls || [], durations: r.durations || [], ready: !!r.ready && r.ttsUrls?.length === r.lines.length };
    }
    return null;
  }
  const durationsOf = (sp) => (sp.durations?.length === sp.lines.length ? sp.durations : sp.lines.map((l) => Math.max(1, l.length / CHARS_PER_SEC)));

  function locate(sp, elapsed) {
    const durs = durationsOf(sp);
    let acc = 0; let idx = 0;
    while (idx < durs.length - 1 && acc + durs[idx] <= elapsed) { acc += durs[idx]; idx++; }
    return { idx, offset: Math.max(0, elapsed - acc), dur: durs[idx], total: durs.reduce((a, b) => a + b, 0) };
  }

  function stopAudio() {
    clearTimeout(leadTimer);
    if (audio) { audio.el.onended = null; audio.el.onerror = null; audio.el.pause(); audio = null; }
    chainKey = null; pending = null; startedKey = null;
    setSpeaking(false);
  }

  function runPending() {
    if (!pending) { setSpeaking(false); return; }
    const p = pending; pending = null;
    startPhase(p.sp, p.key);
  }

  function startPhase(sp, key) {
    const age = speechAge();
    if (age < 0) {   // còn trong khoảng chờ đầu pha: hẹn giờ nói
      clearTimeout(leadTimer);
      leadTimer = setTimeout(() => { if (startedKey === key && !audio) startPhase(sp, key); }, -age * 1000 + 20);
      setSpeaking(false);
      return;
    }
    const loc = locate(sp, age);
    const fromStart = age < LATE_START_SEC || waitedKey === key;   // giọng xong muộn → server đã kéo dài pha, đọc từ đầu
    if (!fromStart && age > loc.total) { setSpeaking(false); return; }   // mở trang muộn: pha đã nói xong từ trước
    chainKey = key;
    if (fromStart) playLine(sp, key, 0, 0);
    else playLine(sp, key, loc.idx, loc.offset);
  }

  function playLine(sp, key, i, off) {
    if (chainKey !== key || i >= sp.ttsUrls.length) { audio = null; if (chainKey === key) chainKey = null; runPending(); return; }
    const el = new Audio(sp.ttsUrls[i]);
    el.volume = volume;
    audio = { el, key, index: i, text: sp.lines[i], section: sp.sections?.[i], sp };
    setSpeaking(true);
    const next = () => {
      if (audio?.el !== el) return;
      if (pending) { audio = null; runPending(); return; }          // pha đã đổi: câu dở đã xong → sang lời pha mới
      playLine(sp, key, i + 1, 0);
    };
    el.onended = next;
    el.onerror = next;
    if (off > 0.2) el.addEventListener('loadedmetadata', () => { try { el.currentTime = off; } catch (_) {} }, { once: true });
    el.play().catch(() => { onAudioBlocked(); next(); });
  }

  /** Cỡ chữ cố định theo Figma; khung bong bóng tự giãn chiều cao (CSS). */
  function fit() {
    subEl.style.fontSize = '';
    boxEl.classList.remove('long');
  }
  function setText(text, progress = null) {
    const key = text + '|' + (progress === null ? 'n' : 'k');
    if (key !== shownKey) {
      shownKey = key;
      subEl.innerHTML = '';
      if (progress === null) subEl.textContent = text;
      else {
        const said = document.createElement('span'); said.className = 'said';
        const rest = document.createElement('span'); rest.className = 'rest';
        rest.textContent = text;
        subEl.append(said, rest);
      }
      fit();
    }
    if (progress !== null) {
      const chars = Array.from(text);
      // Dấu câu = chỗ ngắt hơi: tính nặng hơn chữ thường để chữ chạy khớp nhịp nói (không dồn hết vào cuối câu).
      const w = chars.map((c) => (/[.!?…]/.test(c) ? 4 : /[,;:]/.test(c) ? 3 : 1));
      const total = w.reduce((a, b) => a + b, 0);
      let k = 0; let acc = 0;
      while (k < chars.length && acc + w[k] <= progress * total) { acc += w[k]; k++; }
      const said = subEl.querySelector('.said'); const rest = subEl.querySelector('.rest');
      const head = chars.slice(0, k).join('');
      if (said && said.textContent !== head) { said.textContent = head; rest.textContent = chars.slice(k).join(''); }
    }
  }

  /** Khung "Thông điệp nhận được": hiện cả trang (nhiều câu cùng phần); câu đã nói đậm, câu đang nói chạy chữ, câu sau nhạt. */
  function setPage(sp, idx, progress) {
    const pg = pageOf(sp, idx);
    const key = `page|${pg.start}-${pg.end}|${sp.lines[pg.start]}`;
    if (key !== shownKey) {
      shownKey = key;
      subEl.innerHTML = '';
      for (let i = pg.start; i <= pg.end; i++) {
        const said = document.createElement('span'); said.className = 'said';
        const rest = document.createElement('span'); rest.className = 'rest';
        rest.textContent = sp.lines[i] + (i < pg.end ? ' ' : '');
        subEl.append(said, rest);
      }
      fit();
    }
    const saids = subEl.querySelectorAll('.said'); const rests = subEl.querySelectorAll('.rest');
    for (let i = pg.start; i <= pg.end; i++) {
      const k = i - pg.start;
      const text = sp.lines[i] + (i < pg.end ? ' ' : '');
      const chars = Array.from(text);
      let n = 0;
      if (i < idx) n = chars.length;
      else if (i === idx) {
        const w = chars.map((c) => (/[.!?…]/.test(c) ? 4 : /[,;:]/.test(c) ? 3 : 1));
        const total = w.reduce((a, b) => a + b, 0);
        let acc = 0;
        while (n < chars.length && acc + w[n] <= progress * total) { acc += w[n]; n++; }
      }
      const head = chars.slice(0, n).join('');
      if (saids[k] && saids[k].textContent !== head) { saids[k].textContent = head; rests[k].textContent = chars.slice(n).join(''); }
    }
  }
  const pageMode = (state) => panelPages && state.phase === 'READING';

  function setSection(state, section) {
    const s = section || null;
    if (s === lastSection) return;
    lastSection = s;
    const tag = state.seat?.sessionType === 'gift' ? SECTION_TAG[s] : null;
    if (tagEl) { tagEl.textContent = tag || ''; tagEl.classList.toggle('show', !!tag); }
    onSection(s, SECTION_CARD[s] ?? null);
  }

  function update(state) {
    // Đang phát một câu (kể cả câu dở của pha trước): bong bóng hiện đúng câu đó, khớp tiếng.
    if (audio) {
      const d = audio.el.duration;
      const prog = d > 0 ? Math.min(1, audio.el.currentTime / d) : 0;
      boxEl.classList.remove('hide');
      if (pageMode(state) && audio.sp && audio.key.includes(':READING:')) setPage(audio.sp, audio.index, prog);
      else setText(audio.text, prog);
      setSection(state, audio.section);
      return;
    }
    const sp = phaseSpeech(state);
    if (!sp) {
      setSection(state, null);
      const text = phaseLine(state);
      boxEl.classList.toggle('hide', !text);
      if (text) setText(text);
      return;
    }
    // Còn trong khoảng chờ đầu pha (vd. avatar đang bay vào bệ đá): chưa hiện lời.
    const age = speechAge(state);
    if (age < 0) { boxEl.classList.add('hide'); setSection(state, null); return; }
    // Chưa có tiếng (đang tạo giọng / tắt giọng): chạy chữ theo giờ server.
    const loc = locate(sp, age);
    const prog = Math.min(1, loc.offset / Math.max(0.5, loc.dur));
    boxEl.classList.remove('hide');
    if (pageMode(state)) setPage(sp, loc.idx, prog);
    else setText(sp.lines[loc.idx], prog);
    setSection(state, sp.sections?.[loc.idx]);
  }

  function render(state) {
    // Người đầu tiên vừa vào lúc ghế rảnh: nói câu chào "chuẩn bị ngồi vào ghế" (một lần cho mỗi người).
    // Câu "… chuẩn bị vào phòng xem bài nha" chỉ nói lúc đếm ngược trên bệ đá (INTERMISSION), đồng thời với 3-2-1.
    const wl = state.phase === 'INTERMISSION' ? state.welcome : null;
    if (wl && wl.ready && wl.ttsUrls?.length && !muted) {
      const wkey = `welcome:${wl.viewerId}:${wl.at}`;
      if (wkey !== startedKey) {
        startedKey = wkey;
        const sp = { lines: [wl.line], sections: [null], ttsUrls: wl.ttsUrls, durations: wl.durations, ready: true };
        if (audio) pending = { sp, key: wkey }; else { chainKey = wkey; playLine(sp, wkey, 0, 0); }
      }
    }
    const key = `${sessionKey(state)}:${state.phase}:${state.phaseStartedAt}`;
    if (key !== startedKey) {
      const sp = phaseSpeech(state);
      if (sp && sp.ready && !muted) {
        startedKey = key;
        if (audio) { pending = { sp, key }; chainKey = null; }   // nói hết câu dở rồi mới sang pha mới
        else startPhase(sp, key);
      } else {
        if (sp && !sp.ready && store.phaseAge() < LATE_START_SEC) waitedKey = key;   // thấy pha từ đầu, giọng đang tạo
        if (chainKey && chainKey !== key) chainKey = null;   // pha mới chưa/không có lời: dừng sau câu đang dở
      }
    }
    update(state);
  }

  setInterval(() => { const st = store.get(); if (st) update(st); }, 80);
  if (document.fonts?.ready) document.fonts.ready.then(() => { shownKey = ''; });

  /** Nữ tư tế đang có thoại không (để clip chuyển sang miệng nói). Tính theo giờ server nên đúng cả khi tắt tiếng / chưa có giọng. */
  function isTalking() {
    // Có tiếng: theo đúng tiếng đang phát (chưa phát / đang tải / đã hết thì im) → miệng khớp lời.
    if (audio) return !audio.el.paused && !audio.el.ended && audio.el.currentTime > 0;
    if (chainKey && !muted) return false;   // giữa hai câu của một chuỗi đang phát: chờ câu sau phát thật
    const st = store.get();
    if (!st) return false;
    const sp = phaseSpeech(st);
    const wl = st.phase === 'INTERMISSION' ? st.welcome : null;
    const lines = sp || (wl ? { lines: [wl.line], durations: wl.durations } : null);
    if (!lines || !lines.lines?.length) return false;
    const age = sp ? speechAge(st) : store.phaseAge();
    const total = durationsOf(lines).reduce((a, b) => a + b, 0);
    return age >= 0 && age < total;
  }

  return {
    render, stopAudio, isTalking,
    /** Âm lượng giọng 0..1 (0 = tắt tiếng giọng). */
    setVolume(v) { volume = Math.max(0, Math.min(1, v)); if (audio) audio.el.volume = volume; }
  };
}
