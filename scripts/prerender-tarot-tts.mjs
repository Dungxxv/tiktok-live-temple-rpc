// Đọc sẵn giọng cho mọi câu lời giải để lúc live chỉ tra cache (không phải chờ tạo giọng).
// Nguồn câu: data/tarot/fixed-lines.json (câu cố định không có tên) + data/tarot/readings.json (đồng bộ Google Sheet);
//           chưa có readings.json thì dùng lời giải cũ trong cards.json.
// Dùng đúng bộ đọc đã chọn trong data/tarot/config.json (tts.engine) qua RPC tarot.speak với ưu tiên THẤP:
// có phiên đang live thì câu của phiên live luôn được làm trước.
//
// LƯU LÂU, LÀM TIẾP ĐƯỢC: mỗi câu là một file .wav trong data/tts-cache/ và KHÔNG bao giờ bị xóa tự động.
// Chạy lại (hoặc sau khi ngắt giữa chừng) sẽ bỏ qua ngay các câu đã có, làm tiếp từ câu đầu tiên còn thiếu.
// Tiến độ ghi sau MỖI câu vào data/tts-cache/_omni-progress.json; bảng tra "tên file → câu" ở _omni-index.json.
// Xem nhanh tiến độ (không cần server): node scripts/tarot-tts-status.mjs
//
// Cần server Tarot đang chạy; với omnivoice thì OmniVoice (omnivoice-demo, cổng 8001) cũng phải đang chạy.
// Nếu server đặt ADMIN_TOKEN thì truyền biến môi trường ADMIN_TOKEN.
// Chạy: node scripts/prerender-tarot-tts.mjs [--base http://localhost:3000] [--limit 20] [--wait 300] [--retry 2]
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { loadSentences, scan, createIndexWriter, writeProgress } = require('../lib/tarot-tts-progress.js');
const { omniCacheNamer } = require('../lib/tarot-voice.js');
const { loadConfig } = require('../lib/tarot-config.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const BASE = args.base || 'http://localhost:3000';
const LIMIT = args.limit ? Number(args.limit) : Infinity;
const WAIT_SEC = Number(args.wait ?? 300);
const RETRY = Number(args.retry ?? 2);
const TOKEN = process.env.ADMIN_TOKEN || undefined;

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tarotDir = path.join(root, 'data', 'tarot');
const cacheDir = path.join(root, 'data', 'tts-cache');
const config = loadConfig(path.join(tarotDir, 'config.json'));

const sentences = loadSentences(tarotDir);
const namer = omniCacheNamer(config, tarotDir, cacheDir);   // null nếu engine không phải omnivoice
const index = createIndexWriter(cacheDir);
console.log(`Bộ đọc: ${config.tts.engine}. Tổng ${sentences.length} câu khác nhau.`);

// Câu nào đã có file thì bỏ qua ngay (không cần hỏi server) → làm tiếp từ chỗ dừng.
let todoIdx = sentences.map((_, i) => i);
let sc = null;
if (namer) {
  sc = scan(sentences, namer, cacheDir);
  for (const i of sc.doneIdx) index.add(namer(sentences[i].text), sentences[i].text);   // bù bảng tra cho file cũ
  todoIdx = sc.missingIdx;
  console.log(`Đã có sẵn ${sc.doneCount}/${sc.total} câu (${(sc.doneCount / sc.total * 100).toFixed(1)}%).` +
    (todoIdx.length ? ` Làm tiếp từ câu thứ ${todoIdx[0] + 1}.` : ' Đã đủ cả!'));
  writeProgress(cacheDir, sentences, sc, { engine: config.tts.engine, state: todoIdx.length ? 'đang chạy' : 'xong' });
}
todoIdx = todoIdx.slice(0, LIMIT);
if (!todoIdx.length) { index.flush(); console.log('Không còn câu nào cần đọc.'); process.exit(0); }

let id = 0;
async function rpc(method, params = {}) {
  const res = await fetch(`${BASE}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: TOKEN ? { ...params, token: TOKEN } : params }) });
  const body = await res.json();
  if (body.error) throw new Error(body.error.message);
  return body.result;
}

console.log(`Chờ bộ đọc giọng sẵn sàng (tối đa ${WAIT_SEC}s)…`);
const start = Date.now();
for (;;) {
  let st;
  try { st = await rpc('tarot.ttsStatus'); } catch (e) { st = { status: 'server-offline', error: `không nối được server Tarot (${BASE})` }; }
  if (st.ready) break;
  if (st.status === 'disabled') { console.error('Bộ đọc giọng đang tắt (DISABLE_ZEROTTS_WORKER=1 với engine zerotts?).'); process.exit(1); }
  if ((Date.now() - start) / 1000 > WAIT_SEC) {
    console.error(`Hết thời gian chờ. Trạng thái: ${st.status}${st.error ? ` — ${st.error}` : ''}`);
    if (config.tts.engine === 'omnivoice') console.error('Hãy bật OmniVoice: python -m omnivoice.cli.demo --ip 0.0.0.0 --port 8001');
    process.exit(1);
  }
  await new Promise((r) => setTimeout(r, 2000));
}
console.log(`Bắt đầu đọc sẵn ${todoIdx.length} câu…`);

let ok = 0; let synthTotal = 0; let doneNow = sc ? sc.doneCount : 0;
const failed = [];
let lastSaved = null;
const t0 = Date.now();
const finish = (state) => {
  index.flush();
  if (sc) {
    const missing = sc.missingIdx.filter((i) => !savedSet.has(i));
    const fresh = { ...sc, doneCount: sc.total - missing.length, missingIdx: missing, firstMissing: missing.length ? missing[0] : null };
    writeProgress(cacheDir, sentences, fresh, { engine: config.tts.engine, state, lastSavedSentence: lastSaved?.text, lastSavedFile: lastSaved?.file, lastSavedAt: lastSaved ? new Date().toISOString() : undefined });
  }
};
const savedSet = new Set();
process.on('SIGINT', () => { finish('tạm dừng'); process.exit(130); });
process.on('SIGTERM', () => { finish('tạm dừng'); process.exit(143); });

for (let n = 0; n < todoIdx.length; n++) {
  const i = todoIdx[n];
  const { text } = sentences[i];
  let done = false;
  for (let attempt = 0; attempt <= RETRY && !done; attempt++) {
    try {
      const r = await rpc('tarot.speak', { text, priority: 'background' });
      if (r.ok) {
        done = true; ok++; synthTotal += r.cached ? 0 : (r.synthSec || 0);
        savedSet.add(i); doneNow++;
        lastSaved = { text, file: r.file };
        if (r.file) index.add(r.file, text);
      } else if (attempt === RETRY) console.warn(`  [lỗi] "${text.slice(0, 50)}": ${r.error}`);
    } catch (e) { if (attempt === RETRY) console.warn(`  [lỗi] ${e.message}`); }
    if (!done && attempt < RETRY) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!done) failed.push(i);
  finish('đang chạy');   // ghi tiến độ sau mỗi câu (file nhỏ): tắt máy/ngắt bất cứ lúc nào vẫn biết đã đến câu nào
  if ((n + 1) % 25 === 0 || n + 1 === todoIdx.length) {
    const avg = ok ? synthTotal / ok : 0;
    const left = todoIdx.length - (n + 1);
    const eta = avg && left ? `, còn ~${Math.round((left * avg) / 60)} phút` : '';
    console.log(`  ${doneNow}/${sentences.length} câu xong (lần này +${ok}, lỗi ${failed.length}${avg ? `, ${avg.toFixed(1)}s/câu` : ''}${eta}) — vừa lưu câu thứ ${i + 1}`);
  }
}
const remaining = sc ? sc.total - doneNow : null;
finish(failed.length ? 'xong, có lỗi' : remaining === 0 ? 'xong' : 'xong đợt (còn câu chưa làm)');
console.log(`Xong sau ${Math.round((Date.now() - t0) / 60000)} phút. Lưu mới ${ok} câu, lỗi ${failed.length}.` + (ok ? ` Trung bình ${(synthTotal / ok).toFixed(2)}s/câu.` : ''));
if (failed.length) process.exit(1);
