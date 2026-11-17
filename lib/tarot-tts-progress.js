'use strict';
// Theo dõi tiến độ đọc sẵn giọng (cache data/tts-cache/). Hàm thuần + ghi file nhỏ, không gọi mạng.
//   _omni-index.json    : bảng tra "tên file .wav → nội dung câu" (tên file là mã băm nên không đọc ra được câu nào)
//   _omni-progress.json : đã đọc xong bao nhiêu / còn bao nhiêu / câu kế tiếp là câu nào / lần cuối lưu câu nào
// Sự thật về "đã xong chưa" luôn là việc file .wav có tồn tại hay không (scan); hai file trên chỉ để bạn xem và tra cứu.
// Không có đoạn code nào xóa cache: file ở lại cho tới khi bạn tự xóa.
const fs = require('fs');
const path = require('path');
const { allFixedSentences, allReadingSentences } = require('./tarot-speech');

const INDEX_FILE = '_omni-index.json';
const PROGRESS_FILE = '_omni-progress.json';

function readJson(file) { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (_) { return null; } }
function writeJsonAtomic(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 1) + '\n');
  fs.renameSync(tmp, file);
}

/** Danh sách câu cần đọc sẵn theo thứ tự cố định: câu cố định trước, rồi lời giải từ sheet. [{ text, kind }] */
function loadSentences(tarotDir) {
  const fixed = readJson(path.join(tarotDir, 'fixed-lines.json'));
  const readings = readJson(path.join(tarotDir, 'readings.json'));
  const out = []; const seen = new Set();
  const add = (text, kind) => { if (text && !seen.has(text)) { seen.add(text); out.push({ text, kind }); } };
  if (fixed) allFixedSentences(fixed).forEach((t) => add(t, 'fixed'));
  if (readings) allReadingSentences(readings).forEach((t) => add(t, 'reading'));
  else {
    // Chưa đồng bộ sheet: dùng lời giải cũ trong cards.json.
    const cards = readJson(path.join(tarotDir, 'cards.json'))?.cards || [];
    for (const c of cards) {
      for (const dir of ['up', 'rev']) for (const topic of Object.values(c.readings || {})) (topic[dir] || []).forEach((t) => add(t, 'reading'));
      add(`Lá ${c.name_vi}.`, 'reading'); add(`Lá ${c.name_vi}, ngược.`, 'reading');
    }
  }
  return out;
}

/**
 * So danh sách câu với file đã có trong cache.
 * @returns {{ total, doneCount, doneIdx, missingIdx, firstMissing, byKind }}  chỉ số tính từ 0 theo thứ tự danh sách
 */
function scan(sentences, cacheFileOf, cacheDir) {
  const doneIdx = []; const missingIdx = [];
  const byKind = {};
  sentences.forEach((s, i) => {
    let ok = false;
    try { ok = fs.statSync(path.join(cacheDir, cacheFileOf(s.text))).size > 200; } catch (_) { /* chưa có */ }
    (ok ? doneIdx : missingIdx).push(i);
    const k = (byKind[s.kind] ||= { done: 0, total: 0 });
    k.total++; if (ok) k.done++;
  });
  return { total: sentences.length, doneCount: doneIdx.length, doneIdx, missingIdx, firstMissing: missingIdx.length ? missingIdx[0] : null, byKind };
}

/** Bảng tra tên file → câu; ghi trễ (gộp nhiều lần ghi), ghi nguyên tử. */
function createIndexWriter(cacheDir, { delayMs = 2000 } = {}) {
  const file = path.join(cacheDir, INDEX_FILE);
  let data = null; let timer = null;
  const load = () => {
    if (!data) { const j = readJson(file); data = j && j.entries ? j : { version: 1, entries: {} }; }
    return data;
  };
  const flush = () => {
    if (timer) { clearTimeout(timer); timer = null; }
    if (!data) return;
    data.updatedAt = new Date().toISOString();
    try { writeJsonAtomic(file, data); } catch (_) { /* thư mục không ghi được: bỏ qua, không làm hỏng việc tạo giọng */ }
  };
  return {
    add(fileName, text) {
      const d = load();
      if (d.entries[fileName] === text) return;
      d.entries[fileName] = text;
      if (!timer) { timer = setTimeout(flush, delayMs); if (timer.unref) timer.unref(); }
    },
    flush,
    entries: () => load().entries
  };
}

/** Ghi tiến độ (ghi đè cả file, nhỏ nên ghi sau mỗi câu cũng được). */
function writeProgress(cacheDir, sentences, sc, extra = {}) {
  const next = sc.firstMissing;
  const p = {
    updatedAt: new Date().toISOString(),
    total: sc.total, done: sc.doneCount, remaining: sc.total - sc.doneCount,
    percent: sc.total ? Math.round((sc.doneCount / sc.total) * 1000) / 10 : 100,
    nextPosition: next === null ? null : next + 1,                    // câu kế tiếp chưa có giọng, đếm từ 1
    nextSentence: next === null ? null : sentences[next].text,
    byKind: sc.byKind,
    ...extra
  };
  writeJsonAtomic(path.join(cacheDir, PROGRESS_FILE), p);
  return p;
}

module.exports = { INDEX_FILE, PROGRESS_FILE, loadSentences, scan, createIndexWriter, writeProgress, readJson };
