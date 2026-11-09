# CLAUDE.md — Dự án Tarot Live (nền: tiktok-live-temple-rpc)

Repo này vốn là "Chùa Linh Ứng" (Bun.js + Express + ws + tiktok-live-connector + ZeroTTS). Ta thêm **chế độ Tarot** chạy song song, KHÔNG phá chế độ chùa.

**Đọc trước khi làm bất cứ việc gì:** `docs/TAROT_SPEC.md` (đặc tả đầy đủ) và `docs/TAROT_ASSET_PROMPTS.md` (prompt tạo ảnh, video).

## Chạy dự án

```bash
bun install
DISABLE_TIKTOK_AUTOCONNECT=1 DISABLE_ZEROTTS_WORKER=1 bun run server.js   # dev nhẹ, không nối TikTok, không nạp TTS
bun test                                                                   # chạy test
# Màn live chùa: http://localhost:3000/   Admin: /admin   RPC: POST /rpc, ws /ws
# Màn tarot (sẽ tạo): http://localhost:3000/tarot   OBS sạch: /tarot?obs=1   Hiệu chuẩn: /tarot?calibrate=1
```

## Quy tắc làm việc

1. **Không sửa** `public/js/temple-*.js`, `three-*.js`, `character-state-machine.js` và cảnh chùa. Mọi thứ của tarot nằm ở file mới: `lib/tarot-*.js`, `public/tarot.html`, `public/js/tarot/*`, `public/css/tarot.css`, `data/tarot/*`.
2. Thay đổi trong `server.js` phải **nhỏ nhất có thể** (chỉ nối: import handler, thêm route `/tarot`, thêm nhánh `tarot.*` trong `handleRpcCall`, gọi hook trong handler CHAT/GIFT). Logic đặt trong `lib/`.
3. **Server là nguồn sự thật.** Hàng chờ, pha phiên, bộ đếm giờ đều ở server; client chỉ vẽ theo `phase` + `phaseStartedAt`. Client không tự quyết ai là người tiếp theo.
4. Logic hàng chờ và máy trạng thái phiên phải là **hàm thuần có thể test** (nhận đồng hồ giả, không gọi mạng). Viết test bằng `bun test` cho từng tính năng.
5. Tái sử dụng: `lib/tiktok-gift-payload.cjs` (`normalizeGiftPayload`, `getGiftComboDelta`), `ZeroTTSManager` trong `server.js`, `sanitizeUserName`, `broadcastNotification`. **Đọc code hiện có trước khi viết lại.**
6. Video của nữ tư tế là **MP4 H.264 không alpha, không âm thanh**, camera cố định, clip 5 giây. Bàn, lá bài, avatar, hàng chờ, sảnh, đồng hồ đều là HTML chồng lên video. Không dùng Three.js cho nhân vật.
7. Ngôn ngữ giao diện, log người dùng, chú thích nội dung: **tiếng Việt**. Tên biến, tên hàm, tên file: tiếng Anh.
8. Không commit: `data/merit-state.json`, `data/tts-cache/`, khóa, token, file video lớn (đặt vào `public/assets/tarot/clips/`, thêm vào `.gitignore` nếu quá nặng và ghi chú cách tải).
9. Không nối TikTok thật khi chạy test. Dùng RPC mô phỏng (`tarot.simulateComment`, `tarot.simulateGift`).
10. Nội dung bói: chỉ giải trí, giọng nhẹ nhàng, không khẳng định về sức khỏe, pháp lý, tài chính, tính mạng, thai sản. Xem mục "An toàn nội dung" trong spec.

## Thứ tự làm (chi tiết trong spec, mục Lộ trình)

M0 khung + hiệu chuẩn → M1 engine hàng chờ + test → M2 máy trạng thái phiên + RPC + mô phỏng → M3 giao diện gắn dữ liệu → M4 trình phát clip → M5 bộ bài + lời giải + TTS → M6 quà tặng thật + hiệu ứng → M7 gia cố (xác thực, soak test).

Làm xong từng mốc thì dừng, chạy test, báo kết quả, rồi mới sang mốc kế.

## Lưu ý đã biết về repo gốc

- `server.js` dùng `cors()` mở và **không có xác thực** cho `/rpc`, `/admin`, `/ws`. Trước khi đưa ra Internet (tunnel, VPS) phải thêm token (M7).
- `tts_worker.py` có đường dẫn cứng tới thư mục model trên máy tác giả cũ; cần cấu hình qua biến môi trường khi chạy trên máy khác.
- TTS worker cắt văn bản ở 160 ký tự; lời giải phải chia câu ngắn.
