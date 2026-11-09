// Nhập clip nữ tư tế thật: bỏ âm thanh (giữ nguyên hình H.264, không mã hóa lại), bật faststart, ghi manifest.json.
// Clip nguồn đặt trong một thư mục (mặc định ../Asset so với repo) với tên: idle_wait, call_name, draw_card, talk, farewell, react_big
// (thêm shuffle, reveal, react_small, talk_b nếu có thì dùng, không có thì mượn clip gần nhất theo bảng FALLBACK).
// Cần ffmpeg + ffprobe trong PATH (hoặc đặt FFMPEG_BIN=thư mục chứa ffmpeg).
// Chạy: node scripts/import-tarot-clips.mjs [--src ../Asset]
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.join(here, '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((a, x, i, arr) => (x.startsWith('--') ? [...a, [x.slice(2), arr[i + 1]]] : a), []));
const SRC = path.resolve(repo, args.src || '../Asset');
const OUT = path.join(repo, 'public', 'assets', 'tarot', 'clips');
const bin = (name) => (process.env.FFMPEG_BIN ? path.join(process.env.FFMPEG_BIN, name) : name);

// Tên clip trình phát cần → file nguồn ưu tiên (theo thứ tự). Mốc cue tính theo giây trong clip.
const CLIPS = {
  idle_wait: { from: ['idle_wait'], loop: true },
  invite: { from: ['invite', 'idle_wait'], loop: true },
  call_name: { from: ['call_name'] },
  shuffle: { from: ['shuffle', 'talk'] },
  draw_card: { from: ['draw_card'], cues: { touch: 1.5 } },
  // Chưa có clip "reveal" riêng: dùng clip nói, cử chỉ chỉ tay ở khoảng giây 2,6.
  reveal: { from: ['reveal', 'talk'], cues: { point: 2.6 } },
  talk_a: { from: ['talk_a', 'talk'], loop: true },
  talk_b: { from: ['talk_b', 'talk'], loop: true },
  farewell: { from: ['farewell'] },
  react_small: { from: ['react_small', 'react_big'] },
  react_big: { from: ['react_big'] }
};

function probe(file) {
  const r = spawnSync(bin('ffprobe'), ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height,r_frame_rate,codec_name', '-show_entries', 'format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe lỗi với ${file}: ${r.stderr || r.error}`);
  const j = JSON.parse(r.stdout);
  const s = j.streams[0];
  const [n, d] = String(s.r_frame_rate).split('/').map(Number);
  return { width: s.width, height: s.height, fps: d ? n / d : n, codec: s.codec_name, duration: Number(j.format.duration) };
}

if (!fs.existsSync(SRC)) { console.error(`Không thấy thư mục clip nguồn: ${SRC}`); process.exit(1); }
fs.mkdirSync(OUT, { recursive: true });
const available = new Set(fs.readdirSync(SRC).filter((f) => f.toLowerCase().endsWith('.mp4')).map((f) => f.slice(0, -4)));

/** Tìm đoạn đen ở đầu/cuối clip (nhiều công cụ tạo video chèn vài khung đen) → khoảng cần giữ [start, end]. */
function blackTrim(file, duration) {
  const r = spawnSync(bin('ffmpeg'), ['-hide_banner', '-i', file, '-vf', 'blackdetect=d=0:pix_th=0.10', '-an', '-f', 'null', '-'], { encoding: 'utf8' });
  const spans = [...String(r.stderr).matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
  let start = 0; let end = duration;
  for (const [a, b] of spans) {
    if (a <= 0.01 && b < duration / 2) start = Math.max(start, b);
    if (b >= duration - 0.05 && a > duration / 2) end = Math.min(end, a);
  }
  return { start, end, trimmed: start > 0 || end < duration };
}

const converted = new Map();   // tên nguồn → { file, info, trimStart }
function convert(srcName) {
  if (converted.has(srcName)) return converted.get(srcName);
  const input = path.join(SRC, `${srcName}.mp4`);
  const out = path.join(OUT, `${srcName}.mp4`);
  const src = probe(input);
  const cut = blackTrim(input, src.duration);
  // Không phải cắt và đã là H.264: giữ nguyên hình. Phải cắt khung đen: mã hóa lại (chất lượng cao) để cắt đúng khung.
  const copy = src.codec === 'h264' && !cut.trimmed;
  const args = ['-y', '-loglevel', 'error', '-i', input,
    ...(cut.trimmed ? ['-ss', cut.start.toFixed(3), '-to', cut.end.toFixed(3)] : []),
    '-map', '0:v:0', '-an',
    ...(copy ? ['-c:v', 'copy'] : ['-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-pix_fmt', 'yuv420p']),
    '-movflags', '+faststart', out];
  const r = spawnSync(bin('ffmpeg'), args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg lỗi với ${srcName}: ${r.stderr || r.error}`);
  const info = probe(out);
  const v = { file: `${srcName}.mp4`, info, trimStart: cut.start };
  converted.set(srcName, v);
  const note = cut.trimmed ? `(cắt khung đen ${cut.start.toFixed(2)}s đầu${cut.end < src.duration ? `, ${(src.duration - cut.end).toFixed(2)}s cuối` : ''}, mã hóa lại)` : copy ? '(giữ hình gốc)' : '(mã hóa lại H.264)';
  console.log(`  ${srcName}.mp4  ${info.width}x${info.height} ${info.fps.toFixed(0)}fps ${info.duration.toFixed(2)}s ${note}`);
  return v;
}

const manifest = { video: null, base: 'idle_wait', clips: {} };
const missing = [];
for (const [name, c] of Object.entries(CLIPS)) {
  const src = c.from.find((s) => available.has(s));
  if (!src) { missing.push(name); continue; }
  const { file, info, trimStart } = convert(src);
  if (!manifest.video) manifest.video = { width: info.width, height: info.height, fps: Math.round(info.fps), format: 'mp4' };
  // Mốc cue tính theo clip gốc → trừ phần đầu đã cắt.
  const cues = c.cues ? Object.fromEntries(Object.entries(c.cues).map(([k, t]) => [k, Number(Math.max(0, t - trimStart).toFixed(3))])) : null;
  manifest.clips[name] = { file, loop: !!c.loop, duration: Number(info.duration.toFixed(3)), ...(cues ? { cues } : {}), ...(src !== name ? { borrowedFrom: src } : {}) };
}
if (!manifest.clips.idle_wait) { console.error('Thiếu clip bắt buộc idle_wait.mp4'); process.exit(1); }
fs.writeFileSync(path.join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Đã ghi manifest với ${Object.keys(manifest.clips).length} clip vào ${OUT}`);
if (missing.length) console.warn(`Chưa có clip cho: ${missing.join(', ')} (trình phát sẽ giữ clip hiện tại ở các pha này).`);
