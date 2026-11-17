// Đồng bộ nội dung bói từ Google Sheet "Data bài" → data/tarot/readings.json (commit được).
// Cách 1 (mặc định): tải CSV từng tab qua gviz (sheet phải chia sẻ "Bất kỳ ai có đường liên kết: Người xem").
// Cách 2: --from-dir <thư mục> đọc CSV tự tải, mỗi tab một file "<tên tab>.csv" (mặc định data/tarot/src/sheet).
// Lỗi (id lạ, 2 lá trùng, câu > 140 ký tự, chiều sai, ô trống, thiếu tab/cột) → in ra và KHÔNG ghi file.
// Chạy: node scripts/sync-tarot-sheet.mjs [--from-dir data/tarot/src/sheet] [--dry]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { parseCsv, buildReadings } = require('../lib/tarot-sheet.js');

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : a), []));
const tabFile = path.join(root, 'data', 'tarot', 'sheet-tabs.json');
const outFile = path.join(root, 'data', 'tarot', 'readings.json');
const { sheetId, tabs: tabConfig } = JSON.parse(fs.readFileSync(tabFile, 'utf8'));
const cardIds = new Set(JSON.parse(fs.readFileSync(path.join(root, 'data', 'tarot', 'cards.json'), 'utf8')).cards.map((c) => c.id));

async function loadTab(name) {
  if (args['from-dir']) {
    const dir = path.resolve(root, args['from-dir'] === true ? 'data/tarot/src/sheet' : args['from-dir']);
    const f = path.join(dir, `${name}.csv`);
    return fs.existsSync(f) ? parseCsv(fs.readFileSync(f, 'utf8')) : null;
  }
  // headers=1: ép đúng 1 hàng tiêu đề. Lưu ý: tên tab sai thì gviz trả về tab ĐẦU TIÊN (không báo lỗi) —
  // buildReadings bắt lỗi này nhờ kiểm tra tên cột.
  const url = `https://docs.google.com/spreadsheets/d/${sheetId}/gviz/tq?tqx=out:csv&headers=1&sheet=${encodeURIComponent(name)}`;
  const res = await fetch(url, { redirect: 'follow' });
  const text = await res.text();
  if (!res.ok || /^\s*<!DOCTYPE|<html/i.test(text)) {
    throw new Error(`Không tải được tab "${name}" (HTTP ${res.status}). Hãy chia sẻ sheet "Bất kỳ ai có đường liên kết: Người xem", ` +
      `hoặc tải CSV từng tab vào data/tarot/src/sheet/ rồi chạy với --from-dir.`);
  }
  return parseCsv(text);
}

const tabs = {};
for (const name of Object.keys(tabConfig)) {
  try {
    const rows = await loadTab(name);
    if (rows) tabs[name] = rows;
  } catch (e) { console.error('✗', e.message); process.exit(1); }
}

const { readings, errors, warnings, summary } = buildReadings(tabs, tabConfig, cardIds);

console.log('Tab                              Loại     Chủ đề     Số dòng');
for (const [name, s] of Object.entries(summary.tabs)) console.log(`${name.padEnd(32)} ${s.type.padEnd(8)} ${(s.topic || '-').padEnd(10)} ${s.rows}`);
const topicsNeeded = ['overview', 'love', 'career', 'finance', 'study'];
const missingTopics = topicsNeeded.filter((t) => !readings.triple[t]?.length);
if (missingTopics.length) console.log(`Chủ đề chưa có tab 3 lá: ${missingTopics.join(', ')}`);
const renamed = Object.keys(readings.cardNames).length;
console.log(`Tên lá lấy theo sheet (hiển thị khớp lời đọc): ${renamed} lá`);
console.log(`Số lá (trong 78) chưa xuất hiện ở tab nào: ${summary.unusedCards.length}${summary.unusedCards.length ? ' → ' + summary.unusedCards.slice(0, 12).join(', ') + (summary.unusedCards.length > 12 ? '…' : '') : ''}`);
for (const w of warnings) console.warn('⚠', w);
if (errors.length) {
  console.error(`\n✗ ${errors.length} lỗi, CHƯA ghi ${path.relative(root, outFile)}:`);
  for (const e of errors.slice(0, 40)) console.error('  -', e);
  if (errors.length > 40) console.error(`  … và ${errors.length - 40} lỗi nữa`);
  process.exit(1);
}
if (args.dry) { console.log('\n(--dry) Dữ liệu hợp lệ, không ghi file.'); process.exit(0); }
fs.writeFileSync(outFile, JSON.stringify({ syncedAt: new Date().toISOString(), sheetId, ...readings }, null, 2) + '\n');
console.log(`\n✓ Đã ghi ${path.relative(root, outFile)}: ${readings.single.length} dòng 1 lá, ` +
  Object.entries(readings.triple).map(([t, l]) => `${t} ${l.length}`).join(', ') + '.');
console.log('Bước tiếp: node scripts/prerender-tarot-tts.mjs (đọc sẵn các câu mới).');
