'use strict';
// Cấu hình chế độ Tarot: giá trị mặc định + nạp/kiểm tra data/tarot/config.json.
const fs = require('fs');

const DEFAULT_CONFIG = {
  queueMax: 200,
  queueVisible: 6,
  rejoinCooldownSec: 600,
  lobbyWindowSec: 300,
  lobbyMax: 24,
  keywords: ['bói', 'tarot', 'xem bài', '+1'],
  topicKeywords: {
    love: ['tình yêu', 'người yêu', 'crush'],
    career: ['công việc', 'sự nghiệp', 'việc làm'],
    money: ['tiền', 'tài lộc']
  },
  // maxCoins = null nghĩa là không giới hạn trên. jump = số bậc, hoặc 'second' (lên vị trí thứ 2).
  giftTiers: [
    { name: 'small', minCoins: 1, maxCoins: 9, jump: 1 },
    { name: 'medium', minCoins: 10, maxCoins: 49, jump: 3 },
    { name: 'large', minCoins: 50, maxCoins: 99, jump: 5 },
    { name: 'huge', minCoins: 100, maxCoins: null, jump: 'second' }
  ],
  // Thứ tự hàng: 'jump' = nhảy bậc theo mức quà (giftTiers); 'stars' = xếp theo sao (bình luận +commentStars,
  // quà + xu × starsPerCoin hoặc theo bảng giftStars {"Tên quà": số sao}), bằng sao thì ai vào trước đứng trước.
  queueOrder: 'jump',
  // Mã bình luận chọn chủ đề (dải "Mã bình luận" trên bảng giấy): bình luận "02" hoặc "2" → trải 3 lá chủ đề Tình Yêu.
  // {} = tắt (bình luận chỉ để vào hàng / cộng sao).
  commentTopicCodes: {},
  // Chờ ngần này giây sau khi vào pha rồi nữ tư tế mới nói (vd. { CALLING: 2.6 }: avatar bay vào bệ đá xong mới chào).
  speechLeadSec: {},
  // false = không còn phiên 1 lá: khách không chọn chủ đề → 3 lá Tổng quan.
  singleCardSessions: true,
  // false = quà chỉ để ưu tiên hàng chờ, không đổi chủ đề (chủ đề chỉ đổi bằng mã bình luận).
  giftSetsTopic: true,
  joinOnEnter: false,          // người xem vừa vào phòng tự vào làn "vào phòng" (free)
  commentStars: 1,
  // Không hoạt động quá chừng này giây (không bình luận/thả tim/quà/chia sẻ) thì trang admin gắn nhãn "có thể đã rời" để bạn xóa.
  // TikTok không có sự kiện "rời phòng" nên chỉ ước đoán được qua việc im lặng. 0 = tắt nhãn.
  idleAfterSec: 600,
  // Người đầu tiên vào lúc ghế đang rảnh: chờ ngần này giây xem có tặng quà không rồi mới mời lên ghế (0 = mời ngay).
  firstJoinGraceSec: 0,
  // Popup chào khi có người vào phòng (màn live): mỗi người tối đa 1 lần / welcomePopupCooldownSec giây (0 = tắt popup).
  welcomePopupCooldownSec: 0,
  // Hàng trống quá autoPickAfterSec giây (không ai bình luận) → bốc ngẫu nhiên tối đa autoPickCount người đang trong phòng vào hàng; mỗi người chỉ bốc 1 lần (0 = tắt).
  // Xem xong: nếu khách vẫn còn hoạt động (trong idleAfterSec) thì đẩy về CUỐI hàng (làn vào phòng, 1 lá) để xem tiếp vòng sau.
  requeueAfterSession: false,
  autoPickCount: 0,
  autoPickAfterSec: 10,
  commentStarCooldownSec: 30,  // hai lần lâu: mỗi người được cộng sao bình luận tối đa 1 lần / khoảng này (chống spam)
  starsPerCoin: 10,
  giftStars: {},
  maxJumpPerGift: 5,
  maxJumpPer60s: 10,
  jumpWindowSec: 60,
  secondPosition: 2,
  lockBeforeEndSec: 10,
  freeReserveEvery: 4,
  bigGiftCoins: 100,
  bonusCardsOnBigGift: 2,
  maxCardsPerSession: 3,
  defaultCards: 1,
  reversedChance: 0.3,
  recentSessionsNoRepeat: 3,
  sessionTargetSec: 33,
  skipPhases: ['SHUFFLING'],
  phaseSec: { CALLING: 5, SHUFFLING: 5, DRAWING: 5, REVEALING: 5, FAREWELL: 5 },
  readingMinSec: 8,
  readingMaxSec: 40,
  readingBufferSec: 1,
  ttsCharsPerSec: 13,
  ttsEnabled: true,
  // Bộ đọc giọng: 'zerotts' (có sẵn, tạo giọng ngẫu nhiên từng câu) hoặc 'omnivoice' (nhân bản giọng từ một đoạn mẫu → đồng đều).
  // OmniVoice chạy ở tiến trình riêng (omnivoice-demo, cổng 8001); refAudio/refText = đoạn giọng mẫu (đường dẫn tính từ data/tarot/).
  tts: {
    engine: 'zerotts',
    capcap: { url: 'http://localhost:8002', voice: 'Ngọc Linh', targetDb: -18, timeoutSec: 60 },
    omnivoice: { url: 'http://localhost:8001', lang: 'Vietnamese', steps: 32, cfg: 2.0, speed: 1.0, targetDb: -18, timeoutSec: 120, refAudio: 'voice/ref.wav', refText: '' }
  },
  // Chờ giọng đọc: giữ màn lật bài tối đa ttsWaitMaxSec giây nếu TTS chưa xong (0 = không chờ).
  ttsWaitMaxSec: 0,
  // Nghỉ thêm sau câu cuối của mỗi pha có lời (pha được kéo dài cho đủ nói hết, không cắt câu).
  speechBufferSec: 1.2,
  // Bốc bài ngay ở CALLING (khi số lá đã tối đa) để TTS chuẩn bị sớm hơn.
  drawOnCalling: false
};

function isPlainObject(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function mergeConfig(base, override) {
  const out = { ...base };
  for (const [k, v] of Object.entries(override || {})) {
    if (k.startsWith('_')) continue;
    out[k] = isPlainObject(v) && isPlainObject(base[k]) ? mergeConfig(base[k], v) : v;
  }
  return out;
}

function assertNumber(cfg, key, min) {
  if (typeof cfg[key] !== 'number' || !Number.isFinite(cfg[key]) || cfg[key] < min) {
    throw new Error(`Cấu hình tarot: "${key}" phải là số >= ${min}`);
  }
}

function validateConfig(cfg) {
  ['queueMax', 'queueVisible', 'lobbyMax', 'maxJumpPerGift', 'maxJumpPer60s', 'bigGiftCoins', 'maxCardsPerSession']
    .forEach((k) => assertNumber(cfg, k, 1));
  ['rejoinCooldownSec', 'lobbyWindowSec', 'lockBeforeEndSec', 'readingBufferSec', 'bonusCardsOnBigGift']
    .forEach((k) => assertNumber(cfg, k, 0));
  assertNumber(cfg, 'freeReserveEvery', 2);
  assertNumber(cfg, 'secondPosition', 1);
  assertNumber(cfg, 'ttsCharsPerSec', 1);
  assertNumber(cfg, 'idleAfterSec', 0);
  assertNumber(cfg, 'firstJoinGraceSec', 0);
  assertNumber(cfg, 'welcomePopupCooldownSec', 0);
  assertNumber(cfg, 'autoPickCount', 0);
  assertNumber(cfg, 'autoPickAfterSec', 1);
  if (!cfg.tts || !['zerotts', 'omnivoice', 'capcap'].includes(cfg.tts.engine)) throw new Error('Cấu hình tarot: "tts.engine" phải là "zerotts", "omnivoice" hoặc "capcap"');
  if (cfg.tts.engine === 'capcap') {
    const c = cfg.tts.capcap || {};
    if (!c.url || !String(c.voice || '').trim()) throw new Error('Cấu hình tarot: capcap cần "url" và "voice" (tên giọng, ví dụ "Ngọc Linh")');
    for (const k of ['timeoutSec']) if (typeof c[k] !== 'number' || !(c[k] > 0)) throw new Error(`Cấu hình tarot: tts.capcap.${k} phải là số > 0`);
  }
  if (cfg.tts.engine === 'omnivoice') {
    const o = cfg.tts.omnivoice || {};
    if (!o.url || !o.refAudio || !String(o.refText || '').trim()) throw new Error('Cấu hình tarot: omnivoice cần "url", "refAudio" và "refText" (nội dung đúng của đoạn giọng mẫu)');
    for (const k of ['steps', 'cfg', 'speed', 'timeoutSec']) if (typeof o[k] !== 'number' || !(o[k] > 0)) throw new Error(`Cấu hình tarot: tts.omnivoice.${k} phải là số > 0`);
  }
  assertNumber(cfg, 'ttsWaitMaxSec', 0);
  if (!['jump', 'stars', 'lanes'].includes(cfg.queueOrder)) throw new Error('Cấu hình tarot: "queueOrder" phải là "jump", "stars" hoặc "lanes"');
  assertNumber(cfg, 'commentStars', 0);
  assertNumber(cfg, 'starsPerCoin', 0);
  if (cfg.giftStars === null || typeof cfg.giftStars !== 'object' || Array.isArray(cfg.giftStars)) throw new Error('Cấu hình tarot: "giftStars" phải là bảng {"Tên quà": số sao}');
  if (cfg.reversedChance < 0 || cfg.reversedChance > 1) throw new Error('Cấu hình tarot: "reversedChance" phải trong [0,1]');
  if (!Array.isArray(cfg.keywords) || cfg.keywords.length === 0) throw new Error('Cấu hình tarot: "keywords" không được rỗng');
  if (!Array.isArray(cfg.giftTiers) || cfg.giftTiers.length === 0) throw new Error('Cấu hình tarot: "giftTiers" không được rỗng');
  for (const t of cfg.giftTiers) {
    if (typeof t.minCoins !== 'number' || (t.maxCoins !== null && typeof t.maxCoins !== 'number')) {
      throw new Error('Cấu hình tarot: giftTiers cần minCoins (số) và maxCoins (số hoặc null)');
    }
    if (t.jump !== 'second' && !(typeof t.jump === 'number' && t.jump >= 0)) {
      throw new Error('Cấu hình tarot: giftTiers.jump phải là số >= 0 hoặc "second"');
    }
  }
  return cfg;
}

function loadConfig(file) {
  let override = {};
  if (file && fs.existsSync(file)) {
    override = JSON.parse(fs.readFileSync(file, 'utf8'));
  }
  return validateConfig(mergeConfig(DEFAULT_CONFIG, override));
}

module.exports = { DEFAULT_CONFIG, mergeConfig, validateConfig, loadConfig };
