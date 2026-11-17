// Nháp lời giải bằng Claude: dùng client giả (không gọi mạng), kiểm tra yêu cầu gửi đi + xử lý kết quả + RPC tarot.aiDraft.
import { describe, expect, it } from 'bun:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const require = createRequire(import.meta.url);
const { createReadingWriter, riskyWords, buildSchema } = require('../lib/tarot-ai.js');
const { createTarotService, ADMIN_METHODS } = require('../lib/tarot-rpc.js');
const { loadDeck } = require('../lib/tarot-deck.js');
const { DEFAULT_CONFIG, validateConfig, mergeConfig } = require('../lib/tarot-config.js');

const SECTIONS = ['opening', 'card1', 'card2', 'card3', 'closing'];
const CARDS = [
  { id: 'swords-13', name: 'Nữ Vương Kiếm', reversed: false, positionLabel: 'Quá khứ' },
  { id: 'cups-04', name: 'Bốn Cốc', reversed: false, positionLabel: 'Hiện tại' },
  { id: 'cups-03', name: 'Ba Cốc', reversed: true, positionLabel: 'Tương lai' }
];

function fakeClient(reply, { stop = 'end_turn' } = {}) {
  const calls = [];
  return {
    calls,
    beta: { messages: { create: async (req) => { calls.push(req); return { model: req.model, stop_reason: stop, content: [{ type: 'text', text: JSON.stringify(reply) }], usage: { input_tokens: 900, output_tokens: 400 } }; } } }
  };
}
const REPLY = Object.fromEntries(SECTIONS.map((k) => [k, `Đoạn ${k} cho câu hỏi.  Có thể   bạn đang băn khoăn.`]));

describe('tarot-ai: createReadingWriter', () => {
  it('gửi Claude Opus 5.5, JSON schema đúng các phần, câu hỏi + lá + lời sheet; không có tên khách', async () => {
    const client = fakeClient(REPLY);
    const w = createReadingWriter({ client });
    const r = await w.write({ question: 'Người ấy có nhớ mình không?', topicLabel: 'Tình Yêu', cards: CARDS, sections: SECTIONS, sheet: { card1: 'Lời sheet lá 1.' } });
    const req = client.calls[0];
    expect(req.model).toBe('claude-opus-5-5');
    expect(req.fallbacks).toBe('default');
    expect(req.betas).toEqual(['server-side-fallback-2026-07-01']);
    expect(req.output_config.format).toEqual({ type: 'json_schema', schema: buildSchema(SECTIONS) });
    expect(req.thinking).toBeUndefined();
    const prompt = req.messages[0].content;
    expect(prompt).toContain('Người ấy có nhớ mình không?');
    expect(prompt).toContain('Ba Cốc (chiều ngược)');
    expect(prompt).toContain('Lời sheet lá 1.');
    expect(req.system).toContain('Không dùng "sẽ"');
    expect(r.lines.card1).toBe('Đoạn card1 cho câu hỏi. Có thể bạn đang băn khoăn.');   // gom khoảng trắng
    expect(Object.keys(r.lines)).toEqual(SECTIONS);
    expect(r.usage).toEqual({ input: 900, output: 400 });
  });

  it('báo lỗi rõ khi: chưa có khóa, chưa nhập câu hỏi, Claude từ chối, bị cắt, JSON hỏng', async () => {
    await expect(createReadingWriter({ env: {}, cliPath: null }).write({ question: 'a', cards: CARDS, sections: SECTIONS })).rejects.toThrow('ANTHROPIC_API_KEY');
    await expect(createReadingWriter({ client: fakeClient(REPLY) }).write({ question: ' ', cards: CARDS, sections: SECTIONS })).rejects.toThrow('câu hỏi');
    await expect(createReadingWriter({ client: fakeClient(REPLY, { stop: 'refusal' }) }).write({ question: 'a', cards: CARDS, sections: SECTIONS })).rejects.toThrow('từ chối');
    await expect(createReadingWriter({ client: fakeClient(REPLY, { stop: 'max_tokens' }) }).write({ question: 'a', cards: CARDS, sections: SECTIONS })).rejects.toThrow('cắt');
    const bad = { beta: { messages: { create: async () => ({ stop_reason: 'end_turn', content: [{ type: 'text', text: '{oops' }] }) } } };
    await expect(createReadingWriter({ client: bad }).write({ question: 'a', cards: CARDS, sections: SECTIONS })).rejects.toThrow('định dạng');
  });

  it('enabled theo khóa trong env; riskyWords bắt "sẽ"/"chắc chắn" nguyên từ', () => {
    expect(createReadingWriter({ env: {}, cliPath: null }).enabled()).toBe(false);
    expect(createReadingWriter({ env: { ANTHROPIC_API_KEY: 'k' } }).engine()).toBe('api');
    expect(createReadingWriter({ env: {}, cliPath: 'C:/x/claude.exe' }).engine()).toBe('cli');
    expect(createReadingWriter({ env: { ANTHROPIC_API_KEY: 'k' }, cliPath: 'C:/x/claude.exe' }).engine()).toBe('api');   // có khóa thì ưu tiên API
    expect(riskyWords('Bạn sẽ gặp may. Chắc chắn vậy.')).toEqual(['sẽ', 'chắc chắn']);
    expect(riskyWords('Sẻ chia nhẹ nhàng.')).toEqual([]);
  });
});

describe('tarot-ai: chạy bằng Claude Code (không khóa API)', () => {
  it('gọi CLI với lời dặn tarot + schema + câu hỏi; đọc structured_output', async () => {
    const calls = [];
    const runCli = async (o) => { calls.push(o); return { subtype: 'success', is_error: false, structured_output: REPLY, usage: { input_tokens: 2, cache_creation_input_tokens: 1500, output_tokens: 300 }, modelUsage: { 'claude-opus-5-5': {} } }; };
    const w = createReadingWriter({ env: {}, cliPath: 'C:/x/claude.exe', runCli });
    const r = await w.write({ question: 'Có nên đổi việc không?', topicLabel: 'Sự Nghiệp', cards: CARDS, sections: SECTIONS, sheet: {} });
    expect(calls[0].cli).toBe('C:/x/claude.exe');
    expect(calls[0].system).toContain('tarot');
    expect(calls[0].schema).toEqual(buildSchema(SECTIONS));
    expect(calls[0].prompt).toContain('Có nên đổi việc không?');
    expect(r).toMatchObject({ engine: 'cli', model: 'claude-opus-5-5', usage: { input: 1502, output: 300 } });
    expect(r.lines.closing).toContain('closing');
  });

  it('kết quả không có structured_output thì đọc result; hỏng thì báo lỗi', async () => {
    const ok = createReadingWriter({ env: {}, cliPath: 'x', runCli: async () => ({ subtype: 'success', result: JSON.stringify(REPLY) }) });
    expect((await ok.write({ question: 'a', cards: CARDS, sections: SECTIONS })).lines.card3).toContain('card3');
    const bad = createReadingWriter({ env: {}, cliPath: 'x', runCli: async () => ({ subtype: 'success', result: 'không phải json' }) });
    await expect(bad.write({ question: 'a', cards: CARDS, sections: SECTIONS })).rejects.toThrow('định dạng');
  });
});

describe('tarot.aiDraft (RPC)', () => {
  const dir = path.join(import.meta.dir, '..', 'data', 'tarot');
  const readJson = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
  const make = (aiWriter, over = {}) => {
    const svc = createTarotService({
      config: validateConfig(mergeConfig(DEFAULT_CONFIG, { queueOrder: 'lanes', singleCardSessions: false, commentTopicCodes: { '02': { topic: 'love', label: 'Tình Yêu' } }, ...over })),
      deck: loadDeck(path.join(dir, 'cards.json')), clock: { now: () => 5e6, setTimeout: () => 0, clearTimeout: () => {} },
      readings: readJson('readings.json'), giftTopics: readJson('gift-topics.json'), fixedLines: readJson('fixed-lines.json'),
      sanitizeUserName: (s) => s, isBlocked: (t) => /cấmxx/.test(t), aiWriter
    });
    svc.session.stop();
    svc.onComment({ viewerId: 'Bình', name: 'Bình', text: '02' });
    return svc;
  };

  it('câu hỏi đặc biệt → Claude soạn với bộ lá MỚI bốc từ bộ bài, không gửi lời sheet, không gửi tên khách; chưa lưu', async () => {
    const client = fakeClient(REPLY);
    const svc = make(createReadingWriter({ client }));
    const d = await svc.rpc('tarot.getViewer', { viewerId: 'Bình' });
    expect(d.ai).toBe(true);
    const r = await svc.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'Người ấy có nhớ mình không?' });
    expect(r.cards).toHaveLength(3);
    expect(r.cards.map((c) => c.positionLabel)).toEqual(['Quá khứ', 'Hiện tại', 'Tương lai']);
    const prompt = client.calls[0].messages[0].content;
    for (const c of r.cards) expect(prompt).toContain(c.name);
    expect(prompt).not.toContain('Lời mẫu trong sheet');
    expect(prompt).not.toContain(readJson('readings.json').triple.love[0].card1.slice(0, 30));
    expect(prompt).not.toContain('Bình');
    const after = await svc.rpc('tarot.getViewer', { viewerId: 'Bình' });
    expect(after.custom).toBeNull();
    expect(after.plan.aiMode).toBe(false);
    expect(ADMIN_METHODS.has('tarot.aiDraft')).toBe(true);
  });

  it('câu hỏi về đổi việc → tự đổi chủ đề sang Sự nghiệp (chỉ nhãn, không giữ dòng sheet)', async () => {
    const svc = make(createReadingWriter({ client: fakeClient(REPLY) }));
    const r = await svc.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'Tháng này mình có nên đổi việc không?' });
    expect(r.topicChanged).toMatchObject({ hits: ['đổi việc'] });
    expect(r.topic).toBe('career');
    expect(r.detail.entry.commentTopic).toBe('career');
    expect(r.detail.plan.source).toBe('preview');
  });

  it('lưu nháp kèm bộ lá → phiên riêng: dùng đúng lá + lời Claude, không tốn dòng sheet; vào bệ đọc đúng; dùng một lần', async () => {
    const svc = make(createReadingWriter({ client: fakeClient(REPLY) }), { firstJoinGraceSec: 0, phaseSec: { INTERMISSION: 0 } });
    const r = await svc.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'Người ấy có nhớ mình không?' });
    const saved = await svc.rpc('tarot.setCustom', { viewerId: 'Bình', question: 'Người ấy có nhớ mình không?', lines: r.lines, cards: r.cards });
    expect(saved.plan).toMatchObject({ aiMode: true, source: 'custom' });
    expect(saved.plan.cards.map((c) => [c.id, c.reversed])).toEqual(r.cards.map((c) => [c.id, c.reversed]));
    expect(saved.plan.speech.READING.join(' ')).toContain('Đoạn card2');
    expect(saved.plan.speech.CALLING.join(' ')).toContain('Câu hỏi của bạn là: Người ấy có nhớ mình không?');
    // Dòng sheet không bị dùng: khách khác cùng chủ đề vẫn nhận dòng đầu tab Tình Yêu.
    svc.onComment({ viewerId: 'Chi', name: 'Chi', text: '02' });
    const love0 = readJson('readings.json').triple.love[0].cards.map((c) => c.id);
    expect((await svc.rpc('tarot.getViewer', { viewerId: 'Chi' })).plan.cards.map((c) => c.id)).toEqual(love0);
    // Vào bệ: đúng bộ lá riêng.
    svc.session.start();
    expect(svc.getState().seat.viewerId).toBe('Bình');
    expect(svc.getState().cards.map((c) => c.id)).toEqual(r.cards.map((c) => c.id));
    const seated = await svc.rpc('tarot.getViewer', { viewerId: 'Bình' });
    expect(seated.plan.aiMode).toBe(true);
    expect(seated.custom).toBeNull();
    expect((await svc.rpc('tarot.getViewer', { viewerId: 'Chi' })).plan.cards.map((c) => c.id)).toEqual(love0);
  });

  it('phiên riêng: lá lạ / trùng / thiếu phần lời → lỗi', async () => {
    const svc = make(createReadingWriter({ client: fakeClient(REPLY) }));
    const r = await svc.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'Hỏi thử' });
    const q = { viewerId: 'Bình', question: 'Hỏi thử' };
    await expect(svc.rpc('tarot.setCustom', { ...q, lines: r.lines, cards: [{ id: 'khongco' }, r.cards[1], r.cards[2]] })).rejects.toThrow('không hợp lệ');
    await expect(svc.rpc('tarot.setCustom', { ...q, lines: r.lines, cards: [r.cards[0], r.cards[0], r.cards[2]] })).rejects.toThrow('không hợp lệ');
    await expect(svc.rpc('tarot.setCustom', { ...q, lines: { ...r.lines, card3: '' }, cards: r.cards })).rejects.toThrow('Lá 3');
  });

  it('câu hỏi không rõ chủ đề → giữ chủ đề cũ; autoTopic=false → không đổi', async () => {
    const svc = make(createReadingWriter({ client: fakeClient(REPLY) }));
    expect((await svc.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'Dạo này mình thấy thế nào?' })).topicChanged).toBeNull();
    expect((await svc.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'Có nên đổi việc?', autoTopic: false })).topic).toBe('love');
  });

  it('tarot.setTopic đổi chủ đề tay + giữ bài; chủ đề không có tab → lỗi', async () => {
    const svc = make(null);
    const d = await svc.rpc('tarot.setTopic', { viewerId: 'Bình', topic: 'study' });
    expect(d.plan).toMatchObject({ topic: 'study', source: 'reserved' });
    expect(d.topics.map((t) => t.topic)).toContain('study');
    await expect(svc.rpc('tarot.setTopic', { viewerId: 'Bình', topic: 'khongco' })).rejects.toThrow('chưa có tab');
    expect(ADMIN_METHODS.has('tarot.setTopic')).toBe(true);
  });

  it('tắt khi không có writer / không có khóa; chặn từ cấm trong câu hỏi', async () => {
    const off = make(null);
    expect((await off.rpc('tarot.getViewer', { viewerId: 'Bình' })).ai).toBe(false);
    await expect(off.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'hỏi' })).rejects.toThrow('ANTHROPIC_API_KEY');
    const on = make(createReadingWriter({ client: fakeClient(REPLY) }));
    await expect(on.rpc('tarot.aiDraft', { viewerId: 'Bình', question: 'cấmxx' })).rejects.toThrow('bị chặn');
  });
});
