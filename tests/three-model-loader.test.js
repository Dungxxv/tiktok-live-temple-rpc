import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const loaderSource = readFileSync(new URL('../public/js/three-model-loader.js', import.meta.url), 'utf8');

describe('Three.js GLB resource lifecycle', () => {
  it('disposes imported textures together with model geometry and materials', () => {
    expect(loaderSource).toContain("import { disposeThreeSceneResources } from './three-resource-utils.js';");
    expect(loaderSource).toContain('disposeThreeSceneResources(root);');
    expect(loaderSource).not.toContain('disposeThreeObjectTree(root)');
  });

  it('keeps GLB loading restricted to same-origin project model assets', () => {
    expect(loaderSource).toContain("!url.startsWith('/assets/models/')");
    expect(loaderSource).toContain("url.startsWith('//')");
  });

  it('keeps disposal idempotent and stops model animation actions', () => {
    expect(loaderSource).toContain('if (disposed) return;');
    expect(loaderSource).toContain('mixer?.stopAllAction();');
  });

  it('releases decoded scene resources when bounds validation rejects a GLB', () => {
    expect(loaderSource).toContain('catch (error) {');
    expect(loaderSource).toContain('disposeThreeSceneResources(root);');
    expect(loaderSource).toContain('throw error;');
  });
});
