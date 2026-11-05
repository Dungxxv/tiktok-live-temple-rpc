import { describe, expect, it } from 'bun:test';
import { disposeThreeObjectTree, disposeThreeSceneResources } from '../public/js/three-resource-utils.js';

function resource() {
  return { disposeCount: 0, dispose() { this.disposeCount++; } };
}

function tree(nodes) {
  return { traverse(callback) { nodes.forEach(callback); } };
}

describe('disposeThreeObjectTree', () => {
  it('disposes shared geometries and materials only once per tree', () => {
    const geometry = resource();
    const sharedMaterial = resource();
    const secondMaterial = resource();
    const root = tree([
      { geometry, material: sharedMaterial },
      { geometry, material: [sharedMaterial, secondMaterial] },
      { geometry: null, material: sharedMaterial }
    ]);

    expect(disposeThreeObjectTree(root)).toEqual({ geometries: 1, materials: 2 });
    expect(geometry.disposeCount).toBe(1);
    expect(sharedMaterial.disposeCount).toBe(1);
    expect(secondMaterial.disposeCount).toBe(1);
  });

  it('handles empty and invalid trees', () => {
    expect(disposeThreeObjectTree(null)).toEqual({ geometries: 0, materials: 0 });
    expect(disposeThreeObjectTree({})).toEqual({ geometries: 0, materials: 0 });
    expect(disposeThreeObjectTree(tree([]))).toEqual({ geometries: 0, materials: 0 });
  });

  it('ignores non-disposable material and geometry values', () => {
    const root = tree([{ geometry: {}, material: [{}, null, 'invalid'] }]);
    expect(disposeThreeObjectTree(root)).toEqual({ geometries: 0, materials: 0 });
  });
});


describe('disposeThreeSceneResources', () => {
  it('disposes shared material textures once when the complete scene is released', () => {
    const geometry = resource();
    const sharedTexture = { ...resource(), isTexture: true };
    const materialA = { ...resource(), map: sharedTexture };
    const materialB = { ...resource(), bumpMap: sharedTexture };
    const root = tree([
      { geometry, material: materialA },
      { geometry: null, material: materialB }
    ]);

    expect(disposeThreeSceneResources(root)).toEqual({ geometries: 1, materials: 2, textures: 1 });
    expect(geometry.disposeCount).toBe(1);
    expect(materialA.disposeCount).toBe(1);
    expect(materialB.disposeCount).toBe(1);
    expect(sharedTexture.disposeCount).toBe(1);
  });

  it('handles invalid scene roots without throwing', () => {
    expect(disposeThreeSceneResources(null)).toEqual({ geometries: 0, materials: 0, textures: 0 });
  });
});
