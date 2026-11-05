import { disposeThreeObjectTree, disposeThreeSceneResources } from './three-resource-utils.js';
import { getFootPlantingPose, getFootPlantingStep, getHumanFootPose, getHumanUpperPose, getRitualPoseState, getGiftReactionBlend } from './three-gait-utils.js';
import { getTempleRenderProfile } from './temple-render-quality.js';
import { createTempleEnvironment } from './temple-environment.js';

/**
 * Full 3D temple world. The 2D artwork remains the fallback, but is hidden
 * while this world is active. Coordinates are world-space, not screen-space.
 */
const enabled = new URLSearchParams(location.search).get('3d') === '1';
const stage = document.getElementById('stage9x16');
const canvas = document.getElementById('temple3dCanvas');

if (enabled && stage && canvas) {
  stage.classList.add('temple-3d-mode');
  boot().catch((error) => {
    console.warn('[Temple3D] World unavailable; restoring 2D scene:', error);
    stage.classList.remove('temple-3d-mode');
    canvas.hidden = true;
    window.__TEMPLE_3D_READY__ = false;
    window.dispatchEvent(new Event('temple:3d-unavailable'));
  });
}

async function boot() {
  const THREE = await import('three');
  const renderProfile = getTempleRenderProfile({
    devicePixelRatio: window.devicePixelRatio || 1,
    deviceMemory: navigator.deviceMemory,
    hardwareConcurrency: navigator.hardwareConcurrency
  });
  const renderer = new THREE.WebGLRenderer({
    canvas, alpha: false, antialias: true, powerPreference: 'high-performance'
  });
  renderer.setPixelRatio(renderProfile.pixelRatio);
  renderer.setSize(1080, 1920, false);
  renderer.setClearColor(0x160904, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a0a05);
  scene.fog = new THREE.FogExp2(0x241006, 0.018);
  const camera = new THREE.PerspectiveCamera(42, 1080 / 1920, 0.1, 140);
  camera.position.set(0, 11.75, 28.5);
  camera.lookAt(0, -1.5, -5.5);

  const mats = {
    wood: new THREE.MeshStandardMaterial({ color: 0x48200e, roughness: 0.55, metalness: 0.18 }),
    woodLight: new THREE.MeshStandardMaterial({ color: 0x79401b, roughness: 0.48, metalness: 0.25 }),
    gold: new THREE.MeshStandardMaterial({ color: 0xe6ae45, roughness: 0.3, metalness: 0.78 }),
    goldBright: new THREE.MeshStandardMaterial({ color: 0xffdf83, roughness: 0.24, metalness: 0.62, emissive: 0x70400b, emissiveIntensity: 0.25 }),
    red: new THREE.MeshPhysicalMaterial({ color: 0x741321, roughness: 0.48, metalness: 0.22, clearcoat: 0.28, clearcoatRoughness: 0.32 }),
    redBright: new THREE.MeshPhysicalMaterial({ color: 0x9d2030, roughness: 0.4, metalness: 0.3, clearcoat: 0.42, clearcoatRoughness: 0.22 }),
    stone: new THREE.MeshStandardMaterial({ color: 0x777a7c, roughness: 0.92 }),
    statueStone: new THREE.MeshStandardMaterial({ color: 0x98866d, roughness: 0.92 }),
    statueShadow: new THREE.MeshStandardMaterial({ color: 0x493724, roughness: 0.96 }),
    statueLight: new THREE.MeshStandardMaterial({ color: 0xd9c7a5, roughness: 0.9 }),
    ivory: new THREE.MeshStandardMaterial({ color: 0xffe0a0, roughness: 0.35, metalness: 0.18 }),
    skin: new THREE.MeshStandardMaterial({ color: 0xe7ad6b, roughness: 0.52 }),
    robe: new THREE.MeshStandardMaterial({ color: 0x71859a, roughness: 0.82 }),
    robeDark: new THREE.MeshStandardMaterial({ color: 0x3e5367, roughness: 0.86 }),
    dark: new THREE.MeshStandardMaterial({ color: 0x1d100b, roughness: 0.65 }),
    lotus: new THREE.MeshStandardMaterial({ color: 0xe9829a, roughness: 0.42, side: THREE.DoubleSide }),
    leaf: new THREE.MeshStandardMaterial({ color: 0x315a35, roughness: 0.85 })
  };

  // Procedural micro-roughness breaks up the perfectly uniform finish on
  // lacquer, carved timber and gilding without adding image assets.
  const detailTextureSize = 64;
  const makeRoughnessTexture = (kind) => {
    const data = new Uint8Array(detailTextureSize * detailTextureSize * 4);
    for (let y = 0; y < detailTextureSize; y++) {
      for (let x = 0; x < detailTextureSize; x++) {
        const index = (y * detailTextureSize + x) * 4;
        const grain = (Math.sin(y * 1.17 + Math.sin(x * 0.19) * 2.2)
          + Math.sin(y * 0.37 + x * 0.11) * 0.32) * 0.5;
        const noise = ((Math.imul(x + 17, 374761393) ^ Math.imul(y + 29, 668265263)) >>> 24) / 255;
        let value;
        if (kind === 'wood') value = 178 + grain * 30 + noise * 13;
        else if (kind === 'lacquer') value = 82 + grain * 10 + noise * 9;
        else if (kind === 'stone') value = 222 + grain * 7 + noise * 10;
        else value = 112 + grain * 8 + noise * 15;
        const channel = Math.max(0, Math.min(255, Math.round(value)));
        data[index] = data[index + 1] = data[index + 2] = channel;
        data[index + 3] = 255;
      }
    }
    const texture = new THREE.DataTexture(data, detailTextureSize, detailTextureSize, THREE.RGBAFormat);
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(kind === 'wood' ? 2 : kind === 'stone' ? 4 : 3, kind === 'wood' ? 5 : kind === 'stone' ? 4 : 3);
    texture.magFilter = THREE.LinearFilter;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    return texture;
  };
  const woodRoughness = makeRoughnessTexture('wood');
  const lacquerRoughness = makeRoughnessTexture('lacquer');
  const goldRoughness = makeRoughnessTexture('gold');
  const stoneRoughness = makeRoughnessTexture('stone');
  for (const material of [mats.wood, mats.woodLight]) material.roughnessMap = woodRoughness;
  for (const material of [mats.red, mats.redBright]) material.roughnessMap = lacquerRoughness;
  for (const material of [mats.gold, mats.goldBright]) material.roughnessMap = goldRoughness;
  for (const material of [mats.statueStone, mats.statueShadow, mats.statueLight]) material.roughnessMap = stoneRoughness;
  // A tiny deterministic grayscale bump tile gives the carved stone a restrained mineral grain.
  const stoneGrainSize = 64;
  const stoneGrainData = new Uint8Array(stoneGrainSize * stoneGrainSize * 4);
  for (let y = 0; y < stoneGrainSize; y++) {
    for (let x = 0; x < stoneGrainSize; x++) {
      const index = (y * stoneGrainSize + x) * 4;
      let grain = (Math.imul(x + 1, 374761393) + Math.imul(y + 1, 668265263)) | 0;
      grain = Math.imul(grain ^ (grain >>> 13), 1274126177);
      grain = (grain ^ (grain >>> 16)) & 255;
      const value = 112 + Math.round(grain * 0.28);
      stoneGrainData[index] = value;
      stoneGrainData[index + 1] = value;
      stoneGrainData[index + 2] = value;
      stoneGrainData[index + 3] = 255;
    }
  }
  const stoneGrain = new THREE.DataTexture(
    stoneGrainData, stoneGrainSize, stoneGrainSize, THREE.RGBAFormat
  );
  stoneGrain.wrapS = THREE.RepeatWrapping;
  stoneGrain.wrapT = THREE.RepeatWrapping;
  stoneGrain.repeat.set(3, 3);
  stoneGrain.magFilter = THREE.LinearFilter;
  stoneGrain.minFilter = THREE.LinearMipmapLinearFilter;
  stoneGrain.generateMipmaps = true;
  stoneGrain.needsUpdate = true;
  for (const material of [mats.statueStone, mats.statueShadow, mats.statueLight]) {
    material.bumpMap = stoneGrain;
    material.bumpScale = material === mats.statueStone ? 0.022 : 0.012;
    material.roughness = material === mats.statueLight ? 0.92 : 0.98;
    material.needsUpdate = true;
  }
  mats.statueStone.emissive.setHex(0x241507);
  mats.statueStone.emissiveIntensity = 0.035;

  const world = new THREE.Group();
  scene.add(world);

  // Reuse immutable primitive geometry across repeated architectural pieces.
  // This reduces duplicate GPU buffers while preserving independent transforms/materials.
  const primitiveGeometryCache = new Map();
  const getPrimitiveGeometry = (key, create) => {
    if (!primitiveGeometryCache.has(key)) primitiveGeometryCache.set(key, create());
    return primitiveGeometryCache.get(key);
  };
  const box = (w, h, d, material, x, y, z, parent = world) => {
    const geometry = getPrimitiveGeometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const cylinder = (rt, rb, h, material, x, y, z, parent = world, radial = 24) => {
    const geometry = getPrimitiveGeometry(`cylinder:${rt}:${rb}:${h}:${radial}`, () => new THREE.CylinderGeometry(rt, rb, h, radial));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true;
    parent.add(mesh); return mesh;
  };
  const sphere = (r, material, x, y, z, sx = 1, sy = 1, sz = 1, parent = world) => {
    const geometry = getPrimitiveGeometry(`sphere:${r}:24:16`, () => new THREE.SphereGeometry(r, 24, 16));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz);
    mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const plane = (w, h, material, x, y, z, rx = -Math.PI / 2) => {
    const geometry = getPrimitiveGeometry(`plane:${w}:${h}`, () => new THREE.PlaneGeometry(w, h));
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z); mesh.rotation.x = rx; mesh.receiveShadow = true; world.add(mesh); return mesh;
  };

  scene.add(new THREE.HemisphereLight(0xffdba2, 0x29130a, 1.8));
  const ambient = new THREE.AmbientLight(0xffc777, 0.55); scene.add(ambient);
  const key = new THREE.DirectionalLight(0xffd28a, 3.0);
  key.position.set(-7, 15, 8); key.castShadow = true;
  key.shadow.mapSize.set(renderProfile.shadowMapSize, renderProfile.shadowMapSize); key.shadow.camera.left = -14; key.shadow.camera.right = 14;
  key.shadow.camera.top = 18; key.shadow.camera.bottom = -18;
  key.shadow.bias = -0.00018; key.shadow.normalBias = 0.025; key.shadow.radius = 3;
  scene.add(key);
  // A warm, restrained focal fill keeps the stone readable without bleaching its carved planes.
  const buddhaLight = new THREE.PointLight(0xffd1a0, 15, 18, 2);
  buddhaLight.position.set(0, 6.8, -7); scene.add(buddhaLight);

  // A restrained rear-side rim separates the ivory statue from the dark altar.
  // It deliberately casts no shadows; gift light is layered onto this same light.
  const statueRimTarget = new THREE.Object3D();
  statueRimTarget.position.set(0, 4.1, -8.25);
  scene.add(statueRimTarget);
  const statueRimLight = new THREE.DirectionalLight(0xffc982, 0.82);
  statueRimLight.position.set(5.5, 8.5, -12.5);
  statueRimLight.target = statueRimTarget;
  statueRimLight.castShadow = false;
  scene.add(statueRimLight);

  // Layered altar lighting: two soft, non-shadow-casting spots shape the focal area
  // without changing the fixed master camera or adding expensive shadow maps.
  const altarTargets = [];
  for (const x of [-4.2, 4.2]) {
    const target = new THREE.Object3D();
    target.position.set(0, 2.8, -8.1); scene.add(target); altarTargets.push(target);
    const spot = new THREE.SpotLight(0xffd18a, 34, 20, Math.PI / 5.2, 0.72, 1.4);
    spot.position.set(x, 9.1, -2.8);
    spot.target = target;
    spot.castShadow = false;
    scene.add(spot);
  }
  const altarFill = new THREE.PointLight(0xff8f42, 18, 9, 2);
  altarFill.position.set(0, 2.8, -5.4); scene.add(altarFill);

  // Courtyard floor, raised processional path and inlaid gold borders.
  plane(22, 36, mats.stone, 0, -0.18, 1);
  // Instance the courtyard tiles: hundreds of repeated meshes become two draw calls.
  const tileGeometry = new THREE.BoxGeometry(1.08, 0.035, 1.08);
  const tilePositions = [[], []];
  for (let z = -14; z < 19; z += 1.15) {
    for (let x = -9; x < 10; x += 1.15) {
      tilePositions[Math.round(x + z) % 2 ? 0 : 1].push([x, -0.13, z]);
    }
  }
  const tileTransform = new THREE.Object3D();
  [mats.stone, mats.wood].forEach((material, index) => {
    const instances = new THREE.InstancedMesh(tileGeometry, material, tilePositions[index].length);
    instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    instances.castShadow = false;
    instances.receiveShadow = true;
    const tilePalette = index === 0
      ? [0x77736d, 0x817c73, 0x898276, 0x706d68, 0x928878]
      : [0x48200e, 0x512713, 0x5a2c16, 0x60331a, 0x42200f];
    const tileColors = tilePalette.map((color) => new THREE.Color(color));
    tilePositions[index].forEach(([x, y, z], instanceIndex) => {
      tileTransform.position.set(x, y, z);
      tileTransform.updateMatrix();
      instances.setMatrixAt(instanceIndex, tileTransform.matrix);
      // Subtle per-tile tint breaks up the repeated grid without extra draw calls.
      const paletteIndex = (instanceIndex * 7 + Math.round((x + 9) * 3) + Math.round((z + 14) * 5)) % tileColors.length;
      instances.setColorAt(instanceIndex, tileColors[paletteIndex]);
    });
    if (instances.instanceColor) instances.instanceColor.needsUpdate = true;
    world.add(instances);
  });
  box(5.8, 0.12, 27, mats.red, 0, -0.02, 3);
  box(0.12, 0.035, 27, mats.gold, -2.82, 0.06, 3);
  box(0.12, 0.035, 27, mats.gold, 2.82, 0.06, 3);
  // Low stone curbs and a second fine brass inlay frame the processional carpet.
  // Their restrained height preserves the open sightline from the fixed camera.
  for (const side of [-1, 1]) {
    box(0.22, 0.16, 27.2, mats.stone, side * 3.08, 0.025, 3);
    box(0.035, 0.025, 27.0, mats.goldBright, side * 3.19, 0.115, 3);
    box(1.05, 0.045, 27.0, mats.woodLight, side * 3.82, -0.105, 3);
  }
  // Broad threshold slabs visually anchor the near end of the aisle.
  for (const z of [16.8, 17.45]) {
    box(6.45, 0.07, 0.12, mats.gold, 0, 0.045, z);
  }
  for (let z = -9; z < 16; z += 2.2) {
    box(5.4, 0.035, 0.045, mats.goldBright, 0, 0.07, z);
  }
  // Lotus medallions in the carpet.
  for (let z = -7; z < 15; z += 4.4) {
    const emblem = new THREE.Group(); emblem.position.set(0, 0.09, z); world.add(emblem);
    cylinder(0.32, 0.32, 0.035, mats.gold, 0, 0, 0, emblem, 32);
    for (let p = 0; p < 8; p++) {
      const a = p * Math.PI / 4;
      const petal = sphere(0.17, mats.goldBright, Math.cos(a) * 0.28, 0.035, Math.sin(a) * 0.28, 0.65, 0.22, 1, emblem);
      petal.rotation.y = -a;
    }
  }

  // Rear sanctuary dais and altar.
  box(11, 0.65, 3.2, mats.wood, 0, 0.15, -9.4);
  box(10.4, 0.12, 2.8, mats.gold, 0, 0.55, -9.35);
  box(8.4, 1.0, 1.1, mats.woodLight, 0, 1.05, -10.45);
  for (let x = -3.8; x <= 3.8; x += 0.95) {
    cylinder(0.12, 0.16, 0.82, mats.goldBright, x, 1.12, -9.7, world, 12);
  }

  // Carved red-and-gold altar screen behind the Buddha, kept in the rear focal plane.
  box(9.2, 5.5, 0.28, mats.red, 0, 4.05, -11.25);
  box(9.55, 0.22, 0.42, mats.goldBright, 0, 6.86, -11.22);
  box(9.55, 0.22, 0.42, mats.goldBright, 0, 1.24, -11.22);
  for (const x of [-4.65, -2.35, 0, 2.35, 4.65]) {
    box(0.12, 5.45, 0.38, mats.gold, x, 4.05, -11.02);
  }
  for (const y of [2.0, 3.05, 4.1, 5.15, 6.2]) {
    box(9.0, 0.055, 0.36, mats.gold, 0, y, -11.0);
  }
  // Central carved medallion and side relief panels.
  cylinder(0.92, 0.92, 0.1, mats.gold, 0, 4.25, -10.98, world, 48).rotation.x = Math.PI / 2;
  cylinder(0.72, 0.72, 0.12, mats.redBright, 0, 4.25, -10.9, world, 48).rotation.x = Math.PI / 2;
  // Repeated brass rosettes and ruby centres enrich the recessed side panels.
  // Instancing keeps the ornamentation to two draw calls for the whole screen.
  const panelRosetteGeometry = new THREE.TorusGeometry(0.085, 0.012, 6, 20);
  const panelRosettes = new THREE.InstancedMesh(panelRosetteGeometry, mats.goldBright, 10);
  const panelGemGeometry = new THREE.SphereGeometry(0.043, 10, 8);
  const panelGems = new THREE.InstancedMesh(panelGemGeometry, mats.redBright, 10);
  const panelOrnamentTransform = new THREE.Object3D();
  let panelOrnamentIndex = 0;
  for (const panelX of [-3.45, 3.45]) {
    for (const ornamentY of [2.72, 3.38, 4.05, 4.72, 5.38]) {
      panelOrnamentTransform.position.set(panelX, ornamentY, -10.79);
      panelOrnamentTransform.rotation.set(0, 0, 0);
      panelOrnamentTransform.scale.set(1, 1, 1);
      panelOrnamentTransform.updateMatrix();
      panelRosettes.setMatrixAt(panelOrnamentIndex, panelOrnamentTransform.matrix);
      panelOrnamentTransform.position.z = -10.765;
      panelOrnamentTransform.scale.set(1, 1, 0.52);
      panelOrnamentTransform.updateMatrix();
      panelGems.setMatrixAt(panelOrnamentIndex, panelOrnamentTransform.matrix);
      panelOrnamentIndex++;
    }
  }
  panelRosettes.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  panelGems.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  panelRosettes.castShadow = panelGems.castShadow = false;
  panelRosettes.receiveShadow = panelGems.receiveShadow = true;
  world.add(panelRosettes, panelGems);

  for (const x of [-3.45, 3.45]) {
    box(1.55, 3.8, 0.12, mats.woodLight, x, 4.05, -10.98);
    // Recessed cinnabar panels sit behind the brass lattice, adding a second
    // architectural plane instead of leaving the side screens visually flat.
    box(1.34, 3.55, 0.05, mats.redBright, x, 4.05, -10.90);
    for (let y = 2.55; y <= 5.55; y += 0.75) {
      box(1.42, 0.045, 0.08, mats.goldBright, x, y, -10.88);
    }
    for (let dx = -0.48; dx <= 0.49; dx += 0.48) {
      box(0.045, 3.55, 0.08, mats.goldBright, x + dx, 4.05, -10.88);
    }
    // Fine inner mouldings catch the warm altar light and make each niche
    // read as a framed cabinet, matching the reference's red-and-gold screen.
    for (const side of [-1, 1]) {
      box(0.065, 3.68, 0.1, mats.gold, x + side * 0.72, 4.05, -10.78);
    }
    for (const y of [2.19, 5.91]) {
      box(1.5, 0.075, 0.1, mats.goldBright, x, y, -10.78);
    }
    for (const y of [2.3, 5.8]) {
      for (const side of [-1, 1]) {
        sphere(0.075, mats.goldBright, x + side * 0.72, y, -10.69, 1, 1, 0.55);
      }
    }
  }

  // Foreground offering table with bronze incense burner, candles, vases and fruit.
  const offeringTable = new THREE.Group();
  offeringTable.position.set(0, 0, -5.85);
  world.add(offeringTable);
  box(5.6, 0.2, 1.45, mats.woodLight, 0, 1.62, 0, offeringTable);
  box(5.72, 0.09, 1.55, mats.gold, 0, 1.77, 0, offeringTable);
  box(5.35, 0.12, 1.3, mats.red, 0, 1.86, 0, offeringTable);
  // A lacquered front apron makes the altar table read as a crafted piece of
  // temple furniture instead of a stack of plain rectangular slabs.
  box(5.32, 0.3, 0.12, mats.redBright, 0, 1.38, 0.755, offeringTable);
  box(5.28, 0.035, 0.15, mats.goldBright, 0, 1.55, 0.765, offeringTable);
  box(5.28, 0.035, 0.15, mats.gold, 0, 1.21, 0.765, offeringTable);
  const tableSeal = box(0.25, 0.25, 0.065, mats.goldBright, 0, 1.38, 0.84, offeringTable);
  tableSeal.rotation.z = Math.PI / 4;
  sphere(0.07, mats.red, 0, 1.38, 0.89, 1, 1, 0.38, offeringTable);
  for (const x of [-2.35, -1.2, 1.2, 2.35]) {
    sphere(0.055, mats.goldBright, x, 1.38, 0.84, 1, 1, 0.45, offeringTable);
  }
  for (const x of [-2.35, -0.8, 0.8, 2.35]) {
    box(0.18, 1.35, 0.18, mats.wood, x, 0.9, 0, offeringTable);
    box(0.42, 0.12, 1.32, mats.gold, x, 0.38, 0, offeringTable);
  }
  // Central bronze incense vessel.
  const bronze = new THREE.MeshStandardMaterial({ color: 0x8a5428, roughness: 0.34, metalness: 0.82 });
  const incense = new THREE.Group(); incense.position.set(0, 1.92, 0.02); offeringTable.add(incense);
  cylinder(0.42, 0.5, 0.16, bronze, 0, 0, 0, incense, 32);
  sphere(0.43, bronze, 0, 0.2, 0, 1, 0.58, 1, incense);
  const burnerRim = new THREE.Mesh(new THREE.TorusGeometry(0.43, 0.055, 8, 32), mats.goldBright);
  burnerRim.rotation.x = Math.PI / 2; burnerRim.position.y = 0.28; incense.add(burnerRim);
  cylinder(0.12, 0.2, 0.32, bronze, 0, 0.47, 0, incense, 24);
  sphere(0.2, mats.gold, 0, 0.68, 0, 1, 0.38, 1, incense);
  for (let i = -1; i <= 1; i++) {
    const stick = cylinder(0.018, 0.022, 0.78, mats.woodLight, i * 0.11, 1.0, 0, incense, 8);
    stick.rotation.z = i * 0.12;
  }
  // Persistent incense wisps rise from the burner even between ritual events.
  // Shared geometry/material keep the idle ambience inexpensive and allocation-free per frame.
  const incenseSmokeGeometry = new THREE.SphereGeometry(0.105, 8, 6);
  const incenseSmokeMaterial = new THREE.MeshBasicMaterial({
    color: 0xd8cbb8, transparent: true, opacity: 0.0, depthWrite: false
  });
  // Incense is ambient decoration: scale its transparent draw calls with the
  // selected device tier while preserving a visible plume on low-end devices.
  const incenseWispCount = renderProfile.tier === 'low' ? 3
    : renderProfile.tier === 'medium' ? 4 : 6;
  const incenseWisps = Array.from({ length: incenseWispCount }, (_, index) => {
    const wisp = new THREE.Mesh(incenseSmokeGeometry, incenseSmokeMaterial.clone());
    wisp.scale.set(0.72 + (index % 3) * 0.18, 1.9 + (index % 2) * 0.45, 0.72 + (index % 2) * 0.12);
    wisp.userData.phase = index / 6;
    wisp.userData.drift = index % 2 ? 1 : -1;
    world.add(wisp);
    return wisp;
  });
  function updateIncenseWisps(time) {
    incenseWisps.forEach((wisp, index) => {
      const phase = ((time * 0.00022 + wisp.userData.phase) % 1);
      const rise = phase;
      const envelope = Math.sin(Math.PI * phase);
      wisp.position.set(
        Math.sin(phase * Math.PI * 2 + index) * 0.16 + wisp.userData.drift * phase * 0.18,
        3.34 + rise * 1.55,
        -5.82 + Math.cos(phase * Math.PI * 2 + index) * 0.08
      );
      wisp.rotation.z = Math.sin(phase * Math.PI * 2 + index) * 0.22;
      wisp.material.opacity = 0.105 * envelope;
      const swell = 0.82 + envelope * 0.34;
      wisp.scale.set(0.72 * swell, (1.9 + (index % 2) * 0.45) * swell, 0.72 * swell);
    });
  }

  // Paired bronze vases with lotus stems.
  for (const side of [-1, 1]) {
    const vase = new THREE.Group(); vase.position.set(side * 1.72, 1.91, 0.02); offeringTable.add(vase);
    cylinder(0.22, 0.3, 0.12, bronze, 0, 0.05, 0, vase, 24);
    sphere(0.25, bronze, 0, 0.28, 0, 0.9, 1.15, 0.9, vase);
    cylinder(0.11, 0.17, 0.34, bronze, 0, 0.56, 0, vase, 20);
    cylinder(0.16, 0.16, 0.08, mats.goldBright, 0, 0.75, 0, vase, 20);
    const stem = cylinder(0.018, 0.025, 0.72, mats.leaf, 0, 1.1, 0, vase, 8);
    stem.rotation.z = side * -0.14;
    for (let petal = 0; petal < 5; petal++) {
      const angle = petal * Math.PI * 2 / 5;
      const bloom = sphere(0.12, mats.lotus, Math.cos(angle) * 0.12, 1.48, Math.sin(angle) * 0.12, 0.65, 0.55, 1, vase);
      bloom.rotation.y = -angle;
    }
  }
  // Small fruit offerings and warm butter lamps.
  for (const [x, color] of [[-0.92, 0xe5a52f], [-0.55, 0xb82e32], [0.55, 0xb82e32], [0.92, 0xe5a52f]]) {
    const fruitMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.42 });
    sphere(0.18, fruitMaterial, x, 2.03, 0.12, 1, 1.08, 1, offeringTable);
  }
  const flameMaterial = new THREE.MeshStandardMaterial({
    color: 0xffc45a, emissive: 0xff7a18, emissiveIntensity: 1.2, roughness: 0.4
  });
  for (const x of [-2.45, 2.45]) {
    cylinder(0.16, 0.2, 0.22, mats.goldBright, x, 1.98, 0.05, offeringTable, 20);
    sphere(0.075, flameMaterial, x, 2.17, 0.05, 0.72, 1.5, 0.72, offeringTable);
  }
  const offeringFlames = offeringTable.children.filter((child) => child.material === flameMaterial);
  const offeringGlow = new THREE.PointLight(0xffa044, 7, 5, 2);
  offeringGlow.position.set(0, 2.6, -5.8); world.add(offeringGlow);

  // Layered lotus pedestal.
  cylinder(2.05, 1.8, 0.55, mats.wood, 0, 1.0, -8.25, world, 48);
  cylinder(1.82, 2.0, 0.28, mats.redBright, 0, 1.38, -8.25, world, 48);
  cylinder(1.62, 1.82, 0.2, mats.gold, 0, 1.62, -8.25, world, 48);

  // Fine brass beads and double mouldings finish the carved pedestal drum.
  const pedestalTrimGeometry = new THREE.TorusGeometry(1.94, 0.026, 8, 64);
  const pedestalTrim = new THREE.InstancedMesh(pedestalTrimGeometry, mats.goldBright, 2);
  const pedestalTrimTransform = new THREE.Object3D();
  [[0.78, 0.95], [1.2, 1.04]].forEach(([y, scale], index) => {
    pedestalTrimTransform.position.set(0, y, -8.25);
    pedestalTrimTransform.rotation.set(Math.PI / 2, 0, 0);
    pedestalTrimTransform.scale.setScalar(scale);
    pedestalTrimTransform.updateMatrix();
    pedestalTrim.setMatrixAt(index, pedestalTrimTransform.matrix);
  });
  pedestalTrim.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  pedestalTrim.castShadow = false;
  pedestalTrim.receiveShadow = true;
  world.add(pedestalTrim);

  const pedestalStudGeometry = new THREE.SphereGeometry(0.052, 8, 6);
  const pedestalStuds = new THREE.InstancedMesh(pedestalStudGeometry, mats.goldBright, 32);
  const pedestalStudTransform = new THREE.Object3D();
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI * 2 / 32;
    pedestalStudTransform.position.set(
      Math.cos(angle) * 1.93,
      1.38,
      -8.25 + Math.sin(angle) * 1.93
    );
    pedestalStudTransform.scale.set(1, 1, 0.72);
    pedestalStudTransform.rotation.y = -angle;
    pedestalStudTransform.updateMatrix();
    pedestalStuds.setMatrixAt(i, pedestalStudTransform.matrix);
  }
  pedestalStuds.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  pedestalStuds.castShadow = false;
  pedestalStuds.receiveShadow = true;
  world.add(pedestalStuds);

  // Seven front-facing lotus-seed plaques decorate the red pedestal band.
  // The shallow Z offsets follow the cylinder's curved face rather than floating flat.
  const pedestalPlaqueXs = [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35];
  const pedestalPlaqueGeometry = new THREE.BoxGeometry(0.19, 0.19, 0.035);
  const pedestalPlaques = new THREE.InstancedMesh(pedestalPlaqueGeometry, mats.goldBright, pedestalPlaqueXs.length);
  const pedestalGemGeometry = new THREE.SphereGeometry(0.052, 10, 8);
  const pedestalGems = new THREE.InstancedMesh(pedestalGemGeometry, mats.red, pedestalPlaqueXs.length);
  const pedestalPlaqueTransform = new THREE.Object3D();
  pedestalPlaqueXs.forEach((x, index) => {
    const faceZ = -8.25 + Math.sqrt(1.94 * 1.94 - x * x);
    pedestalPlaqueTransform.position.set(x, 1.38, faceZ + 0.018);
    pedestalPlaqueTransform.rotation.set(0, 0, Math.PI / 4);
    pedestalPlaqueTransform.scale.set(1, 1, 1);
    pedestalPlaqueTransform.updateMatrix();
    pedestalPlaques.setMatrixAt(index, pedestalPlaqueTransform.matrix);
    pedestalPlaqueTransform.position.z = faceZ + 0.047;
    pedestalPlaqueTransform.rotation.set(0, 0, 0);
    pedestalPlaqueTransform.scale.set(1, 1, 0.5);
    pedestalPlaqueTransform.updateMatrix();
    pedestalGems.setMatrixAt(index, pedestalPlaqueTransform.matrix);
  });
  pedestalPlaques.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  pedestalGems.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  pedestalPlaques.castShadow = pedestalGems.castShadow = false;
  pedestalPlaques.receiveShadow = pedestalGems.receiveShadow = true;
  world.add(pedestalPlaques, pedestalGems);

  const lotusThrone = new THREE.Group(); lotusThrone.position.set(0, 1.7, -8.25); world.add(lotusThrone);
  // Special gifts briefly reveal a soft gold aura around the lotus without adding lights.
  const lotusGiftAuraMaterial = new THREE.MeshBasicMaterial({
    color: 0xffc978, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const lotusGiftAura = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.035, 8, 96), lotusGiftAuraMaterial);
  lotusGiftAura.rotation.x = Math.PI / 2;
  lotusGiftAura.position.y = 0.24;
  lotusThrone.add(lotusGiftAura);
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const petal = sphere(0.55, i % 2 ? mats.redBright : mats.goldBright,
      Math.cos(a) * 1.4, 0.2 + Math.sin(a) * 0.08, Math.sin(a) * 1.4, 0.52, 0.24, 1, lotusThrone);
    petal.rotation.y = -a;
  }

  // Sculpted upright lotus leaves: one shared curved surface, instanced in two
  // nested rings to create a layered throne without dozens of individual draws.
  function createLotusPetalGeometry() {
    const lengthSegments = 12;
    const widthSegments = 8;
    const positions = [];
    const indices = [];
    for (let row = 0; row <= lengthSegments; row++) {
      const t = row / lengthSegments;
      const taper = Math.pow(Math.sin(Math.PI * t), 0.72);
      const halfWidth = 0.34 * taper * (0.84 + 0.16 * t);
      for (let column = 0; column <= widthSegments; column++) {
        const u = (column / widthSegments) * 2 - 1;
        const petalRidge = Math.max(0, 1 - u * u);
        positions.push(
          u * halfWidth,
          t,
          0.08 + 0.19 * Math.sin(Math.PI * t) + 0.07 * petalRidge * Math.sin(Math.PI * t)
        );
      }
    }
    for (let row = 0; row < lengthSegments; row++) {
      for (let column = 0; column < widthSegments; column++) {
        const a = row * (widthSegments + 1) + column;
        const b = a + widthSegments + 1;
        const c = a + 1;
        const d = b + 1;
        indices.push(a, c, b, c, d, b);
      }
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  }
  const lotusPetalGeometry = createLotusPetalGeometry();
  // A fine raised midrib follows the sculpted crown of each petal.
  const lotusVeinCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0.1, 0.17),
    new THREE.Vector3(0, 0.34, 0.275),
    new THREE.Vector3(0, 0.58, 0.31),
    new THREE.Vector3(0, 0.9, 0.17)
  ]);
  const lotusVeinGeometry = new THREE.TubeGeometry(lotusVeinCurve, 16, 0.009, 5, false);
  const lotusPetalRings = [];
  function createLotusPetalRing(count, radius, y, size, lean = 0.08) {
    const ring = new THREE.Group();
    lotusThrone.add(ring);
    lotusPetalRings.push(ring);
    const redCount = Math.ceil(count / 2);
    const goldCount = Math.floor(count / 2);
    const redPetals = new THREE.InstancedMesh(lotusPetalGeometry, mats.redBright, redCount);
    const goldPetals = new THREE.InstancedMesh(lotusPetalGeometry, mats.goldBright, goldCount);
    const petalVeins = new THREE.InstancedMesh(lotusVeinGeometry, mats.goldBright, count);
    const redSlots = [];
    const goldSlots = [];
    const transform = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2;
      transform.position.set(Math.cos(angle) * radius, y, Math.sin(angle) * radius);
      transform.rotation.set(Math.cos(angle) * lean, Math.PI / 2 - angle, Math.sin(angle) * lean);
      transform.scale.set(size, size, size);
      transform.updateMatrix();
      petalVeins.setMatrixAt(i, transform.matrix);
      if (i % 2 === 0) {
        redPetals.setMatrixAt(redSlots.length, transform.matrix);
        redSlots.push(i);
      } else {
        goldPetals.setMatrixAt(goldSlots.length, transform.matrix);
        goldSlots.push(i);
      }
    }
    for (const petals of [redPetals, goldPetals, petalVeins]) {
      petals.instanceMatrix.setUsage(THREE.StaticDrawUsage);
      petals.castShadow = false;
      petals.receiveShadow = false;
    }
    ring.add(redPetals, goldPetals, petalVeins);
    return ring;
  }
  createLotusPetalRing(16, 1.46, 0.02, 1.0, 0.1);
  createLotusPetalRing(12, 1.12, 0.1, 0.78, 0.06);

  // A fixed, low-cost point cloud carries warm sparks from the lotus toward
  // the Buddha halo during special gifts. Buffers are reused every frame.
  const lotusSparkCount = 32;
  const lotusSparkPositions = new Float32Array(lotusSparkCount * 3);
  const lotusSparkPhases = new Float32Array(lotusSparkCount);
  const lotusSparkSpeeds = new Float32Array(lotusSparkCount);
  const lotusSparkRadii = new Float32Array(lotusSparkCount);
  for (let i = 0; i < lotusSparkCount; i++) {
    lotusSparkPhases[i] = i / lotusSparkCount;
    lotusSparkSpeeds[i] = 0.16 + (i % 5) * 0.025;
    lotusSparkRadii[i] = 1.08 + (i % 4) * 0.11;
  }
  const lotusSparkGeometry = new THREE.BufferGeometry();
  lotusSparkGeometry.setAttribute('position', new THREE.BufferAttribute(lotusSparkPositions, 3));
  const lotusSparkMaterial = new THREE.PointsMaterial({
    color: 0xffd58a, size: 0.085, transparent: true, opacity: 0,
    depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
  });
  const lotusSparks = new THREE.Points(lotusSparkGeometry, lotusSparkMaterial);
  lotusThrone.add(lotusSparks);

  // Seated stone Buddha statue: sculpted silhouette, robe folds, calm face and halo.
  const statue = new THREE.Group(); statue.position.set(0, 1.8, -8.25); statue.scale.set(1.16, 1, 1.04); world.add(statue);
  // Cross-legged lotus posture and layered robe silhouette.
  sphere(1.12, mats.statueStone, 0, 1.45, 0.12, 1.35, 0.42, 0.82, statue);
  sphere(0.78, mats.statueStone, 0, 2.18, -0.02, 0.9, 1.15, 0.72, statue);
  sphere(0.72, mats.statueLight, 0, 2.0, 0.12, 1.18, 0.42, 0.9, statue);
  // A pair of fine front-facing fillets follows the curved lower robe/base silhouette.
  // Their depth is sampled from the seated base ellipsoid so the transition reads as carved-in.
  const statueBaseBandPoints = [];
  const statueBaseHighlightPoints = [];
  for (let i = 0; i <= 20; i++) {
    const x = -1.12 + (i / 20) * 2.24;
    const surfaceZ = 0.12 + 0.82 * Math.sqrt(Math.max(0.08,
      1 - ((1.24 - 1.45) / 0.42) ** 2 - (x / 1.512) ** 2));
    statueBaseBandPoints.push(new THREE.Vector3(x, 1.24, surfaceZ + 0.012));
    statueBaseHighlightPoints.push(new THREE.Vector3(x, 1.29, surfaceZ + 0.018));
  }
  const statueBaseBand = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(statueBaseBandPoints), 48, 0.018, 6, false),
    mats.goldBright
  );
  const statueBaseHighlight = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(statueBaseHighlightPoints), 48, 0.009, 6, false),
    mats.statueLight
  );
  for (const detail of [statueBaseBand, statueBaseHighlight]) {
    detail.castShadow = false;
    detail.receiveShadow = false;
  }
  statue.add(statueBaseBand, statueBaseHighlight);
  sphere(0.76, mats.statueStone, 0, 3.35, 0.02, 1.16, 1.2, 0.9, statue);
  // A continuous shoulder mantle gives the upper body a clear carved silhouette at portrait scale.
  sphere(0.8, mats.statueStone, 0, 3.72, -0.015, 1.18, 0.72, 0.8, statue);
  // A shallow curved neckline softens the join between neck, shoulders and chest.
  const necklineCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.48, 3.98, 0.43),
    new THREE.Vector3(-0.28, 3.91, 0.53),
    new THREE.Vector3(0, 3.88, 0.56),
    new THREE.Vector3(0.28, 3.91, 0.53),
    new THREE.Vector3(0.48, 3.98, 0.43)
  ]);
  const neckline = new THREE.Mesh(
    new THREE.TubeGeometry(necklineCurve, 32, 0.018, 6, false),
    mats.statueShadow
  );
  neckline.castShadow = false;
  neckline.receiveShadow = false;
  statue.add(neckline);
  const collarRidgeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.42, 4.015, 0.445),
    new THREE.Vector3(-0.22, 3.965, 0.545),
    new THREE.Vector3(0, 3.945, 0.575),
    new THREE.Vector3(0.22, 3.965, 0.545),
    new THREE.Vector3(0.42, 4.015, 0.445)
  ]);
  const collarRidge = new THREE.Mesh(
    new THREE.TubeGeometry(collarRidgeCurve, 32, 0.01, 6, false),
    mats.statueLight
  );
  collarRidge.castShadow = false;
  collarRidge.receiveShadow = false;
  statue.add(collarRidge);
  // Robe drapes over both shoulders and falls across the lap.
  const robeFold = (points, radius = 0.035) => {
    const curve = new THREE.CatmullRomCurve3(points.map(([x,y,z]) => new THREE.Vector3(x,y,z)));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, radius, 8, false), mats.statueShadow);
    mesh.castShadow = true; statue.add(mesh); return mesh;
  };
  // Subtle neck tendons and shoulder drape creases bridge the head into the robe.
  for (const side of [-1, 1]) {
    const neckContour = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 0.22, 4.2, 0.235),
      new THREE.Vector3(side * 0.24, 4.08, 0.275),
      new THREE.Vector3(side * 0.2, 3.96, 0.305)
    ]);
    const neckContourMesh = new THREE.Mesh(
      new THREE.TubeGeometry(neckContour, 18, 0.009, 6, false), mats.statueLight
    );
    neckContourMesh.castShadow = false;
    neckContourMesh.receiveShadow = false;
    statue.add(neckContourMesh);
    const shoulderDrape = [
      [side * 0.39, 3.98, 0.46],
      [side * 0.55, 3.88, 0.51],
      [side * 0.68, 3.72, 0.51]
    ];
    robeFold(shoulderDrape, 0.014);
    const shoulderDrapeHighlight = new THREE.CatmullRomCurve3(shoulderDrape.map(([x, y, z]) =>
      new THREE.Vector3(x - side * 0.018, y + 0.018, z + 0.012)
    ));
    const shoulderDrapeHighlightMesh = new THREE.Mesh(
      new THREE.TubeGeometry(shoulderDrapeHighlight, 18, 0.007, 6, false), mats.statueLight
    );
    shoulderDrapeHighlightMesh.castShadow = false;
    shoulderDrapeHighlightMesh.receiveShadow = false;
    statue.add(shoulderDrapeHighlightMesh);
  }
  // One continuous shoulder-to-hand robe contour avoids stacked parallel seams.
  robeFold([[-0.58,4.02,0.18],[-0.44,3.55,0.57],[-0.18,3.02,0.72],[0.34,2.52,0.67],[0.72,2.25,0.4]],0.045);
  robeFold([[0.58,4.0,0.18],[0.7,3.55,0.48],[0.5,3.1,0.67],[0.15,2.65,0.72],[-0.42,2.34,0.55]],0.035);
  for (let k=0;k<5;k++) {
    const x=-0.42+k*0.21;
    const lapFoldPoints = [[x,2.55,0.72],[x*1.3,2.25,0.82],[x*1.7,1.95,0.78]];
    robeFold(lapFoldPoints,0.022);
    const lapFoldHighlight = new THREE.CatmullRomCurve3(lapFoldPoints.map(([px, py, pz]) =>
      new THREE.Vector3(px + 0.028, py + 0.012, pz + 0.018)
    ));
    const lapFoldGroove = new THREE.CatmullRomCurve3(lapFoldPoints.map(([px, py, pz]) =>
      new THREE.Vector3(px - 0.026, py - 0.012, pz + 0.008)
    ));
    const highlightMesh = new THREE.Mesh(
      new THREE.TubeGeometry(lapFoldHighlight, 24, 0.008, 6, false), mats.statueLight
    );
    const grooveMesh = new THREE.Mesh(
      new THREE.TubeGeometry(lapFoldGroove, 24, 0.007, 6, false), mats.statueShadow
    );
    highlightMesh.castShadow = grooveMesh.castShadow = false;
    highlightMesh.receiveShadow = grooveMesh.receiveShadow = false;
    statue.add(highlightMesh, grooveMesh);
  }
  // Small paired elbow creases connect the upper-arm drape to the resting forearms.
  for (const side of [-1, 1]) {
    const elbowCrease = [
      [side * 0.53, 3.22, 0.61],
      [side * 0.64, 3.17, 0.64],
      [side * 0.75, 3.2, 0.59]
    ];
    robeFold(elbowCrease, 0.012);
    const elbowRidgeCurve = new THREE.CatmullRomCurve3(elbowCrease.map(([x, y, z]) =>
      new THREE.Vector3(x, y + 0.026, z + 0.012)
    ));
    const elbowRidge = new THREE.Mesh(
      new THREE.TubeGeometry(elbowRidgeCurve, 16, 0.008, 6, false),
      mats.statueLight
    );
    elbowRidge.castShadow = false;
    elbowRidge.receiveShadow = false;
    statue.add(elbowRidge);
    // A short side-torso pleat and lower elbow fold create a quiet layered transition.
    const sideTorsoPleat = [
      [side * 0.48, 3.48, 0.71],
      [side * 0.57, 3.42, 0.72],
      [side * 0.66, 3.33, 0.67]
    ];
    robeFold(sideTorsoPleat, 0.01);
    const sideTorsoPleatRidge = new THREE.CatmullRomCurve3(sideTorsoPleat.map(([x, y, z]) =>
      new THREE.Vector3(x - side * 0.016, y + 0.014, z + 0.012)
    ));
    const sideTorsoPleatRidgeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(sideTorsoPleatRidge, 16, 0.006, 6, false), mats.statueLight
    );
    sideTorsoPleatRidgeMesh.castShadow = false;
    sideTorsoPleatRidgeMesh.receiveShadow = false;
    statue.add(sideTorsoPleatRidgeMesh);
    const elbowLowerFold = [
      [side * 0.56, 3.105, 0.635],
      [side * 0.66, 3.085, 0.645],
      [side * 0.75, 3.115, 0.585]
    ];
    robeFold(elbowLowerFold, 0.009);
    const elbowLowerFoldRidge = new THREE.CatmullRomCurve3(elbowLowerFold.map(([x, y, z]) =>
      new THREE.Vector3(x, y + 0.018, z + 0.01)
    ));
    const elbowLowerFoldMesh = new THREE.Mesh(
      new THREE.TubeGeometry(elbowLowerFoldRidge, 16, 0.0055, 6, false), mats.statueLight
    );
    elbowLowerFoldMesh.castShadow = false;
    elbowLowerFoldMesh.receiveShadow = false;
    statue.add(elbowLowerFoldMesh);
  }
  // Two restrained chest folds follow the robe diagonally toward the lap.
  robeFold([[-0.38,3.28,0.69],[-0.12,3.18,0.77],[0.16,3.04,0.75],[0.39,2.9,0.67]],0.018);
  robeFold([[-0.3,3.12,0.73],[-0.04,3.02,0.79],[0.22,2.88,0.73],[0.43,2.76,0.62]],0.014);
  // Fine upper-chest pleats carry the robe's drape from the neckline into the chest.
  for (const side of [-1, 1]) {
    const upperChestPleat = [
      [side * 0.14, 3.72, 0.69],
      [side * 0.2, 3.56, 0.77],
      [side * 0.28, 3.4, 0.78]
    ];
    robeFold(upperChestPleat, 0.011);
    const upperChestPleatRidge = new THREE.CatmullRomCurve3(upperChestPleat.map(([x, y, z]) =>
      new THREE.Vector3(x + side * 0.018, y + 0.012, z + 0.014)
    ));
    const upperChestPleatRidgeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(upperChestPleatRidge, 18, 0.006, 6, false), mats.statueLight
    );
    upperChestPleatRidgeMesh.castShadow = false;
    upperChestPleatRidgeMesh.receiveShadow = false;
    statue.add(upperChestPleatRidgeMesh);
  }
  // A single shoulder seam continues down the outer arm toward the resting hand.
  // Its offset ivory ridge is subtle and does not cast shadows.
  for (const side of [-1, 1]) {
    const shoulderSeam = [
      [side * 0.62, 4.02, 0.2],
      [side * 0.76, 3.82, 0.43],
      [side * 0.78, 3.55, 0.53],
      [side * 0.69, 3.12, 0.56],
      [side * 0.48, 2.88, 0.62],
      [side * 0.34, 2.78, 0.68]
    ];
    robeFold(shoulderSeam, 0.016);
    const shoulderRidge = new THREE.CatmullRomCurve3(shoulderSeam.map(([x, y, z]) =>
      new THREE.Vector3(x - side * 0.045, y + 0.018, z + 0.018)
    ));
    const ridgeMesh = new THREE.Mesh(
      new THREE.TubeGeometry(shoulderRidge, 32, 0.01, 6, false),
      mats.statueLight
    );
    ridgeMesh.castShadow = false;
    ridgeMesh.receiveShadow = false;
    statue.add(ridgeMesh);
  }
  // A raised hem and its shallow shadow groove make the lap robe read as layered stone.
  const robeHemCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.82, 2.34, 0.45),
    new THREE.Vector3(-0.62, 2.16, 0.68),
    new THREE.Vector3(-0.28, 2.08, 0.82),
    new THREE.Vector3(0, 2.06, 0.85),
    new THREE.Vector3(0.28, 2.08, 0.82),
    new THREE.Vector3(0.62, 2.16, 0.68),
    new THREE.Vector3(0.82, 2.34, 0.45)
  ]);
  const robeHem = new THREE.Mesh(
    new THREE.TubeGeometry(robeHemCurve, 48, 0.032, 8, false),
    mats.statueLight
  );
  robeHem.castShadow = true;
  robeHem.receiveShadow = false;
  statue.add(robeHem);
  const robeHemGrooveCurve = new THREE.CatmullRomCurve3(
    robeHemCurve.getPoints(24).map((point) => new THREE.Vector3(point.x, point.y - 0.075, point.z - 0.018))
  );
  const robeHemGroove = new THREE.Mesh(
    new THREE.TubeGeometry(robeHemGrooveCurve, 48, 0.014, 6, false),
    mats.statueShadow
  );
  robeHemGroove.castShadow = false;
  robeHemGroove.receiveShadow = false;
  statue.add(robeHemGroove);
  // Neck, head, elongated ears and ushnisha.
  cylinder(0.28,0.32,0.42,mats.statueStone,0,4.05,0,statue,24);
  sphere(0.66,mats.statueStone,0,4.62,0.02,0.98,1.1,0.82,statue);
  // Soft cheek and chin masses turn the face from a narrow mask into a fuller, calm sculpture.
  sphere(0.25, mats.statueStone, -0.285, 4.49, 0.49, 0.9, 0.72, 0.72, statue);
  sphere(0.25, mats.statueStone, 0.285, 4.49, 0.49, 0.9, 0.72, 0.72, statue);
  sphere(0.22, mats.statueStone, 0, 4.32, 0.49, 0.82, 0.58, 0.72, statue);
  sphere(0.36,mats.statueShadow,0,5.42,0.02,0.82,0.72,0.78,statue);
  sphere(0.13,mats.statueStone,-0.62,4.55,0.02,0.55,1.2,0.62,statue);
  sphere(0.13,mats.statueStone,0.62,4.55,0.02,0.55,1.2,0.62,statue);
  // Curled hair cap: preserve the sculpted layout in one static draw batch.
  const hairCurlRows = [9, 7, 5, 3];
  const hairCurlCount = hairCurlRows.reduce((total, count) => total + count, 0);
  const hairCurlGeometry = new THREE.SphereGeometry(0.075, 24, 16);
  const hairCurls = new THREE.InstancedMesh(hairCurlGeometry, mats.statueShadow, hairCurlCount);
  const hairCurlTransform = new THREE.Object3D();
  let hairCurlIndex = 0;
  hairCurlRows.forEach((count, row) => {
    for (let k = 0; k < count; k++) {
      const x = (k - (count - 1) / 2) * 0.13;
      hairCurlTransform.position.set(x, 5.18 + row * 0.12, 0.43);
      hairCurlTransform.scale.set(1, 1, 0.85);
      hairCurlTransform.updateMatrix();
      hairCurls.setMatrixAt(hairCurlIndex++, hairCurlTransform.matrix);
    }
  });
  hairCurls.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  hairCurls.castShadow = true;
  hairCurls.receiveShadow = false;
  statue.add(hairCurls);
  // Continue the curled cap down both temples with a compact shared-mesh batch.
  const templeCurlCount = 8;
  const templeCurls = new THREE.InstancedMesh(hairCurlGeometry, mats.statueShadow, templeCurlCount);
  const templeCurlTransform = new THREE.Object3D();
  let templeCurlIndex = 0;
  for (const side of [-1, 1]) {
    for (let row = 0; row < 4; row++) {
      templeCurlTransform.position.set(side * (0.53 - row * 0.018), 5.13 - row * 0.105, 0.36 + row * 0.035);
      templeCurlTransform.scale.set(0.78, 0.82, 0.72);
      templeCurlTransform.updateMatrix();
      templeCurls.setMatrixAt(templeCurlIndex++, templeCurlTransform.matrix);
    }
  }
  templeCurls.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  templeCurls.castShadow = true;
  templeCurls.receiveShadow = false;
  statue.add(templeCurls);
  sphere(0.1,mats.statueStone,0,5.78,0.02,1,1.1,1,statue);
  // A pair of tight curl courses follows the ushnisha ellipsoid instead of floating as a flat crown row.
  const ushnishaCurlPolarAngles = [0.56, 0.98];
  const ushnishaCurlCounts = [8, 12];
  const ushnishaCurlCount = ushnishaCurlCounts.reduce((total, count) => total + count, 0);
  const ushnishaCurlGeometry = new THREE.SphereGeometry(0.045, 16, 12);
  const ushnishaCurls = new THREE.InstancedMesh(
    ushnishaCurlGeometry, mats.statueShadow, ushnishaCurlCount
  );
  const ushnishaCurlTransform = new THREE.Object3D();
  let ushnishaCurlIndex = 0;
  ushnishaCurlPolarAngles.forEach((polarAngle, ringIndex) => {
    const count = ushnishaCurlCounts[ringIndex];
    for (let curl = 0; curl < count; curl++) {
      const angle = (curl / count) * Math.PI * 2 + ringIndex * 0.13;
      const sinPolar = Math.sin(polarAngle);
      ushnishaCurlTransform.position.set(
        0.2952 * sinPolar * Math.cos(angle),
        5.42 + 0.2592 * Math.cos(polarAngle),
        0.02 + 0.2808 * sinPolar * Math.sin(angle)
      );
      ushnishaCurlTransform.scale.setScalar(0.72);
      ushnishaCurlTransform.updateMatrix();
      ushnishaCurls.setMatrixAt(ushnishaCurlIndex++, ushnishaCurlTransform.matrix);
    }
  });
  ushnishaCurls.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  ushnishaCurls.instanceMatrix.needsUpdate = true;
  ushnishaCurls.name = 'BuddhaUshnishaCurls';
  ushnishaCurls.castShadow = true;
  ushnishaCurls.receiveShadow = false;
  statue.add(ushnishaCurls);
  // The nose is modeled as a continuous stone volume first; fine lines only describe its transitions.
  sphere(0.085, mats.statueStone, 0, 4.515, 0.69, 0.62, 1.45, 0.68, statue);
  sphere(0.075, mats.statueStone, 0, 4.425, 0.725, 0.92, 0.78, 0.72, statue);
  for (const side of [-1, 1]) {
    sphere(0.052, mats.statueStone, side * 0.092, 4.435, 0.69, 0.92, 0.72, 0.68, statue);
  }
  // Calm eyes, brows, nose and lips, carved shallow into the stone.
  const statueLine=(points,radius,material=mats.statueShadow)=>{
    const curve=new THREE.CatmullRomCurve3(points.map(([x,y,z])=>new THREE.Vector3(x,y,z)));
    const mesh=new THREE.Mesh(new THREE.TubeGeometry(curve,18,radius,8,false),material);
    mesh.castShadow=true;statue.add(mesh);return mesh;
  };
  // Shallow inner-ear grooves make the elongated stone ears read as sculpted forms.
  for (const side of [-1, 1]) {
    statueLine([
      [side * 0.64, 4.68, 0.105],
      [side * 0.67, 4.58, 0.145],
      [side * 0.65, 4.45, 0.13],
      [side * 0.62, 4.42, 0.105]
    ], 0.012);
    statueLine([
      [side * 0.64, 4.58, 0.15],
      [side * 0.61, 4.53, 0.16],
      [side * 0.62, 4.49, 0.145]
    ], 0.009, mats.statueLight);
  }
  // Fine temple arcs connect the curled cap to the head silhouette.
  for (const side of [-1, 1]) {
    statueLine([
      [side * 0.56, 5.02, 0.49],
      [side * 0.52, 4.91, 0.55],
      [side * 0.49, 4.79, 0.57]
    ], 0.014, mats.statueLight);
  }
  for(const side of [-1,1]){
    statueLine([[side*0.43,4.75,0.59],[side*0.3,4.78,0.68],[side*0.16,4.75,0.7]],0.022);
    statueLine([[side*0.42,4.94,0.58],[side*0.28,4.99,0.65],[side*0.14,4.96,0.68]],0.025,mats.statueLight);
  }
  // Fine upper-lid folds and outer eye corners define the closed, meditative gaze.
  for (const side of [-1, 1]) {
    statueLine([
      [side * 0.43, 4.79, 0.59],
      [side * 0.31, 4.81, 0.665],
      [side * 0.18, 4.79, 0.695]
    ], 0.01, mats.statueShadow);
    statueLine([
      [side * 0.45, 4.755, 0.585],
      [side * 0.39, 4.735, 0.625]
    ], 0.008, mats.statueLight);
    statueLine([
      [side * 0.49, 4.77, 0.555],
      [side * 0.53, 4.745, 0.52]
    ], 0.008, mats.statueShadow);
  }
  // Lower eyelids and cheek transitions soften the serene carved expression.
  for (const side of [-1, 1]) {
    statueLine([
      [side * 0.43, 4.72, 0.59],
      [side * 0.3, 4.69, 0.665],
      [side * 0.17, 4.72, 0.69]
    ], 0.012, mats.statueLight);
    statueLine([
      [side * 0.49, 4.58, 0.52],
      [side * 0.38, 4.48, 0.62],
      [side * 0.2, 4.43, 0.68]
    ], 0.014, mats.statueShadow);
  }
  // Soft cheekbone highlights and jaw transitions give the face a gently sculpted profile.
  for (const side of [-1, 1]) {
    statueLine([
      [side * 0.5, 4.625, 0.53],
      [side * 0.37, 4.565, 0.635],
      [side * 0.22, 4.535, 0.685]
    ], 0.012, mats.statueLight);
    statueLine([
      [side * 0.48, 4.36, 0.54],
      [side * 0.34, 4.245, 0.625],
      [side * 0.16, 4.205, 0.685]
    ], 0.01, mats.statueShadow);
    statueLine([
      [side * 0.31, 4.205, 0.64],
      [side * 0.2, 4.17, 0.68],
      [side * 0.08, 4.16, 0.7]
    ], 0.008, mats.statueLight);
  }
  // A restrained lower-lip crease adds definition without a pronounced smile.
  statueLine([[-0.105,4.27,0.685],[0,4.255,0.715],[0.105,4.27,0.685]],0.009,mats.statueLight);
  // Refine the nose wings and philtrum with restrained, shallow stone carving.
  for (const side of [-1, 1]) {
    statueLine([
      [side * 0.045, 4.455, 0.716],
      [side * 0.105, 4.425, 0.704],
      [side * 0.145, 4.438, 0.68]
    ], 0.012, mats.statueShadow);
    statueLine([
      [side * 0.055, 4.405, 0.718],
      [side * 0.085, 4.395, 0.714]
    ], 0.008, mats.statueShadow);
    statueLine([
      [side * 0.025, 4.385, 0.721],
      [side * 0.04, 4.355, 0.72],
      [side * 0.075, 4.337, 0.705]
    ], 0.009, mats.statueLight);
  }
  statueLine([[-0.13,4.315,0.686],[0,4.325,0.718],[0.13,4.315,0.686]],0.011,mats.statueLight);
  statueLine([[0,4.78,0.69],[0.02,4.55,0.76],[-0.06,4.48,0.72]],0.035,mats.statueLight);
  statueLine([[-0.16,4.34,0.66],[0,4.30,0.72],[0.16,4.34,0.66]],0.024,mats.statueShadow);
  // The Buddha's urna is a restrained stone relief, not a metallic jewel.
  // A shallow shadow cradle and tiny ivory rise keep the forehead mark legible at portrait scale.
  statueLine([
    [-0.026, 5.025, 0.535],
    [-0.018, 5.042, 0.545],
    [0, 5.047, 0.55],
    [0.018, 5.042, 0.545],
    [0.026, 5.025, 0.535]
  ], 0.0055, mats.statueShadow);
  statueLine([
    [-0.015, 5.047, 0.548],
    [0, 5.052, 0.553],
    [0.015, 5.047, 0.548]
  ], 0.004, mats.statueLight);
  sphere(0.019, mats.statueLight, 0, 5.03, 0.557, 0.82, 1.12, 0.48, statue);

  // Hands rest together in a meditation mudra above the crossed legs.
  // Build the palms and digits as rounded stone volumes; avoid thin tube strokes that
  // read as spokes at portrait scale. Fingers extend toward the viewer in parallel.
  for (const side of [-1, 1]) {
    sphere(0.19, mats.statueStone, side * 0.19, 2.705, 0.755, 1.12, 0.48, 0.62, statue);
    for (let finger = 0; finger < 4; finger++) {
      const x = side * (0.085 + finger * 0.052);
      const length = 0.19 - finger * 0.012;
      const z = 0.83 + (finger % 2) * 0.012;
      sphere(0.052, mats.statueLight, x, 2.665, z + length * 0.48,
        0.58, 0.52, length / 0.052, statue);
      // Small knuckle reliefs sit flush with the finger volumes.
      sphere(0.018, mats.statueStone, x, 2.69, z + 0.035, 0.82, 0.55, 0.72, statue);
    }
  }
  // The thumbs curve inward and meet softly above the joined palms.
  for (const side of [-1, 1]) {
    sphere(0.065, mats.statueLight, side * 0.115, 2.775, 0.865, 1.0, 0.72, 1.35, statue);
    sphere(0.058, mats.statueLight, side * 0.055, 2.805, 0.91, 1.0, 0.72, 1.25, statue);
  }
  sphere(0.018, mats.statueShadow, 0, 2.84, 0.925, 0.8, 0.6, 0.7, statue);
  // Fine wrist transitions and palm creases finish the joined meditation hands.
  for (const side of [-1, 1]) {
    const wristCrease = [
      [side * 0.31, 2.69, 0.82],
      [side * 0.38, 2.705, 0.817],
      [side * 0.445, 2.72, 0.79]
    ];
    statueLine(wristCrease, 0.008, mats.statueShadow);
    statueLine(wristCrease.map(([x, y, z]) => [x - side * 0.008, y + 0.014, z + 0.004]), 0.0055, mats.statueLight);
    const palmCrease = [
      [side * 0.105, 2.655, 0.795],
      [side * 0.2, 2.665, 0.806],
      [side * 0.295, 2.69, 0.795]
    ];
    statueLine(palmCrease, 0.007, mats.statueShadow);
    statueLine(palmCrease.map(([x, y, z]) => [x + side * 0.006, y + 0.012, z + 0.005]), 0.005, mats.statueLight);
  }
  // Broad carved stone aureole behind the Buddha.
  const halo = new THREE.Group(); halo.position.set(0,5.25,-8.8); world.add(halo);
  const haloStone = new THREE.MeshStandardMaterial({color:0xa59a83,roughness:0.9,metalness:0.02,side:THREE.DoubleSide});
  const haloDisc = new THREE.Mesh(new THREE.CircleGeometry(2.05,64),haloStone); halo.add(haloDisc);
  const haloRim = new THREE.Mesh(new THREE.TorusGeometry(2.05,0.12,12,96),mats.statueLight); halo.add(haloRim);
  const haloInner = new THREE.Mesh(new THREE.TorusGeometry(1.82,0.035,8,96),mats.goldBright); haloInner.position.z=0.03; halo.add(haloInner);
  // Fine outer filigree gives the aureole a finished ceremonial edge without
  // adding dozens of independent draw calls.
  const haloOuter = new THREE.Mesh(new THREE.TorusGeometry(2.3,0.035,8,96),mats.gold);
  haloOuter.position.z = -0.025;
  halo.add(haloOuter);
  const haloBeads = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.045,8,6), mats.goldBright, 32
  );
  const haloBeadTransform = new THREE.Object3D();
  for (let i = 0; i < 32; i++) {
    const angle = i * Math.PI * 2 / 32;
    haloBeadTransform.position.set(Math.cos(angle) * 2.3, Math.sin(angle) * 2.3, 0.025);
    haloBeadTransform.updateMatrix();
    haloBeads.setMatrixAt(i, haloBeadTransform.matrix);
  }
  haloBeads.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  halo.add(haloBeads);
  const haloGiftAuraMaterial = new THREE.MeshBasicMaterial({
    color: 0xffd58a, transparent: true, opacity: 0, depthWrite: false,
    blending: THREE.AdditiveBlending, side: THREE.DoubleSide
  });
  const haloGiftAura = new THREE.Mesh(new THREE.TorusGeometry(2.48, 0.055, 8, 112), haloGiftAuraMaterial);
  haloGiftAura.position.z = 0.08;
  halo.add(haloGiftAura);
  const haloGlow = new THREE.PointLight(0xffbd69, 8, 7, 2);
  haloGlow.position.set(0, 5.25, -8.55);
  world.add(haloGlow);
  for(let n=0;n<24;n++){
    const a=n*Math.PI/12;
    const ray=new THREE.Mesh(new THREE.ConeGeometry(0.09,0.42,8),mats.statueLight);
    ray.position.set(Math.cos(a)*2.2,Math.sin(a)*2.2,0);
    ray.rotation.z=a-Math.PI/2;halo.add(ray);
  }
  // Repeating carved flame leaves turn the plain disc into a traditional aureole.
  for(let n=0;n<12;n++){
    const a=n*Math.PI/6;
    const flameShape=new THREE.Shape();
    flameShape.moveTo(-0.13,-0.12);
    flameShape.quadraticCurveTo(-0.22,0.12,0,0.42);
    flameShape.quadraticCurveTo(0.22,0.12,0.13,-0.12);
    flameShape.quadraticCurveTo(0,-0.02,-0.13,-0.12);
    const flameMesh=new THREE.Mesh(new THREE.ShapeGeometry(flameShape),haloStone);
    flameMesh.position.set(Math.cos(a)*1.72,Math.sin(a)*1.72,0.055);
    flameMesh.rotation.z=a-Math.PI/2;
    halo.add(flameMesh);
    const vein=new THREE.Mesh(new THREE.TubeGeometry(
      new THREE.CatmullRomCurve3([
        new THREE.Vector3(0,-0.08,0.07),
        new THREE.Vector3(0.015,0.08,0.07),
        new THREE.Vector3(0,0.28,0.07)
      ]),10,0.012,6,false
    ),mats.statueLight);
    vein.position.copy(flameMesh.position);
    vein.rotation.z=flameMesh.rotation.z;
    halo.add(vein);
  }

  // Main hall architecture: paired carved pillars and short side crossbeams; roof intentionally removed.
  for (const x of [-7.2, 7.2]) {
    for (const z of [-10, -4, 2, 8, 13]) {
      cylinder(0.42, 0.5, 8.2, mats.woodLight, x, 4.05, z, world, 24);
      cylinder(0.62, 0.62, 0.42, mats.gold, x, 0.32, z, world, 24);
      cylinder(0.58, 0.68, 0.35, mats.goldBright, x, 7.95, z, world, 24);
      cylinder(0.47, 0.47, 0.18, mats.red, x, 5.4, z, world, 24);
    }
  }
  // Fine gilded fluting on the timber columns: one instanced draw call
  // keeps the repeated architectural detail inexpensive on live-stream devices.
  const columnFluteGeometry = new THREE.CylinderGeometry(0.012, 0.012, 5.9, 6);
  const columnFlutes = new THREE.InstancedMesh(
    columnFluteGeometry, mats.goldBright, 10 * 8
  );
  const fluteTransform = new THREE.Object3D();
  let fluteIndex = 0;
  for (const x of [-7.2, 7.2]) {
    for (const z of [-10, -4, 2, 8, 13]) {
      for (let rib = 0; rib < 8; rib++) {
        const angle = rib * Math.PI / 4;
        fluteTransform.position.set(
          x + Math.cos(angle) * 0.432,
          4.05,
          z + Math.sin(angle) * 0.432
        );
        fluteTransform.updateMatrix();
        columnFlutes.setMatrixAt(fluteIndex++, fluteTransform.matrix);
      }
    }
  }
  columnFlutes.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  columnFlutes.castShadow = false;
  columnFlutes.receiveShadow = true;
  world.add(columnFlutes);

  // Slim brass collars finish the foot and crown of each timber column.
  // One instanced batch keeps this architectural polish to a single extra draw call.
  const columnCollarGeometry = new THREE.TorusGeometry(0.49, 0.035, 8, 24);
  const columnCollars = new THREE.InstancedMesh(columnCollarGeometry, mats.goldBright, 10 * 2);
  const collarTransform = new THREE.Object3D();
  let collarIndex = 0;
  for (const x of [-7.2, 7.2]) {
    for (const z of [-10, -4, 2, 8, 13]) {
      for (const y of [0.86, 7.18]) {
        collarTransform.position.set(x, y, z);
        collarTransform.rotation.set(Math.PI / 2, 0, 0);
        collarTransform.scale.set(1, 1, 1);
        collarTransform.updateMatrix();
        columnCollars.setMatrixAt(collarIndex++, collarTransform.matrix);
      }
    }
  }
  columnCollars.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  columnCollars.castShadow = false;
  columnCollars.receiveShadow = true;
  world.add(columnCollars);

  // Front-facing ruby-and-brass diamond plaques add a carved rhythm to each
  // pillar without changing its silhouette or introducing per-piece draw calls.
  const columnPlaqueGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.035);
  const columnPlaques = new THREE.InstancedMesh(columnPlaqueGeometry, mats.goldBright, 10 * 3);
  const columnPlaqueGemGeometry = new THREE.SphereGeometry(0.052, 10, 8);
  const columnPlaqueGems = new THREE.InstancedMesh(columnPlaqueGemGeometry, mats.redBright, 10 * 3);
  const plaqueTransform = new THREE.Object3D();
  let plaqueIndex = 0;
  for (const x of [-7.2, 7.2]) {
    for (const z of [-10, -4, 2, 8, 13]) {
      for (const y of [1.55, 4.05, 6.55]) {
        plaqueTransform.position.set(x, y, z + 0.445);
        plaqueTransform.rotation.set(0, 0, Math.PI / 4);
        plaqueTransform.scale.set(1, 1, 1);
        plaqueTransform.updateMatrix();
        columnPlaques.setMatrixAt(plaqueIndex, plaqueTransform.matrix);
        plaqueTransform.position.z = z + 0.47;
        plaqueTransform.rotation.set(0, 0, 0);
        plaqueTransform.scale.set(1, 1, 0.42);
        plaqueTransform.updateMatrix();
        columnPlaqueGems.setMatrixAt(plaqueIndex, plaqueTransform.matrix);
        plaqueIndex++;
      }
    }
  }
  columnPlaques.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  columnPlaqueGems.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  columnPlaques.castShadow = columnPlaqueGems.castShadow = false;
  columnPlaques.receiveShadow = columnPlaqueGems.receiveShadow = true;
  world.add(columnPlaques, columnPlaqueGems);

  // Keep the central sightline to the Buddha open. Full-width crossbeams and
  // the low ceiling slab previously projected as opaque black bands over the altar.
  for (const z of [-10, -4, 2, 8, 13]) {
    box(1.6,0.28,0.42,mats.wood, -7.2,8.15,z);
    box(1.6,0.28,0.42,mats.wood, 7.2,8.15,z);
  }
  // Open-air sanctuary: keep the upper sightline clear while the side pillars frame the altar.

  // Raised side galleries add a second architectural plane beyond the columns.
  // Keep them low and peripheral so the Buddha remains the dominant focal point.
  for (const side of [-1, 1]) {
    const x = side * 9.15;
    box(2.35, 0.18, 25.5, mats.wood, x, -0.055, 2.2);
    box(2.2, 0.045, 25.2, mats.stone, x, 0.06, 2.2);
    box(0.055, 0.035, 25.0, mats.goldBright, side * 10.25, 0.1, 2.2);
    for (const z of [-9.8, -3.5, 2.8, 9.1, 14.2]) {
      box(2.05, 0.035, 0.07, mats.gold, x, 0.095, z);
    }
  }

  // Open timber balustrades finish the outer edge of each raised gallery.
  // The waist-high rails define the space without forming walls across the camera view.
  for (const side of [-1, 1]) {
    const railX = side * 10.18;
    box(0.14, 0.14, 24.8, mats.woodLight, railX, 0.66, 2.2);
    box(0.1, 0.09, 24.8, mats.goldBright, railX, 0.79, 2.2);
    for (let z = -9.2; z <= 14.0; z += 3.3) {
      box(0.18, 0.82, 0.18, mats.woodLight, railX, 0.48, z);
      box(0.25, 0.09, 0.25, mats.gold, railX, 0.94, z);
      sphere(0.075, mats.goldBright, railX, 1.02, z, 1, 0.7, 1);
    }
  }

  // Lanterns with warm emissive cores along the side aisles.
  const lanterns = [];
  for (const x of [-5.8, 5.8]) {
    for (const z of [-7, -1, 5, 11]) {
      const lantern = new THREE.Group(); lantern.position.set(x, 6.6, z); world.add(lantern);
      box(0.72, 0.12, 0.72, mats.gold, 0, 0.6, 0, lantern);
      box(0.55, 1.05, 0.55, mats.ivory, 0, 0, 0, lantern);
      box(0.72, 0.12, 0.72, mats.goldBright, 0, -0.58, 0, lantern);
      // Four distributed point lights illuminate all eight lanterns. The
      // remaining fixtures stay visible under the scene's existing key/fill lights,
      // avoiding eight extra point lights.
      if (z === -7 || z === 5) {
        const light = new THREE.PointLight(0xffb84d, 13, 5, 2);
        light.position.set(0, 0, 0);
        lantern.add(light);
        lanterns.push(light);
      }
    }
  }

  // Brass incense burner in the front of the dais.
  const burner = new THREE.Group(); burner.position.set(0, 0.2, -5.6); world.add(burner);
  cylinder(0.62, 0.8, 0.45, mats.gold, 0, 0.45, 0, burner, 32);
  cylinder(0.72, 0.72, 0.16, mats.goldBright, 0, 0.72, 0, burner, 32);
  cylinder(0.08, 0.08, 0.9, mats.woodLight, 0, 1.28, 0, burner, 12);
  sphere(0.11, mats.redBright, 0, 1.76, 0, 1, 1, 1, burner);

  // Three ritual stations are modeled as actual sanctuary props, not flat HUD icons.
  // They sit just inside the side colonnade, within the fixed portrait camera frustum.
  const ritualStations = [];
  function makeRitualStation(x, z, kind) {
    const station = new THREE.Group();
    station.position.set(x, 0.16, z);
    station.userData.ritualKind = kind;
    station.userData.animation = {
      startedAt: 0, duration: 0,
      bellPivot: null, malletPivot: null, drum: null, fortuneDrum: null
    };
    world.add(station);
    box(1.55, 0.22, 1.45, mats.wood, 0, 0, 0, station);
    box(1.62, 0.07, 1.52, mats.gold, 0, 0.14, 0, station);
    box(1.42, 0.12, 1.32, mats.woodLight, 0, 0.23, 0, station);
    if (kind === 'bell') {
      // Suspend the bell from a pivot so each strike visibly sets the bronze body swinging.
      const bellPivot = new THREE.Group();
      bellPivot.position.set(0, 1.08, 0);
      station.add(bellPivot);
      cylinder(0.38, 0.48, 0.76, mats.gold, 0, -0.34, 0, bellPivot, 32);
      cylinder(0.5, 0.5, 0.1, mats.goldBright, 0, -0.01, 0, bellPivot, 32);
      sphere(0.1, mats.goldBright, 0, 0.1, 0, 1, 1.25, 1, bellPivot);
      cylinder(0.035, 0.035, 0.42, mats.wood, 0.58, 0.63, 0, station, 10);
      sphere(0.09, mats.gold, 0.58, 0.4, 0, 1, 1, 1, station);
      station.userData.animation.bellPivot = bellPivot;
    } else if (kind === 'woodfish') {
      const drum = new THREE.Mesh(new THREE.SphereGeometry(0.48, 24, 18), mats.red);
      drum.scale.set(1.2, 0.76, 0.82); drum.position.set(0, 0.72, 0);
      drum.castShadow = true; station.add(drum);
      sphere(0.09, mats.goldBright, 0, 0.76, 0.39, 1, 0.7, 0.35, station);
      const malletPivot = new THREE.Group();
      malletPivot.position.set(0.58, 1.05, 0);
      station.add(malletPivot);
      const mallet = cylinder(0.055, 0.055, 0.72, mats.woodLight, 0, -0.29, 0, malletPivot, 10);
      mallet.rotation.z = -0.65;
      station.userData.animation.malletPivot = malletPivot;
      station.userData.animation.drum = drum;
    } else {
      // Keep all fortune-cylinder details under one pivot for a believable spin.
      const fortuneDrum = new THREE.Group();
      fortuneDrum.position.set(0, 0.72, 0);
      station.add(fortuneDrum);
      cylinder(0.34, 0.42, 0.82, mats.red, 0, 0, 0, fortuneDrum, 12);
      cylinder(0.38, 0.38, 0.08, mats.goldBright, 0, 0.42, 0, fortuneDrum, 16);
      cylinder(0.38, 0.38, 0.08, mats.gold, 0, -0.42, 0, fortuneDrum, 16);
      for (let i = 0; i < 9; i++) {
        const angle = i * Math.PI * 2 / 9;
        cylinder(0.018, 0.018, 0.72, mats.woodLight, Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2, fortuneDrum, 6);
      }
      sphere(0.1, mats.goldBright, 0, 0.53, 0, 1, 0.8, 1, fortuneDrum);
      station.userData.animation.fortuneDrum = fortuneDrum;
    }
    ritualStations.push(station);
  }
  makeRitualStation(-3.75, -1.2, 'bell');
  makeRitualStation(3.75, -1.2, 'woodfish');
  makeRitualStation(3.75, -5.4, 'fortune');

  // Raycast the visible 3D props so the world itself becomes the ritual menu.
  // The existing ritual event bus remains the single source of action behavior.
  const ritualActionByKind = {
    bell: 'ringBell',
    woodfish: 'strikeWoodenFish',
    fortune: 'drawFortune'
  };
  const ritualHitMeshes = [];
  for (const station of ritualStations) {
    const kind = station.userData.ritualKind;
    station.traverse((object) => {
      if (!object.isMesh) return;
      object.userData.ritualKind = kind;
      ritualHitMeshes.push(object);
    });
  }
  const ritualRaycaster = new THREE.Raycaster();
  const ritualPointer = new THREE.Vector2();
  let hoveredRitualStation = null;
  let pressedRitualStation = null;

  function ritualStationAtPointer(event) {
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    ritualPointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );
    ritualRaycaster.setFromCamera(ritualPointer, camera);
    const hit = ritualRaycaster.intersectObjects(ritualHitMeshes, false)[0];
    return hit?.object?.userData?.ritualKind
      ? ritualStations.find((station) => station.userData.ritualKind === hit.object.userData.ritualKind)
      : null;
  }

  function triggerRitualStation(kind) {
    const station = ritualStations.find((item) => item.userData.ritualKind === kind);
    if (!station) return;
    const animation = station.userData.animation;
    animation.startedAt = performance.now();
    animation.duration = kind === 'bell' ? 1400 : kind === 'woodfish' ? 720 : 1900;
  }

  function updateRitualStationAnimations(now) {
    for (const station of ritualStations) {
      const animation = station.userData.animation;
      if (!animation.startedAt) continue;
      const progress = Math.min(1, (now - animation.startedAt) / animation.duration);
      const fade = 1 - progress;
      if (animation.bellPivot) {
        animation.bellPivot.rotation.z = Math.sin(progress * Math.PI * 8) * 0.17 * fade;
      }
      if (animation.malletPivot) {
        animation.malletPivot.rotation.z = Math.sin(progress * Math.PI * 4) * 0.46 * fade;
        if (animation.drum) {
          animation.drum.scale.y = 0.76 + Math.max(0, Math.cos(progress * Math.PI * 4)) * 0.055 * fade;
        }
      }
      if (animation.fortuneDrum) {
        const spinEase = 1 - Math.pow(1 - progress, 3);
        animation.fortuneDrum.rotation.y = Math.PI * 2 * 3 * spinEase;
      }
      if (progress >= 1) {
        animation.startedAt = 0;
        if (animation.bellPivot) animation.bellPivot.rotation.z = 0;
        if (animation.malletPivot) animation.malletPivot.rotation.z = 0;
        if (animation.drum) animation.drum.scale.y = 0.76;
      }
    }
  }

  function setHoveredRitualStation(station) {
    if (hoveredRitualStation === station) return;
    if (hoveredRitualStation) hoveredRitualStation.scale.setScalar(1);
    hoveredRitualStation = station;
    if (hoveredRitualStation) hoveredRitualStation.scale.setScalar(1.045);
    canvas.style.cursor = hoveredRitualStation ? 'pointer' : '';
  }

  function onWorldPointerMove(event) {
    if (!event.isPrimary) return;
    setHoveredRitualStation(ritualStationAtPointer(event));
  }

  function onWorldPointerDown(event) {
    if (!event.isPrimary || event.button !== 0) return;
    pressedRitualStation = ritualStationAtPointer(event);
  }

  function onWorldPointerUp(event) {
    if (!event.isPrimary || event.button !== 0) return;
    const station = ritualStationAtPointer(event);
    const pressedStation = pressedRitualStation;
    pressedRitualStation = null;
    if (!station || station !== pressedStation) return;
    const action = ritualActionByKind[station.userData.ritualKind];
    if (action) {
      window.dispatchEvent(new CustomEvent('temple:ritual', { detail: { type: action } }));
    }
  }

  function onWorldPointerCancel() {
    pressedRitualStation = null;
  }

  function onWorldPointerLeave() {
    setHoveredRitualStation(null);
  }
  canvas.addEventListener('pointermove', onWorldPointerMove, { passive: true });
  canvas.addEventListener('pointerdown', onWorldPointerDown);
  canvas.addEventListener('pointerup', onWorldPointerUp);
  canvas.addEventListener('pointercancel', onWorldPointerCancel);
  canvas.addEventListener('pointerleave', onWorldPointerLeave);

  // Stylized human devotees replace the temporary animal crowd.
  // The avatar is deliberately built from lightweight Three.js geometry so it
  // is local, deterministic and does not depend on a third-party model host.
  const devotees = [];
  const devoteeAvatars = [];
  const allHumanAvatars = [];
  function makeHumanAvatar(height = 1.55) {
    const root = new THREE.Group();
    // The altar is at -Z; turn the avatar away from the +Z camera so devotees face it.
    root.rotation.y = Math.PI;
    // Upper body pivots at the waist so the devotee bows naturally instead of
    // rotating the entire body around the feet (which makes the knees clip the floor).
    const upperBody = new THREE.Group();
    upperBody.position.y = 0.48;
    root.add(upperBody);
    const pink = new THREE.MeshStandardMaterial({color:0xe978a5,roughness:0.82});
    const pinkDark = new THREE.MeshStandardMaterial({color:0xb94f7c,roughness:0.86});
    const denim = new THREE.MeshStandardMaterial({color:0x315f9c,roughness:0.9});
    const skin = new THREE.MeshStandardMaterial({color:0xf1c49a,roughness:0.82});
    const hair = new THREE.MeshStandardMaterial({color:0x39231d,roughness:0.9});
    const white = new THREE.MeshStandardMaterial({color:0xf2eee8,roughness:0.65});
    const eye = new THREE.MeshStandardMaterial({color:0x201b1a,roughness:0.6});
    const torso = sphere(0.27,pink,0,0.40,0,1.08,1.25,0.68,upperBody);
    sphere(0.12,pinkDark,0,0.24,0,1.08,0.45,0.72,upperBody);
    const head = new THREE.Group(); head.position.set(0,0.80,0.02); upperBody.add(head);
    sphere(0.27,skin,0,0,0,0.88,1.08,0.78,head);
    sphere(0.29,hair,0,0.12,-0.09,0.98,1.18,0.86,head);
    // Long back hair and shoulder-length side locks match the reference avatar silhouette.
    sphere(0.27,hair,0,-0.25,-0.11,0.92,1.55,0.72,head);
    sphere(0.13,hair,-0.22,-0.25,0.015,0.62,1.75,0.78,head);
    sphere(0.13,hair,0.22,-0.25,0.015,0.62,1.75,0.78,head);
    sphere(0.25,skin,0,0.02,0.06,0.9,1.0,0.78,head);
    // Soft fringe pieces sit above the forehead without covering the eyes.
    for (const [x,y,sx] of [[-0.13,0.19,0.58],[0,0.22,0.62],[0.13,0.19,0.58]]) {
      const fringe=sphere(0.105,hair,x,y,0.22,sx,0.72,0.42,head);
      fringe.rotation.z=-x*0.8;
    }
    const eyeWhites = [], eyePupils = [], eyebrows = [];
    for(const side of [-1,1]){
      const eyeGroup = new THREE.Group(); eyeGroup.position.set(side*0.105,0.045,0.22); head.add(eyeGroup);
      const sclera = sphere(0.052,white,0,0,0,1,1,0.45,eyeGroup);
      const pupil = sphere(0.026,eye,0,0,0.027,1,1,0.45,eyeGroup);
      eyeWhites.push(sclera); eyePupils.push(pupil);
      const brow=sphere(0.052,hair,side*0.105,0.115,0.205,1.25,0.22,0.35,head);
      brow.rotation.z=-side*0.12;
      eyebrows.push({ mesh: brow, side });
      sphere(0.035,skin,side*0.265,-0.02,0.05,0.7,0.7,0.7,head);
    }
    sphere(0.035,skin,0,-0.045,0.25,0.7,0.7,0.7,head);
    const smile = new THREE.Mesh(new THREE.TorusGeometry(0.075,0.012,6,18,Math.PI),pinkDark);
    smile.position.set(0,-0.105,0.235); smile.rotation.z=Math.PI; head.add(smile);
    const leftArm = new THREE.Group(); leftArm.position.set(-0.29,0.57,0); upperBody.add(leftArm);
    const rightArm = new THREE.Group(); rightArm.position.set(0.29,0.57,0); upperBody.add(rightArm);
    const leftHand = new THREE.Group(); leftHand.position.set(0,-0.43,0.02); leftArm.add(leftHand);
    const rightHand = new THREE.Group(); rightHand.position.set(0,-0.43,0.02); rightArm.add(rightHand);
    for(const [pivot,side,hand] of [[leftArm,-1,leftHand],[rightArm,1,rightHand]]){
      const sleeve=cylinder(0.105,0.12,0.42,pink,0,-0.2,0,pivot,12); sleeve.rotation.z=side*0.18;
      // Small articulated palms and separated fingers keep the prayer gesture readable at scene scale.
      sphere(0.064,skin,0,-0.025,0,0.92,1.18,0.48,hand);
      for(let finger=0;finger<4;finger++){
        const x=(finger-1.5)*0.027;
        cylinder(0.011,0.014,0.105,skin,x,0.075,0,hand,8);
        sphere(0.013,skin,x,0.128,0,0.85,0.9,0.85,hand);
      }
      sphere(0.025,skin,side*0.066,-0.005,0.008,0.9,1.2,0.9,hand);
    }
    const leftLeg = new THREE.Group(); leftLeg.position.set(-0.13,0.48,0); root.add(leftLeg);
    const rightLeg = new THREE.Group(); rightLeg.position.set(0.13,0.48,0); root.add(rightLeg);
    const leftKnee = new THREE.Group(); leftKnee.position.y = -0.24; leftLeg.add(leftKnee);
    const rightKnee = new THREE.Group(); rightKnee.position.y = -0.24; rightLeg.add(rightKnee);
    const leftFoot = new THREE.Group(); leftFoot.position.y = -0.24; leftKnee.add(leftFoot);
    const rightFoot = new THREE.Group(); rightFoot.position.y = -0.24; rightKnee.add(rightFoot);
    for(const [upper,lower,foot,side] of [[leftLeg,leftKnee,leftFoot,-1],[rightLeg,rightKnee,rightFoot,1]]){
      cylinder(0.105,0.12,0.25,denim,0,-0.12,0,upper,12);
      cylinder(0.095,0.11,0.25,denim,0,-0.12,0,lower,12);
      const shoe=sphere(0.13,white,0,-0.025,0.09,1.35,0.55,1.9,foot);
      shoe.rotation.y=side*0.04;
    }
    root.scale.setScalar(height/1.72);
    const avatar = {
      root, upperBody, torso, head, eyeWhites, eyePupils, eyebrows, smile, leftArm, rightArm, leftHand, rightHand, leftLeg, rightLeg, leftKnee, rightKnee, leftFoot, rightFoot,
      phase: Math.random() * Math.PI * 2,
      gltfRoot: null, gltfMixer: null, gltfActions: null, gltfActionName: null,
      gltfLastTime: 0, gltfRig: null, bowing: false, bowAmount: 0, kneeling: false, kneelBlend: 0, giftReactionStartedAt: 0, giftReactionUntil: 0, giftReactionProfile: { tier: 'small', intensity: 0.55, bowAmount: 0.08, durationMs: 1800 }
    };
    allHumanAvatars.push(avatar);
    return avatar;
  }

  function playGLTFHumanAction(avatar, mode) {
    if (!avatar.gltfMixer || !avatar.gltfActions) return false;
    const clip = avatar.gltfActions[mode] || (mode !== 'idle' ? avatar.gltfActions.idle : null);
    if (!clip) {
      // Do not leave a previous walk/bow action running when this rig has no
      // clip for the requested state and no idle clip to fall back to.
      avatar.gltfCurrentAction?.stopFading().fadeOut(0.18);
      avatar.gltfCurrentAction = null;
      avatar.gltfCurrentClip = null;
      avatar.gltfActionName = null;
      return false;
    }
    const isBow = mode === 'bow' && clip === avatar.gltfActions.bow;
    const current = avatar.gltfCurrentAction;
    if (current && avatar.gltfCurrentClip === clip) {
      // Several state names can resolve to the same idle clip. Cancel any
      // interrupted fade before reusing the action, or it may keep fading out.
      current.stopFading().setEffectiveWeight(1);
      current.setLoop(isBow ? THREE.LoopOnce : THREE.LoopRepeat, isBow ? 1 : Infinity);
      current.clampWhenFinished = isBow;
      avatar.gltfActionName = mode;
      return true;
    }
    const next = avatar.gltfMixer.clipAction(clip);
    // Actions are cached by the mixer. A quick A -> B -> A transition can
    // otherwise reuse an action that still has a previous fade scheduled.
    next.stopFading().setEffectiveWeight(1);
    if (isBow) {
      next.setLoop(THREE.LoopOnce, 1);
      next.clampWhenFinished = true;
    } else {
      next.setLoop(THREE.LoopRepeat, Infinity);
      next.clampWhenFinished = false;
    }
    next.reset().fadeIn(0.18).play();
    if (current && current !== next) current.stopFading().fadeOut(0.18);
    avatar.gltfCurrentAction = next;
    avatar.gltfCurrentClip = clip;
    avatar.gltfActionName = mode;
    return true;
  }

  function applyHumanBow(avatar, amount, kneelBlend = 0) {
    avatar.bowing = amount > 0.035;
    avatar.bowAmount = amount;
    if (avatar.gltfRoot) {
      if (avatar.gltfActions?.bow) return;
      const rig = avatar.gltfRig;
      if (rig?.spine) {
        rig.spine.rotation.x = rig.spineRest.x - amount * 0.46;
      }
      if (rig?.neck) {
        rig.neck.rotation.x = rig.neckRest.x - amount * 0.12;
      }
      if (rig?.head) {
        rig.head.rotation.x = rig.headRest.x + amount * 0.16;
      }
      if (rig?.leftArm) rig.leftArm.rotation.z = rig.leftArmRest.z + amount * 0.22;
      if (rig?.rightArm) rig.rightArm.rotation.z = rig.rightArmRest.z - amount * 0.22;
      return;
    }
    const upperPose = getHumanUpperPose({ kneelBlend, bowAmount: amount });
    avatar.upperBody.rotation.x = upperPose.torsoLean;
    avatar.head.rotation.x = upperPose.headCounter;
    avatar.leftArm.rotation.x = upperPose.armReach;
    avatar.rightArm.rotation.x = upperPose.armReach;
    avatar.leftArm.rotation.z = upperPose.armOpen;
    avatar.rightArm.rotation.z = -upperPose.armOpen;
    avatar.leftHand.rotation.z = -upperPose.armOpen * 0.18;
    avatar.rightHand.rotation.z = upperPose.armOpen * 0.18;
  }

  async function upgradeDevoteesFromGLB() {
    try {
      const [{ loadGLTFAsset }, { clone }, { findBestAnimationClip }] = await Promise.all([
        import('./three-model-loader.js'),
        import('three/addons/utils/SkeletonUtils.js'),
        import('./three-animation-utils.js')
      ]);
      const asset = await loadGLTFAsset('/assets/models/devotee-selected.glb', {
        targetHeight: 1.72,
        centerXZ: true
      });
      if (disposed) { asset.dispose(); return; }
      // SkeletonUtils.clone shares immutable geometry/material/texture resources
      // with the source GLB. Keep that source attached but hidden so the single
      // scene-level disposer owns both source and avatar clones without leaks.
      asset.root.visible = false;
      world.add(asset.root);
      const animations = asset.animations || [];
      const gltfActions = findBestAnimationClip(animations);
      const replacements = allHumanAvatars.map(() => clone(asset.root));
      for (const [avatarIndex, avatar] of allHumanAvatars.entries()) {
        // Keep procedural fallback nodes attached but hidden: their primitive
        // geometry/materials may be shared with the sanctuary's cached meshes.
        // Scene teardown owns and releases these resources exactly once.
        for (const child of avatar.root.children) child.visible = false;
        const model = replacements[avatarIndex];
        avatar.root.add(model);
        avatar.gltfRoot = model;
        avatar.gltfActions = gltfActions;
        avatar.gltfMixer = animations.length ? new THREE.AnimationMixer(model) : null;
        avatar.gltfActionName = null;
        avatar.gltfCurrentAction = null;
        avatar.gltfCurrentClip = null;
        avatar.gltfLastTime = 0;
        avatar.gltfWalkBlend = 0;
        const bones = {};
        const normalizedBoneName = (value) => (value || '').toLowerCase().replace(/[^a-z0-9]/g, '');
        const boneAliases = {
          spine: ['spine', 'spine01', 'spine1', 'spine02', 'spine2', 'chest', 'upperbody', 'jbipcspine', 'jbipcchest'],
          neck: ['neck', 'jbipcneck'],
          head: ['head', 'jbipchead'],
          leftArm: ['leftupperarm', 'leftarm', 'upperarmleft', 'armleft', 'upperarml', 'arml', 'lupperarm', 'larm', 'jbiplupperarm'],
          rightArm: ['rightupperarm', 'rightarm', 'upperarmright', 'armright', 'upperarmr', 'armr', 'rupperarm', 'rarm', 'jbiprupperarm'],
          leftLeg: ['leftupperleg', 'leftupleg', 'leftthigh', 'leftleg', 'upperlegleft', 'thighleft', 'upperlegl', 'thighl', 'legl', 'lupperleg', 'lthigh', 'lleg', 'jbiplupperleg'],
          leftKnee: ['leftlowerleg', 'leftcalf', 'leftshin', 'lowerlegleft', 'calfleft', 'shinleft', 'lowerlegl', 'calfl', 'shinl', 'llowerleg', 'lcalf', 'lshin', 'jbipllowerleg'],
          leftFoot: ['leftfoot', 'footleft', 'footl', 'lfoot', 'jbiplfoot'],
          rightLeg: ['rightupperleg', 'rightupleg', 'rightthigh', 'rightleg', 'upperlegright', 'thighright', 'upperlegr', 'thighr', 'legr', 'rupperleg', 'rthigh', 'rleg', 'jbiprupperleg'],
          rightKnee: ['rightlowerleg', 'rightcalf', 'rightshin', 'lowerlegright', 'calfright', 'shinright', 'lowerlegr', 'calfr', 'shinr', 'rlowerleg', 'rcalf', 'rshin', 'jbiprlowerleg'],
          rightFoot: ['rightfoot', 'footright', 'footr', 'rfoot', 'jbiprfoot']
        };
        const boneScores = {};
        model.traverse((node) => {
          if (!node.isBone) return;
          const name = normalizedBoneName(node.name);
          for (const [slot, aliases] of Object.entries(boneAliases)) {
            const aliasIndex = aliases.findIndex((alias) => name === alias || name.endsWith(alias));
            if (aliasIndex < 0) continue;
            // Prefer exact, earlier and more specific aliases over broad suffix
            // matches; traversal order must not decide which joint drives a pose.
            const exact = name === aliases[aliasIndex];
            const score = (exact ? 20000 : 10000) - aliasIndex * 100 + aliases[aliasIndex].length;
            if (score > (boneScores[slot] || 0)) {
              bones[slot] = node;
              boneScores[slot] = score;
            }
          }
        });
        avatar.gltfRig = {
          spine: bones.spine,
          neck: bones.neck,
          head: bones.head,
          leftArm: bones.leftArm,
          rightArm: bones.rightArm,
          spineRest: bones.spine?.rotation.clone(),
          neckRest: bones.neck?.rotation.clone(),
          headRest: bones.head?.rotation.clone(),
          leftArmRest: bones.leftArm?.rotation.clone(),
          rightArmRest: bones.rightArm?.rotation.clone(),
          leftLeg: bones.leftLeg,
          rightLeg: bones.rightLeg,
          leftKnee: bones.leftKnee,
          rightKnee: bones.rightKnee,
          leftFoot: bones.leftFoot,
          rightFoot: bones.rightFoot,
          leftLegRest: bones.leftLeg?.rotation.clone(),
          rightLegRest: bones.rightLeg?.rotation.clone(),
          leftKneeRest: bones.leftKnee?.rotation.clone(),
          rightKneeRest: bones.rightKnee?.rotation.clone(),
          leftFootRest: bones.leftFoot?.rotation.clone(),
          rightFootRest: bones.rightFoot?.rotation.clone()
        };

        // Report whether name-matched leg joints form usable ordered chains.
        // This is diagnostic only: do not enable world-space IK until the
        // selected asset's rest pose and bend axes have been visually checked.
        const inspectLegChain = (upper, lower, foot) => {
          const descendsFrom = (node, ancestor) => {
            for (let parent = node?.parent; parent; parent = parent.parent) {
              if (parent === ancestor) return true;
            }
            return false;
          };
          if (!upper?.isBone || !lower?.isBone || !foot?.isBone
            || !descendsFrom(lower, upper) || !descendsFrom(foot, lower)) {
            return { valid: false, upper: upper?.name || null, lower: lower?.name || null, foot: foot?.name || null };
          }
          model.updateWorldMatrix(true, true);
          const upperPosition = upper.getWorldPosition(new THREE.Vector3());
          const lowerPosition = lower.getWorldPosition(new THREE.Vector3());
          const footPosition = foot.getWorldPosition(new THREE.Vector3());
          return {
            valid: true,
            upper: upper.name,
            lower: lower.name,
            foot: foot.name,
            upperLength: Number(upperPosition.distanceTo(lowerPosition).toFixed(4)),
            lowerLength: Number(lowerPosition.distanceTo(footPosition).toFixed(4))
          };
        };
        avatar.gltfRig.leftLegChain = inspectLegChain(bones.leftLeg, bones.leftKnee, bones.leftFoot);
        avatar.gltfRig.rightLegChain = inspectLegChain(bones.rightLeg, bones.rightKnee, bones.rightFoot);
      }
      console.info(`[Temple3D] Selected devotee GLB applied to ${allHumanAvatars.length} characters; mapped clips:`,
        Object.entries(gltfActions).filter(([, clip]) => clip).map(([name, clip]) => `${name}=${clip.name}`),
        'available clips:', animations.map((clip) => ({
          name: clip.name || '(unnamed)',
          duration: Number.isFinite(clip.duration) ? Number(clip.duration.toFixed(2)) : null,
          tracks: clip.tracks.length,
          targets: [...new Set(clip.tracks.map((track) => track.name.split('.')[0]))].slice(0, 12)
        })),
        'rig:', Object.fromEntries(Object.entries(allHumanAvatars[0]?.gltfRig || {})
          .filter(([key, value]) => !key.endsWith('Rest') && value?.isBone)
          .map(([key, value]) => [key, value.name])),
        'leg chains:', {
          left: allHumanAvatars[0]?.gltfRig?.leftLegChain || { valid: false },
          right: allHumanAvatars[0]?.gltfRig?.rightLegChain || { valid: false }
        });
    } catch (error) {
      console.warn('[Temple3D] Optional devotee GLB unavailable; keeping procedural characters:', error);
    }
  }

  function applyGLTFFallbackWalk(avatar, gaitPhase, weight = 1) {
    const rig = avatar.gltfRig;
    if (!rig) return;
    const leftPose = getFootPlantingPose(gaitPhase + avatar.phase);
    const rightPose = getFootPlantingPose(gaitPhase + avatar.phase + Math.PI);
    const leftStep = leftPose.step;
    const rightStep = rightPose.step;
    const amount = 0.34 * weight;
    // Preserve the idle clip's evaluated pose when one exists. With no clips,
    // return to the captured rest pose instead of freezing on the last gait.
    const base = (bone, rest) => avatar.gltfActions?.idle ? bone?.rotation.x : rest?.x;
    if (rig.leftLeg && rig.leftLegRest) rig.leftLeg.rotation.x = base(rig.leftLeg, rig.leftLegRest) - leftStep * amount;
    if (rig.rightLeg && rig.rightLegRest) rig.rightLeg.rotation.x = base(rig.rightLeg, rig.rightLegRest) - rightStep * amount;
    if (rig.leftKnee && rig.leftKneeRest) rig.leftKnee.rotation.x = base(rig.leftKnee, rig.leftKneeRest) + leftPose.kneeFlex * weight;
    if (rig.rightKnee && rig.rightKneeRest) rig.rightKnee.rotation.x = base(rig.rightKnee, rig.rightKneeRest) + rightPose.kneeFlex * weight;
    if (rig.leftFoot && rig.leftFootRest) rig.leftFoot.rotation.x = base(rig.leftFoot, rig.leftFootRest) + leftStep * amount * 0.45 - leftPose.kneeFlex * weight * 0.65;
    if (rig.rightFoot && rig.rightFootRest) rig.rightFoot.rotation.x = base(rig.rightFoot, rig.rightFootRest) + rightStep * amount * 0.45 - rightPose.kneeFlex * weight * 0.65;
    if (rig.leftArm && rig.leftArmRest) rig.leftArm.rotation.x = base(rig.leftArm, rig.leftArmRest) + rightStep * amount * 0.62;
    if (rig.rightArm && rig.rightArmRest) rig.rightArm.rotation.x = base(rig.rightArm, rig.rightArmRest) + leftStep * amount * 0.62;
  }

  function getAvatarGiftReactionBlend(avatar, time) {
    const duration = Math.max(1, avatar.giftReactionProfile?.durationMs || 1800);
    return getGiftReactionBlend(avatar.giftReactionUntil - time, duration);
  }

  function applyGiftThankYouGesture(avatar, time) {
    if (avatar.gltfRoot) return;
    const blend = getAvatarGiftReactionBlend(avatar, time);
    const upperPose = getHumanUpperPose({ kneelBlend: avatar.kneelBlend, bowAmount: avatar.bowAmount });
    // Sweep both forearms inward and upward so the palms meet at chest height.
    // Recompute from the ritual base pose every frame to avoid rotation drift.
    const profile = avatar.giftReactionProfile || { intensity: 0.55, bowAmount: 0.08 };
    const strength = blend * profile.intensity;
    avatar.upperBody.rotation.x = upperPose.torsoLean - blend * profile.bowAmount;
    const thankYouLift = strength * (0.92 + Math.sin(time * 0.007) * 0.025);
    avatar.leftArm.rotation.x = upperPose.armReach - strength * 0.08;
    avatar.rightArm.rotation.x = upperPose.armReach - strength * 0.08;
    avatar.leftArm.rotation.z = upperPose.armOpen + thankYouLift;
    avatar.rightArm.rotation.z = -upperPose.armOpen - thankYouLift;
    avatar.leftHand.rotation.z = -upperPose.armOpen * 0.18 - blend * 0.06;
    avatar.rightHand.rotation.z = upperPose.armOpen * 0.18 + blend * 0.06;
  }

  function animateHuman(avatar, time, walking = false, walkPhase = null) {
    const gaitPhase = Number.isFinite(walkPhase) ? walkPhase : time * 0.009;
    const swing = Math.sin(gaitPhase + avatar.phase);
    const leftStep = getFootPlantingStep(gaitPhase + avatar.phase);
    const rightStep = getFootPlantingStep(gaitPhase + avatar.phase + Math.PI);
    const giftReaction = getAvatarGiftReactionBlend(avatar, time) * (avatar.giftReactionProfile?.intensity || 0.55);
    // Devotees briefly turn from the altar toward the live audience, then ease back.
    avatar.root.rotation.y = Math.PI * (1 - giftReaction);
    if (avatar.gltfRoot) {
      const mode = walking ? 'walk' : avatar.bowing ? 'bow' : 'idle';
      playGLTFHumanAction(avatar, mode);
      const delta = avatar.gltfLastTime ? Math.min(0.05, Math.max(0, (time - avatar.gltfLastTime) / 1000)) : 1 / 30;
      avatar.gltfMixer?.update(delta);
      avatar.gltfLastTime = time;
      const walkTarget = walking && !avatar.gltfActions?.walk ? 1 : 0;
      const walkBlend = 1 - Math.exp(-delta / 0.16);
      avatar.gltfWalkBlend += (walkTarget - avatar.gltfWalkBlend) * walkBlend;
      if (!avatar.gltfActions?.walk) applyGLTFFallbackWalk(avatar, gaitPhase, avatar.gltfWalkBlend);
      // Apply zero as well as non-zero bow amounts so a manual bow pose always
      // blends back to rest when the ritual state ends and no bow clip exists.
      if (!avatar.gltfActions?.bow) applyHumanBow(avatar, avatar.bowing ? avatar.bowAmount : 0);
      avatar.root.position.y = walking ? 0 : Math.sin(time*0.0015+avatar.phase)*0.012;
      return;
    }
    avatar.leftArm.rotation.x = walking ? rightStep*0.42 : Math.sin(time*0.0017+avatar.phase)*0.035;
    avatar.rightArm.rotation.x = walking ? leftStep*0.42 : Math.sin(time*0.0017+avatar.phase+1)*0.035;
    const footMode = walking ? 'walk' : avatar.kneeling ? 'kneel' : 'idle';
    const leftFootPose = getHumanFootPose({ mode: footMode, phase: gaitPhase + avatar.phase, blend: footMode === 'kneel' ? avatar.kneelBlend : 1 });
    const rightFootPose = getHumanFootPose({ mode: footMode, phase: gaitPhase + avatar.phase + Math.PI, blend: footMode === 'kneel' ? avatar.kneelBlend : 1 });
    avatar.leftLeg.rotation.x = leftFootPose.hipRotationX;
    avatar.rightLeg.rotation.x = rightFootPose.hipRotationX;
    avatar.leftKnee.rotation.x = leftFootPose.kneeRotationX;
    avatar.rightKnee.rotation.x = rightFootPose.kneeRotationX;
    avatar.leftFoot.rotation.x = leftFootPose.footRotationX;
    avatar.rightFoot.rotation.x = rightFootPose.footRotationX;
    avatar.leftFoot.position.y = -0.24 + leftFootPose.footLift;
    avatar.rightFoot.position.y = -0.24 + rightFootPose.footLift;
    const breathCycle = time * 0.00135 + avatar.phase;
    const breath = Math.sin(breathCycle);
    // Keep breathing on the torso mesh so the waist pivot and kneeling feet stay planted.
    avatar.torso.scale.y = 1 + breath * 0.012;
    avatar.torso.position.y = 0.40 + breath * 0.0025;
    avatar.torso.rotation.y = giftReaction * 0.035;
    avatar.head.rotation.y = Math.sin(time*0.0011+avatar.phase)*0.035 + giftReaction * 0.2;
    avatar.head.rotation.x = Math.sin(time*0.00082+avatar.phase*0.7)*0.012 - giftReaction * 0.045;
    // A tiny alternating head tilt keeps the group feeling attentive rather than mechanically synchronized.
    avatar.head.rotation.z = Math.sin(time*0.0014+avatar.phase)*0.008 + giftReaction * Math.sin(avatar.phase) * 0.035;
    const blinkCycle = ((time * 0.001 + avatar.phase * 0.17) % 4.6 + 4.6) % 4.6;
    const blinkPulse = Math.max(0, 1 - Math.abs(blinkCycle - 0.12) / 0.12);
    const blink = Math.min(1, blinkPulse * 0.94 + avatar.kneelBlend * 0.12);
    for (let index=0; index<avatar.eyeWhites.length; index++) {
      const eyeOpen = 1 - blink * 0.9;
      avatar.eyeWhites[index].scale.y = eyeOpen;
      avatar.eyePupils[index].scale.y = eyeOpen;
      avatar.eyePupils[index].position.x = Math.sin(time*0.00065+avatar.phase)*0.006 + giftReaction * (index === 0 ? 0.009 : -0.009);
      avatar.eyePupils[index].position.y = giftReaction * 0.008;
    }
    // A subtle wider smile and attentive eyes make the thank-you readable at portrait scale.
    avatar.smile.scale.x = 1 + giftReaction * 0.2;
    avatar.smile.scale.y = 1 + giftReaction * 0.12 - avatar.bowAmount * 0.12;
    for (const eyeWhite of avatar.eyeWhites) eyeWhite.scale.x = 1 + giftReaction * 0.045;
    // Lift the brows subtly and direct the pupils toward the viewer during thanks.
    for (const { mesh, side } of avatar.eyebrows) mesh.rotation.z = -side * 0.12 + giftReaction * side * 0.035;
    avatar.root.position.y = (walking ? 0 : Math.sin(time*0.0015+avatar.phase)*0.012) - avatar.kneelBlend * 0.1;
    applyGiftThankYouGesture(avatar, time);
  }
  function makeDevotee(x,z,scale=1) {
    const group=new THREE.Group();group.position.set(x,0.02,z);group.scale.setScalar(scale);world.add(group);
    const avatar=makeHumanAvatar(1.42);group.add(avatar.root);
    devotees.push(group);devoteeAvatars.push(avatar);return group;
  }
  for(let row=0;row<4;row++){
    const z=-3.2+row*3.1, scale=1.0-row*0.065;
    makeDevotee(-4.3,z,scale);makeDevotee(4.3,z,scale);
  }
  const mainDevotee=new THREE.Group();
  mainDevotee.visible=false;mainDevotee.position.set(0,0.05,7.5);world.add(mainDevotee);
  const mainHuman=makeHumanAvatar(1.72);mainDevotee.add(mainHuman.root);
  const devoteeState={active:false,startedAt:0,duration:2600,arrivedAt:0};

  // Prayer flags, side screens and lotus planters give the hall a lived-in scale.
  for (const x of [-6.2, 6.2]) {
    for (let z = -8; z <= 10; z += 6) {
      box(0.55, 0.22, 1.2, mats.woodLight, x, 0.18, z);
      for (let i = 0; i < 3; i++) {
        const leaf = sphere(0.22, mats.leaf, x + (i - 1) * 0.22, 0.48, z, 0.45, 0.18, 1.2);
        leaf.rotation.z = (i - 1) * 0.35;
      }
      for (let i = 0; i < 3; i++) {
        const petal = sphere(0.2, mats.lotus, x + (i - 1) * 0.22, 0.75, z, 0.65, 0.35, 1.1);
        petal.rotation.z = (i - 1) * 0.25;
      }
    }
  }

  // Gentle ambient incense motes and lamp flames keep the world alive at idle.
  const dustGeometry = new THREE.BufferGeometry();
  const dustCount = 130;
  const dustPositions = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPositions[i * 3] = (Math.random() - 0.5) * 15;
    dustPositions[i * 3 + 1] = 0.8 + Math.random() * 8;
    dustPositions[i * 3 + 2] = -10 + Math.random() * 26;
  }
  dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
  const dust = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xffd98b, size: 0.045, transparent: true, opacity: 0.72 }));
  world.add(dust);

  const effects = [];
  // Keep transient gift/ritual meshes bounded during high-volume live sessions.
  // Evicted effects are detached and disposed by addEffect() before insertion.
  const MAX_EFFECTS = 64;
  let raf = 0, lastFrame = 0, elapsed = 0, disposed = false;
  let ritualUntil = 0;
  const clock = new THREE.Clock();

  // Optional, local-only GLB replacement. The procedural Buddha remains the
  // default and stays visible until the selected, rights-cleared file loads.
  const modelParams = new URLSearchParams(location.search);
  const modelsRequested = modelParams.get('models') === '1';
  // Allow the Buddha asset to be previewed independently of optional devotee rigs.
  const buddhaModelRequested = modelParams.get('buddha') === '1';
  // The procedural custom sculpture is the default production Buddha; GLB is opt-in.
  if (!buddhaModelRequested && !modelsRequested) {
    window.__TEMPLE_BUDDHA_MODEL_SOURCE__ = 'custom-procedural';
  }
  // Diagnostics are opt-in so normal live sessions pay no logging overhead.
  const statsEnabled = modelParams.get('stats') === '1';
  let lastStatsAt = 0;

  // Probe optional same-origin GLBs before the model loader requests them.
  // A missing preferred asset is an expected fallback state.
  async function isLocalModelAvailable(url) {
    const response = await fetch(url, { method: 'HEAD', cache: 'no-store' });
    return response.ok;
  }

  function applyGiltFinish(root) {
    root.traverse((node) => {
      if (!node.isMesh || !node.material) return;
      const materials = Array.isArray(node.material) ? node.material : [node.material];
      for (const material of materials) {
        if (!material) continue;
        // The public MIA scan is a neutral/light scan of a gilt-bronze object.
        // Apply a restrained gold PBR finish while preserving its texture maps.
        if (material.color) material.color.setHex(0xc99a3c);
        // A slightly broader highlight and lower self-glow read closer to aged
        // gilt bronze under the temple's warm key lights, not polished plastic.
        if ('metalness' in material) material.metalness = 0.68;
        if ('roughness' in material) material.roughness = 0.42;
        if ('envMapIntensity' in material) material.envMapIntensity = 1.15;
        if (material.emissive) {
          material.emissive.setHex(0x241304);
          material.emissiveIntensity = 0.035;
        }
        material.needsUpdate = true;
      }
      node.castShadow = true;
      node.receiveShadow = true;
    });
  }

  async function upgradeBuddhaFromGLB() {
    let asset;
    let assetSource = 'procedural';
    try {
      const { loadGLTFAsset } = await import('./three-model-loader.js');
      const selectedUrl = '/assets/models/buddha-selected.glb';
      const fallbackUrl = '/assets/models/buddha-cc0-fallback.glb';

      // The user-selected Kenny Hsieh model has priority when its local file exists.
      if (await isLocalModelAvailable(selectedUrl)) {
        try {
          asset = await loadGLTFAsset(selectedUrl, {
            targetHeight: 5.88,
            centerXZ: true
          });
          assetSource = 'kenny-hsieh';
          console.info('[Temple3D] Selected Buddha GLB loaded; procedural fallback replaced.');
        } catch (selectedError) {
          console.warn('[Temple3D] Selected Kenny Hsieh Buddha is invalid; trying the CC0 gilt-bronze scan:', selectedError);
        }
      } else {
        console.info('[Temple3D] Selected Kenny Hsieh GLB is not vendored yet; skipping its load request.');
      }

      if (!asset) {
        if (!(await isLocalModelAvailable(fallbackUrl))) {
          window.__TEMPLE_BUDDHA_MODEL_SOURCE__ = 'procedural';
          console.warn('[Temple3D] Optional Buddha GLB files are not available; keeping procedural statue.');
          return;
        }
        asset = await loadGLTFAsset(fallbackUrl, {
          targetHeight: 5.88,
          centerXZ: true
        });
        assetSource = 'mia-cc0-gilt-bronze';
        console.info('[Temple3D] CC0 gilt-bronze Buddha fallback loaded; procedural fallback replaced.');
      }

      if (disposed) {
        asset.dispose();
        return;
      }
      // Preserve Kenny Hsieh's authored materials; only tint the neutral CC0 scan.
      if (assetSource === 'mia-cc0-gilt-bronze') {
        applyGiltFinish(asset.root);
        // The museum scan reads slightly narrow in the 9:16 altar composition.
        // Widen only the horizontal axis; preserve height, ground contact and center.
        const originalCenter = new THREE.Box3()
          .setFromObject(asset.root)
          .getCenter(new THREE.Vector3());
        asset.root.scale.x *= 1.1;
        asset.root.updateMatrixWorld(true);
        const widenedCenter = new THREE.Box3()
          .setFromObject(asset.root)
          .getCenter(new THREE.Vector3());
        asset.root.position.x += originalCenter.x - widenedCenter.x;
        asset.root.position.z += originalCenter.z - widenedCenter.z;
        asset.root.updateMatrixWorld(true);
      }
      // Keep the procedural meshes as a hidden last-resort fallback. Their
      // cached primitive geometries are shared with the rest of the scene.
      for (const child of statue.children) child.visible = false;
      statue.add(asset.root);
      window.__TEMPLE_BUDDHA_MODEL_SOURCE__ = assetSource;
    } catch (error) {
      window.__TEMPLE_BUDDHA_MODEL_SOURCE__ = 'procedural';
      console.warn('[Temple3D] Optional Buddha GLB unavailable; keeping procedural statue:', error);
    }
  }

  function addEffect(object, update, duration = 1800) {
    if (effects.length >= MAX_EFFECTS) {
      const old = effects.shift(); world.remove(old.object); disposeThreeObjectTree(old.object);
    }
    world.add(object); effects.push({ object, update, elapsed: 0, duration });
  }
  function makeRing(x, y, z, color = 0xffd16b) {
    const mesh = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.035, 8, 48),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
    mesh.position.set(x, y, z); mesh.rotation.x = -Math.PI / 2;
    addEffect(mesh, (obj, dt, p) => { const s = 1 + p * 5; obj.scale.setScalar(s); obj.material.opacity = 0.85 * (1 - p); }, 1400);
  }
  function lotusBurst(count = 5) {
    for (let i = 0; i < Math.min(count, 18); i++) {
      const petal = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), mats.lotus.clone());
      petal.position.set((Math.random() - 0.5) * 5, 1.2 + Math.random() * 3, -4 + Math.random() * 9);
      addEffect(petal, (obj, dt, p) => {
        obj.position.y += dt * 0.0015; obj.rotation.z += dt * 0.001;
        obj.material.opacity = 0.9 * (1 - p);
      }, 2600);
    }
  }
  // Three-dimensional gift reactions mirror the existing gift action engine.
  // Every transient effect owns its materials: disposeThreeObjectTree() can then
  // release them without disposing shared sanctuary materials used by the world.
  // They are world-space overlays; they never move the master camera.
  function giftSparkBurst(x, y, z, count = 18, color = 0xffc45a) {
    for (let i = 0; i < count; i++) {
      const material = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
      const spark = new THREE.Mesh(new THREE.SphereGeometry(0.055 + Math.random() * 0.045, 8, 6), material);
      spark.position.set(x, y, z);
      const velocity = new THREE.Vector3(
        (Math.random() - 0.5) * 5,
        Math.random() * 4.5,
        (Math.random() - 0.5) * 4
      );
      addEffect(spark, (obj, dt, p) => {
        const step = dt * 0.001;
        obj.position.addScaledVector(velocity, step);
        velocity.y -= step * 2.4;
        obj.scale.setScalar(Math.max(0.01, 1 - p));
        obj.material.opacity = 0.95 * (1 - p);
      }, 1050);
    }
  }

  function playWorldGiftAction(action) {
    if (action === 'rocket') {
      const rocket = new THREE.Group();
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 0.9, 12), mats.redBright.clone());
      body.rotation.z = -Math.PI / 2; rocket.add(body);
      const nose = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.34, 12), mats.goldBright.clone());
      nose.rotation.z = -Math.PI / 2; nose.position.x = 0.6; rocket.add(nose);
      const finMaterial = mats.gold.clone();
      for (const side of [-1, 1]) {
        const fin = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 0.34), finMaterial);
        fin.position.set(-0.32, side * 0.14, 0); rocket.add(fin);
      }
      rocket.position.set(-8, 4.2, 3.5); rocket.rotation.y = -0.08;
      addEffect(rocket, (obj, dt, p) => {
        obj.position.x = -8 + p * 8.4;
        obj.position.y = 4.2 + Math.sin(p * Math.PI) * 0.8;
        obj.position.z = 3.5 - p * 2.4;
        obj.rotation.z = -0.08 + p * 0.12;
        if (p >= 0.98 && !obj.userData.detonated) {
          obj.userData.detonated = true;
          world.remove(obj);
          makeRing(0, 1.25, 1.0, 0xffa52e);
          makeRing(0, 1.35, 1.0, 0xffe18a);
          giftSparkBurst(0, 1.5, 1.0, 28, 0xffa52e);
        }
      }, 1250);
      return;
    }
    if (action === 'dragon') {
      const dragon = new THREE.Group();
      const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x2d9a54, roughness: 0.5, metalness: 0.12 });
      const goldMaterial = mats.goldBright.clone();
      for (let i = 0; i < 5; i++) {
        const segment = new THREE.Mesh(new THREE.SphereGeometry(0.28 - i * 0.025, 12, 8), bodyMaterial);
        segment.position.set(-i * 0.42, Math.sin(i * 0.8) * 0.12, 0);
        dragon.add(segment);
      }
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.36, 14, 10), bodyMaterial);
      head.position.set(0.42, 0.05, 0); dragon.add(head);
      for (const side of [-1, 1]) {
        const horn = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.42, 8), goldMaterial);
        horn.position.set(0.3, 0.38, side * 0.18); horn.rotation.z = -0.35; dragon.add(horn);
      }
      const whisker = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.025, 6, 18, Math.PI), goldMaterial);
      whisker.position.set(0.58, -0.1, 0); dragon.add(whisker);
      dragon.position.set(-8, 6.2, -1.5);
      addEffect(dragon, (obj, dt, p) => {
        obj.position.x = -8 + p * 16;
        obj.position.y = 6.2 + Math.sin(p * Math.PI * 4) * 0.55;
        obj.position.z = -1.5 + Math.sin(p * Math.PI * 2) * 0.7;
        obj.rotation.z = Math.sin(p * Math.PI * 4) * 0.08;
        obj.scale.setScalar(0.72 + Math.sin(p * Math.PI) * 0.22);
        if (p > 0.72 && !obj.userData.gust) {
          obj.userData.gust = true;
          makeRing(0, 1.5, -0.2, 0x65d9a0);
          giftSparkBurst(0, 2.0, -0.2, 14, 0x65d9a0);
        }
      }, 2900);
      return;
    }
    if (action === 'donut') {
      const donutMaterial = new THREE.MeshStandardMaterial({ color: 0xf1a0bd, roughness: 0.38, metalness: 0.04 });
      const donut = new THREE.Mesh(new THREE.TorusGeometry(0.58, 0.22, 14, 36), donutMaterial);
      donut.position.set(-7, 3.3, 4.0);
      const icing = new THREE.Mesh(new THREE.TorusGeometry(0.59, 0.055, 8, 36), mats.ivory.clone());
      icing.position.y = 0.08; donut.add(icing);
      addEffect(donut, (obj, dt, p) => {
        obj.position.x = -7 + p * 14;
        obj.position.y = 3.3 + Math.sin(p * Math.PI * 3) * 0.65;
        obj.position.z = 4 - Math.sin(p * Math.PI) * 2.2;
        obj.rotation.x += dt * 0.002;
        obj.rotation.y += dt * 0.004;
        obj.scale.setScalar(0.65 + Math.sin(p * Math.PI) * 0.3);
        if (p > 0.55 && !obj.userData.trail) {
          obj.userData.trail = true;
          for (let i = 0; i < 7; i++) makeRing((i - 3) * 0.32, 1.0, 3.2, 0xffc2dc);
        }
      }, 2450);
      return;
    }
    if (action === 'rose') {
      const bloom = new THREE.Group();
      bloom.position.set(0, 3.0, 2.5);
      const petalMaterial = mats.lotus.clone();
      for (let i = 0; i < 10; i++) {
        const angle = i * Math.PI * 2 / 10;
        const petal = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 8), petalMaterial);
        petal.position.set(Math.cos(angle) * 0.35, Math.sin(angle) * 0.35, 0);
        petal.scale.set(1.0, 0.58, 0.48);
        petal.rotation.z = angle;
        bloom.add(petal);
      }
      const heart = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 8), mats.goldBright.clone());
      bloom.add(heart);
      addEffect(bloom, (obj, dt, p) => {
        obj.position.y = 3.0 + p * 1.8;
        obj.rotation.z += dt * 0.0007;
        obj.scale.setScalar(0.35 + Math.sin(Math.min(1, p * 1.5) * Math.PI / 2) * 0.85);
        obj.children.forEach((petal, i) => { petal.rotation.z += dt * (i % 2 ? 0.0003 : -0.0003); });
        if (p > 0.28 && !obj.userData.petalBurst) {
          obj.userData.petalBurst = true;
          giftSparkBurst(0, 4.0, 2.5, 12, 0xf18eae);
        }
      }, 2100);
    }
  }

  function incenseEffect() {
    for (let i = 0; i < 8; i++) {
      const puff = new THREE.Mesh(new THREE.SphereGeometry(0.16 + Math.random() * 0.1, 10, 8),
        new THREE.MeshBasicMaterial({ color: 0xd7c5a6, transparent: true, opacity: 0.22 }));
      puff.position.set((Math.random() - 0.5) * 0.5, 2 + i * 0.12, -5.6);
      addEffect(puff, (obj, dt, p) => {
        obj.position.y += dt * 0.001; obj.position.x += Math.sin(p * 7) * dt * 0.0002;
        obj.scale.multiplyScalar(1 + dt * 0.00012); obj.material.opacity = 0.22 * (1 - p);
      }, 3600);
    }
  }
  function handleRitual(event) {
    if (!event || typeof event.type !== 'string') return;
    const stationKindByAction = {
      ringBell: 'bell',
      strikeWoodenFish: 'woodfish',
      drawFortune: 'fortune'
    };
    if (stationKindByAction[event.type]) triggerRitualStation(stationKindByAction[event.type]);
    ritualUntil = performance.now() + 7800;
    if (event.type === 'burnIncense') {
      incenseEffect(); makeRing(0, 1.2, -5.6);
      mainDevotee.visible = true;
      mainDevotee.position.z = 7.5;
      mainDevotee.scale.setScalar(1);
      mainDevotee.rotation.x = 0;
      mainHuman.upperBody.rotation.x = 0;
      mainHuman.head.rotation.x = 0;
      mainHuman.kneeling = false;
      mainHuman.kneelBlend = 0;
      applyHumanBow(mainHuman, 0);
      devoteeState.active = true;
      devoteeState.startedAt = performance.now();
      devoteeState.arrivedAt = 0;
    }
    else if (event.type === 'ringBell') { makeRing(-3.75, 1.85, -1.2, 0xffe18a); }
    else if (event.type === 'strikeWoodenFish') { makeRing(3.75, 0.9, -1.2); }
    else if (event.type === 'sendPrayer') lotusBurst(8);
    else if (event.type === 'offerGift') lotusBurst(Math.min(18, 5 + Math.ceil((event.coins || 10) / 10)));
    else if (event.type === 'grandCeremony') { lotusBurst(18); for (let i = 0; i < 5; i++) makeRing(0, 0.2 + i * 0.2, -7); }
    else if (event.type === 'drawFortune') { lotusBurst(5); makeRing(3.75, 0.85, -5.4, 0xffdf83); }
    start();
  }
  function onTempleRitual(event) { handleRitual(event.detail); }
  // A gift can arrive while the altar is empty; listen to the effect lifecycle,
  // not the character-interruption signal, so every started gift renders once.
  function applyGiftReactionProfile(profile) {
    const resolved = profile || { tier: 'small', intensity: 0.55, bowAmount: 0.08, durationMs: 1800 };
    const now = performance.now();
    for (const avatar of allHumanAvatars) {
      const wasActive = avatar.giftReactionUntil > now;
      if (!wasActive) {
        // Phase-based delay creates a soft wave through the congregation without randomness per gift.
        const phase = ((avatar.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        avatar.giftReactionStartedAt = now + (phase / (Math.PI * 2)) * 420;
        avatar.giftReactionUntil = avatar.giftReactionStartedAt + resolved.durationMs;
      } else {
        avatar.giftReactionUntil = Math.max(avatar.giftReactionUntil, avatar.giftReactionStartedAt + resolved.durationMs);
      }
      if (resolved.intensity >= (avatar.giftReactionProfile?.intensity || 0)) avatar.giftReactionProfile = resolved;
    }
  }
  function onTempleGiftAction(event) {
    const action = event.detail?.action;
    if (!['rocket', 'dragon', 'donut', 'rose'].includes(action)) return;
    playWorldGiftAction(action);
    applyGiftReactionProfile(event.detail?.reactionProfile);
  }
  function onTempleGiftReaction(event) {
    // Combo frames update gratitude intensity without replaying the 3D gift effect.
    applyGiftReactionProfile(event.detail?.reactionProfile);
  }
  window.addEventListener('temple:ritual', onTempleRitual);
  window.addEventListener('temple:gift-action', onTempleGiftAction);
  window.addEventListener('temple:gift-reaction', onTempleGiftReaction);

  // Add the independent roofless architectural detail layer to the same scene.
  // It shares the renderer, camera and animation loop; no extra lights are created.
  const templeEnvironment = createTempleEnvironment({
    THREE,
    scene,
    config: { detailLevel: renderProfile.environmentDetail }
  });

  function frame(now) {
    if (disposed || document.hidden) { raf = 0; return; }
    raf = requestAnimationFrame(frame);
    if (now - lastFrame < 33) return; // cap at 30 fps for the portrait live scene
    const dt = Math.min(50, now - (lastFrame || now));
    lastFrame = now; elapsed += dt;
    halo.rotation.z = Math.sin(elapsed * 0.00016) * 0.025;
    lotusThrone.rotation.y = Math.sin(elapsed * 0.00022) * 0.025;
    devoteeAvatars.forEach((avatar) => animateHuman(avatar, now, false));
    if (devoteeState.active) {
      const travel = Math.min(1, (now - devoteeState.startedAt) / devoteeState.duration);
      const eased = travel * travel * (3 - 2 * travel);
      // Use eased world-space distance, matching the actual translation below.
      const walkPhase = (eased * 11.2 / 2.2) * Math.PI * 2;
      if (travel >= 1 && !devoteeState.arrivedAt) devoteeState.arrivedAt = now;
      const ritualPose = getRitualPoseState({
        travel,
        elapsedAfterArrival: devoteeState.arrivedAt ? now - devoteeState.arrivedAt : 0,
        remainingMs: ritualUntil - now
      });
      mainHuman.kneelBlend = ritualPose.kneelBlend;
      mainHuman.kneeling = ritualPose.kneelBlend > 0.035;
      animateHuman(mainHuman, now, ritualPose.walking, walkPhase);
      mainDevotee.position.z = 7.5 - eased * 11.2;
      mainDevotee.scale.setScalar(1 - eased * 0.18);
      // The same eased timeline drives the procedural bow and GLB bow state.
      applyHumanBow(mainHuman, ritualPose.bowAmount, ritualPose.kneelBlend);
      applyGiftThankYouGesture(mainHuman, now);
      if (now > ritualUntil) {
        devoteeState.active = false;
        mainHuman.kneeling = false;
        mainHuman.kneelBlend = 0;
        applyHumanBow(mainHuman, 0);
        mainDevotee.visible = false;
      }
    }
    lanterns.forEach((light, i) => {
      light.intensity = 11.5 + Math.sin(elapsed * 0.0032 + i * 1.7) * 1.65 + Math.sin(elapsed * 0.007 + i) * 0.35;
    });
    const congregationGiftGlow = allHumanAvatars.reduce((peak, avatar) => Math.max(
      peak,
      getAvatarGiftReactionBlend(avatar, now) * (avatar.giftReactionProfile?.intensity || 0.55)
    ), 0);
    const specialGiftGlow = allHumanAvatars.reduce((peak, avatar) => Math.max(
      peak,
      avatar.giftReactionProfile?.tier === 'special' ? getAvatarGiftReactionBlend(avatar, now) : 0
    ), 0);
    const auraPulse = specialGiftGlow * (0.94 + Math.sin(elapsed * 0.008) * 0.06);
    lotusSparkMaterial.opacity = auraPulse * 0.88;
    if (auraPulse > 0.001) {
      for (let i = 0; i < lotusSparkCount; i++) {
        const progress = (lotusSparkPhases[i] + elapsed * 0.00001 * lotusSparkSpeeds[i]) % 1;
        const angle = lotusSparkPhases[i] * Math.PI * 2 + elapsed * 0.0007 * lotusSparkSpeeds[i];
        const radius = lotusSparkRadii[i] * (1 - progress * 0.58);
        const offset = i * 3;
        lotusSparkPositions[offset] = Math.cos(angle) * radius;
        lotusSparkPositions[offset + 1] = 0.32 + progress * 3.55;
        lotusSparkPositions[offset + 2] = Math.sin(angle) * radius;
      }
      lotusSparkGeometry.attributes.position.needsUpdate = true;
    }
    // Parent-group scaling opens both instanced petal tiers without rewriting
    // per-petal matrices or allocating objects in the render loop.
    lotusPetalRings.forEach((ring, index) => {
      const opening = auraPulse * (index === 0 ? 0.13 : 0.09);
      ring.scale.set(1 + opening, 1, 1 + opening);
    });
    haloGiftAuraMaterial.opacity = auraPulse * 0.42;
    haloGiftAura.scale.setScalar(1 + auraPulse * 0.12);
    lotusGiftAuraMaterial.opacity = auraPulse * 0.34;
    lotusGiftAura.scale.setScalar(1 + auraPulse * 0.18);
    haloGlow.intensity = 8 + auraPulse * 13;
    // A warm edge light and restrained material emission make stone reliefs
    // and gilded trim catch the special-gift beat without a full-scene flash.
    statueRimLight.intensity = 0.82 + auraPulse * 1.1;
    mats.goldBright.emissiveIntensity = 0.25 + auraPulse * 0.38;
    mats.statueStone.emissiveIntensity = 0.035 + auraPulse * 0.045;
    buddhaLight.intensity = 14 + Math.sin(elapsed * 0.0018) * 1.0 + congregationGiftGlow * 2.2;
    altarFill.intensity = 17 + Math.sin(elapsed * 0.0045 + 0.8) * 2.2 + congregationGiftGlow * 4.5;
    updateRitualStationAnimations(now);
    offeringFlames.forEach((flame, i) => { const flicker = 1 + Math.sin(elapsed * 0.018 + i * 2.1) * 0.09; flame.scale.set(0.72 * flicker, 1.5 * flicker, 0.72 * flicker); });
    offeringGlow.intensity = 7 + Math.sin(elapsed * 0.009) * 1.1;
    updateIncenseWisps(now);
    dust.rotation.y += dt * 0.000018;
    for (let i = effects.length - 1; i >= 0; i--) {
      const effect = effects[i]; effect.elapsed += dt;
      const p = Math.min(1, effect.elapsed / effect.duration);
      effect.update(effect.object, dt, p);
      if (p >= 1) { world.remove(effect.object); disposeThreeObjectTree(effect.object); effects.splice(i, 1); }
    }
    renderer.render(scene, camera);
    if (statsEnabled && now - lastStatsAt >= 5000) {
      const info = renderer.info;
      console.info('[Temple3D] GPU frame stats', {
        drawCalls: info.render.calls,
        triangles: info.render.triangles,
        geometries: info.memory.geometries,
        textures: info.memory.textures,
        activeEffects: effects.length,
        pixelRatio: renderer.getPixelRatio()
      });
      lastStatsAt = now;
    }
    if (!effects.length && now > ritualUntil && elapsed > 60000) elapsed = 0;
  }
  function start() { if (!disposed && !document.hidden && !raf) raf = requestAnimationFrame(frame); }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }
  let resourcesDisposed = false;
  function releaseWorldResources() {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    window.removeEventListener('temple:ritual', onTempleRitual);
    window.removeEventListener('temple:gift-action', onTempleGiftAction);
    window.removeEventListener('temple:gift-reaction', onTempleGiftReaction);
    canvas.removeEventListener('pointermove', onWorldPointerMove);
    canvas.removeEventListener('pointerdown', onWorldPointerDown);
    canvas.removeEventListener('pointerup', onWorldPointerUp);
    canvas.removeEventListener('pointercancel', onWorldPointerCancel);
    canvas.removeEventListener('pointerleave', onWorldPointerLeave);
    canvas.style.cursor = '';
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('resize', onWindowResize);
    for (const effect of effects.splice(0)) {
      world.remove(effect.object);
      disposeThreeObjectTree(effect.object);
    }
    templeEnvironment.dispose();
    disposeThreeSceneResources(scene);
    renderer.dispose();
  }
  function onVisibilityChange() { if (document.hidden) stop(); else start(); }
  function onWindowResize() {
    if (disposed) return;
    camera.aspect = 1080 / 1920; camera.updateProjectionMatrix();
    renderer.setSize(1080, 1920, false);
  }
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('resize', onWindowResize);
  canvas.addEventListener('webglcontextlost', (event) => {
    // Do not attempt to render into a lost context. Release CPU-side references
    // and fall back to the known-good 2D stage; a page reload can create a fresh
    // WebGL context if the user explicitly enables 3D again.
    event.preventDefault();
    disposed = true;
    stop();
    releaseWorldResources();
    canvas.hidden = true;
    stage.classList.remove('temple-3d-mode');
    window.__TEMPLE_3D_READY__ = false;
    window.dispatchEvent(new Event('temple:3d-unavailable'));
  });
  window.addEventListener('pagehide', () => {
    disposed = true;
    stop();
    releaseWorldResources();
  }, { once: true });

  canvas.hidden = false;
  window.__TEMPLE_3D_READY__ = true;
  window.dispatchEvent(new Event('temple:3d-ready'));
  start();
  if (modelsRequested || buddhaModelRequested) {
    window.__TEMPLE_BUDDHA_MODEL_SOURCE__ = 'loading';
    void upgradeBuddhaFromGLB();
  }
  if (modelsRequested) {
    void upgradeDevoteesFromGLB();
  }
  console.info('[Temple3D] Full sanctuary world ready (?3d=1), with human devotees and stone Buddha.');
}
