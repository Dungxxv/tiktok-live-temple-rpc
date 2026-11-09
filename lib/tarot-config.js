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
  commentStars: 1,
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
  ttsEnabled: true
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
  if (!['jump', 'stars'].includes(cfg.queueOrder)) throw new Error('Cấu hình tarot: "queueOrder" phải là "jump" hoặc "stars"');
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
