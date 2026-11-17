// Mô phỏng người xem Tarot qua RPC (không nối TikTok thật).
// Chạy: node scripts/sim-tarot.mjs [--enters 10] [--comments 30] [--gifts 10] [--base http://localhost:3000] [--watch 40]
//   --enters: người xem vào phòng (joinOnEnter → làn vào phòng, phiên 1 lá)
//   --gifts : quà ngẫu nhiên trong các nhánh: hoa (Tổng quan), kem, tim, bắn tim, nước hoa (Tình Yêu), mũ (Hỏi cụ thể), quà lạ
// Nếu server đặt ADMIN_TOKEN thì truyền biến môi trường ADMIN_TOKEN.
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const BASE = args.base || 'http://localhost:3000';
const COMMENTS = Number(args.comments ?? 30);
const ENTERS = Number(args.enters ?? 0);
const GIFTS = Number(args.gifts ?? 10);
const WATCH_SEC = Number(args.watch ?? 0);
const TOKEN = process.env.ADMIN_TOKEN || undefined;

let id = 0;
async function rpc(method, params = {}) {
  const res = await fetch(`${BASE}/rpc`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: { ...params, token: TOKEN } })
  });
  const body = await res.json();
  if (body.error) throw new Error(`${method}: ${body.error.message}`);
  return body.result;
}

const NAMES = ['Minh Anh', 'Hà Linh', 'Bảo', 'Thu Trang', 'Quốc Huy', 'Mai', 'Lan Phương', 'Đức', 'Ngọc', 'Tuấn Kiệt'];
const TEXTS = ['bói giúp mình', 'xem bài với', 'tarot nhé', '+1', 'bói tình yêu', 'tarot công việc'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const GIFT_TYPES = [
  { giftName: 'Rose', coins: 1 }, { giftName: 'Ice Cream Cone', coins: 1 }, { giftName: 'Wink wink', coins: 1 },
  { giftName: 'Finger Heart', coins: 5 }, { giftName: 'Love in Scent', coins: 5 }, { giftName: 'Cap', coins: 99 },
  { giftName: 'Galaxy (quà lạ)', coins: 1000 }
];
const show = (st) => `${st.phase.padEnd(9)} ghế=${st.seat ? `${st.seat.name} [${st.seat.sessionType || '-'}:${st.seat.topicLabel || st.seat.topic}]` : '-'} hàng=[${st.queue.map((e) => `${e.name}${e.lane === 'gift' ? `*${e.stars}⭐` : ''}`).join(', ')}]+${st.queueMore}`;

console.log(`Mô phỏng ${ENTERS} người vào phòng, ${COMMENTS} bình luận, ${GIFTS} quà → ${BASE}`);
for (let i = 0; i < ENTERS; i++) {
  const name = `${pick(NAMES)} ${100 + i}`;
  const r = await rpc('tarot.simulateEnter', { name });
  if (!r.joined) console.log(`  (vào phòng ${name}: ${r.reason})`);
}
for (let i = 0; i < COMMENTS; i++) {
  const name = `${pick(NAMES)} ${i + 1}`;
  const r = await rpc('tarot.simulateComment', { name, text: pick(TEXTS) });
  if (!r.joined) console.log(`  (bỏ qua ${name}: ${r.reason})`);
}
let st = await rpc('tarot.getState');
console.log('Sau bình luận :', show(st));

for (let i = 0; i < GIFTS; i++) {
  const name = Math.random() < 0.5 ? `${pick(NAMES)} ${1 + Math.floor(Math.random() * COMMENTS)}` : `Khách quà ${i + 1}`;
  const g = pick(GIFT_TYPES);
  const r = await rpc('tarot.simulateGift', { name, giftName: g.giftName, coins: g.coins });
  console.log(`  ${g.giftName.padEnd(16)} ${String(g.coins).padStart(4)} xu từ ${name.padEnd(16)} → ${r.ok ? (r.seated ? 'đang ngồi ghế' : `chủ đề ${r.topicLabel || r.topic}, +${r.stars}⭐, vị trí ${r.to + 1}`) : r.reason}`);
}
st = await rpc('tarot.getState');
console.log('Sau quà       :', show(st));

if (WATCH_SEC > 0) {
  console.log(`\nTheo dõi ${WATCH_SEC}s:`);
  let last = '';
  const end = Date.now() + WATCH_SEC * 1000;
  while (Date.now() < end) {
    st = await rpc('tarot.getState');
    const left = st.phaseEndsAt ? ((st.phaseEndsAt - st.serverTime) / 1000).toFixed(1) : '-';
    const line = `${st.phase} ghế=${st.seat ? `${st.seat.name} [${st.seat.sessionType || '-'}:${st.seat.topicLabel || st.seat.topic}]` : '-'} lá=${st.cards.map((c) => (c.positionLabel ? c.positionLabel + ':' : '') + c.name + (c.reversed ? '(ngược)' : '')).join(' + ') || '-'}`;
    if (line !== last) { console.log(`  [${left}s] ${line}`); last = line; }
    await new Promise((r) => setTimeout(r, 500));
  }
}
