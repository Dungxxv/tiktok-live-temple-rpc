# Bộ clip phù thủy (clips-witch)

6 clip MP4 H.264, 1124×2000 (dọc), 30 fps, không âm thanh, không alpha. Mọi clip **bắt đầu và kết thúc ở cùng một tư thế**, các chuyển động nền (thở, tóc, đồ treo, sao) có chu kỳ 3 giây, nên chuyển clip ở biên clip không bị giật.

| File | Dài | Lặp | Nội dung |
|---|---|---|---|
| `idle.mp4` | 6s | có | Chờ: thở, chớp mắt, tóc và đồ treo đung đưa, sao lấp lánh |
| `greet.mp4` | 3s | không | Gật đầu khẽ chào, mỉm cười (khách vào / gọi tên) |
| `talk.mp4` | 3s | có | Nói chuyện: miệng theo nhịp, đầu gật nhẹ |
| `cast.mp4` | 6s | không | Giơ tay làm phép xoá bài: mắt phát sáng vàng, vòng sáng quét mặt bàn (giây 1,8–4,1), hạ tay |
| `read.mp4` | 6s | không | Nhắm mắt kết nối đọc bài, hoa văn bàn sáng lên, mở mắt |
| `thanks.mp4` | 3s | không | Gật đầu cảm ơn, mỉm cười |

## Dùng với trình phát có sẵn

`manifest.json` cùng định dạng với `clips/manifest.json`, nên chỉ cần đổi `basePath` khi tạo trình phát trong `public/js/tarot/main.js`:

```js
const clips = createClipPlayer($('video'), {
  basePath: '/assets/tarot/clips-witch/',
  // ...giữ nguyên các tham số khác
});
```

Bảng pha → clip (sửa trong `manifest.json` nếu muốn đổi):

| Tên clip trong manifest | File | Pha |
|---|---|---|
| `idle_wait`, `invite` | `idle.mp4` | IDLE, INTERMISSION |
| `call_name` | `greet.mp4` | CALLING |
| `shuffle` | `cast.mp4` (cue `spell` 1,8s) | SHUFFLING |
| `draw_card` | `read.mp4` (cue `touch` 1,5s) | DRAWING |
| `reveal`, `talk_a`, `talk_b` | `talk.mp4` (cue `point` 1,5s) | REVEALING, READING |
| `farewell`, `react_small` | `thanks.mp4` | FAREWELL, quà nhỏ |
| `react_big` | `greet.mp4` | quà lớn (mắt sáng `cast.mp4` chỉ dùng lúc xáo bài) |

## Lưu ý khi chuyển sang bộ clip này

- **Khung hình khác bộ cũ:** bộ cũ là 1280×1234, bộ này là 1124×2000 (dọc). Toạ độ bàn, lá bài, ghế trong `data/tarot/layout.json` đang hiệu chuẩn cho bộ cũ, cần hiệu chuẩn lại bằng `/tarot?calibrate=1`.
- **Cảnh đã có sẵn bàn và bầu trời:** mặt bàn có hoa văn vòng tròn ở nửa dưới khung (tâm khoảng x=570, y=1440); lá bài HTML nên đặt trong vùng này.
- **Dung lượng:** khoảng 9 MB tổng. `.gitignore` hiện chỉ bỏ qua `clips/*.mp4`; nếu không muốn commit video thì thêm dòng `public/assets/tarot/clips-witch/*.mp4`.

## Tạo lại hoặc chỉnh clip

Mã nguồn tạo clip nằm ngoài repo, ở `D:\Code\livetiktok-tarot-v2\Asset\witch-anim-src\` (cần Python 3.10 + numpy, scipy, pillow, torch; có GPU thì nhanh hơn):

```bash
python states_anim.py            # render cả 6 trạng thái vào out/<tên>/
python states_anim.py cast talk  # chỉ render vài trạng thái
```

Rồi ghép thành MP4 (ảnh rộng 1125, cắt 1px cho H.264):

```bash
ffmpeg -framerate 30 -i out/cast/cast_%04d.png -vf "crop=1124:2000:0:0" -c:v libx264 -pix_fmt yuv420p -crf 18 -movflags +faststart cast.mp4
```

Các thông số hay chỉnh trong `states_anim.py`: biên độ tóc (`6.0 * np.sin(...)` trong `render`), độ sâu gật đầu (`tl_greet`, `tl_thanks`), thời điểm giơ tay (`tl_cast`), độ sáng mắt (`EYE_GOLD`, `add_eye_rays`).
