# TAROT_ASSET_PROMPTS — Prompt tạo ảnh và video

Công cụ đã dùng thử: Dreamina (mô hình Seedance 2.0 Mini). Phong cách: **tranh minh họa bán thực, bóng mịn, tím và vàng**. Mọi video: **5 giây, không âm thanh, camera cố định, không hiệu ứng sáng ở tay**.

## 0. Ảnh gốc (đã tạo xong)

Ảnh phòng bói 16:9 (1600×900), nữ tư tế ở giữa, hai bàn tay mở ở ngực, rèm tím, cửa sổ sao, nến, tấm vải bàn tím ở đáy. Đây là **khung đầu và khung cuối của mọi clip**. Lưu tại `public/assets/tarot/base/priestess_base.png`. Không tạo lại ảnh này (để mặt không đổi); nếu buộc phải tạo lại thì phải tạo lại toàn bộ clip.

Prompt ảnh gốc (khi cần tham khảo, bản không bàn, 9:16):
```
Vertical 9:16, 1080x1920. Semi-realistic fantasy digital illustration, glossy painterly finish, purple and gold palette. A mystical tarot parlor with deep violet drapes, a night window with stars, candles. A young fortune-teller priestess with a soft round youthful face, rosy cheeks, large bright almond-shaped eyes with long lashes and light hazel-brown irises, thin gently arched eyebrows, small delicate nose, soft pink lips in a gentle closed-mouth smile. Long wavy chestnut-brown hair with loose curls, a gold crescent-moon tiara with purple gem chains across the forehead, gold crescent-moon earrings, purple gem choker, deep purple robe with gold star embroidery. She faces the viewer, waist-up framing, centered in the upper-left area, about 37% of the width, both hands raised at chest height with open palms, nothing in front of her. Lower third is plain dark purple rug. Fixed camera, front view, soft candlelight. No table, no cards, no text, no UI, no extra people.
```

## 1. Khuôn prompt video (ghép trong code hoặc tay)

`PREFIX` (đặt đầu mọi prompt):
```
5-second video. Static locked camera, no zoom, no pan, no cut. Keep the exact same face, hairstyle, outfit, jewelry, room and lighting as the input image. Only the woman moves; the background stays almost still except gentle candle flame flicker. The video starts and ends exactly on the input image pose (both open palms raised at chest height, warm smile). Action:
```

`SUFFIX` (đặt cuối mọi prompt):
```
Silent video, no audio, no speech, no music, no sound effects. Avoid: camera movement, zoom, scene change, new objects, extra hands or fingers, deformed hands, face change, outfit change, text, watermark, flicker, morphing.
```

Ghép: `PREFIX + " " + ACTION + " " + SUFFIX`.

**Nếu công cụ chặn xem video vì âm thanh** (đã gặp: "vì âm thanh trong video… hãy dùng nội dung tham chiếu khác"): tắt nút âm thanh nếu có; bỏ câu "Silent video, no audio…" khỏi SUFFIX (câu nhắc tới nhạc đôi khi kéo mô hình sinh nhạc); tạo lại; nếu vẫn bị chặn thì thử mô hình khác.

## 2. Danh sách ACTION theo trạng thái

Tên file = tên trạng thái, `.mp4`. Đường dẫn: `public/assets/tarot/clips/`.

| Trạng thái | Kiểu | Dùng khi | ACTION |
|---|---|---|---|
| `idle_wait` | loop | Không có ai, chờ | `she breathes softly, blinks naturally once or twice, a tiny head sway, hair and sleeves move slightly, both open palms float gently in place, calm warm smile throughout.` |
| `invite` | loop | Mời người xem bình luận để xếp hàng | `from 0 to 1s she looks into the camera with a warm welcoming smile; from 1 to 3.5s her right hand makes a slow gentle beckoning gesture toward the viewer; from 3.5 to 5s her hand returns to the open-palm pose and she keeps smiling.` |
| `talk_a` | loop | Đọc lời giải (kiểu giải thích) | `she speaks softly and warmly to the viewer, lips moving naturally as in conversation, small head nods, her right hand makes one slow explaining gesture while the left stays open, and both hands return to the open-palm pose at the end.` |
| `talk_b` | loop | Đọc lời giải (kiểu trầm ngâm), xen kẽ talk_a | `she speaks thoughtfully with a gentle head tilt, her eyes drift slightly down as if looking at cards and then back to the camera, both hands move slightly with calm gestures, lips moving naturally, and she settles back into the open-palm pose at the end.` |
| `call_name` | once | Gọi người vào ghế | `from 0 to 1s she tilts her head slightly; from 1 to 3s she lifts her right hand toward the viewer in a gentle greeting, nods once and smiles brightly; from 3 to 5s she returns to the open-palm pose with a warm smile.` |
| `shuffle` | once | Xào bài | `from 0 to 1s her hands slowly lower to a table level just below the middle of the frame and her eyes look down; from 1 to 3.5s her hands move in a smooth circular shuffling motion over an invisible surface, hands plain and natural with no glow, no sparkles, no light effects, no particles; from 3.5 to 5s her hands rise back to the open-palm pose and she looks up with a smile.` (thêm `glow, sparkles, light trails, magic effects` vào Avoid) |
| `draw_card` | once | Rút bài. **Cue `touch` ≈ 1.5 s** (đo lại) | `from 0 to 1.5s her right hand reaches forward and down to the table surface at one fixed point just below the middle of the frame, her eyes following it; at about 1.5s her hand touches the surface and pauses briefly; from 2 to 3.5s her hand lifts in a smooth graceful sweep, plain and natural with no glow, no sparkles, no light effects; from 3.5 to 5s she returns to the open-palm pose and looks up with a smile.` (thêm `glow, sparkles, light trails, magic effects` vào Avoid) |
| `reveal` | once | Chỉ vào lá bài đã lật. Cue `point` ≈ 3 s (đo lại) | `from 0 to 1s her eyes look down at the table; from 1 to 3s both hands glide slowly over the table surface from left to right as if presenting something, then her right hand points gently downward at the center; from 3 to 5s she looks up at the viewer with a knowing smile and returns to the open-palm pose.` |
| `farewell` | once | Tạm biệt, **không cười**, đồng cảm, gật đầu | `from 0 to 1s her smile fades into a calm, empathetic, compassionate expression with soft caring eyes, mouth closed, no smile; from 1 to 3s she looks into the camera and slowly nods her head twice in a gentle understanding goodbye, one hand lowering slightly to rest near her heart; from 3 to 5s her hand returns to the open-palm pose and she keeps the calm, caring expression, no smile.` (bỏ cụm "and ends exactly on … warm smile" trong PREFIX cho clip này; thêm `smiling, laughing, teeth showing` vào Avoid) |
| `react_small` | once | Quà nhỏ | `from 0 to 2s she smiles with delight, her eyes brighten and she gives a quick happy nod; from 2 to 5s she returns to the open-palm pose with a warm smile.` (bản gốc có tia sáng nhỏ quanh tay; nên bỏ, dùng hạt HTML) |
| `react_big` | once | Quà lớn | `from 0 to 1s she gasps with joyful surprise and raises both hands up; from 1 to 3s she laughs warmly; from 3 to 4s she bows her head in thanks; from 4 to 5s she returns to the open-palm pose with a warm smile.` (bản gốc có chùm sáng vàng; nên bỏ, dùng hạt HTML) |

Ghi chú:
- Chuyển từ `farewell` sang `idle_wait` có đổi nét mặt (không cười → cười). Crossfade 150–300 ms, hoặc giữ khung cuối 0,5 s. Hoặc đổi dòng cuối ACTION thành `her expression slowly softens into a faint gentle smile`.
- Hiệu ứng sáng (xào bài, rút bài, quà) làm bằng **hạt HTML** đúng thời điểm cue, không để AI vẽ vào video.
- Clip `talk_*` chỉ cần môi cử động tự nhiên, **không khớp tiếng** (mặt nhỏ trên màn hình). Server phát TTS riêng.

## 3. Xử lý sau khi tạo

```bash
# Bỏ âm thanh, chuẩn hóa H.264, 24 fps, chạy được mọi nơi
ffmpeg -i in.mp4 -an -c:v libx264 -pix_fmt yuv420p -r 24 -crf 20 -preset slow -movflags +faststart out.mp4

# Kiểm tra: không âm thanh, thời lượng, kích thước
ffprobe -v error -show_entries stream=codec_type,width,height,r_frame_rate:format=duration out.mp4

# Làm clip lặp bằng cách chạy xuôi rồi ngược (chỉ cho idle_wait, không cho clip nói)
ffmpeg -i idle.mp4 -filter_complex "[0:v]reverse[r];[0:v][r]concat=n=2:v=1:a=0[v]" -map "[v]" -an idle_loop.mp4
```

Đo cue (thời điểm tay chạm bàn, tay chỉ lá bài) bằng cách xem từng khung hình (VLC hoặc `ffmpeg -i x.mp4 -vf fps=10 f_%03d.png`) rồi ghi vào `manifest.json`.

## 4. Manifest

`public/assets/tarot/clips/manifest.json` (ví dụ):
```json
{
  "video": { "width": 1600, "height": 900, "fps": 24, "format": "mp4" },
  "base": "idle_wait",
  "clips": {
    "idle_wait":   { "file": "idle_wait.mp4",   "loop": true,  "duration": 5 },
    "invite":      { "file": "invite.mp4",      "loop": true,  "duration": 5 },
    "talk_a":      { "file": "talk_a.mp4",      "loop": true,  "duration": 5 },
    "talk_b":      { "file": "talk_b.mp4",      "loop": true,  "duration": 5 },
    "call_name":   { "file": "call_name.mp4",   "loop": false, "duration": 5 },
    "shuffle":     { "file": "shuffle.mp4",     "loop": false, "duration": 5 },
    "draw_card":   { "file": "draw_card.mp4",   "loop": false, "duration": 5, "cues": { "touch": 1.5 } },
    "reveal":      { "file": "reveal.mp4",      "loop": false, "duration": 5, "cues": { "point": 3.0 } },
    "farewell":    { "file": "farewell.mp4",    "loop": false, "duration": 5 },
    "react_small": { "file": "react_small.mp4", "loop": false, "duration": 5 },
    "react_big":   { "file": "react_big.mp4",   "loop": false, "duration": 5 }
  }
}
```

## 5. Ảnh nền giao diện (chỉ để xem bố cục)

Mockup toàn bộ giao diện 9:16 (đã dùng để duyệt bố cục): tham khảo mục "Màn hình" trong `TAROT_SPEC.md`. Chữ tiếng Việt trong ảnh AI hay sai dấu; mockup chỉ để xem bố cục, giao diện thật là HTML.

## 6. Lá bài tarot

- Mặt sau: một ảnh `card-back.webp` thiết kế gốc (tím, vàng, trăng sao).
- 78 mặt bài: **thiết kế gốc**, không sao chép hình ảnh bộ Rider-Waite hay bộ bài có bản quyền. MVP dùng mặt bài vẽ bằng CSS/SVG (số, tên, biểu tượng đơn giản, màu theo bộ); sau đó thay bằng tranh gốc khi có.
- Định dạng: WebP, 400×700, `public/assets/tarot/cards/{id}.webp`.
