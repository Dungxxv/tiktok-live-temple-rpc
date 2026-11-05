#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const TRIANGLES = 4;
const TRIANGLE_STRIP = 5;
const TRIANGLE_FAN = 6;

export function parseGLB(input) {
  const bytes = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (bytes.length < 20) throw new Error('File is too small to be a GLB.');
  if (bytes.readUInt32LE(0) !== GLB_MAGIC) throw new Error('Invalid GLB magic; expected glTF.');
  const version = bytes.readUInt32LE(4);
  if (version !== 2) throw new Error(`Unsupported GLB version: ${version} (expected 2).`);
  const declaredLength = bytes.readUInt32LE(8);
  if (declaredLength !== bytes.length || declaredLength < 20) {
    throw new Error('GLB header length does not match the file size.');
  }

  let offset = 12;
  let document = null;
  while (offset < declaredLength) {
    if (offset + 8 > declaredLength) throw new Error('GLB chunk header is truncated.');
    const chunkLength = bytes.readUInt32LE(offset);
    const chunkType = bytes.readUInt32LE(offset + 4);
    const chunkStart = offset + 8;
    const chunkEnd = chunkStart + chunkLength;
    if (chunkLength % 4 !== 0) throw new Error('GLB chunk length must be 4-byte aligned.');
    if (chunkEnd > declaredLength) throw new Error('GLB chunk exceeds the declared file length.');
    if (chunkType === JSON_CHUNK && document === null) {
      const rawJson = bytes.toString('utf8', chunkStart, chunkEnd).replace(/[\0\s]+$/u, '');
      try {
        document = JSON.parse(rawJson);
      } catch (error) {
        throw new Error(`GLB JSON chunk is invalid: ${error.message}`);
      }
    }
    offset = chunkEnd;
  }
  if (!document) throw new Error('GLB does not contain a JSON chunk.');

  const accessors = Array.isArray(document.accessors) ? document.accessors : [];
  const meshes = Array.isArray(document.meshes) ? document.meshes : [];
  const primitives = [];
  let triangleEstimate = 0;
  for (const [meshIndex, mesh] of meshes.entries()) {
    for (const [primitiveIndex, primitive] of (mesh.primitives || []).entries()) {
      const mode = primitive.mode ?? TRIANGLES;
      const indexAccessor = primitive.indices == null ? null : accessors[primitive.indices];
      const positionAccessor = accessors[primitive.attributes?.POSITION];
      const vertexOrIndexCount = indexAccessor?.count ?? positionAccessor?.count ?? 0;
      let triangles = 0;
      if (mode === TRIANGLES) triangles = Math.floor(vertexOrIndexCount / 3);
      else if (mode === TRIANGLE_STRIP || mode === TRIANGLE_FAN) triangles = Math.max(0, vertexOrIndexCount - 2);
      triangleEstimate += triangles;
      primitives.push({
        mesh: mesh.name || `mesh-${meshIndex}`,
        primitive: primitiveIndex,
        mode,
        triangles,
        vertices: positionAccessor?.count ?? null
      });
    }
  }

  const nodes = Array.isArray(document.nodes) ? document.nodes : [];
  const nodeNames = nodes.map((node, index) => node.name || `node-${index}`);
  const skins = (document.skins || []).map((skin, index) => ({
    name: skin.name || `skin-${index}`,
    joints: Array.isArray(skin.joints) ? skin.joints.length : 0,
    jointNames: (skin.joints || []).map((nodeIndex) => nodeNames[nodeIndex] ?? `invalid-node-${nodeIndex}`),
    skeleton: Number.isInteger(skin.skeleton) ? nodeNames[skin.skeleton] ?? null : null
  }));
  const animationDetails = (document.animations || []).map((animation, index) => {
    const channels = (animation.channels || []).map((channel) => ({
      node: Number.isInteger(channel.target?.node)
        ? nodeNames[channel.target.node] ?? `invalid-node-${channel.target.node}`
        : null,
      path: channel.target?.path ?? null,
      sampler: channel.sampler ?? null
    }));
    const inputAccessorIndices = (animation.samplers || [])
      .map((sampler) => sampler.input)
      .filter(Number.isInteger);
    const timeRanges = inputAccessorIndices
      .map((accessorIndex) => accessors[accessorIndex])
      .filter(Boolean)
      .map((accessor) => ({
        min: Array.isArray(accessor.min) ? accessor.min[0] : null,
        max: Array.isArray(accessor.max) ? accessor.max[0] : null
      }))
      .filter((range) => Number.isFinite(range.min) && Number.isFinite(range.max));
    const duration = timeRanges.length
      ? Math.max(...timeRanges.map((range) => range.max)) - Math.min(...timeRanges.map((range) => range.min))
      : null;
    return {
      name: animation.name || `unnamed animation ${index + 1}`,
      channels,
      channelCount: channels.length,
      targetPaths: [...new Set(channels.map((channel) => channel.path).filter(Boolean))],
      durationSeconds: duration
    };
  });
  const externalUris = [
    ...(document.buffers || []),
    ...(document.images || [])
  ].map((item) => item.uri).filter((uri) => typeof uri === 'string' && !uri.startsWith('data:'));

  return {
    assetVersion: document.asset?.version ?? null,
    generator: document.asset?.generator ?? null,
    scenes: document.scenes?.length ?? 0,
    nodes: document.nodes?.length ?? 0,
    nodeNames: nodeNames.filter((name, index) => nodes[index].name),
    meshes: meshes.length,
    primitives,
    triangleEstimate,
    materials: document.materials?.length ?? 0,
    textures: document.textures?.length ?? 0,
    images: document.images?.length ?? 0,
    skins: document.skins?.length ?? 0,
    skinDetails: skins,
    animations: animationDetails.map((animation) => animation.name),
    animationDetails,
    externalUris
  };
}

function main() {
  const file = process.argv[2];
  if (!file) {
    console.error('Usage: node scripts/inspect-glb.mjs <model.glb>');
    process.exitCode = 2;
    return;
  }
  const absolutePath = path.resolve(file);
  try {
    const result = parseGLB(fs.readFileSync(absolutePath));
    console.log(JSON.stringify({ file: absolutePath, ...result }, null, 2));
    if (result.externalUris.length) {
      console.warn('Warning: this GLB references external files; bundle them or export a self-contained GLB.');
    }
  } catch (error) {
    console.error(`Unable to inspect ${absolutePath}: ${error.message}`);
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) main();
