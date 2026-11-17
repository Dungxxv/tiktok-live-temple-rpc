'use strict';
// Lời nói của nữ tư tế cho một phiên: chia theo pha, mỗi câu ≤ 140 ký tự kèm "section" (để sáng lá đang đọc,
// hiện nhãn phần đang đọc). Câu cố định lấy từ data/tarot/fixed-lines.json (xoay vòng, không lặp liền kề).
const { splitSentences } = require('./tarot-sheet');

const POSITIONS = [
  { position: 'past', positionLabel: 'Quá khứ' },
  { position: 'present', positionLabel: 'Hiện tại' },
  { position: 'future', positionLabel: 'Tương lai' }
];
const SECTION_LABELS = { card1: 'Quá khứ', card2: 'Hiện tại', card3: 'Tương lai', closing: 'Lời kết', opening: 'Mở đầu' };
// Các phần lời giải admin được viết lại (3 lá: opening…closing; 1 lá: lead/present/advice).
const CUSTOM_SECTIONS = ['opening', 'card1', 'card2', 'card3', 'closing', 'lead', 'present', 'advice'];

/**
 * Tên đọc thành tiếng: chỉ chữ cái Việt/Latin và khoảng trắng (bỏ số, ký hiệu, emoji), 2–14 chữ cái,
 * không lặp ký tự kiểu "aaaa", không chứa từ cấm. Không qua bộ lọc → null (chào "bạn").
 */
function safeName(raw, isBlocked = () => false) {
  const n = String(raw || '').normalize('NFC').replace(/[^\p{L}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!n) return null;
  if (!/^[a-zA-ZÀ-ỹĐđ ]+$/u.test(n)) return null;
  const letters = n.replace(/ /g, '');
  if (letters.length < 2 || letters.length > 14) return null;
  if (/(.)\1{2,}/iu.test(letters)) return null;
  if (isBlocked(n)) return null;
  return n;
}

/** Chọn câu cố định xoay vòng, không lặp liền kề; thay {name}. */
function createFixedLines(lines = {}) {
  const next = {};
  return {
    pick(type, vars = {}) {
      const list = Array.isArray(lines[type]) ? lines[type] : [];
      if (!list.length) return '';
      const i = (next[type] ?? 0) % list.length;
      next[type] = i + 1;
      return list[i].replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
    },
    all: () => lines
  };
}

/** Mọi câu cố định không có tên (để đọc sẵn TTS). */
function allFixedSentences(lines = {}) {
  const out = new Set();
  for (const [type, list] of Object.entries(lines)) {
    if (type.startsWith('_') || !Array.isArray(list)) continue;
    for (const l of list) if (!l.includes('{')) splitSentences(l).forEach((s) => out.add(s));
  }
  return [...out];
}

/** Mọi câu trong readings.json (để đọc sẵn TTS). */
function allReadingSentences(readings) {
  const out = new Set();
  const add = (t) => splitSentences(t).forEach((s) => out.add(s));
  for (const r of readings?.single || []) [r.lead, r.present, r.advice].forEach(add);
  for (const list of Object.values(readings?.triple || {})) for (const r of list) [r.opening, r.card1, r.card2, r.card3, r.closing].forEach(add);
  return [...out];
}

/**
 * Kịch bản một phiên từ lượt bốc đã chọn.
 * @returns {{ sessionType:'join'|'gift', topic, cards, speech: Record<phase, {lines:string[], sections:string[]}> }}
 */
function buildScript({ reservation, deckById, name, fixed, isBlocked = () => false, topicLabel = (t) => t, commented = null, custom = null }) {
  // Lời giải riêng (admin viết cho trường hợp đặc biệt): phần nào có chữ thì thay phần tương ứng của dòng sheet.
  const over = custom?.lines || {};
  const row = { ...reservation.row };
  for (const k of CUSTOM_SECTIONS) if (typeof over[k] === 'string' && over[k].trim()) row[k] = over[k].trim();
  const question = typeof custom?.question === 'string' ? custom.question.trim() : '';
  const spoken = safeName(name, isBlocked);
  const greet = spoken ? fixed.pick('greetingNamed', { name: spoken }) : fixed.pick('greeting');
  const speech = {};
  for (const ph of ['CALLING', 'SHUFFLING', 'DRAWING', 'REVEALING', 'READING', 'FAREWELL']) speech[ph] = { lines: [], sections: [] };
  const say = (phase, section, text) => { for (const s of splitSentences(text)) { speech[phase].lines.push(s); speech[phase].sections.push(section); } };
  const cardOf = (c, extra) => {
    const d = deckById.get(c.id) || { name_vi: c.id, keywords_up: [], keywords_rev: [] };
    return { id: c.id, name: d.name_vi, reversed: !!c.reversed, revealed: false, keywords: (c.reversed ? d.keywords_rev : d.keywords_up || []).slice(0, 3), ...extra };
  };

  // Lời chào theo Figma: "Chào {tên}" → "Chủ đề của bạn là …" → (xáo bài) "Hãy nghĩ đến chuyện … của bạn trong lúc xáo bài nhé!"
  const topicKey = reservation.type === 'single' ? 'overview' : reservation.requestedTopic === 'specific' ? 'specific' : reservation.topic;
  const tLabel = String(topicLabel(topicKey) || '');
  const hasTopic = tLabel && topicKey !== 'overview' && topicKey !== 'specific';
  say('CALLING', 'greeting', greet);
  // Chọn chủ đề bằng mã bình luận: "Chủ đề bạn bình luận là 02: Tình Yêu"; còn lại: "Chủ đề của bạn là …".
  if (question) say('CALLING', 'topic', fixed.pick('questionIs', { question }) || `Câu hỏi của bạn là: ${question}`);
  else if (commented) say('CALLING', 'topic', fixed.pick('topicCommented', { code: commented.code, topic: commented.label }) || fixed.pick('topicIs', { topic: commented.label }));
  else if (tLabel && topicKey !== 'specific') say('CALLING', 'topic', fixed.pick('topicIs', { topic: tLabel }));
  const introTopic = question ? fixed.pick('introQuestion')
    : hasTopic ? fixed.pick('introTopic', { topic: tLabel.toLocaleLowerCase('vi') }) : '';
  // Câu "Hãy nghĩ đến … trong lúc xáo bài nhé!" nói ngay TRƯỚC khi xáo (cuối pha CALLING, miệng nói), để lúc xáo bài
  // clip mắt sáng không bị chồng thoại (clip đó không nhép miệng).
  if (reservation.type === 'single') {
    say('CALLING', 'intro', (question && introTopic) || fixed.pick('introSingle'));
    say('DRAWING', 'draw', fixed.pick('drawSingle'));
    say('REVEALING', 'reveal', fixed.pick('reveal'));
    say('READING', 'lead', row.lead);
    say('READING', 'present', row.present);
    say('READING', 'advice', row.advice);
    say('READING', 'invite', fixed.pick('inviteGift'));
    say('FAREWELL', 'goodbye', fixed.pick('goodbye'));
    return {
      sessionType: 'join', topic: 'overview', topicLabel: topicLabel('overview'), sheetRow: row.row,
      cards: [cardOf({ id: row.id, reversed: row.reversed }, { position: 'center', positionLabel: '' })], speech
    };
  }
  say('CALLING', 'intro', introTopic || fixed.pick('introTriple'));
  say('DRAWING', 'draw', fixed.pick('drawTriple'));
  say('REVEALING', 'reveal', fixed.pick('reveal'));
  say('READING', 'opening', row.opening);
  say('READING', 'card1', row.card1);
  say('READING', 'card2', row.card2);
  say('READING', 'card3', row.card3);
  say('READING', 'closing', row.closing);
  say('FAREWELL', 'goodbye', fixed.pick('goodbye'));
  return {
    sessionType: 'gift', topic: reservation.topic, requestedTopic: reservation.requestedTopic,
    topicLabel: topicLabel(reservation.requestedTopic === 'specific' ? 'specific' : reservation.topic), sheetRow: row.row,
    cards: row.cards.map((c, i) => cardOf(c, POSITIONS[i])), speech
  };
}

module.exports = { safeName, createFixedLines, allFixedSentences, allReadingSentences, buildScript, POSITIONS, SECTION_LABELS, CUSTOM_SECTIONS };
