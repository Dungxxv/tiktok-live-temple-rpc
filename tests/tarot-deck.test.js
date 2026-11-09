import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { loadDeck, checkDeck, draw, withKeywords, pickReading } = require('../lib/tarot-deck.js');
const deck = loadDeck(path.join(import.meta.dir, '..', 'data', 'tarot', 'cards.json'));

// rng xác định (mulberry32)
function seeded(seed) {
  let a = seed;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('tarot-deck: dữ liệu', () => {
  it('đủ 78 lá: 22 Ẩn chính + 56 Ẩn phụ (4 bộ x 14)', () => {
    expect(deck.length).toBe(78);
    expect(deck.filter((c) => c.arcana === 'major').length).toBe(22);
    for (const suit of ['wands', 'cups', 'swords', 'pentacles']) {
      expect(deck.filter((c) => c.suit === suit).length).toBe(14);
    }
  });

  it('mọi lá hợp lệ: câu <= 140 ký tự, đủ xuôi/ngược, không từ nhạy cảm', () => {
    expect(checkDeck(deck)).toEqual([]);
  });

  it('id không trùng', () => {
    expect(new Set(deck.map((c) => c.id)).size).toBe(78);
  });

  it('phát hiện câu quá dài và từ nhạy cảm', () => {
    const bad = JSON.parse(JSON.stringify(deck));
    bad[0].readings.general.up[0] = 'x'.repeat(141);
    bad[1].readings.general.rev[0] = 'Bạn nên đi gặp bác sĩ sớm.';
    const problems = checkDeck(bad);
    expect(problems.some((p) => p.includes('141'))).toBe(true);
    expect(problems.some((p) => p.includes('nhạy cảm'))).toBe(true);
  });
});

describe('tarot-deck: rút bài', () => {
  it('rút nhiều lá không trùng nhau', () => {
    for (let s = 1; s <= 50; s++) {
      const cards = draw(deck, 3, { rng: seeded(s) });
      expect(new Set(cards.map((c) => c.id)).size).toBe(3);
    }
  });

  it('rng cố định cho kết quả cố định', () => {
    const a = draw(deck, 3, { rng: seeded(42) });
    const b = draw(deck, 3, { rng: seeded(42) });
    expect(a).toEqual(b);
    const c = draw(deck, 3, { rng: seeded(43) });
    expect(c).not.toEqual(a);
  });

  it('loại các lá exclude khi bộ còn đủ lá', () => {
    const exclude = new Set(deck.slice(0, 70).map((c) => c.id));
    for (let s = 1; s <= 20; s++) {
      for (const card of draw(deck, 3, { rng: seeded(s), exclude })) expect(exclude.has(card.id)).toBe(false);
    }
  });

  it('bỏ ràng buộc exclude khi không đủ lá để rút', () => {
    const exclude = new Set(deck.slice(0, 77).map((c) => c.id));
    expect(draw(deck, 3, { rng: seeded(1), exclude }).length).toBe(3);
  });

  it('reversedChance 0 và 1', () => {
    expect(draw(deck, 3, { rng: seeded(1), reversedChance: 0 }).every((c) => !c.reversed)).toBe(true);
    expect(draw(deck, 3, { rng: seeded(1), reversedChance: 1 }).every((c) => c.reversed)).toBe(true);
  });

  it('tỉ lệ ngược xấp xỉ cấu hình (0,3)', () => {
    const rng = seeded(7);
    let rev = 0; const n = 3000;
    for (let i = 0; i < n; i++) if (draw(deck, 1, { rng, reversedChance: 0.3 })[0].reversed) rev++;
    expect(rev / n).toBeGreaterThan(0.26);
    expect(rev / n).toBeLessThan(0.34);
  });

  it('phân phối khá đều: 78 lá đều xuất hiện sau nhiều lần rút', () => {
    const rng = seeded(11);
    const seen = new Set();
    for (let i = 0; i < 3000; i++) seen.add(draw(deck, 1, { rng })[0].id);
    expect(seen.size).toBe(78);
  });
});

describe('tarot-deck: lời giải', () => {
  it('1 lá: đúng câu xuôi/ngược của lá đó', () => {
    const [d] = draw(deck, 1, { rng: seeded(5), reversedChance: 0 });
    const c = deck.find((x) => x.id === d.id);
    expect(pickReading(deck, [d])).toEqual(c.readings.general.up);
    const lines = pickReading(deck, [{ ...d, reversed: true }]);
    expect(lines).toEqual(c.readings.general.rev);
  });

  it('nhiều lá: có câu giới thiệu tên từng lá và mọi câu <= 140 ký tự', () => {
    const drawn = draw(deck, 3, { rng: seeded(9) });
    const lines = pickReading(deck, drawn);
    expect(lines.length).toBeGreaterThanOrEqual(9);
    expect(lines.filter((l) => l.startsWith('Lá ')).length).toBe(3);
    expect(lines.every((l) => l.length <= 140)).toBe(true);
  });

  it('chủ đề chưa có dữ liệu thì dùng general', () => {
    const [d] = draw(deck, 1, { rng: seeded(5), reversedChance: 0 });
    expect(pickReading(deck, [d], 'love')).toEqual(pickReading(deck, [d], 'general'));
  });

  it('withKeywords gắn từ khóa theo chiều bài', () => {
    const up = withKeywords(deck, draw(deck, 1, { rng: seeded(3), reversedChance: 0 }))[0];
    const rev = withKeywords(deck, draw(deck, 1, { rng: seeded(3), reversedChance: 1 }))[0];
    expect(up.keywords.length).toBeGreaterThan(0);
    expect(rev.keywords.length).toBeGreaterThan(0);
  });
});
