import { test, expect } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { createCapCapVoice } = require('../lib/tarot-capcap');
const { encodeWav16 } = require('../lib/tarot-wav');
const { validateConfig, DEFAULT_CONFIG } = require('../lib/tarot-config');

const tone = () => encodeWav16(Float32Array.from({ length: 4800 }, (_, i) => 0.3 * Math.sin(i / 8)), 48000);
const mkDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'capcap-'));

test('capcap: tạo giọng, ghi cache, lần sau dùng cache', async () => {
  let calls = 0;
  const fetchImpl = async (u, o) => { calls++; return { ok: true, arrayBuffer: async () => tone().buffer.slice(0) }; };
  const v = createCapCapVoice({ cacheDir: mkDir(), fetchImpl });
  const a = await v.synthesize('Xin chào bạn.', 'x');
  expect(a.ok).toBe(true); expect(a.cached).toBe(false); expect(a.url).toMatch(/^\/tts-cache\/capcap_/);
  const b = await v.synthesize('  Xin chào   bạn. ', 'x');
  expect(b.cached).toBe(true); expect(calls).toBe(1);
});

test('capcap: lỗi máy chủ trả ok=false, không ném', async () => {
  const fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ error: 'Không có giọng' }) });
  const r = await createCapCapVoice({ cacheDir: mkDir(), fetchImpl }).synthesize('Chào', 'x');
  expect(r.ok).toBe(false); expect(r.error).toContain('Không có giọng');
});

test('capcap: câu live được làm trước câu nền', async () => {
  const order = [];
  const fetchImpl = async (u, o) => { order.push(JSON.parse(o.body).text); await new Promise((r) => setTimeout(r, 5)); return { ok: true, arrayBuffer: async () => tone().buffer.slice(0) }; };
  const v = createCapCapVoice({ cacheDir: mkDir(), fetchImpl });
  const ps = [v.synthesize('một', 'x'), v.synthesize('nền', 'x', { priority: 'background' }), v.synthesize('live', 'x')];
  await Promise.all(ps);
  expect(order).toEqual(['một', 'live', 'nền']);
});

test('capcap: status offline khi không nối được', async () => {
  const s = await createCapCapVoice({ cacheDir: mkDir(), fetchImpl: async () => { throw new Error('x'); } }).status();
  expect(s.status).toBe('offline'); expect(s.ready).toBe(false);
});

test('config: engine capcap cần voice', () => {
  const bad = { ...DEFAULT_CONFIG, tts: { engine: 'capcap', capcap: { url: 'http://x', voice: '', timeoutSec: 5 } } };
  expect(() => validateConfig(bad)).toThrow(/capcap/);
});

test('trimSilence: cắt lặng đầu/cuối, giữ phần giữa', () => {
  const { trimSilence } = require('../lib/tarot-wav');
  const sr = 48000; const x = new Float32Array(sr * 2);
  for (let i = sr * 0.5; i < sr * 1.0; i++) x[i] = 0.3 * Math.sin(i / 8);
  const y = trimSilence(x, sr);
  expect(y.length).toBeGreaterThan(sr * 0.5); expect(y.length).toBeLessThan(sr * 0.75);
  expect(trimSilence(new Float32Array(1000), sr).length).toBe(1000);
});
