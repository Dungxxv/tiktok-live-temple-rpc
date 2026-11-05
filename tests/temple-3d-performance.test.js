import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');

describe('Three.js scene performance safeguards', () => {
  it('limits decorative lantern point lights to two per aisle', () => {
    expect(source).toContain('for (const x of [-5.8, 5.8])');
    expect(source).toContain('for (const z of [-7, -1, 5, 11])');
    expect(source).toContain('if (z === -7 || z === 5)');
    expect(source).toContain('lanterns.push(light);');
  });

  it('bounds concurrent transient gift and ritual effects and disposes evictions', () => {
    expect(source).toContain('const MAX_EFFECTS = 64;');
    expect(source).toContain('if (effects.length >= MAX_EFFECTS)');
    expect(source).toContain('world.remove(old.object); disposeThreeObjectTree(old.object);');
  });

  it('scales ambient incense draw calls to the selected render tier', () => {
    expect(source).toContain("const incenseWispCount = renderProfile.tier === 'low' ? 3");
    expect(source).toContain(": renderProfile.tier === 'medium' ? 4 : 6;");
    expect(source).toContain('Array.from({ length: incenseWispCount }');
    expect(source).toContain('const incenseSmokeGeometry = new THREE.SphereGeometry(0.105, 8, 6);');
  });

  it('keeps the fixed elevated portrait camera and 30fps frame cap', () => {
    expect(source).toContain('camera.position.set(0, 11.75, 28.5);');
    expect(source).toContain('camera.lookAt(0, -1.5, -5.5);');
    expect(source).toContain('if (now - lastFrame < 33) return;');
  });
  it('adapts render pixel ratio to device capacity without exceeding 1.25x', async () => {
    const { getTemplePixelRatio } = await import('../public/js/temple-render-quality.js');
    expect(getTemplePixelRatio({ devicePixelRatio: 2, deviceMemory: 4, hardwareConcurrency: 8 })).toBe(1);
    expect(getTemplePixelRatio({ devicePixelRatio: 2, deviceMemory: 8, hardwareConcurrency: 8 })).toBe(1.25);
    expect(getTemplePixelRatio({ devicePixelRatio: 1, deviceMemory: 8, hardwareConcurrency: 8 })).toBe(1);
    expect(getTemplePixelRatio({ devicePixelRatio: 2, hardwareConcurrency: 8 })).toBe(1.25);
    expect(getTemplePixelRatio({ devicePixelRatio: 2, deviceMemory: 8, hardwareConcurrency: 2 })).toBe(1);
  });

  it('gives the Buddha a fuller shoulder and torso silhouette at portrait scale', () => {
    expect(source).toContain('statue.scale.set(1.16, 1, 1.04);');
    expect(source).toContain('sphere(0.76, mats.statueStone, 0, 3.35, 0.02, 1.16, 1.2, 0.9, statue);');
    expect(source).toContain('sphere(0.8, mats.statueStone, 0, 3.72, -0.015, 1.18, 0.72, 0.8, statue);');
    expect(source).toContain('color: 0x98866d, roughness: 0.92');
  });

  it('keeps the sanctuary roofless and preserves the open altar sightline', () => {
    expect(source).not.toMatch(/makeCurvedRoofSide|roofTile|roofTrim|roofStartZ|const ridge =/);
    expect(source).toContain('Open-air sanctuary: keep the upper sightline clear');
    expect(source).toContain('camera.lookAt(0, -1.5, -5.5);');
  });

});


describe('Three.js opt-in GPU diagnostics', () => {
  it('reports renderer draw calls, triangles and resource counts only when stats=1', () => {
    expect(source).toContain("const statsEnabled = modelParams.get('stats') === '1';");
    expect(source).toContain("console.info('[Temple3D] GPU frame stats'");
    expect(source).toContain('drawCalls: info.render.calls');
    expect(source).toContain('triangles: info.render.triangles');
    expect(source).toContain('geometries: info.memory.geometries');
    expect(source).toContain('textures: info.memory.textures');
    expect(source).toContain('activeEffects: effects.length');
    expect(source).toContain('now - lastStatsAt >= 5000');
  });
});


describe('Three.js shared primitive geometry', () => {
  it('caches box, cylinder, sphere and plane geometry by immutable dimensions', () => {
    expect(source).toContain('const primitiveGeometryCache = new Map();');
    expect(source).toContain('const getPrimitiveGeometry = (key, create) =>');
    expect(source).toContain('`box:${w}:${h}:${d}`');
    expect(source).toContain('`cylinder:${rt}:${rb}:${h}:${radial}`');
    expect(source).toContain('`sphere:${r}:24:16`');
    expect(source).toContain('`plane:${w}:${h}`');
    expect(source).toContain('primitiveGeometryCache.set(key, create())');
  });
});
