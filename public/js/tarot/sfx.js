// Hiệu ứng âm thanh màn Tarot: ít tiếng, chỉ ở các khoảnh khắc chính của phiên (tránh nhiễu giọng nữ tư tế).
// File ở /assets/tarot/sfx/<tên>.ogg; thiếu file nào thì im tiếng đó, không lỗi.
// Thời điểm phát theo tuổi pha của server (giống bộ bài 3D) → tab mở muộn không phát lại tiếng đã qua.
import { drawTimes } from './deck3d.js';

const BASE = '/assets/tarot/sfx/';
// Mức to tương đối của từng tiếng (file đã chuẩn hóa đỉnh -3 dB; tiếng kéo dài thì để nhỏ hơn).
const GAIN = {
  'summon': 0.8,          // khách bay từ hàng chờ vào bệ đá
  'countdown-tick': 0.45, // mỗi số 3-2-1 trên bệ
  'shuffle': 0.7,         // xáo bài trên bàn (2 lượt riffle)
  'table-light': 0.55,    // mặt bàn tỏa sáng vàng trước khi rút bài
  'card-fly': 0.7,        // mỗi lá bay lên (3 lần)
  'paper-open': 0.7       // mở khung "Thông điệp nhận được"
};
const SHUFFLE_AT = 0.4;   // khớp SH.start trong deck3d.js
const LIGHT_AT = 0.1;     // khớp DR.light
const LATE = 0.35;        // trễ quá mức này (giây) thì bỏ, không phát muộn

export function createSfx({ store }) {
  const bank = {};
  for (const name of Object.keys(GAIN)) {
    const a = new Audio(BASE + name + '.ogg');
    a.preload = 'auto';
    a.addEventListener('error', () => { bank[name] = null; });   // thiếu file → im
    bank[name] = a;
  }
  let enabled = true, volume = 0.4, duckLevel = 1, speaking = false;
  let timers = [];

  function play(name) {
    const src = bank[name];
    if (!src || !enabled || volume <= 0) return;
    const a = src.cloneNode();
    a.volume = Math.max(0, Math.min(1, volume * GAIN[name] * (speaking ? duckLevel : 1)));
    a.play().catch(() => {});
  }

  /** Hẹn phát tại giây `at` của pha hiện tại (tính theo giờ server). */
  function at(name, sec) {
    const wait = sec - store.phaseAge();
    if (wait < -LATE) return;
    timers.push(setTimeout(() => play(name), Math.max(0, wait * 1000)));
  }

  function onPhase(st) {
    timers.forEach(clearTimeout); timers = [];
    if (st.phase === 'SHUFFLING') at('shuffle', SHUFFLE_AT);
    else if (st.phase === 'DRAWING') {
      at('table-light', LIGHT_AT);
      const n = Math.min(3, st.cards?.length || 3);
      for (let i = 0; i < n; i++) at('card-fly', drawTimes(i).fly);
    } else if (st.phase === 'READING') at('paper-open', 0);
  }

  return {
    play, onPhase,
    /** cfg: { sfxOn, sfxVolume, duck } từ /tarot/admin; muted = khung xem trước / tab cũ. */
    setConfig({ on, vol, duck }) { enabled = !!on; volume = vol; duckLevel = Math.max(0.3, duck ?? 1); },
    setSpeaking(v) { speaking = !!v; }
  };
}
