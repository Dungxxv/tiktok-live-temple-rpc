import { describe, expect, it } from 'bun:test';

describe('Temple environment scene integration', () => {
  it('mounts the independent architecture into the existing scene and reuses the shared Three namespace', async () => {
    const source = await Bun.file(new URL('../public/js/temple-3d.js', import.meta.url)).text();
    expect(source).toContain("import { createTempleEnvironment } from './temple-environment.js';");
    expect(source).toContain('createTempleEnvironment({');
    expect(source).toContain('THREE,\n    scene,');
    const moduleSource = await Bun.file(new URL('../public/js/temple-environment.js', import.meta.url)).text();
    expect(moduleSource).not.toContain('new THREE.WebGLRenderer');
  });

  it('disposes the environment layer before disposing the shared scene resources', async () => {
    const source = await Bun.file(new URL('../public/js/temple-3d.js', import.meta.url)).text();
    const environmentDispose = source.indexOf('templeEnvironment.dispose()');
    const sceneDispose = source.indexOf('disposeThreeSceneResources(scene)');
    expect(environmentDispose).toBeGreaterThan(-1);
    expect(sceneDispose).toBeGreaterThan(environmentDispose);
  });
});
