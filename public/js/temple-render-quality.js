/**
 * Select a render-resolution budget for the portrait Three.js scene.
 *
 * The tier sets a pixel-ratio cap and derives one-time shadow-map and
 * static environment-detail budgets. The scene also scales its animated
 * incense-wisp count at boot; central materials, lighting, render cadence and
 * gift-effect behavior remain shared across tiers.
 * Pixel cost (and render-target memory) grows approximately with ratio squared.
 */
export function getTempleRenderQuality({
  deviceMemory,
  hardwareConcurrency
} = {}) {
  const memory = Number.isFinite(deviceMemory) && deviceMemory > 0
    ? deviceMemory
    : null;
  const cores = Number.isFinite(hardwareConcurrency) && hardwareConcurrency > 0
    ? hardwareConcurrency
    : null;

  // Preserve the existing 1x safety cap for devices at or below 4 GB / 4 cores.
  if ((memory !== null && memory <= 4) || (cores !== null && cores <= 4)) {
    return { tier: 'low', maxPixelRatio: 1 };
  }

  // Mid-range devices can use a modest supersampling budget without taking
  // the full desktop cost. Missing hints are neutral; no hints means balanced.
  if ((memory !== null && memory <= 6) || (cores !== null && cores <= 6)
    || (memory === null && cores === null)) {
    return { tier: 'medium', maxPixelRatio: 1.15 };
  }

  // Strong devices retain the existing crisp desktop ceiling of 1.25.
  return { tier: 'high', maxPixelRatio: 1.25 };
}

/**
 * Preserve the existing public API used by temple-3d.js.
 * Invalid/missing DPR falls back to 1, and the output never upscales below 1.
 */
export function getTemplePixelRatio({
  devicePixelRatio = 1,
  deviceMemory,
  hardwareConcurrency
} = {}) {
  const quality = getTempleRenderQuality({ deviceMemory, hardwareConcurrency });
  const requested = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;

  return Math.min(Math.max(requested, 1), quality.maxPixelRatio);
}


/**
 * Resolve the complete device render profile used by the scene coordinator.
 * This keeps the current Three.js pixel-ratio API intact while also exposing
 * conservative shadow-map and environment-detail budgets for one-time setup.
 */
export function getTempleRenderProfile({
  devicePixelRatio = 1,
  deviceMemory,
  hardwareConcurrency
} = {}) {
  const quality = getTempleRenderQuality({ deviceMemory, hardwareConcurrency });
  const requested = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0
    ? devicePixelRatio
    : 1;

  return {
    ...quality,
    pixelRatio: Math.min(Math.max(requested, 1), quality.maxPixelRatio),
    shadowMapSize: quality.tier === 'low' ? 512 : 1024,
    environmentDetail: quality.tier
  };
}
