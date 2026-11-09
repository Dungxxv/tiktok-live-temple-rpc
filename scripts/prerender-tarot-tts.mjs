// Render sẵn giọng đọc (ZeroTTS, giọng maichi) cho mọi câu lời giải để lúc live chỉ tra cache.
// Cần server đang chạy với TTS bật (không đặt DISABLE_ZEROTTS_WORKER). Worker lưu WAV vào data/tts-cache/.
// Chạy: node scripts/prerender-tarot-tts.mjs [--base http://localhost:3000] [--limit 20] [--wait 300]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const BASE = args.base || 'http://localhost:3000';
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const WAIT_SEC = Number(args.wait ?? 300);

const here = path.dirname(fileURLToPath(import.meta.url));
const { cards } = JSON.parse(fs.readFileSync(path.join(here, '..', 'data', 'tarot', 'cards.json'), 'utf8'));

// Mọi câu có thể được đọc: lời giải xuôi/ngược của từng lá + câu giới thiệu lá khi rút nhiều lá.
const lines = new Set();
for (const c of cards) {
  for (const dir of ['up', 'rev']) {
    for (const topic of Object.values(c.readings)) (topic[dir] || []).forEach((l) => lines.add(l));
  }
  lines.add(`Lá ${c.name_vi}.`);
  lines.add(`Lá ${c.name_vi}, ngược.`);
}
const todo = Array.from(lines).slice(0, LIMIT);

let id = 0;
async function rpc(method, params) {
  const res = await fetch(`${BASE}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }) });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

console.log(`Chờ ZeroTTS sẵn sàng (tối đa ${WAIT_SEC}s)…`);
const start = Date.now();
for (;;) {
  const st = await rpc('temple.ttsStatus', {});
  if (st.ready) break;
  if (st.status === 'disabled' || st.status === 'error') { console.error(`TTS không khả dụng (trạng thái: ${st.status}). Cài zerotts và bỏ DISABLE_ZEROTTS_WORKER.`); process.exit(1); }
  if ((Date.now() - start) / 1000 > WAIT_SEC) { console.error('Hết thời gian chờ TTS.'); process.exit(1); }
  await new Promise((r) => setTimeout(r, 1500));
}

console.log(`Render ${todo.length} câu…`);
let ok = 0; let cached = 0; let failed = 0; let synthTotal = 0;
for (let i = 0; i < todo.length; i++) {
  const text = todo[i];
  try {
    const r = await rpc('temple.speak', { text, voice: 'maichi', broadcast: false });
    if (!r.ok) { failed++; console.warn(`  [lỗi] "${text.slice(0, 50)}": ${r.error}`); continue; }
    ok++; if (r.cached) cached++; else synthTotal += r.synthSec || 0;
  } catch (e) { failed++; console.warn(`  [lỗi] ${e.message}`); }
  if ((i + 1) % 20 === 0 || i + 1 === todo.length) console.log(`  ${i + 1}/${todo.length} (đã có cache: ${cached}, lỗi: ${failed})`);
}
const fresh = ok - cached;
console.log(`Xong. Thành công ${ok}, đã có cache ${cached}, lỗi ${failed}.` + (fresh ? ` Thời gian render trung bình ${(synthTotal / fresh).toFixed(2)}s/câu.` : ''));
