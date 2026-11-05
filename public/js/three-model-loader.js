import * as THREE from 'three';
import { disposeThreeSceneResources } from './three-resource-utils.js';

/**
 * Load a project-vendored GLB and normalize it to the temple's world units.
 * Files must live under /assets/models so the scene never depends on a remote host.
 */
export async function loadGLTFAsset(url, {
  targetHeight = 1.7,
  centerXZ = true,
  onProgress
} = {}) {
  if (typeof url !== 'string' || !url.startsWith('/assets/models/') || url.startsWith('//')) {
    throw new TypeError('GLB assets must use a same-origin /assets/models/ path.');
  }
  if (!Number.isFinite(targetHeight) || targetHeight <= 0) {
    throw new RangeError('targetHeight must be a positive finite number.');
  }

  const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
  const gltf = await new GLTFLoader().loadAsync(url, onProgress);
  if (!gltf?.scene) throw new Error(`GLB has no default scene: ${url}`);

  const root = new THREE.Group();
  root.name = 'normalized-gltf-asset';
  root.add(gltf.scene);

  let sourceBounds;
  let sourceSize;
  let scale;
  try {
    root.updateMatrixWorld(true);
    sourceBounds = new THREE.Box3().setFromObject(root);
    if (sourceBounds.isEmpty()) throw new Error(`GLB scene is empty: ${url}`);
    sourceSize = sourceBounds.getSize(new THREE.Vector3());
    if (!Number.isFinite(sourceSize.y) || sourceSize.y <= 1e-5) {
      throw new Error(`GLB has invalid vertical bounds: ${url}`);
    }

    scale = targetHeight / sourceSize.y;
    root.scale.setScalar(scale);
    root.updateMatrixWorld(true);

    const normalizedBounds = new THREE.Box3().setFromObject(root);
    const center = normalizedBounds.getCenter(new THREE.Vector3());
    root.position.set(
      centerXZ ? -center.x : 0,
      -normalizedBounds.min.y,
      centerXZ ? -center.z : 0
    );
    root.updateMatrixWorld(true);

    root.traverse((node) => {
      if (!node.isMesh) return;
      node.castShadow = true;
      node.receiveShadow = true;
      // Keep imported tangent/normal and material data intact; no destructive merge.
    });
  } catch (error) {
    // A malformed/empty GLB must not strand decoded GPU resources before fallback.
    disposeThreeSceneResources(root);
    throw error;
  }


  const animations = Array.isArray(gltf.animations) ? gltf.animations : [];
  const mixer = animations.length ? new THREE.AnimationMixer(root) : null;
  let disposed = false;

  return {
    root,
    animations,
    mixer,
    sourceBounds,
    sourceSize,
    scale,
    dispose() {
      if (disposed) return;
      disposed = true;
      mixer?.stopAllAction();
      // GLB materials own their imported maps; dispose textures with the model.
      disposeThreeSceneResources(root);
    }
  };
}
