// Xem tiến độ đọc sẵn giọng Tarot — KHÔNG cần server hay OmniVoice đang chạy, chỉ đọc thư mục data/tts-cache/.
// Cho biết đã đọc xong bao nhiêu câu, câu kế tiếp cần đọc là câu nào, dung lượng, và cập nhật hai file ghi nhớ:
//   data/tts-cache/_omni-progress.json  (tiến độ)      data/tts-cache/_omni-index.json  (tên file → nội dung câu)
// Chạy: node scripts/tarot-tts-status.mjs [--list-missing 10]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { loadSentences, scan, createIndexWriter, writeProgress, readJson, PROGRESS_FILE } = require('../lib/tarot-tts-progress.js');
const { omniCacheNamer } = require('../lib/tarot-voice.js');
const { loadConfig } = require('../lib/tarot-config.js');

const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tarotDir = path.join(root, 'data', 'tarot');
const cacheDir = path.join(root, 'data', 'tts-cache');
const config = loadConfig(path.join(tarotDir, 'config.json'));

const namer = omniCacheNamer(config, tarotDir, cacheDir);
if (!namer) { console.log(`Bộ đọc hiện tại là "${config.tts.engine}"; lệnh này chỉ theo dõi OmniVoice.`); process.exit(0); }

const sentences = loadSentences(tarotDir);
const sc = scan(sentences, namer, cacheDir);
const index = createIndexWriter(cacheDir);
for (const i of sc.doneIdx) index.add(namer(sentences[i].text), sentences[i].text);
index.flush();

const files = fs.readdirSync(cacheDir).filter((f) => f.startsWith('omni_') && f.endsWith('.wav'));
const mb = files.reduce((s, f) => s + fs.statSync(path.join(cacheDir, f)).size, 0) / 1048576;
const prev = readJson(path.join(cacheDir, PROGRESS_FILE));
const p = writeProgress(cacheDir, sentences, sc, { engine: config.tts.engine, state: prev?.state || (sc.doneCount === sc.total ? 'xong' : 'chưa chạy') });

const KIND = { fixed: 'câu cố định', reading: 'lời giải (từ sheet)' };
console.log(`Thư mục lưu : ${cacheDir}`);
console.log(`Đã xong     : ${p.done} / ${p.total} câu (${p.percent}%)   |   còn ${p.remaining} câu`);
for (const [k, v] of Object.entries(sc.byKind)) console.log(`   - ${KIND[k] || k}: ${v.done}/${v.total}`);
console.log(`File giọng  : ${files.length} file omni_*.wav, ${mb.toFixed(0)} MB`);
console.log(p.nextSentence ? `Câu kế tiếp : #${p.nextPosition} “${p.nextSentence.slice(0, 80)}${p.nextSentence.length > 80 ? '…' : ''}”` : 'Câu kế tiếp : (đã đủ cả)');
if (p.remaining) console.log(`Ước tính    : ~${Math.round((p.remaining * 3.9) / 60)} phút nếu card đồ họa rảnh (3,9 giây/câu)`);
if (prev?.updatedAt && prev.lastSavedSentence) console.log(`Lần lưu cuối: ${prev.lastSavedAt || prev.updatedAt} — “${prev.lastSavedSentence.slice(0, 60)}…”`);
const n = Number(args['list-missing'] || 0);
if (n > 0) { console.log(`\n${n} câu đầu còn thiếu:`); sc.missingIdx.slice(0, n).forEach((i) => console.log(`  #${i + 1} [${sentences[i].kind}] ${sentences[i].text.slice(0, 90)}`)); }
console.log(`\nGhi nhớ     : ${path.join(cacheDir, '_omni-progress.json')} và _omni-index.json (cùng thư mục)`);
console.log('Làm tiếp    : node scripts/prerender-tarot-tts.mjs');
