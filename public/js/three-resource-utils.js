/**
 * Dispose Three.js resources owned by one transient object tree.
 * Sets prevent shared geometries/materials inside groups from being disposed repeatedly.
 */
export function disposeThreeObjectTree(root) {
  if (!root || typeof root.traverse !== 'function') return { geometries: 0, materials: 0 };

  const geometries = new Set();
  const materials = new Set();

  root.traverse((node) => {
    if (node?.geometry && typeof node.geometry.dispose === 'function') {
      geometries.add(node.geometry);
    }
    const nodeMaterials = Array.isArray(node?.material)
      ? node.material
      : node?.material ? [node.material] : [];
    for (const material of nodeMaterials) {
      if (material && typeof material.dispose === 'function') materials.add(material);
    }
  });

  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();

  return { geometries: geometries.size, materials: materials.size };
}


/**
 * Dispose a complete scene tree, including textures referenced by its materials.
 * Unlike transient effects, a full scene owns its texture lifetime; Set keeps
 * shared maps (such as the Buddha's bump tile) from being disposed repeatedly.
 */
export function disposeThreeSceneResources(root) {
  if (!root || typeof root.traverse !== 'function') {
    return { geometries: 0, materials: 0, textures: 0 };
  }

  const textures = new Set();
  root.traverse((node) => {
    const nodeMaterials = Array.isArray(node?.material)
      ? node.material
      : node?.material ? [node.material] : [];
    for (const material of nodeMaterials) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture && typeof value.dispose === 'function') textures.add(value);
      }
    }
  });

  const disposed = disposeThreeObjectTree(root);
  for (const texture of textures) texture.dispose();
  return { ...disposed, textures: textures.size };
}
