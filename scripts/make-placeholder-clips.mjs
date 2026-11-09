// Tạo clip giữ chỗ (MP4 H.264, không âm thanh, 5 giây) + manifest để thử trình phát clip khi chưa có clip nữ tư tế thật.
// Cần ffmpeg trong PATH. Chạy: node scripts/make-placeholder-clips.mjs
// Clip thật thay thế bằng cách chép đè cùng tên file vào public/assets/tarot/clips/ (xem docs/TAROT_ASSET_PROMPTS.md mục 4).
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', 'public', 'assets', 'tarot', 'clips');
fs.mkdirSync(dir, { recursive: true });

const CLIPS = {
  idle_wait: { loop: true, color: '0x3b2a6b' }, invite: { loop: true, color: '0x4a2f7a' },
  talk_a: { loop: true, color: '0x2f5a6b' }, talk_b: { loop: true, color: '0x2f6b55' },
  call_name: { loop: false, color: '0x6b2f55' }, shuffle: { loop: false, color: '0x6b4a2f' },
  draw_card: { loop: false, color: '0x7a2f2f', cues: { touch: 1.5 } },
  reveal: { loop: false, color: '0x2f2f7a', cues: { point: 3.0 } },
  farewell: { loop: false, color: '0x2f3b6b' },
  react_small: { loop: false, color: '0x6b6b2f' }, react_big: { loop: false, color: '0x8a6b1f' }
};
const font = process.platform === 'win32' ? 'C\\:/Windows/Fonts/arial.ttf' : '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';

const manifest = { video: { width: 640, height: 360, fps: 24, format: 'mp4' }, base: 'idle_wait', clips: {} };
for (const [name, c] of Object.entries(CLIPS)) {
  const out = path.join(dir, `${name}.mp4`);
  const vf = `drawtext=fontfile='${font}':text='${name}  %{pts\\:flt}s':fontcolor=white:fontsize=40:x=(w-tw)/2:y=(h-th)/2`;
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${c.color}:s=640x360:r=24:d=5`,
    '-vf', vf, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-an', out], { encoding: 'utf8' });
  if (r.status !== 0) { console.error(`Lỗi tạo ${name}:`, r.stderr || r.error); process.exit(1); }
  manifest.clips[name] = { file: `${name}.mp4`, loop: c.loop, duration: 5, ...(c.cues ? { cues: c.cues } : {}) };
}
fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Đã tạo ${Object.keys(CLIPS).length} clip giữ chỗ trong ${dir}`);
