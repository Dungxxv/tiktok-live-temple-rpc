'use strict';
// Bộ bài Tarot: nạp dữ liệu, kiểm tra, rút bài, chọn lời giải. Hàm thuần, rng được tiêm vào để test.
const fs = require('fs');

const MAX_SENTENCE_CHARS = 140;   // tts_worker.py cắt ở 160 ký tự
// Chủ đề nhạy cảm không được khẳng định trong lời giải (xem mục "An toàn nội dung" của spec).
const FORBIDDEN_RE = /(bệnh|ung thư|tử vong|tự tử|chết|mang thai|có thai|ly hôn|kiện tụng|tòa án|đầu tư|chứng khoán|phá sản|nợ nần|tai nạn|sức khỏe|bác sĩ|phẫu thuật)/i;

function loadDeck(file) {
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  return validateDeck(raw.cards || raw);
}

/** Trả về danh sách lá nếu hợp lệ, ngược lại ném lỗi mô tả lá đầu tiên sai. */
function validateDeck(cards) {
  const problems = checkDeck(cards);
  if (problems.length) throw new Error(`Bộ bài tarot không hợp lệ: ${problems[0]} (+${problems.length - 1} lỗi khác)`);
  return cards;
}

function checkDeck(cards) {
  const problems = [];
  if (!Array.isArray(cards) || cards.length !== 78) {
    problems.push(`cần đúng 78 lá, có ${Array.isArray(cards) ? cards.length : 0}`);
    if (!Array.isArray(cards)) return problems;
  }
  const seen = new Set();
  for (const c of cards) {
    if (!c.id || seen.has(c.id)) problems.push(`id trùng hoặc thiếu: ${c.id}`);
    seen.add(c.id);
    if (!c.name_vi) problems.push(`${c.id}: thiếu name_vi`);
    for (const dir of ['up', 'rev']) {
      const lines = c.readings?.general?.[dir];
      if (!Array.isArray(lines) || lines.length < 2 || lines.length > 3) {
        problems.push(`${c.id}: readings.general.${dir} cần 2-3 câu`);
        continue;
      }
      for (const line of lines) {
        if (typeof line !== 'string' || !line.trim()) problems.push(`${c.id}: có câu rỗng`);
        else if (line.length > MAX_SENTENCE_CHARS) problems.push(`${c.id}.${dir}: câu dài ${line.length} > ${MAX_SENTENCE_CHARS}`);
        else if (FORBIDDEN_RE.test(line)) problems.push(`${c.id}.${dir}: chứa từ nhạy cảm: "${line}"`);
      }
    }
  }
  return problems;
}

function shuffled(arr, rng) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Rút n lá không trùng nhau. `exclude` (Set id) bị loại trừ khi bộ còn đủ lá; nếu không đủ thì bỏ ràng buộc.
 * Mỗi lá có `reversed` với xác suất reversedChance.
 */
function draw(deck, n, { rng = Math.random, exclude = new Set(), reversedChance = 0.3 } = {}) {
  const count = Math.max(0, Math.min(n, deck.length));
  let pool = deck.filter((c) => !exclude.has(c.id));
  if (pool.length < count) pool = deck.slice();
  return shuffled(pool, rng).slice(0, count).map((c) => ({
    id: c.id,
    name: c.name_vi,
    nameEn: c.name_en,
    reversed: rng() < reversedChance,
    keywords: null,
    revealed: false
  }));
}

/** Gắn từ khóa theo chiều xuôi/ngược cho lá đã rút. */
function withKeywords(deck, drawn) {
  const byId = new Map(deck.map((c) => [c.id, c]));
  return drawn.map((d) => {
    const c = byId.get(d.id);
    return { ...d, keywords: (d.reversed ? c.keywords_rev : c.keywords_up).slice(0, 3) };
  });
}

/** Lời giải (mảng câu ngắn) cho các lá đã rút; mở đầu bằng tên lá khi rút nhiều lá. */
function pickReading(deck, drawn, topic = 'general') {
  const byId = new Map(deck.map((c) => [c.id, c]));
  const lines = [];
  for (const d of drawn) {
    const c = byId.get(d.id);
    const block = c.readings[topic] || c.readings.general;
    const part = d.reversed ? block.rev : block.up;
    if (drawn.length > 1) lines.push(`Lá ${c.name_vi}${d.reversed ? ', ngược' : ''}.`);
    lines.push(...part);
  }
  return lines;
}

module.exports = { loadDeck, validateDeck, checkDeck, draw, withKeywords, pickReading, MAX_SENTENCE_CHARS, FORBIDDEN_RE };
