'use strict';
// Viết nháp lời giải tarot theo câu hỏi riêng của khách bằng Claude API (trang admin → nút "Nhờ Claude viết").
// Chỉ là BẢN NHÁP: admin đọc, sửa rồi mới bấm "Lưu & giữ bài". Không gửi tên khách, chỉ gửi câu hỏi + lá + lời sheet.
// Khóa API: biến môi trường ANTHROPIC_API_KEY (Bun tự nạp từ file .env). Không có khóa → tính năng tắt, server vẫn chạy.

const MODEL = 'claude-opus-5-5';

const SECTION_GUIDE = {
  opening: 'Mở đầu: 1–2 câu dẫn vào câu hỏi của khách, chưa nói lá cụ thể.',
  card1: 'Lá 1 (Quá khứ): nêu tên lá (kèm "chiều ngược" nếu ngược), ý nghĩa với câu hỏi, 2–3 câu.',
  card2: 'Lá 2 (Hiện tại): nêu tên lá, ý nghĩa với câu hỏi, 2–3 câu.',
  card3: 'Lá 3 (Tương lai): nêu tên lá, xu hướng có thể đến, 2–3 câu, không khẳng định.',
  closing: 'Lời kết: 2–3 câu tổng hợp ba lá và một lời khuyên nhẹ nhàng, làm được ngay.',
  lead: 'Dẫn: 1–2 câu nêu tên lá và cảm giác chung với câu hỏi.',
  present: 'Hiện tại: 2–3 câu lá này nói gì về câu hỏi lúc này.',
  advice: 'Lời khuyên: 1–2 câu nhẹ nhàng, làm được ngay.'
};

const SYSTEM = [
  'Bạn viết lời giải bài tarot cho một nữ tư tế đọc thành tiếng trên livestream TikTok tiếng Việt.',
  'Lời giải chỉ để giải trí: giọng ấm áp, nhẹ nhàng, gần gũi, xưng "tôi", gọi khách là "bạn".',
  '',
  'Quy tắc bắt buộc:',
  '- Bám sát câu hỏi của khách và ý nghĩa của đúng các lá được cho (tên, chiều xuôi/ngược, vị trí).',
  '- Không khẳng định hay dự đoán chắc chắn. Không dùng "sẽ", "chắc chắn", "nhất định". Dùng "có thể", "gợi ý", "biết đâu", "có lẽ".',
  '- Không đưa lời khuyên hay nhận định về sức khỏe, bệnh tật, thuốc, pháp lý, kiện tụng, đầu tư, vay nợ, cờ bạc, tính mạng, thai sản.',
  '  Nếu câu hỏi chạm các chủ đề đó, chuyển sang góc nhìn cảm xúc, tinh thần, cách bình tĩnh nhìn nhận, và gợi ý hỏi người có chuyên môn.',
  '- Không phán xét, không đổ lỗi, không nói về người thứ ba bằng tên. Không hứa hẹn kết quả.',
  '- Không viết "Tôi rút cho bạn". Không dùng emoji, ký hiệu, ngoặc, gạch đầu dòng: chỉ câu văn nói tự nhiên.',
  '- Câu ngắn, mỗi câu tối đa khoảng 120 ký tự, kết thúc bằng dấu chấm (máy đọc giọng cắt câu dài).',
  '- Mỗi phần 2–3 câu ngắn (mở đầu 1–2 câu), cả bài khoảng 150–220 chữ để đọc trong chừng một phút.',
  '',
  'Trả về JSON đúng các khóa được yêu cầu, mỗi khóa là đoạn văn của phần đó.'
].join('\n');

function buildSchema(sections) {
  return {
    type: 'object',
    properties: Object.fromEntries(sections.map((k) => [k, { type: 'string' }])),
    required: sections,
    additionalProperties: false
  };
}

/** sendSheet=false: không gửi lời sheet (tiết kiệm ~40% token vào), chỉ gửi tên lá + từ khóa. */
function buildPrompt({ question, topicLabel, cards, sections, sheet, sendSheet = true }) {
  const cardLines = cards.map((c, i) =>
    `${i + 1}. ${c.positionLabel || 'Lá chính'}: ${c.name}${c.reversed ? ' (chiều ngược)' : ' (chiều xuôi)'}`
    + (c.keywords?.length ? `, từ khóa: ${c.keywords.join(', ')}` : ''));
  const sheetPart = sendSheet && sheet && Object.values(sheet).some(Boolean) ? [
    '',
    'Lời mẫu trong sheet cho đúng các lá này (theo chủ đề chung, chưa theo câu hỏi). Dùng để giữ ý nghĩa lá và giọng văn, nhưng viết lại cho khớp câu hỏi:',
    ...sections.map((k) => `[${k}] ${sheet?.[k] || '(trống)'}`)
  ] : [];
  return [
    `Chủ đề: ${topicLabel || 'Tổng quan'}`,
    `Câu hỏi của khách: "${question}"`,
    '',
    'Các lá đã rút:',
    ...cardLines,
    ...sheetPart,
    '',
    'Yêu cầu từng phần:',
    ...sections.map((k) => `- ${k}: ${SECTION_GUIDE[k] || ''}`)
  ].join('\n');
}

/** Các từ dự đoán chắc chắn còn sót (để admin để ý, không tự sửa). */
function riskyWords(text) {
  const found = new Set();
  for (const w of ['sẽ', 'chắc chắn', 'nhất định', 'đảm bảo']) if (new RegExp(`(^|[^\\p{L}])${w}([^\\p{L}]|$)`, 'iu').test(text)) found.add(w);
  return [...found];
}

/**
 * Tìm Claude Code CLI (claude.exe) để chạy bằng tài khoản Claude đang đăng nhập (không cần khóa API):
 * CLAUDE_CLI_PATH → bản mới nhất đi kèm extension VS Code → "claude" trong PATH.
 */
function findClaudeCli(env = process.env) {
  const fs = require('fs'); const path = require('path'); const os = require('os');
  if (env.CLAUDE_CLI_PATH) return fs.existsSync(env.CLAUDE_CLI_PATH) ? env.CLAUDE_CLI_PATH : null;
  const exe = process.platform === 'win32' ? 'claude.exe' : 'claude';
  for (const base of [path.join(os.homedir(), '.vscode', 'extensions'), path.join(os.homedir(), '.cursor', 'extensions')]) {
    try {
      const dirs = fs.readdirSync(base).filter((d) => d.startsWith('anthropic.claude-code-'))
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
      for (const d of dirs) { const p = path.join(base, d, 'resources', 'native-binary', exe); if (fs.existsSync(p)) return p; }
    } catch (_) { /* không có thư mục */ }
  }
  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, exe);
    try { if (dir && fs.existsSync(p)) return p; } catch (_) {}
  }
  return null;
}

/** Chạy claude -p (không công cụ, không MCP, không lưu phiên, thư mục trống) với JSON schema; trả object kết quả. */
function runClaudeCli({ cli, system, prompt, schema, model = null, effort = 'low', timeoutMs = 180_000 }) {
  const { spawn } = require('child_process'); const fs = require('fs'); const path = require('path'); const os = require('os');
  const cwd = path.join(os.tmpdir(), 'tarot-claude-empty');
  fs.mkdirSync(cwd, { recursive: true });
  const args = ['-p', '--output-format', 'json', '--no-session-persistence', '--strict-mcp-config', '--tools', '',
    '--effort', effort, '--system-prompt', system, '--json-schema', JSON.stringify(schema), ...(model ? ['--model', model] : [])];
  return new Promise((resolve, reject) => {
    // Tắt việc phụ của Claude Code (gọi Haiku đặt tiêu đề, kiểm tra cập nhật...): bớt ~2.200 token mỗi lần.
    const childEnv = { ...process.env, CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: '1' };
    const child = spawn(cli, args, { cwd, env: childEnv, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = ''; let err = '';
    const timer = setTimeout(() => { child.kill(); reject(new Error('Claude trả lời quá lâu (hơn 3 phút), thử lại')); }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Không chạy được Claude Code: ${e.message}`)); });
    child.on('close', () => {
      clearTimeout(timer);
      let j;
      try { j = JSON.parse(out); } catch (_) {
        return reject(new Error(`Claude Code không trả kết quả${/login|auth|log in/i.test(out + err) ? ' (chưa đăng nhập: mở Claude Code và đăng nhập)' : ''}: ${(err || out).trim().slice(0, 200)}`));
      }
      if (j.is_error || j.subtype !== 'success') return reject(new Error(`Claude Code báo lỗi: ${String(j.result || j.subtype || '').slice(0, 200)}`));
      resolve(j);
    });
    child.stdin.end(prompt);
  });
}
// Model chọn được trên trang admin (tên ngắn → model ID). Số token gần như nhau; Sonnet tốn khoảng nửa hạn mức của Opus.
const MODELS = { opus: 'claude-opus-5-5', sonnet: 'claude-sonnet-5-5' };

// Thoại phiên nghỉ: nữ tư tế nói với cả phòng giữa các lượt đọc bài.
const BREAK_SYSTEM = [
  'Bạn viết lời cho một nữ tư tế tarot nói thành tiếng trên livestream TikTok tiếng Việt, trong lúc nghỉ giữa các lượt xem bài.',
  'Nói với cả phòng (gọi "các bạn" hoặc "bạn"), xưng "tôi", giọng ấm áp, gần gũi, nhẹ nhàng, chỉ để giải trí.',
  '',
  'Quy tắc bắt buộc:',
  '- Viết đúng ý admin đưa ra, tự nhiên như đang trò chuyện. 3–6 câu ngắn, mỗi câu tối đa khoảng 120 ký tự, kết thúc bằng dấu chấm.',
  '- Có thể mời bình luận, thả tim, tặng quà một cách nhẹ nhàng, không ép, không hứa hẹn kết quả hay may mắn nhờ quà.',
  '- Không khẳng định, không dùng "sẽ", "chắc chắn". Không nói về sức khỏe, pháp lý, tài chính, tính mạng, thai sản.',
  '- Không emoji, không ký hiệu, không gạch đầu dòng: chỉ câu văn nói.',
  'Trả về JSON với khóa "text" là cả đoạn lời.'
].join('\n');

/**
 * @param {object} opts
 * @param {object} [opts.client]  client Anthropic (tiêm vào khi test); không có thì tự tạo nếu có khóa
 * @param {object} [opts.env]     biến môi trường (ANTHROPIC_API_KEY, CLAUDE_CLI_PATH)
 * @param {Function} [opts.runCli] thay runClaudeCli khi test
 */
function createReadingWriter({ client = null, env = process.env, log = () => {}, model = MODEL, cliPath, runCli = runClaudeCli,
  // Tiết kiệm token (chỉnh qua .env): TAROT_AI_MODEL, TAROT_AI_EFFORT (low|medium|high), TAROT_AI_SHEET=0 (không gửi lời sheet).
  effort = env.TAROT_AI_EFFORT || 'low', sendSheet = env.TAROT_AI_SHEET !== '0' } = {}) {
  let currentModel = env.TAROT_AI_MODEL || model;
  let Anthropic = null;
  let api = client;
  const apiKey = () => !!(client || env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN);
  // Không có khóa API → dùng Claude Code CLI bằng tài khoản đang đăng nhập (tính vào hạn mức gói Claude của bạn).
  const cli = cliPath !== undefined ? cliPath : (apiKey() ? null : findClaudeCli(env));
  const engine = apiKey() ? 'api' : cli ? 'cli' : null;
  if (engine === 'cli') log(`[Tarot AI] Dùng Claude Code (tài khoản đang đăng nhập): ${cli}`);
  const hasKey = () => !!engine;
  // Token đã dùng từ lúc server chạy (hiện trên trang admin).
  const stats = { calls: 0, input: 0, output: 0, byModel: {} };

  function getClient() {
    if (api) return api;
    Anthropic = Anthropic || (() => { const m = require('@anthropic-ai/sdk'); return m.default || m; })();
    api = new Anthropic({ timeout: 120_000, maxRetries: 2 });
    return api;
  }

  /** Gọi Claude một lần với JSON schema → { data, usage: {input, output}, model }. */
  async function call({ system, prompt, schema, what }) {
    if (!hasKey()) throw new Error('Chưa bật Claude: không thấy Claude Code trên máy và chưa có ANTHROPIC_API_KEY trong .env');
    const t0 = Date.now();
    let data; let usage; let used;
    if (engine === 'cli') {
      const j = await runCli({ cli, system, prompt, schema, model: currentModel, effort });
      data = j.structured_output;
      if (!data) { try { data = JSON.parse(j.result); } catch (_) { throw new Error('Claude trả về không đúng định dạng, thử lại'); } }
      const u = j.usage || {};
      usage = { input: (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0), output: u.output_tokens || 0 };
      used = Object.entries(j.modelUsage || {}).sort((a, b) => (b[1]?.outputTokens || 0) - (a[1]?.outputTokens || 0))[0]?.[0] || currentModel;
    } else {
      const c = getClient();
      let resp;
      try {
        resp = await c.beta.messages.create({
          model: currentModel,
          max_tokens: 16000,
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort, format: { type: 'json_schema', schema } },
          system,
          messages: [{ role: 'user', content: prompt }]
        });
      } catch (e) {
        const A = Anthropic || (() => { try { const m = require('@anthropic-ai/sdk'); return m.default || m; } catch (_) { return null; } })();
        if (A && e instanceof A.AuthenticationError) throw new Error('Khóa Claude API không hợp lệ (kiểm tra ANTHROPIC_API_KEY trong .env)');
        if (A && e instanceof A.PermissionDeniedError) throw new Error('Khóa Claude API không có quyền dùng model này');
        if (A && e instanceof A.RateLimitError) throw new Error('Claude API đang giới hạn tốc độ, thử lại sau ít giây');
        if (A && e instanceof A.BadRequestError) throw new Error(`Claude API từ chối yêu cầu: ${e.message}`);
        if (A && e instanceof A.APIConnectionError) throw new Error('Không kết nối được Claude API (kiểm tra mạng)');
        if (A && e instanceof A.APIError) throw new Error(`Lỗi Claude API ${e.status ?? ''}: ${e.message}`);
        throw e;
      }
      if (resp.stop_reason === 'refusal') throw new Error('Claude từ chối viết nội dung này, hãy tự viết hoặc đổi cách diễn đạt');
      if (resp.stop_reason === 'max_tokens') throw new Error('Câu trả lời bị cắt giữa chừng, thử lại');
      const text = (resp.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('');
      try { data = JSON.parse(text); } catch (_) { throw new Error('Claude trả về không đúng định dạng, thử lại'); }
      usage = resp.usage ? { input: resp.usage.input_tokens || 0, output: resp.usage.output_tokens || 0 } : { input: 0, output: 0 };
      used = resp.model || currentModel;
    }
    stats.calls += 1; stats.input += usage.input; stats.output += usage.output;
    const m = (stats.byModel[used] = stats.byModel[used] || { calls: 0, input: 0, output: 0 });
    m.calls += 1; m.input += usage.input; m.output += usage.output;
    log(`[Tarot AI] ${what} · ${used} · ${((Date.now() - t0) / 1000).toFixed(1)}s · ${usage.input} vào / ${usage.output} ra token`);
    return { data, usage, model: used };
  }

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

  async function write({ question, topicLabel, cards, sections, sheet }) {
    const q = String(question || '').trim();
    if (!hasKey()) throw new Error('Chưa bật Claude: không thấy Claude Code trên máy và chưa có ANTHROPIC_API_KEY trong .env');
    if (!q) throw new Error('Hãy nhập câu hỏi của khách trước');
    if (!cards?.length || !sections?.length) throw new Error('Chưa xác định được lá bài cho khách này');
    const prompt = buildPrompt({ question: q, topicLabel, cards, sections, sheet, sendSheet });
    const r = await call({ system: SYSTEM, prompt, schema: buildSchema(sections), what: `Viết nháp ${sections.length} phần lời giải` });
    const lines = {};
    for (const k of sections) lines[k] = clean(r.data?.[k]).slice(0, 800);
    return { lines, model: r.model, engine, warnings: riskyWords(Object.values(lines).join(' ')), usage: r.usage, stats: getStats() };
  }

  /** Thoại phiên nghỉ theo ý admin (vd. "xin quà để trả lời chi tiết", "chúc cuối ngày"). */
  async function writeBreak({ idea }) {
    const i = clean(idea).slice(0, 400);
    if (!i) throw new Error('Ghi ý cho đoạn thoại trước (vd. xin quà để trả lời chi tiết)');
    const prompt = `Ý của admin cho đoạn nói này:\n"${i}"\n\nViết đoạn lời dài khoảng 20–40 giây đọc.`;
    const r = await call({ system: BREAK_SYSTEM, prompt, what: 'Viết thoại phiên nghỉ',
      schema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'], additionalProperties: false } });
    const text = clean(r.data?.text).slice(0, 1200);
    return { text, model: r.model, engine, warnings: riskyWords(text), usage: r.usage, stats: getStats() };
  }

  /** Đổi model: "opus" | "sonnet" (hoặc model ID đầy đủ). */
  function setModel(name) {
    const id = MODELS[name] || (Object.values(MODELS).includes(name) ? name : null);
    if (!id) throw new Error(`Model không hỗ trợ: ${name}`);
    currentModel = id;
    return id;
  }
  const modelKey = () => Object.entries(MODELS).find(([, v]) => v === currentModel)?.[0] || currentModel;
  function getStats() { return { ...stats, byModel: JSON.parse(JSON.stringify(stats.byModel)), model: modelKey(), engine }; }

  return { write, writeBreak, enabled: hasKey, engine: () => engine, model: () => currentModel, setModel, modelKey, stats: getStats };
}

module.exports = { createReadingWriter, buildPrompt, buildSchema, riskyWords, findClaudeCli, runClaudeCli, SYSTEM, BREAK_SYSTEM, MODELS };
