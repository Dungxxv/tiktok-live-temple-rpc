# TAROT_SPEC — Chế độ Tarot Live trên nền tiktok-live-temple-rpc

Phiên bản: 0.1 (đặc tả, chưa có code tarot). Ngày: 2026-11-09.
Nơi đặt file: `docs/TAROT_SPEC.md`. Đi kèm: `CLAUDE.md` (gốc repo), `docs/TAROT_ASSET_PROMPTS.md`.

---

## 1. Mục tiêu

Một phòng livestream TikTok dọc (9:16) nơi **nữ tư tế** (nhân vật hoạt hình tự động) bói bài tarot cho người xem:

- Người xem **bình luận** hoặc **tặng quà** để xếp hàng.
- **Một ghế khách**: lần lượt từng người ngồi vào khoảng ~30 giây, nữ tư tế **tự rút bài** và **đọc lời giải bằng TTS**, rồi mời người kế tiếp.
- Quà (hoa, quà khác) **đẩy người xem lên cao hơn** trong hàng chờ.
- Bộ bài đủ **78 lá**; trên màn hình chỉ hiện vài lá (1 đến 3 lá).
- Mọi thứ tự động, không cần người điều khiển giữa buổi live (admin chỉ giám sát).

Không thuộc phạm vi (làm sau hoặc không làm): thanh toán thật, bói cá nhân hóa bằng AI sinh nội dung theo thời gian thực, nhân vật 3D thời gian thực, nhiều ghế khách cùng lúc.

## 2. Trạng thái quyết định

### Đã chốt

| Mục | Quyết định |
|---|---|
| Hình thức | Nữ tư tế là **video MP4** (H.264, không alpha, không âm thanh), 16:9, camera cố định, **mỗi clip 5 giây**, quay về tư thế trung tính ở cuối |
| Phong cách | Tranh minh họa bán thực, bóng mịn, tím và vàng |
| Giao diện | Bàn, lá bài, avatar, tên, hàng chờ, sảnh, đồng hồ = **HTML chồng lên video** |
| Bộ bài | Dữ liệu 78 lá; hiển thị ít lá |
| Giọng đọc | TTS có sẵn của repo (ZeroTTS giọng "maichi"), **render sẵn** lời giải |
| Hàng chờ | Hiển thị **6 chỗ** + dòng "+N người nữa"; hiện tên |
| Quà | Tặng hoa/quà → được **đẩy lên** trong hàng chờ |
| Sảnh | Lưới 6 cột × 4 hàng (24 avatar) ở nửa dưới |
| Hiệu ứng sáng | **Không** vẽ trong video (xào bài, rút bài); thêm bằng hạt HTML |
| Chào tạm biệt | Không cười, đồng cảm, gật đầu |

### Chưa chốt (mặc định đề xuất, được thay bằng cấu hình)

| # | Câu hỏi | Mặc định đề xuất |
|---|---|---|
| D1 | Quà làm người xem **nhảy bậc** hay **cộng điểm**? | Nhảy bậc có trần (mục 5) |
| D2 | **Khóa người kế tiếp** (không ai chen được)? | Có: người đứng đầu bị khóa từ lúc phiên hiện tại còn ≤ 10 giây |
| D3 | Quà lớn nhảy thẳng lên đầu hay có trần? | Có trần: tối đa lên vị trí thứ 2 (sau người bị khóa) |
| D4 | Quà khi **đang ngồi ghế**? | ≥ ngưỡng lớn: thêm **1 lá bài** (tối đa +1 mỗi phiên); không thêm giờ |
| D5 | **Giữ chỗ cho người miễn phí**? | Cứ 4 phiên thì 1 phiên dành cho người xếp hàng miễn phí lâu nhất |
| D6 | **Đọc tên** người xem bằng giọng nói? | Không. Chỉ hiện tên trên màn hình; giọng nói gọi chung ("mời bạn kế tiếp") |
| D7 | Tarot là **route riêng** hay thay cảnh chùa? | Route riêng `/tarot`; chế độ chùa giữ nguyên |
| D8 | "Sảnh" nghĩa là gì? | Người xem đang có mặt/vừa tương tác, chưa xếp hàng (mục 6.3) |
| D9 | Mỗi phiên rút mấy lá? | 1 lá mặc định; 3 lá khi D4 kích hoạt hoặc khi admin bật |

Khi một mục được chốt khác mặc định, cập nhật bảng này và `data/tarot/config.json`.

## 3. Màn hình

Khung chuẩn **1080 × 1920**. Tọa độ dưới đây suy từ bản phác 1125×2000 nhân 0,96; coi là **giá trị khởi điểm, hiệu chuẩn lại** bằng `?calibrate=1` và ảnh chụp thử trên TikTok thật. Lưu trong `data/tarot/layout.json`, không hard-code.

```
y=0     ┌────────────────────────────────────────────┐
        │ Thanh trên: tên phòng, đồng hồ, trạng thái │  (0–220)
y≈220   │                         "Lượt tiếp theo"   │
        │ ┌──────────────────┐     ┌──────────┐      │
        │ │ NỮ TƯ TẾ (video) │     │ slot 1   │      │
y≈485   │ └──────────────────┘     │ slot 2   │      │
        │ ┌──────────────────────┐ │ ...      │      │
        │ │  BÀN TAROT (HTML)    │ │ slot 6   │      │
        │ │  chồng bài | lá bài  │ │ +N người │      │
y≈989   │ └──────────────────────┘ └──────────┘      │
        │        ( avatar khách )  vòng đồng hồ 30s  │
y≈1133  │          tên khách                         │
y≈1311  ├────────────────────────────────────────────┤
        │ Sảnh                                       │
        │ ○ ○   ○ ○   ○ ○   (6 cột × 4 hàng)         │
y=1920  └────────────────────────────────────────────┘
```

Giá trị khởi điểm (px, khung 1080×1920):

| Phần tử | Giá trị |
|---|---|
| Video nữ tư tế | Rộng 1080, cao 607 (16:9), `videoTopY ≈ -35`; làm mờ viền trái/phải/trên bằng `mask-image` vì rìa video là rèm tối |
| Mép trên bàn | `tableTopY ≈ videoTopY + 520` (≈ 485); điều chỉnh sao cho tay lúc `draw_card` vẫn thấy trước khi chạm bàn |
| Bàn | x 77–759, y 485–989 |
| Avatar khách | tâm (404, 1006), bán kính ≈ 88; tên bên dưới y ≈ 1133 |
| Cột hàng chờ | nhãn y ≈ 218; 6 slot x 897–1022, y 274–1243 (bước ≈ 174) |
| Sảnh | từ y ≈ 1311; tâm cột x ≈ 104, 252, 423, 582, 780, 938; tâm hàng y ≈ 1403, 1573, 1717, 1861; avatar ≈ 84 px |

**Cảnh báo giao diện TikTok:** trong live, TikTok phủ khung bình luận (dưới trái), các nút (phải), thông tin chủ phòng (trên). Sảnh ở đáy và cột hàng chờ sát mép phải **có thể bị che**. Chưa kiểm chứng giao diện hiện tại. Việc bắt buộc ở M0: live thử riêng tư, chụp màn hình, đặt lớp hướng dẫn "vùng bị che" vào `?calibrate=1`, rồi chỉnh `layout.json`.

## 4. Pha của phiên và đồng hồ

### 4.1 Pha (server giữ)

```
IDLE            không ai xếp hàng → clip idle_wait; định kỳ invite
  │ (có người trong hàng)
CALLING         clip call_name (5s); khách chuyển từ hàng chờ vào ghế
  │
SHUFFLING       clip shuffle (5s)             [bật/tắt bằng config]
  │
DRAWING         clip draw_card (5s); cue "touch" → lá bài bật ra từ chồng bài (HTML) → bay → lật
  │
REVEALING       clip reveal (5s); cue "point" → làm nổi bật lá bài, hiện tên + từ khóa
  │
READING         talk_a/talk_b xen kẽ lặp; phát TTS lời giải; kết thúc khi TTS xong + 1s đệm
  │
FAREWELL        clip farewell (5s); khách rời ghế
  │ (còn người) → CALLING     (hết người) → IDLE
```

Mọi pha chuyển qua `react_small`/`react_big` (quà) là **hiệu ứng chèn**, không thay đổi pha (mục 4.3).

### 4.2 Thời lượng (mặc định, đều cấu hình được)

| Pha | Giây |
|---|---|
| CALLING | 5 |
| SHUFFLING | 5 (có thể tắt) |
| DRAWING | 5 |
| REVEALING | 5 |
| READING | tối thiểu 8, thường 10–14 (theo TTS) |
| FAREWELL | 5 |
| **Tổng ghế** | **≈ 33–39** |

Mục tiêu "~30 giây" đạt được bằng cách **tắt SHUFFLING** hoặc rút ngắn READING; cấu hình `sessionTargetSec` và `skipPhases`. Các clip dài đúng 5 s nên **không cắt ngang**; nếu cần ngắn hơn thì tạo clip 3 s riêng.

### 4.3 Chèn phản ứng quà

Khi có quà trong lúc đang có phiên: đưa `react_small` hoặc `react_big` vào **hàng đợi chèn**, chỉ phát tại **điểm an toàn** (khi clip hiện tại kết thúc hoặc trong pha READING giữa hai clip talk). Không chèn lúc `draw_card` đang chạy (làm lệch cue). Ưu tiên: rocket-lớn > nhỏ; gộp quà liên tiếp (dùng `GiftStreakCoalescer`).

### 4.4 Trạng thái do server phát (WebSocket)

```json
{
  "method": "tarot.state",
  "params": {
    "version": 128,
    "serverTime": 1731139200000,
    "phase": "DRAWING",
    "phaseStartedAt": 1731139190000,
    "phaseEndsAt": 1731139195000,
    "seat": { "viewerId": "u123", "name": "Minh Anh", "avatar": "https://...", "since": 1731139180000, "topic": "general", "cardsPlanned": 1 },
    "cards": [ { "id": "major-00", "name": "Chàng Khờ", "reversed": false, "revealed": false } ],
    "reading": { "lines": ["..."], "ttsUrls": ["/tts-cache/....wav"], "totalSec": 11.4 },
    "queue": [ { "viewerId": "u9", "name": "Hà Linh", "avatar": "...", "lane": "gift", "boost": 3, "joinedAt": 1731139000000, "locked": true } ],
    "queueMore": 12,
    "lobby": [ { "viewerId": "u55", "name": "Bảo", "avatar": "..." } ],
    "config": { "sessionTargetSec": 33 }
  }
}
```

Client nhận `tarot.state` đầy đủ khi vừa kết nối và mỗi khi đổi pha/hàng chờ; **tự tính** thời gian còn lại từ `phaseEndsAt - (serverTime offset)`. Có số `version` để bỏ gói cũ. Client chỉ phát clip tương ứng pha; mất kết nối thì giữ clip lặp `idle_wait` và hiện "đang kết nối lại".

## 5. Hàng chờ và cơ chế quà

### 5.1 Vào hàng

- **Bình luận**: nếu chứa từ khóa (cấu hình, ví dụ `bói`, `tarot`, `xem bài`, `+1`) và người đó chưa có trong hàng/ghế → vào **làn miễn phí** (free), cuối hàng. Chủ đề tùy chọn đọc từ bình luận (`tình yêu`, `công việc`, `tiền`...; mặc định `general`).
- **Quà**: người chưa trong hàng tặng quà → vào **làn ưu tiên** (gift) ở vị trí tính theo mức quà.
- Mỗi người **tối đa 1 chỗ** (hàng + ghế). Vừa bói xong phải đợi `rejoinCooldownSec` (mặc định 600 s) mới được vào miễn phí lần nữa; quà vẫn được vào.
- Hàng chờ tối đa `queueMax` (mặc định 200); người ngoài giới hạn thấy "hàng đầy" (log, không phản hồi trên màn hình).
- Dùng `sanitizeUserName` hiện có cho tên; cắt tối đa 14 ký tự khi hiển thị.

### 5.2 Đẩy lên bằng quà (mặc định D1–D5)

Mức quà tính theo **kim cương/xu** (lấy từ `normalizeGiftPayload`, cộng dồn bằng `getGiftComboDelta`, không đếm lại khung tích lũy). Bảng minh họa (cấu hình ở `data/tarot/config.json`):

| Mức | Điều kiện (xu) | Hiệu lực khi đang trong hàng |
|---|---|---|
| Nhỏ (hoa) | 1–9 | +1 bậc |
| Vừa | 10–49 | +3 bậc |
| Lớn | 50–99 | +5 bậc |
| Rất lớn | ≥ 100 | lên vị trí **thứ 2** (sau người bị khóa); khi đang ngồi ghế: +1 lá |

Quy tắc:
- **Trần mỗi lượt quà**: `maxJumpPerGift` = 5 bậc (trừ mức Rất lớn đã nêu).
- Nhiều quà liên tiếp **cộng dồn** nhưng tổng nhảy trong 60 s không quá `maxJumpPer60s` (mặc định 10).
- **Người bị khóa** (đứng đầu, D2) không bị vượt.
- **Giữ chỗ miễn phí** (D5): đếm số phiên liên tiếp của làn gift; sau 3 phiên, phiên thứ 4 phải lấy người ở **làn miễn phí lâu nhất**, trừ khi làn miễn phí rỗng.
- Quà từ người chưa trong hàng: vào hàng rồi áp dụng quy tắc nhảy bậc tương ứng.
- Mọi thay đổi vị trí ghi vào log, phát `tarot.queue` có lý do (`reason: "gift:rose"`).

### 5.3 Giao diện cho người vào hàng

Slot đầu có huy hiệu "tiếp theo". Slot vừa được đẩy lên có hiệu ứng nổi/lóe nhẹ và dấu "↑ +3" trong 2 giây.

## 6. Giao diện (HTML)

### 6.1 Hàng chờ (cột phải)
6 slot: avatar tròn + tên. Dòng cuối "+N người nữa" nếu còn. Slot đầu nổi bật. Dùng `<img referrerpolicy="no-referrer">`; nếu ảnh lỗi thì hiện vòng chữ cái đầu tên (tránh phụ thuộc CORS/WebGL).

### 6.2 Ghế khách
Avatar lớn ở mép dưới bàn + tên + vòng đếm ngược (SVG, theo `phaseEndsAt` của cả phiên hoặc theo pha, tùy cấu hình). Hiệu ứng vào/ra: trượt + mờ 300 ms.

### 6.3 Sảnh (D8, giả định)
Người xem **đang có mặt hoặc vừa tương tác** (bình luận, thích, vào phòng) trong `lobbyWindowSec` (mặc định 300), **chưa** trong hàng/ghế, tối đa 24, mới nhất trước, loại trùng. Mỗi ô: avatar + tên ngắn (≤ 8 ký tự). Mục đích: không khí phòng đông, và nhắc người xem "bình luận để vào hàng". Người trong sảnh bình luận từ khóa → bay vào hàng chờ (hoạt ảnh ngắn).

### 6.4 Bàn và lá bài
- Bàn: ảnh nền bàn (HTML/CSS hoặc PNG) có **mép trên** hơi tối/bóng để nối với video.
- Chồng bài mặt sau ở điểm cố định `deckAnchor` (cạnh trái bàn); 1 đến 3 vị trí trải bài ở giữa bàn.
- Lá bài là DOM; lật bằng CSS 3D (`transform-style: preserve-3d`, `rotateY`); mặt úp → mặt ngửa 600 ms; bài ngược (reversed) hiển thị xoay 180°.
- Cue `touch` của `draw_card`: lá bài **bật ra từ `deckAnchor`** (bay cong đến vị trí trải 500 ms), hạt vàng nhẹ.
- Cue `point` của `reveal`: lá bài sáng viền, hiện nhãn tên + 2–3 từ khóa.
- MVP: mặt bài vẽ bằng CSS/SVG (số, tên, biểu tượng đơn giản); tranh gốc thay sau (xem ASSET_PROMPTS).

### 6.5 Lớp phụ
- Phụ đề lời giải (tùy chọn): hiện từng câu theo thời lượng TTS ở phần trên (vùng đen y 0–220).
- Dòng chân nhỏ: "Chỉ mang tính giải trí" luôn hiện.
- Hạt: dùng `public/js/particles.js` (30 FPS, sprite offscreen); đăng ký hiệu ứng mới qua cơ chế sẵn có hoặc lớp canvas riêng nếu cần, không sửa hành vi chùa.

## 7. Trình phát clip (`public/js/tarot/clip-player.js`)

Yêu cầu:
- Hai phần tử `<video>` xếp chồng (A/B), `muted`, `playsinline`, `preload="auto"`, không điều khiển; **tối đa 2 video nạp cùng lúc**.
- `play(name, opts)`: nạp clip kế tiếp ở video chưa hiển thị, đợi `canplay` + khung đầu, rồi **crossfade 150–250 ms**.
- Clip `loop: true` dùng `loop` gốc; clip `loop: false` tự quay về `base` (`idle_wait`) khi kết thúc, trừ khi có yêu cầu tiếp theo trong hàng đợi.
- **Cue**: dùng `video.requestVideoFrameCallback` (dự phòng `timeupdate`) để bắn sự kiện `cue` (ví dụ `touch`, `point`) khi `mediaTime ≥ cue`; mỗi lần phát chỉ bắn một lần.
- **Talk loop**: trong READING phát `talk_a` → `talk_b` → `talk_a`... mỗi lần `ended` (hoặc lặp ở điểm khung đầu = cuối); dừng khi TTS xong, quay về `idle_wait`.
- Hàng đợi chèn phản ứng quà (mục 4.3) và điểm an toàn.
- Khi tab ẩn hoặc nền, OBS có thể tạm dừng video; nếu `paused` bất ngờ thì `play()` lại.
- Lỗi nạp clip: ghi log, giữ clip hiện tại, không đen màn hình. Có ảnh tĩnh `priestess_base.png` làm dự phòng (poster).
- Đo: số khung bị bỏ, thời gian từ lệnh `play` tới khung đầu (hiện ở `?stats=1`).

Manifest và tên clip: xem `docs/TAROT_ASSET_PROMPTS.md`, mục 4.

## 8. Bộ bài, lời giải, TTS

### 8.1 Dữ liệu (`data/tarot/cards.json`)

```json
{
  "id": "major-00",
  "arcana": "major",
  "suit": null,
  "number": 0,
  "name_vi": "Chàng Khờ",
  "name_en": "The Fool",
  "keywords_up": ["khởi đầu mới", "tự do", "tin tưởng"],
  "keywords_rev": ["liều lĩnh", "thiếu cân nhắc"],
  "readings": {
    "general": {
      "up":  ["Câu 1 (≤ 140 ký tự).", "Câu 2.", "Câu 3."],
      "rev": ["..."]
    },
    "love":   { "up": ["..."], "rev": ["..."] },
    "career": { "up": ["..."], "rev": ["..."] },
    "money":  { "up": ["..."], "rev": ["..."] }
  }
}
```

- 78 lá: 22 Ẩn chính + 56 Ẩn phụ (4 bộ × 14).
- Giai đoạn đầu chỉ cần chủ đề `general` (78 × 2 chiều = 156 đoạn). Thêm `love`/`career`/`money` ở giai đoạn sau (78 × 2 × 3 = 468 đoạn).
- Mỗi đoạn gồm **2 đến 3 câu ngắn, mỗi câu ≤ 140 ký tự** (TTS worker cắt ở 160). Một đoạn đọc xong trong ~8–14 s.
- Văn phong: ấm, nhẹ, gợi mở, mang tính suy ngẫm. Câu cuối của đoạn là lời khuyên nhẹ, không phải dự đoán.
- Nội dung do Claude Code soạn thảo theo lô, có **bước duyệt của người** (mục 10) trước khi dùng thật.

### 8.2 Rút bài
`lib/tarot-deck.js`: `draw(n, { rng, exclude })` — xáo bằng Fisher–Yates với `rng` tiêm vào (test dùng rng cố định). Mỗi lá có `reversed` ngẫu nhiên (xác suất cấu hình, mặc định 0,3). Không trùng lá với 3 phiên gần nhất khi bộ còn đủ lá.

### 8.3 TTS
- Dùng `ZeroTTSManager` có sẵn (giọng `maichi`). Mỗi câu của lời giải được **render sẵn** bằng script `scripts/prerender-tarot-tts.mjs`; WAV nằm ở `data/tts-cache/` (khóa SHA1 của "v3::voice::text", đúng như worker hiện tại). Khi chạy live chỉ tra cache; nếu thiếu thì render theo yêu cầu và ghi log cảnh báo.
- Thời lượng đọc lấy từ `durationSec` do worker trả về; server cộng các câu để đặt `phaseEndsAt` của READING.
- Ưu tiên: đo thời gian render thật trên máy mục tiêu ở M5 trước khi chọn số chủ đề.
- Câu mời, câu chào ("Mời bạn kế tiếp", "Cảm ơn bạn đã ghé…") cũng render sẵn; **không** đọc tên người xem (D6).
- Âm lượng: dùng cơ chế duck hiện có trong `audio.js`; nhạc nền (nếu có) tự hạ khi TTS phát.

## 9. Kiến trúc mã

### 9.1 File mới

```
lib/tarot-queue.js          Hàng chờ (hàm thuần): join, boost, lock, popNext, fairness
lib/tarot-session.js        Máy trạng thái phiên (đồng hồ tiêm vào), phát sự kiện
lib/tarot-deck.js           Nạp bộ bài, rút bài, chọn lời giải
lib/tarot-rpc.js            Handler tarot.* (đăng ký vào handleRpcCall)
lib/tarot-config.js         Nạp/kiểm tra data/tarot/config.json
data/tarot/cards.json       78 lá
data/tarot/config.json      Cấu hình (mục 5, 4.2, từ khóa)
data/tarot/layout.json      Tọa độ giao diện
public/tarot.html           Trang live
public/css/tarot.css
public/js/tarot/main.js           Khởi động, nối WebSocket
public/js/tarot/state-store.js    Giữ trạng thái, đồng bộ giờ server
public/js/tarot/clip-player.js    Mục 7
public/js/tarot/ui-queue.js       Hàng chờ
public/js/tarot/ui-seat.js        Ghế khách + đồng hồ
public/js/tarot/ui-lobby.js       Sảnh
public/js/tarot/ui-cards.js       Bàn + lá bài
public/js/tarot/calibrate.js      ?calibrate=1
public/assets/tarot/{base,clips,cards,ui}/
scripts/prerender-tarot-tts.mjs
scripts/sim-tarot.mjs       Mô phỏng người xem (comment, quà) qua RPC
tests/tarot-*.test.js
```

### 9.2 Chỗ sửa nhỏ trong `server.js`
- `import` các module tarot.
- Route `GET /tarot` → `public/tarot.html` (cùng cơ chế phục vụ tĩnh hiện có).
- Trong `handleRpcCall` (khoảng dòng 1089): nhánh `if (method.startsWith('tarot.')) return tarotRpc(method, params, ctx)`.
- Trong handler `CHAT` và `GIFT` của `connectTikTokLive` (khoảng dòng 844): nếu `APP_MODE` có `tarot`, gọi `tarot.onComment(...)`/`tarot.onGift(...)` (song song hoặc thay cho nhánh chùa, theo cờ).
- Biến môi trường: `APP_MODE=temple|tarot|both` (mặc định `temple`).

### 9.3 RPC (JSON-RPC 2.0, `POST /rpc` hoặc `ws /ws`)

| Method | Tác dụng |
|---|---|
| `tarot.getState` | Trả snapshot `tarot.state` |
| `tarot.join` `{viewerId, name, avatar, topic}` | Vào hàng (làn free) |
| `tarot.boost` `{viewerId, coins, giftName}` | Áp dụng quà (làn gift/nhảy bậc) |
| `tarot.skip` | (admin) kết thúc phiên hiện tại |
| `tarot.remove` `{viewerId}` | (admin) xóa khỏi hàng |
| `tarot.setConfig` | (admin) đổi cấu hình trong phiên |
| `tarot.start` / `tarot.stop` | Bật/tắt chế độ |
| `tarot.simulateComment` `{name, text}` | Giả lập bình luận |
| `tarot.simulateGift` `{name, giftName, coins, repeat}` | Giả lập quà |

Thông báo WS: `tarot.state` (đầy đủ), `tarot.queue` (kèm `reason`), `tarot.phase`, `tarot.cue` (tùy chọn, nếu server điều phối cue thay vì client).

### 9.4 Đồng bộ clip và cue
Server chỉ quyết **pha và thời điểm bắt đầu/kết thúc**. Client chọn clip theo pha, bắn `cue` cục bộ từ video. Lá bài hiện theo cue cục bộ để khớp tay; nếu client bị trễ (mở sau), client "bắt kịp" bằng cách nhảy tới trạng thái cuối của pha (lá bài đã ở vị trí, không phát hoạt ảnh).

### 9.5 Khôi phục
Trạng thái hàng chờ/ghế lưu vào `data/tarot-state.json` (gitignore) mỗi thay đổi; khi khởi động lại: nạp hàng chờ, đặt pha về `IDLE`, bỏ phiên dở dang (người đó được xếp lại đầu hàng).

## 10. An toàn nội dung và tuân thủ

- **Nội dung bói**: chỉ giải trí. Không khẳng định hoặc dự đoán chắc chắn về: bệnh tật/sức khỏe, thai sản, cái chết, pháp lý, đầu tư/tài chính, hôn nhân đổ vỡ cụ thể. Lời giải ở dạng suy ngẫm, gợi ý, không ra quyết định hộ. Tránh nội dung đáng sợ, nhắm vào cá nhân. Bước duyệt: một người đọc toàn bộ `cards.json` trước khi dùng live; script kiểm tra độ dài câu (≤ 140) và danh sách từ cấm.
- **Dòng "Chỉ mang tính giải trí"** luôn hiện; thỉnh thoảng nói trong lời mời.
- **Tên và bình luận người xem**: `sanitizeUserName`, giới hạn độ dài, lọc từ xấu (`BAD_WORDS_RE` có sẵn), không hiển thị link/số điện thoại. Không đọc to tên (D6).
- **Quy định TikTok** (cần tự kiểm tra bản hiện hành trước khi live thật): quy tắc về nội dung bói toán, về quà tặng ảo và việc khuyến khích tặng quà để được ưu tiên, về dùng API không chính thức (`tiktok-live-connector`). Chưa kiểm chứng ở đây.
- **Bản quyền**: ảnh lá bài là thiết kế gốc (không sao chép bộ bài có bản quyền); nhạc/âm thanh phải có giấy phép; video AI không có âm thanh (đã gặp bị chặn xem vì âm thanh sinh ra).
- **Giấy phép công cụ AI**: kiểm tra điều khoản dùng thương mại của công cụ tạo ảnh/video đã dùng.
- **Bảo mật máy chủ**: `/rpc`, `/admin`, `/ws` hiện **không xác thực** và `cors()` mở. Trước khi có đường hầm công khai: thêm `ADMIN_TOKEN` (header hoặc query) cho mọi method `tarot.*` quản trị và cho `/admin`; hạn chế origin; giới hạn tốc độ (rate-limit) cho `tarot.join`/`tarot.boost`; chỉ nhận `simulate*` khi `NODE_ENV !== 'production'` hoặc có token.
- `tts_worker.py` có đường dẫn model cứng; đưa ra biến môi trường (`ZEROTTS_MODEL_DIR`).

## 11. Kiểm thử

### 11.1 Test đơn vị (`bun test`)
- `tarot-queue`: vào hàng, một chỗ mỗi người, nhảy bậc đúng bảng, trần mỗi quà, trần 60 s, khóa người đầu, giữ chỗ miễn phí (phiên thứ 4), cooldown vào lại, `queueMax`.
- `tarot-session` (đồng hồ giả): chuỗi pha và thời lượng, bỏ `SHUFFLING`, READING theo tổng TTS, chèn phản ứng quà không phá cue, hết người → `IDLE`, khôi phục sau khởi động lại.
- `tarot-deck`: đủ 78 lá, không trùng khi rút nhiều lá, rng cố định cho kết quả cố định, dữ liệu hợp lệ (câu ≤ 140 ký tự, đủ `up/rev`).
- `tarot-rpc`: kiểm tra tham số, từ chối khi thiếu token ở chế độ production.

### 11.2 Thủ công
1. `?calibrate=1`: lớp hướng dẫn, vùng TikTok bị che, kéo-thả chỉnh tọa độ (xuất `layout.json`).
2. `scripts/sim-tarot.mjs`: 30 người bình luận, 10 người tặng quà ngẫu nhiên; kiểm tra thứ tự hàng chờ.
3. Phát clip: lặp `idle_wait` 5 lần liền, chuyển `idle_wait → call_name → ... → farewell → idle_wait`, quan sát giật khung hình; theo dõi CPU/GPU.
4. OBS: Browser Source 1080×1920 hoặc 720×1280; kiểm tra phát video MP4 không alpha, âm TTS, chạy liên tục **2 giờ** (soak) để tìm rò bộ nhớ.
5. TikTok LIVE Studio hoặc OBS đẩy luồng: kiểm tra trên điện thoại ở một tài khoản khác.

(Bộ thử WebM alpha trước đây **không còn cần** vì đã chuyển sang MP4 không alpha.)

## 12. Lộ trình (mỗi mốc có tiêu chí nghiệm thu)

**M0 — Khung và hiệu chuẩn**
- Route `/tarot`, trang 1080×1920 co theo cửa sổ, bố cục placeholder theo mục 3, `?calibrate=1`, `layout.json`.
- Nghiệm thu: mở `/tarot` thấy bố cục khớp bản phác; có lớp hướng dẫn vùng TikTok; `?obs=1` ẩn mọi thứ thừa.

**M1 — Engine hàng chờ**
- `lib/tarot-queue.js` + test đầy đủ mục 11.1.
- Nghiệm thu: mọi test hàng chờ qua; không phụ thuộc mạng/đồng hồ thật.

**M2 — Phiên, RPC, mô phỏng**
- `lib/tarot-session.js`, `lib/tarot-rpc.js`, `tarot.state` qua WS, `scripts/sim-tarot.mjs`, lưu/khôi phục trạng thái.
- Nghiệm thu: chạy mô phỏng, quan sát JSON trạng thái chuyển pha đúng thời gian; khởi động lại không mất hàng chờ.

**M3 — Giao diện gắn dữ liệu**
- Hàng chờ, ghế khách, vòng đếm ngược, sảnh, bàn trống; ảnh tĩnh `priestess_base.png` thay video.
- Nghiệm thu: mô phỏng đẩy/đổi người, UI cập nhật mượt; avatar lỗi có dự phòng.

**M4 — Trình phát clip**
- `clip-player.js`, manifest, cue, crossfade, talk loop, chèn phản ứng quà; dùng clip thật khi có.
- Nghiệm thu: lặp `idle_wait` 5 lần không giật; cue lệch ≤ 100 ms; không quá 2 video nạp; CPU hợp lý trên máy mục tiêu.

**M5 — Bộ bài, lời giải, TTS**
- `cards.json` (78 lá, chủ đề `general`), `tarot-deck`, script tiền render TTS, READING theo tổng thời lượng.
- Nghiệm thu: rút bài và đọc xong trong khoảng thời gian dự kiến; thiếu cache tự render và ghi log.

**M6 — Quà thật và hiệu ứng**
- Nối CHAT/GIFT thật (qua `normalizeGiftPayload`/`getGiftComboDelta`), phản ứng quà, hạt vàng tại cue, hiệu ứng "↑ +N".
- Nghiệm thu: thử với live riêng; quà cộng dồn đúng; không nhảy bậc vượt trần.

**M7 — Gia cố**
- Token quản trị, rate-limit, chặn `simulate*` ở production, duyệt nội dung, soak 2 giờ, tài liệu chạy trên máy mới (biến môi trường cho model TTS).
- Nghiệm thu: không có `/rpc` quản trị nào chạy được khi thiếu token; soak không rò bộ nhớ đáng kể.

## 13. Rủi ro và việc cần xác minh

1. **Giao diện TikTok che bố cục** (sảnh, cột phải): kiểm tra trên điện thoại thật (M0).
2. **Chỗ nối clip** (giật, đổi mặt, nét mặt khác giữa `farewell` và `idle_wait`): thử sớm (M4).
3. **Clip AI không đồng nhất** (mặt, tay, ánh sáng) giữa các lần tạo: dùng chung ảnh gốc làm khung đầu/cuối; tạo lại clip lỗi.
4. **Tay lệch chồng bài**: cue `touch` + `deckAnchor` phải hiệu chuẩn bằng clip thật.
5. **Tốc độ TTS** chưa đo: đo ở M5.
6. **Giới hạn công cụ video** (điểm miễn phí hằng ngày, chặn xem do bản quyền âm thanh): chuẩn bị phương án dự phòng (đổi công cụ/mô hình).
7. **API TikTok không chính thức** có thể ngắt hoặc đổi: có chế độ mô phỏng để demo không phụ thuộc.
8. **Nội dung bói** có thể gây hiểu lầm: duyệt thủ công, dòng "giải trí".
9. **Kích thước video** (11 clip × vài MB): kiểm tra tải trong OBS, xem có nên hạ độ phân giải.

## 14. Từ điển

- **Phiên (session)**: một lượt người xem ngồi ghế, từ CALLING đến hết FAREWELL.
- **Làn (lane)**: `free` (bình luận) và `gift` (quà).
- **Cue**: mốc thời gian trong clip (giây) để đồng bộ HTML (`touch`, `point`).
- **Tư thế trung tính**: khung đầu/cuối mọi clip (hai tay mở ở ngực, mặt cười ấm).
