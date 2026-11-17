import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { parseCsv, normDir, splitSentences, buildReadings } = require('../lib/tarot-sheet.js');

const ids = new Set(['major-00', 'major-01', 'cups-01', 'cups-02', 'wands-08']);
const H1 = ['id', 'Tên lá', 'Chiều', 'Câu dẫn lá', 'Nội dung hiện tại (2 câu)', 'Lời khuyên thời gian tới (2 câu)', 'Sắc thái'];
const H3 = ['STT', 'Lá 1 id', 'Lá 1 chiều', 'Lá 2 id', 'Lá 2 chiều', 'Lá 3 id', 'Lá 3 chiều', 'Câu mở đầu', 'Đọc lá 1 (quá khứ)', 'Đọc lá 2 (hiện tại)', 'Đọc lá 3 (tương lai)', 'Lời kết'];
const row1 = (id = 'major-00', dir = 'Xuôi', present = 'Câu một. Câu hai.') => [id, 'Tên', dir, 'Câu dẫn.', present, 'Lời khuyên một. Lời khuyên hai!', 'ấm'];
const row3 = (stt, a = 'major-00', b = 'cups-01', c = 'wands-08', da = 'up') => [String(stt), a, da, b, 'rev', c, 'up', 'Mở đầu.', 'Lá một.', 'Lá hai.', 'Lá ba.', 'Kết.'];
const cfg = { 'Bốc 1 lá': { type: 'single' }, 'Bốc 3 lá chủ đề tình yêu': { type: 'triple', topic: 'love' } };

describe('tarot-sheet: CSV và chuẩn hóa', () => {
  it('parseCsv: ngoặc kép, dấu phẩy và xuống dòng trong ô, "" thành "', () => {
    expect(parseCsv('a,"b, c","d ""x""\ne"\r\n1,2,3')).toEqual([['a', 'b, c', 'd "x"\ne'], ['1', '2', '3']]);
  });
  it('normDir: Xuôi/Ngược/up/rev', () => {
    expect([normDir('Xuôi'), normDir(' ngược '), normDir('up'), normDir('REV'), normDir('ngang')]).toEqual(['up', 'rev', 'up', 'rev', null]);
  });
  it('splitSentences tách theo . ! ? và bỏ khoảng trắng thừa', () => {
    expect(splitSentences('  Một.  Hai!\nBa?  ')).toEqual(['Một.', 'Hai!', 'Ba?']);
  });
});

describe('tarot-sheet: dựng readings và kiểm tra', () => {
  it('dữ liệu hợp lệ: 1 lá chuẩn hóa chiều; 3 lá xếp theo STT', () => {
    const r = buildReadings({ 'Bốc 1 lá': [H1, row1('major-00', 'Ngược')], 'Bốc 3 lá chủ đề tình yêu': [H3, row3(2), row3(1, 'major-01')] }, cfg, ids);
    expect(r.errors).toEqual([]);
    expect(r.readings.single[0]).toMatchObject({ id: 'major-00', reversed: true, lead: 'Câu dẫn.', present: 'Câu một. Câu hai.' });
    expect(r.readings.triple.love.map((x) => x.stt)).toEqual([1, 2]);
    expect(r.readings.triple.love[0].cards).toEqual([{ id: 'major-01', reversed: false }, { id: 'cups-01', reversed: true }, { id: 'wands-08', reversed: false }]);
  });
  it('bỏ qua hàng trống; tab không khai báo chỉ cảnh báo', () => {
    const r = buildReadings({ 'Bốc 1 lá': [H1, ['', '', ''], row1()], 'Bốc 3 lá chủ đề tình yêu': [H3], 'Thư viện': [['x']] }, cfg, ids);
    expect(r.errors).toEqual([]);
    expect(r.readings.single.length).toBe(1);
    expect(r.warnings.some((w) => w.includes('Thư viện'))).toBe(true);
  });
  it('lỗi: id lạ, chiều sai, ba lá trùng nhau, câu > 140 ký tự, ô trống', () => {
    const long = 'a'.repeat(141) + '.';
    const r = buildReadings({
      'Bốc 1 lá': [H1, row1('major-99'), row1('major-00', 'ngang'), row1('major-01', 'Xuôi', long)],
      'Bốc 3 lá chủ đề tình yêu': [H3, row3(1, 'cups-01', 'cups-01'), [...row3(2).slice(0, 11), '']]
    }, cfg, ids);
    const all = r.errors.join('\n');
    expect(all).toContain('major-99');
    expect(all).toContain('"ngang"');
    expect(all).toContain('ba lá phải khác nhau');
    expect(all).toContain('142 ký tự');
    expect(all).toContain('đang trống');
    expect(r.readings.single.length).toBe(0);
  });
  it('thiếu tab đã khai báo, hoặc tab sai cột (vd. gviz trả nhầm tab đầu) → lỗi rõ ràng', () => {
    const r1 = buildReadings({ 'Bốc 1 lá': [H1, row1()] }, cfg, ids);
    expect(r1.errors.join()).toContain('Thiếu tab "Bốc 3 lá chủ đề tình yêu"');
    const r2 = buildReadings({ 'Bốc 1 lá': [H1, row1()], 'Bốc 3 lá chủ đề tình yêu': [H1, row1()] }, cfg, ids);
    expect(r2.errors.join()).toContain('thiếu cột');
  });
  it('trùng bộ ba lá chỉ cảnh báo, không dừng', () => {
    const r = buildReadings({ 'Bốc 1 lá': [H1], 'Bốc 3 lá chủ đề tình yêu': [H3, row3(1), row3(2)] }, cfg, ids);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => w.includes('trùng bộ ba'))).toBe(true);
    expect(r.readings.triple.love.length).toBe(2);
  });
  it('lấy tên lá theo cột "Tên lá" của tab 1 lá (cardNames)', () => {
    const r = buildReadings({ 'Bốc 1 lá': [H1, row1('major-00')], 'Bốc 3 lá chủ đề tình yêu': [H3] }, cfg, ids);
    expect(r.readings.cardNames).toEqual({ 'major-00': 'Tên' });
  });

  it('tóm tắt: số dòng mỗi tab và lá chưa xuất hiện', () => {
    const r = buildReadings({ 'Bốc 1 lá': [H1, row1()], 'Bốc 3 lá chủ đề tình yêu': [H3, row3(1)] }, cfg, ids);
    expect(r.summary.tabs['Bốc 1 lá'].rows).toBe(1);
    expect(r.summary.unusedCards).toEqual(['major-01', 'cups-02']);
  });
});
