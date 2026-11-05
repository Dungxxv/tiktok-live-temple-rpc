import { describe, expect, it } from 'bun:test';
import { parseGLB } from '../scripts/inspect-glb.mjs';

function makeGlb(document, { declaredLength, chunkLength, trailing = Buffer.alloc(0) } = {}) {
  const json = Buffer.from(JSON.stringify(document));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const chunk = Buffer.alloc(paddedLength, 0x20);
  json.copy(chunk);
  const totalLength = 12 + 8 + chunk.length;
  const bytes = Buffer.alloc(totalLength + trailing.length);
  bytes.writeUInt32LE(0x46546c67, 0);
  bytes.writeUInt32LE(2, 4);
  bytes.writeUInt32LE(declaredLength ?? totalLength, 8);
  bytes.writeUInt32LE(chunkLength ?? chunk.length, 12);
  bytes.writeUInt32LE(0x4e4f534a, 16);
  chunk.copy(bytes, 20);
  trailing.copy(bytes, totalLength);
  return bytes;
}

describe('GLB inspector', () => {
  it('summarizes meshes, triangle counts, textures, skins and animation clips', () => {
    const result = parseGLB(makeGlb({
      asset: { version: '2.0', generator: 'fixture' },
      scenes: [{}],
      nodes: [{ name: 'Devotee_Rig' }, { name: 'Spine' }, { name: 'RightArm' }],
      accessors: [{ count: 8 }, { count: 12 }, { count: 2, min: [0], max: [1.25] }],
      meshes: [{ name: 'Body', primitives: [
        { attributes: { POSITION: 0 } },
        { mode: 5, indices: 1, attributes: { POSITION: 0 } }
      ] }],
      materials: [{}],
      textures: [{}],
      images: [{ uri: 'textures/body.png' }],
      skins: [{ joints: [1, 2], skeleton: 0 }],
      animations: [{ name: 'Idle', samplers: [{ input: 2 }], channels: [
        { sampler: 0, target: { node: 1, path: 'rotation' } },
        { sampler: 0, target: { node: 2, path: 'rotation' } }
      ] }, {}]
    }));
    expect(result.assetVersion).toBe('2.0');
    expect(result.triangleEstimate).toBe(12);
    expect(result.meshes).toBe(1);
    expect(result.textures).toBe(1);
    expect(result.skins).toBe(1);
    expect(result.skinDetails[0].jointNames).toEqual(['Spine', 'RightArm']);
    expect(result.animations).toEqual(['Idle', 'unnamed animation 2']);
    expect(result.animationDetails[0].channelCount).toBe(2);
    expect(result.animationDetails[0].targetPaths).toEqual(['rotation']);
    expect(result.animationDetails[0].durationSeconds).toBe(1.25);
    expect(result.externalUris).toEqual(['textures/body.png']);
  });

  it('rejects a header length that excludes trailing bytes', () => {
    expect(() => parseGLB(makeGlb({ asset: { version: '2.0' } }, { trailing: Buffer.from([1, 2, 3, 4]) })))
      .toThrow('GLB header length does not match the file size.');
  });

  it('rejects truncated chunk headers and chunks extending past the file', () => {
    const truncatedHeader = Buffer.alloc(21);
    truncatedHeader.writeUInt32LE(0x46546c67, 0);
    truncatedHeader.writeUInt32LE(2, 4);
    truncatedHeader.writeUInt32LE(21, 8);
    expect(() => parseGLB(truncatedHeader)).toThrow('GLB chunk header is truncated.');

    const oversized = makeGlb({ asset: { version: '2.0' } });
    oversized.writeUInt32LE(0xfffffff0, 12);
    expect(() => parseGLB(oversized)).toThrow('GLB chunk exceeds the declared file length.');
  });

  it('rejects unaligned GLB chunks', () => {
    const bytes = makeGlb({ asset: { version: '2.0' } });
    bytes.writeUInt32LE(3, 12);
    expect(() => parseGLB(bytes)).toThrow('GLB chunk length must be 4-byte aligned.');
  });
});
