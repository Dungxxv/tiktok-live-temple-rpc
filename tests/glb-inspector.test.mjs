import { describe, expect, it } from 'bun:test';
import { parseGLB } from '../scripts/inspect-glb.mjs';

function makeGlb(document) {
  const json = Buffer.from(JSON.stringify(document));
  const paddedLength = Math.ceil(json.length / 4) * 4;
  const paddedJson = Buffer.alloc(paddedLength, 0x20);
  json.copy(paddedJson);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + paddedLength, 8);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.writeUInt32LE(paddedLength, 0);
  chunkHeader.writeUInt32LE(0x4e4f534a, 4);
  return Buffer.concat([header, chunkHeader, paddedJson]);
}

describe('GLB asset inspection', () => {
  it('reports mesh complexity, animations, skins and external dependencies', () => {
    const document = {
      asset: { version: '2.0', generator: 'unit-test' },
      scenes: [{}],
      nodes: [{ name: 'BuddhaRoot' }],
      meshes: [{ name: 'Statue', primitives: [
        { attributes: { POSITION: 0 }, indices: 1 },
        { attributes: { POSITION: 2 }, mode: 5 }
      ] }],
      accessors: [{ count: 120 }, { count: 300 }, { count: 20 }],
      materials: [{}],
      textures: [{}],
      images: [{ uri: 'textures/stone.png' }],
      skins: [{}],
      animations: [{ name: 'Idle' }, {}],
      buffers: [{ uri: 'data:application/octet-stream;base64,AA==' }]
    };
    const result = parseGLB(makeGlb(document));
    expect(result.assetVersion).toBe('2.0');
    expect(result.generator).toBe('unit-test');
    expect(result.triangleEstimate).toBe(118);
    expect(result.nodeNames).toEqual(['BuddhaRoot']);
    expect(result.animations).toEqual(['Idle', 'unnamed animation 2']);
    expect(result.skins).toBe(1);
    expect(result.externalUris).toEqual(['textures/stone.png']);
  });

  it('rejects corrupt headers, unsupported versions and missing JSON chunks', () => {
    expect(() => parseGLB(Buffer.alloc(32))).toThrow('Invalid GLB magic');
    const wrongVersion = makeGlb({ asset: { version: '2.0' } });
    wrongVersion.writeUInt32LE(1, 4);
    expect(() => parseGLB(wrongVersion)).toThrow('Unsupported GLB version');
    const truncated = makeGlb({ asset: { version: '2.0' } }).subarray(0, 15);
    expect(() => parseGLB(truncated)).toThrow('File is too small');
  });
});
