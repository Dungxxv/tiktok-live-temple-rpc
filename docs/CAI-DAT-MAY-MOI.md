# Cài Tarot Live trên máy mới (vd. laptop)

## 1. Cài công cụ (một lần)

- **Git**: https://git-scm.com
- **Bun**: mở PowerShell, chạy `powershell -c "irm bun.sh/install.ps1 | iex"`
- **Python 3.10** (cho giọng đọc): https://www.python.org/downloads/release/python-3106/ — khi cài tick **Add python.exe to PATH**
- **Claude Code** (cho nút "Nhờ Claude viết"): cài extension Claude Code trong VS Code rồi **đăng nhập**. Không cài thì mọi thứ khác vẫn chạy, chỉ nút này tắt.

## 2. Tải code

Chọn một thư mục cha (vd. `D:\Code\livetiktok-tarot-v2`), mở terminal ở đó:

```bat
git clone -b tarot/witch-clips https://github.com/Dungxxv/tiktok-live-temple-rpc.git
cd tiktok-live-temple-rpc
bun install
```

Giọng đọc sẽ được cài vào thư mục `CapCapTTS` **cạnh** `tiktok-live-temple-rpc` (cùng thư mục cha).

## 3. Cài giọng đọc CapCap (một lần)

```bat
scripts\setup-capcap.bat
```

## 4. Tạo file `.env`

Chép `.env.example` thành `.env` (cùng thư mục `server.js`), điền:

- `APP_MODE=tarot` (đã có sẵn)
- `SIGN_API_KEY=...` nếu kết nối TikTok báo lỗi 401 "Anonymous access is not available" — khóa miễn phí tại https://www.eulerstream.com

`.env` không có trên GitHub (chứa khóa riêng), mỗi máy tự tạo.

## 5. Chạy mỗi lần live

1. `scripts\start-capcap.bat` (cửa sổ riêng, đợi dòng "Đã nạp xong … giọng"; lần đầu tự tải mô hình, hơi lâu)
2. `scripts\start-tarot.bat`
3. Mở http://localhost:3000/tarot/admin → nhập kênh → **Kết nối**. Màn live cho OBS: http://localhost:3000/tarot?obs=1

## Ghi chú

- **Cập nhật code mới** từ máy kia: `git pull` trong thư mục `tiktok-live-temple-rpc` (rồi `bun install` nếu có gói mới).
- **Cache giọng đọc** (`data/tts-cache`) không có trên GitHub: buổi đầu trên máy mới mỗi câu phải tạo giọng lúc live (chậm hơn chút). Muốn tạo sẵn: `bun scripts/prerender-tarot-tts.mjs` khi server đang chạy (nặng máy, làm lúc không live).
- **Hàng chờ, phiên riêng, cài đặt âm thanh** lưu trong `data/tarot-state.json` của từng máy, không đồng bộ giữa hai máy.
- Mẫu giọng `data/tarot/voice/ref.wav` chỉ cần khi đổi sang bộ giọng OmniVoice (`tts.engine` trong `data/tarot/config.json`); CapCap dùng giọng có sẵn "Ngọc Linh".
