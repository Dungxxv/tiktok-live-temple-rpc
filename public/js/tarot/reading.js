// Bong bóng lời thoại: lời mời/lời dẫn theo pha + lời giải từng câu theo thời lượng TTS (đồng bộ phaseStartedAt của server).
// Audio TTS phát tuần tự trong pha READING.
import { sessionKey } from './state-store.js';

const CHARS_PER_SEC = 13;
const MAX_FONT = 26.778;   // cỡ chữ trong Figma
const MIN_FONT = 15;

/** Lời dẫn theo pha (ngoài phần đọc lời giải). */
export function phaseLine(state) {
  const name = state.seat?.name || 'bạn';
  const n = state.cards?.length || state.seat?.cardsPlanned || 3;
  switch (state.phase) {
    case 'IDLE': return state.queue?.length ? 'Chờ chị một chút nhé…' : 'Bình luận “bói” để được xem bài nhé';
    case 'CALLING': return `Mời ${name} ngồi xuống nào`;
    case 'SHUFFLING': return 'Để chị xào bài cho bạn nhé';
    case 'DRAWING': return `Cùng lật ${n} lá bài nhé`;
    case 'REVEALING': return 'Xem bài nói gì với bạn nào';
    case 'FAREWELL': return `Cảm ơn ${name} đã ghé xem bài!`;
    case 'INTERMISSION': return state.queue?.[0] ? `Bạn ${state.queue[0].name} chuẩn bị nhé, sắp đến lượt rồi!` : 'Chuẩn bị đón khách kế tiếp…';
    default: return '';
  }
}

export function createReadingUi({ subEl, boxEl, store, onAudioBlocked = () => {}, muted = false }) {
  let audio = null;
  let startedKey = null;

  function durationsOf(reading) {
    if (reading.ready && reading.durations?.length === reading.lines.length) return reading.durations;
    return reading.lines.map((l) => Math.max(1, l.length / CHARS_PER_SEC));
  }

  function stopAudio() {
    if (audio) { audio.onended = null; audio.pause(); audio = null; }
    startedKey = null;
  }

  function playFrom(reading, elapsed) {
    const durs = durationsOf(reading);
    let acc = 0; let idx = 0;
    while (idx < durs.length && acc + durs[idx] <= elapsed) { acc += durs[idx]; idx++; }
    const offset = elapsed - acc;
    const next = (i, off) => {
      if (i >= reading.ttsUrls.length) { audio = null; return; }
      const a = new Audio(reading.ttsUrls[i]);
      audio = a;
      a.onended = () => next(i + 1, 0);
      a.onerror = () => next(i + 1, 0);
      if (off > 0.2) a.addEventListener('loadedmetadata', () => { try { a.currentTime = off; } catch (_) {} }, { once: true });
      a.play().catch(() => onAudioBlocked());
    };
    next(idx, offset);
  }

  /** Thu nhỏ chữ cho vừa bong bóng (câu lời giải dài hơn câu mẫu trong thiết kế). */
  function fit() {
    let size = MAX_FONT;
    subEl.style.fontSize = size + 'px';
    boxEl.classList.remove('long');
    const room = () => boxEl.clientHeight - parseFloat(getComputedStyle(boxEl).paddingTop) - parseFloat(getComputedStyle(boxEl).paddingBottom);
    if (subEl.scrollHeight > room()) boxEl.classList.add('long');
    while (size > MIN_FONT && subEl.scrollHeight > room()) {
      size -= 1;
      subEl.style.fontSize = size + 'px';
    }
  }

  function currentText(state) {
    const r = state.reading;
    if (state.phase === 'READING' && r && r.lines.length) {
      const durs = durationsOf(r);
      const elapsed = store.phaseAge();
      let acc = 0; let idx = 0;
      while (idx < durs.length - 1 && acc + durs[idx] <= elapsed) { acc += durs[idx]; idx++; }
      return r.lines[idx];
    }
    return phaseLine(state);
  }

  function showText(state) {
    const text = currentText(state);
    boxEl.classList.toggle('hide', !text);
    if (text && subEl.textContent !== text) { subEl.textContent = text; fit(); }
  }

  function render(state) {
    const key = sessionKey(state);
    if (state.phase === 'READING' && state.reading?.ready && !muted && startedKey !== key) {
      startedKey = key;
      playFrom(state.reading, store.phaseAge());
    }
    if (state.phase !== 'READING' && state.phase !== 'FAREWELL') stopAudio();
    showText(state);
  }

  setInterval(() => { const st = store.get(); if (st) showText(st); }, 200);
  if (document.fonts?.ready) document.fonts.ready.then(() => { if (subEl.textContent) fit(); });

  return { render, stopAudio };
}
