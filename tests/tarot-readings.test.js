import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createReadingPicker } = require('../lib/tarot-readings.js');

const triple = (n, tag) => Array.from({ length: n }, (_, i) => ({ row: i + 2, stt: i + 1, tag: `${tag}${i + 1}`, cards: [] }));
const single = (n) => Array.from({ length: n }, (_, i) => ({ row: i + 2, id: `c${i}`, reversed: false }));
const data = () => ({ single: single(20), triple: { love: triple(3, 'L'), overview: triple(2, 'O') } });
const seq = (...vals) => { let i = 0; return () => vals[i++ % vals.length]; };

describe('tarot-readings: phiên quà đi tuần tự theo chủ đề', () => {
  it('lấy dòng lần lượt, hết dòng cuối quay lại dòng 1; mỗi chủ đề con trỏ riêng', () => {
    const p = createReadingPicker({ readings: data() });
    const got = ['a', 'b', 'c', 'd'].map((v) => p.take(v, { type: 'triple', topic: 'love' }).row.tag);
    expect(got).toEqual(['L1', 'L2', 'L3', 'L1']);
    expect(p.take('e', { type: 'triple', topic: 'overview' }).row.tag).toBe('O1');
  });

  it('đặt chỗ trước: gọi lại trả đúng dòng đã giữ; người sau nhận dòng kế tiếp', () => {
    const p = createReadingPicker({ readings: data() });
    expect(p.reserve('a', { type: 'triple', topic: 'love' }).row.tag).toBe('L1');
    expect(p.reserve('a', { type: 'triple', topic: 'love' }).row.tag).toBe('L1');
    expect(p.reserve('b', { type: 'triple', topic: 'love' }).row.tag).toBe('L2');
    expect(p.take('a', { type: 'triple', topic: 'love' }).row.tag).toBe('L1');
    expect(p.peek('a')).toBeNull();
  });

  it('khách rời hàng: trả dòng (lùi con trỏ nếu là dòng mới nhất được cấp)', () => {
    const p = createReadingPicker({ readings: data() });
    p.reserve('a', { type: 'triple', topic: 'love' });          // L1
    p.reserve('b', { type: 'triple', topic: 'love' });          // L2
    expect(p.release('b')).toBe(true);
    expect(p.take('c', { type: 'triple', topic: 'love' }).row.tag).toBe('L2');   // không bỏ sót L2
    p.release('a');                                             // L1 không phải dòng mới nhất → không lùi
    expect(p.take('d', { type: 'triple', topic: 'love' }).row.tag).toBe('L3');
  });

  it('đổi chủ đề khi đang giữ chỗ (tặng quà khác): trả dòng cũ, giữ dòng chủ đề mới', () => {
    const p = createReadingPicker({ readings: data() });
    p.reserve('a', { type: 'triple', topic: 'overview' });      // O1
    expect(p.reserve('a', { type: 'triple', topic: 'love' }).row.tag).toBe('L1');
    expect(p.cursorOf('overview')).toBe(0);
  });

  it('con trỏ lưu/khôi phục; sheet bớt dòng thì con trỏ vượt quá về dòng đầu', () => {
    const p = createReadingPicker({ readings: data() });
    p.take('a', { type: 'triple', topic: 'love' }); p.take('b', { type: 'triple', topic: 'love' });
    const saved = p.exportState();
    const q = createReadingPicker({ readings: data() });
    q.importState(saved);
    expect(q.take('c', { type: 'triple', topic: 'love' }).row.tag).toBe('L3');
    q.importState(saved);
    q.setReadings({ ...data(), triple: { love: triple(2, 'L'), overview: triple(2, 'O') } });
    expect(q.take('d', { type: 'triple', topic: 'love' }).row.tag).toBe('L1');
  });

  it('chủ đề chưa có tab (vd. specific) → đọc tạm "overview" và ghi log specificFallback', () => {
    const logs = [];
    const p = createReadingPicker({ readings: data(), log: (m) => logs.push(m) });
    const r = p.take('a', { type: 'triple', topic: 'specific' });
    expect(r).toMatchObject({ topic: 'overview', fallback: 'specific' });
    expect(logs.join()).toContain('specificFallback');
  });
});

describe('tarot-readings: phiên vào phòng chọn ngẫu nhiên', () => {
  it('rng cố định cho kết quả cố định', () => {
    const a = createReadingPicker({ readings: data(), rng: seq(0.5) });
    const b = createReadingPicker({ readings: data(), rng: seq(0.5) });
    expect(a.take('x', { type: 'single' }).index).toBe(b.take('x', { type: 'single' }).index);
  });

  it('không lặp lại 10 dòng vừa dùng', () => {
    const p = createReadingPicker({ readings: data(), rng: seq(0) });   // luôn chọn phần tử đầu của các dòng còn lại
    const got = Array.from({ length: 12 }, (_, i) => p.take(`v${i}`, { type: 'single' }).index);
    expect(new Set(got.slice(0, 11)).size).toBe(11);
  });

  it('không có dữ liệu → null (phiên dùng cách rút bài cũ)', () => {
    const p = createReadingPicker({ readings: null });
    expect(p.hasData()).toBe(false);
    expect(p.take('x', { type: 'single' })).toBeNull();
    expect(p.take('y', { type: 'triple', topic: 'love' })).toBeNull();
  });
});
