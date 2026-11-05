import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');

describe('3D gift effect material ownership', () => {
  it('clones sanctuary materials before attaching them to disposable rocket effects', () => {
    expect(source).toContain('new THREE.CylinderGeometry(0.12, 0.16, 0.9, 12), mats.redBright.clone()');
    expect(source).toContain('new THREE.ConeGeometry(0.16, 0.34, 12), mats.goldBright.clone()');
  });

  it('clones the shared gold material used by dragon horns', () => {
    expect(source).toContain('const goldMaterial = mats.goldBright.clone();');
  });

  it('clones shared ivory and gold materials used by donut and rose effects', () => {
    expect(source).toContain('new THREE.TorusGeometry(0.59, 0.055, 8, 36), mats.ivory.clone()');
    expect(source).toContain('new THREE.SphereGeometry(0.2, 12, 8), mats.goldBright.clone()');
  });

  it('documents that transient gift effects own all disposable materials', () => {
    expect(source).toContain('Every transient effect owns its materials');
  });
});
