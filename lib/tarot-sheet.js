'use strict';
// Nội dung bói từ Google Sheet "Data bài" → data/tarot/readings.json.
// Hàm thuần (không mạng, không file): đọc CSV, tìm cột theo tiêu đề, chuẩn hóa, kiểm tra, dựng dữ liệu.
// Tab nào là loại gì (1 lá / 3 lá + chủ đề) khai báo ở data/tarot/sheet-tabs.json — chủ đề lấy từ tên tab.

const MAX_SENTENCE_CHARS = 140;   // tts_worker.py cắt ở 160 ký tự

/** CSV chuẩn RFC 4180: ô có ngoặc kép, "" là dấu ngoặc kép, xuống dòng trong ô. */
function parseCsv(text) {
  const rows = [];
  let row = []; let cell = ''; let quoted = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"') {
        if (s[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const clean = (v) => String(v ?? '').replace(/\s+/g, ' ').trim();
const norm = (v) => clean(v).normalize('NFC').toLowerCase();

/** Chiều lá: "Xuôi"/"up" → up, "Ngược"/"rev" → rev; khác → null. */
function normDir(v) {
  const t = norm(v);
  if (['up', 'xuôi', 'xuoi', 'thuận'].includes(t)) return 'up';
  if (['rev', 'ngược', 'nguoc', 'reversed'].includes(t)) return 'rev';
  return null;
}

/** Tách đoạn thành câu (theo . ! ? …), giữ dấu câu. */
function splitSentences(text) {
  const t = clean(text);
  if (!t) return [];
  return t.split(/(?<=[.!?…])\s+/).map((x) => x.trim()).filter(Boolean);
}

// Cột cần có, tìm theo tiền tố tiêu đề (không phân biệt hoa thường) để chịu được "(2 câu)", "(quá khứ)"...
const COLUMNS = {
  single: { id: 'id', name: 'tên lá', dir: 'chiều', lead: 'câu dẫn', present: 'nội dung hiện tại', advice: 'lời khuyên', tone: 'sắc thái' },
  triple: {
    stt: 'stt', c1: 'lá 1 id', d1: 'lá 1 chiều', c2: 'lá 2 id', d2: 'lá 2 chiều', c3: 'lá 3 id', d3: 'lá 3 chiều',
    opening: 'câu mở đầu', card1: 'đọc lá 1', card2: 'đọc lá 2', card3: 'đọc lá 3', closing: 'lời kết'
  }
};
const OPTIONAL = new Set(['tone', 'stt', 'name']);
const TEXT_FIELDS = { single: ['lead', 'present', 'advice'], triple: ['opening', 'card1', 'card2', 'card3', 'closing'] };

function mapColumns(header, type) {
  const h = header.map(norm);
  const out = {}; const missing = [];
  for (const [key, prefix] of Object.entries(COLUMNS[type])) {
    const idx = h.findIndex((x) => x === prefix || x.startsWith(prefix + ' ') || x.startsWith(prefix + '('));
    if (idx >= 0) out[key] = idx;
    else if (!OPTIONAL.has(key)) missing.push(prefix);
  }
  return { cols: out, missing };
}

/**
 * Dựng readings từ các tab đã tải.
 * @param {Record<string, string[][]>} tabs  tên tab → các hàng CSV (hàng 1 là tiêu đề)
 * @param {Record<string, {type:'single'|'triple', topic?:string}>} tabConfig
 * @param {Set<string>} cardIds  78 id hợp lệ
 * @returns {{ readings, errors: string[], warnings: string[], summary: object }}
 */
function buildReadings(tabs, tabConfig, cardIds) {
  const errors = []; const warnings = [];
  const readings = { single: [], triple: {}, cardNames: {} };
  const summary = { tabs: {}, unusedCards: [], missingTabs: [] };
  const seenCards = new Set();

  for (const name of Object.keys(tabs)) {
    if (!tabConfig[name]) warnings.push(`Tab "${name}" chưa khai báo trong sheet-tabs.json → bỏ qua.`);
  }
  for (const [tabName, tc] of Object.entries(tabConfig)) {
    const rows = tabs[tabName];
    if (!rows) { summary.missingTabs.push(tabName); errors.push(`Thiếu tab "${tabName}" (đã khai báo trong sheet-tabs.json).`); continue; }
    if (!['single', 'triple'].includes(tc.type)) { errors.push(`Tab "${tabName}": type phải là "single" hoặc "triple".`); continue; }
    if (tc.type === 'triple' && !tc.topic) { errors.push(`Tab "${tabName}": tab 3 lá cần "topic".`); continue; }
    const [header = [], ...body] = rows;
    const { cols, missing } = mapColumns(header, tc.type);
    if (missing.length) { errors.push(`Tab "${tabName}": thiếu cột ${missing.map((m) => `"${m}"`).join(', ')} (có thể sai tên tab hoặc sai hàng tiêu đề).`); continue; }

    let count = 0;
    const triples = new Map();
    body.forEach((r, i) => {
      const rowNo = i + 2;   // số hàng trong sheet
      const get = (k) => clean(r[cols[k]]);
      if (r.every((c) => !clean(c))) return;   // hàng trống
      const where = `Tab "${tabName}" hàng ${rowNo}`;
      let bad = false;
      const fail = (msg) => { errors.push(`${where}: ${msg}`); bad = true; };
      for (const f of TEXT_FIELDS[tc.type]) {
        const v = get(f);
        if (!v) { fail(`ô "${COLUMNS[tc.type][f]}" đang trống`); continue; }
        for (const sen of splitSentences(v)) {
          if (sen.length > MAX_SENTENCE_CHARS) fail(`câu dài ${sen.length} ký tự (> ${MAX_SENTENCE_CHARS}) ở ô "${COLUMNS[tc.type][f]}": "${sen.slice(0, 50)}…"`);
        }
      }
      if (tc.type === 'single') {
        const id = get('id'); const dir = normDir(get('dir'));
        if (!cardIds.has(id)) fail(`id lá "${id}" không có trong bộ 78 lá`);
        if (!dir) fail(`chiều "${get('dir')}" không hợp lệ (cần Xuôi/Ngược hoặc up/rev)`);
        if (bad) return;
        seenCards.add(id);
        // Tên lá theo sheet (để chữ trên màn hình khớp với lời đọc).
        if (cols.name !== undefined && get('name') && !readings.cardNames[id]) readings.cardNames[id] = get('name');
        readings.single.push({ row: rowNo, id, reversed: dir === 'rev', lead: get('lead'), present: get('present'), advice: get('advice'), tone: cols.tone !== undefined ? get('tone') : '' });
      } else {
        const cards = [1, 2, 3].map((n) => ({ id: get(`c${n}`), dir: normDir(get(`d${n}`)), raw: get(`d${n}`) }));
        cards.forEach((c, k) => {
          if (!cardIds.has(c.id)) fail(`lá ${k + 1} id "${c.id}" không có trong bộ 78 lá`);
          if (!c.dir) fail(`lá ${k + 1} chiều "${c.raw}" không hợp lệ (cần up/rev hoặc Xuôi/Ngược)`);
        });
        if (new Set(cards.map((c) => c.id)).size !== 3) fail('ba lá phải khác nhau');
        if (bad) return;
        const key = cards.map((c) => c.id + c.dir).join('|');
        if (triples.has(key)) warnings.push(`${where}: trùng bộ ba lá với hàng ${triples.get(key)}.`);
        else triples.set(key, rowNo);
        cards.forEach((c) => seenCards.add(c.id));
        (readings.triple[tc.topic] ||= []).push({
          row: rowNo, stt: cols.stt !== undefined ? Number(get('stt')) || null : null,
          cards: cards.map((c) => ({ id: c.id, reversed: c.dir === 'rev' })),
          opening: get('opening'), card1: get('card1'), card2: get('card2'), card3: get('card3'), closing: get('closing')
        });
      }
      count++;
    });
    summary.tabs[tabName] = { type: tc.type, topic: tc.topic || null, rows: count };
  }
  // Thứ tự lần bốc trong tab 3 lá: theo STT nếu có, không thì theo thứ tự hàng.
  for (const list of Object.values(readings.triple)) list.sort((a, b) => (a.stt ?? a.row) - (b.stt ?? b.row) || a.row - b.row);
  summary.unusedCards = [...cardIds].filter((id) => !seenCards.has(id));
  return { readings, errors, warnings, summary };
}

module.exports = { parseCsv, normDir, splitSentences, buildReadings, mapColumns, MAX_SENTENCE_CHARS };
