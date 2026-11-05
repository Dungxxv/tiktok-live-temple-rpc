import { describe, expect, it } from 'bun:test';

describe('Device-aware Three.js render profile integration', () => {
  it('uses one resolved device profile for framebuffer and environment setup', async () => {
    const source = await Bun.file(new URL('../public/js/temple-3d.js', import.meta.url)).text();
    expect(source).toContain("import { getTempleRenderProfile } from './temple-render-quality.js';");
    expect(source).toContain('const renderProfile = getTempleRenderProfile({');
    expect(source).toContain('renderer.setPixelRatio(renderProfile.pixelRatio);');
    expect(source).toContain('key.shadow.mapSize.set(renderProfile.shadowMapSize, renderProfile.shadowMapSize);');
    expect(source).toContain('config: { detailLevel: renderProfile.environmentDetail }');
  });

  it('resolves the device profile before creating the WebGL renderer', async () => {
    const source = await Bun.file(new URL('../public/js/temple-3d.js', import.meta.url)).text();
    const profile = source.indexOf('const renderProfile = getTempleRenderProfile({');
    const renderer = source.indexOf('new THREE.WebGLRenderer({');
    expect(profile).toBeGreaterThan(-1);
    expect(renderer).toBeGreaterThan(profile);
  });

  it('does not add a second renderer or animation loop for quality adaptation', async () => {
    const moduleSource = await Bun.file(new URL('../public/js/temple-render-quality.js', import.meta.url)).text();
    const sceneSource = await Bun.file(new URL('../public/js/temple-3d.js', import.meta.url)).text();
    expect(moduleSource).not.toContain('new THREE.WebGLRenderer');
    expect(moduleSource).not.toContain('requestAnimationFrame');
    expect(sceneSource.match(/new THREE\.WebGLRenderer\(/g) || []).toHaveLength(1);
  });
});
