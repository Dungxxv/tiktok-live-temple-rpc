// So quà THẬT đã nhận từ live (server giữ trong tarot.giftsSeen) với 6 quà trong data/tarot/gift-topics.json rồi điền giftId còn thiếu.
// Khớp theo TÊN chính xác (không phân biệt hoa thường). Mặc định chỉ IN những gì sẽ đổi; thêm --write để ghi vào file.
// Quà không khớp quà nào, hoặc có mã khác mã đã lưu, chỉ được cảnh báo, không tự sửa.
// Cần server Tarot đang chạy. Nếu server đặt ADMIN_TOKEN thì truyền biến môi trường ADMIN_TOKEN (chỉ đọc nên thường không cần).
// File gift-topics.json chỉ được server đọc khi khởi động: ghi xong, mã có hiệu lực ở lần khởi động tới (khớp theo tên vẫn chạy trong lúc đó).
// Chạy: node scripts/apply-seen-gifts.mjs [--write] [--base http://localhost:3000]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const BASE = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'http://localhost:3000';
const file = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data', 'tarot', 'gift-topics.json');
const key = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

const res = await fetch(`${BASE}/rpc`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tarot.giftsSeen', params: {} }) });
const body = await res.json();
if (body.error) { console.error('Lỗi:', body.error.message); process.exit(1); }
const real = body.result.gifts.filter((g) => g.giftId !== null && g.giftId !== undefined && g.giftId !== '');
const cfg = JSON.parse(fs.readFileSync(file, 'utf8'));
console.log(`Quà thật đã nhận: ${real.length} loại (bỏ qua ${body.result.gifts.length - real.length} loại giả lập).`);

let changes = 0;
for (const g of real) {
  const slot = cfg.gifts.find((s) => key(s.name) === key(g.giftName));
  if (!slot) { console.log(`  ✗ “${g.giftName}” (giftId ${g.giftId}, ${g.coins} xu): không khớp quà nào trong cột quà → chủ đề mặc định.`); continue; }
  const idNow = slot.giftId === null || slot.giftId === undefined ? null : String(slot.giftId);
  if (idNow === null) {
    console.log(`  + slot ${slot.slot} ${slot.name}: điền giftId ${g.giftId}` + (slot.coins !== g.coins ? `, số xu ${slot.coins} → ${g.coins}` : ''));
    slot.giftId = Number.isFinite(Number(g.giftId)) ? Number(g.giftId) : g.giftId;
    if (slot.coins !== g.coins) slot.coins = g.coins;
    changes++;
  } else if (idNow !== String(g.giftId)) {
    console.log(`  ⚠ slot ${slot.slot} ${slot.name}: file đang ghi giftId ${idNow} nhưng live gửi ${g.giftId} — KHÔNG tự sửa, hãy kiểm tra.`);
  } else console.log(`  ✓ slot ${slot.slot} ${slot.name}: giftId ${idNow} đã đúng.`);
}
const missing = cfg.gifts.filter((s) => s.giftId === null || s.giftId === undefined);
if (missing.length) console.log(`Còn thiếu giftId: ${missing.map((s) => `slot ${s.slot} ${s.name}`).join(', ')} (chờ có người tặng thật).`);
if (!changes) { console.log('Không có gì để ghi.'); process.exit(0); }
if (!WRITE) { console.log(`\nChưa ghi file. Chạy lại với --write để ghi ${changes} thay đổi vào ${path.relative(process.cwd(), file)}.`); process.exit(0); }
fs.writeFileSync(file, JSON.stringify(cfg, null, 2) + '\n');
console.log(`\nĐã ghi ${changes} thay đổi vào ${file}`);
