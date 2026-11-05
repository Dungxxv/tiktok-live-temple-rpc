import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.js', import.meta.url), 'utf8');

describe('Isolated browser visual-audit server mode', () => {
  it('can skip the optional ZeroTTS worker without changing its production default', () => {
    const constructorStart = source.indexOf('class ZeroTTSManager');
    const constructorEnd = source.indexOf('resolvePythonBin()', constructorStart);
    const constructor = source.slice(constructorStart, constructorEnd);

    expect(constructor).toContain("process.env.DISABLE_ZEROTTS_WORKER === '1'");
    expect(constructor).toContain("this.status = 'disabled'");
    expect(constructor).toContain('this.startWorker();');
  });

  it('can skip automatic external TikTok connections while preserving production auto-connect', () => {
    const serverStart = source.indexOf('server.listen(PORT');
    const startup = source.slice(serverStart);

    expect(startup).toContain("process.env.DISABLE_TIKTOK_AUTOCONNECT !== '1'");
    expect(startup).toContain('process.env.TIKTOK_USER || state.tiktok?.username ||');
    expect(startup).toContain('connectTikTokLive(defaultChannel)');
  });
});
