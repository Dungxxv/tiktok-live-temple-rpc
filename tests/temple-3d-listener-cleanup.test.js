import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');

describe('Three.js event listener teardown', () => {
  it('uses named handlers for ritual, gift, visibility and resize events', () => {
    for (const name of ['onTempleRitual', 'onTempleGiftAction', 'onVisibilityChange', 'onWindowResize']) {
      expect(source).toContain(`function ${name}(`);
    }
  });

  it('removes every world listener when renderer resources are released', () => {
    const cleanup = source.slice(source.indexOf('function releaseWorldResources()'), source.indexOf("canvas.addEventListener('webglcontextlost'"));
    expect(cleanup).toContain("window.removeEventListener('temple:ritual', onTempleRitual);");
    expect(cleanup).toContain("window.removeEventListener('temple:gift-action', onTempleGiftAction);");
    expect(cleanup).toContain("document.removeEventListener('visibilitychange', onVisibilityChange);");
    expect(cleanup).toContain("window.removeEventListener('resize', onWindowResize);");
  });
});
