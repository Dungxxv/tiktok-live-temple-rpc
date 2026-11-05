import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');

describe('Three.js lifecycle recovery', () => {
  it('uses one idempotent cleanup path for context loss and page teardown', () => {
    expect(source).toContain('let resourcesDisposed = false;');
    expect(source).toContain('function releaseWorldResources()');
    expect(source).toContain('if (resourcesDisposed) return;');
    expect(source).toContain('releaseWorldResources();');
  });

  it('removes both gift event listeners when the scene is disposed', () => {
    const cleanupStart = source.indexOf('function releaseWorldResources()');
    const cleanupEnd = source.indexOf('function onVisibilityChange()', cleanupStart);
    const cleanup = source.slice(cleanupStart, cleanupEnd);

    expect(source).toContain("window.addEventListener('temple:gift-action', onTempleGiftAction);");
    expect(source).toContain("window.addEventListener('temple:gift-reaction', onTempleGiftReaction);");
    expect(cleanup).toContain("window.removeEventListener('temple:gift-action', onTempleGiftAction);");
    expect(cleanup).toContain("window.removeEventListener('temple:gift-reaction', onTempleGiftReaction);");
  });

  it('stops the animation loop and releases scene resources after WebGL context loss', () => {
    const handler = source.slice(source.indexOf("canvas.addEventListener('webglcontextlost'"), source.indexOf("window.addEventListener('pagehide'"));
    expect(handler).toContain('event.preventDefault();');
    expect(handler).toContain('disposed = true;');
    expect(handler).toContain('stop();');
    expect(handler).toContain('releaseWorldResources();');
    expect(handler).toContain("stage.classList.remove('temple-3d-mode');");
    expect(handler).toContain("window.dispatchEvent(new Event('temple:3d-unavailable'));");
  });

  it('prevents resize callbacks from touching a disposed renderer', () => {
    const handler = source.slice(source.indexOf('function onWindowResize()'), source.indexOf("document.addEventListener('visibilitychange'"));
    expect(handler).toContain('if (disposed) return;');
    expect(handler).toContain('renderer.setSize(1080, 1920, false);');
  });

  it('shares cleanup with pagehide rather than disposing the scene twice', () => {
    const handler = source.slice(source.indexOf("window.addEventListener('pagehide'"));
    expect(handler).toContain('disposed = true;');
    expect(handler).toContain('releaseWorldResources();');
    expect(handler).not.toContain('disposeThreeObjectTree(scene)');
  });
});
