/**
 * Independent architectural detail layer for the roofless temple sanctuary.
 *
 * This module only adds geometry to the supplied scene. It never creates a
 * renderer, camera, lighting rig, animation loop, or external asset request.
 */

const DEFAULTS = Object.freeze({
  // Portrait-camera framing: the altar screen ends near X = ±4.6, so side
  // columns and panels sit just beyond it but remain inside the 9:16 frustum.
  columnXs: [-5.15, 5.15],
  columnZs: [-10],
  columnBaseY: 0.04,
  galleryScreenXs: [-6.25, 6.25],
  galleryBayZs: [-14],
  galleryScreenBaseY: 2.05,
  galleryScreenWidth: 0.95,
  screenHeight: 1.48,
  gallerySurfaceY: -0.0825,
  floorInlayX: 3.82,
  floorInlayZs: [-7, -4, -1, 2],
  enableColumnBases: true,
  enableCapitalBrackets: true,
  enableGalleryScreens: true,
  enableFloorInlays: true,
  detailLevel: 'high'
});

const MATERIAL_OPTIONS = Object.freeze({
  lacquer: { color: 0x681b22, roughness: 0.62, metalness: 0.12 },
  darkWood: { color: 0x382016, roughness: 0.84, metalness: 0.04 },
  agedWood: { color: 0x68402a, roughness: 0.78, metalness: 0.06 },
  bronze: { color: 0x76502d, roughness: 0.68, metalness: 0.58 },
  mutedGold: { color: 0x98713c, roughness: 0.58, metalness: 0.62 },
  goldBright: { color: 0xd6ad55, roughness: 0.42, metalness: 0.72 },
  redBright: { color: 0x9f1828, roughness: 0.46, metalness: 0.28 },
  stone: { color: 0x77736b, roughness: 0.94, metalness: 0.02 },
  stoneDark: { color: 0x514d47, roughness: 0.96, metalness: 0.01 }
});

function finiteNumber(value, fallback, min, max) {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
}

function normalizePositions(value, fallback, min, max) {
  if (!Array.isArray(value)) return [...fallback];
  const positions = value
    .filter(Number.isFinite)
    .map((entry) => finiteNumber(entry, 0, min, max));
  return positions.length ? [...new Set(positions)] : [...fallback];
}

function normalizeConfig(input = {}) {
  const config = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const detailLevel = ['low', 'medium', 'high'].includes(config.detailLevel)
    ? config.detailLevel
    : DEFAULTS.detailLevel;
  return {
    ...DEFAULTS,
    ...config,
    columnXs: normalizePositions(config.columnXs, DEFAULTS.columnXs, -12, 12),
    columnZs: normalizePositions(config.columnZs, DEFAULTS.columnZs, -18, 20),
    galleryScreenXs: normalizePositions(config.galleryScreenXs, DEFAULTS.galleryScreenXs, -12, 12),
    galleryBayZs: normalizePositions(config.galleryBayZs, DEFAULTS.galleryBayZs, -18, 20),
    columnBaseY: finiteNumber(config.columnBaseY, DEFAULTS.columnBaseY, -1, 2),
    screenHeight: finiteNumber(config.screenHeight, DEFAULTS.screenHeight, 0.8, 2.2),
    gallerySurfaceY: finiteNumber(config.gallerySurfaceY, DEFAULTS.gallerySurfaceY, -1, 2),
    galleryScreenBaseY: finiteNumber(config.galleryScreenBaseY, DEFAULTS.galleryScreenBaseY, -1, 6),
    galleryScreenWidth: finiteNumber(config.galleryScreenWidth, DEFAULTS.galleryScreenWidth, 0.6, 1.6),
    floorInlayX: finiteNumber(config.floorInlayX, DEFAULTS.floorInlayX, 2.8, 6),
    floorInlayZs: normalizePositions(config.floorInlayZs, DEFAULTS.floorInlayZs, -18, 20),
    detailLevel
  };
}

function assertThree(THREE, scene) {
  if (!THREE || typeof THREE.Group !== 'function' || typeof THREE.Mesh !== 'function') {
    throw new TypeError('createTempleEnvironment requires a compatible THREE namespace.');
  }
  if (!scene || typeof scene.add !== 'function' || typeof scene.remove !== 'function') {
    throw new TypeError('createTempleEnvironment requires a scene with add() and remove().');
  }
  for (const name of ['BoxGeometry', 'CylinderGeometry', 'TorusGeometry', 'MeshStandardMaterial']) {
    if (typeof THREE[name] !== 'function') {
      throw new TypeError(`The supplied THREE namespace is missing ${name}.`);
    }
  }
}

export function createTempleEnvironment({ THREE, scene, config = {} } = {}) {
  assertThree(THREE, scene);

  const settings = normalizeConfig(config);
  const group = new THREE.Group();
  group.name = 'TempleEnvironmentArchitecture';
  group.userData = {
    ...(group.userData || {}),
    system: 'temple-environment',
    roofless: true,
    detailLevel: settings.detailLevel
  };

  const ownedGeometries = new Set();
  const ownedMaterials = new Set();
  const geometryCache = new Map();
  const materials = {};

  let disposed = false;
  let meshCount = 0;
  let instanceBatchCount = 0;

  const makeMaterial = (name, options) => {
    const material = new THREE.MeshStandardMaterial(options);
    material.name = `TempleEnvironment_${name}`;
    ownedMaterials.add(material);
    materials[name] = material;
    return material;
  };

  Object.entries(MATERIAL_OPTIONS).forEach(([name, options]) => makeMaterial(name, options));

  const geometry = (key, factory) => {
    if (!geometryCache.has(key)) {
      const item = factory();
      geometryCache.set(key, item);
      ownedGeometries.add(item);
    }
    return geometryCache.get(key);
  };

  const addMesh = (key, factory, material, position, parent = group, rotation = null) => {
    const mesh = new THREE.Mesh(geometry(key, factory), material);
    mesh.position.set(position[0], position[1], position[2]);
    if (rotation && mesh.rotation) {
      mesh.rotation.set(rotation[0] || 0, rotation[1] || 0, rotation[2] || 0);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    meshCount += 1;
    return mesh;
  };

  const addBox = (size, material, position, parent = group, rotation = null) => {
    const [w, h, d] = size;
    return addMesh(
      `box:${w}:${h}:${d}`,
      () => new THREE.BoxGeometry(w, h, d),
      material,
      position,
      parent,
      rotation
    );
  };

  const addCylinder = (radiusTop, radiusBottom, height, material, position, segments = 16) => {
    return addMesh(
      `cylinder:${radiusTop}:${radiusBottom}:${height}:${segments}`,
      () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments),
      material,
      position
    );
  };

  const addCylinderBatch = (name, radiusTop, radiusBottom, height, material, transforms, segments = 16) => {
    if (!transforms.length) return;
    if (typeof THREE.InstancedMesh !== 'function' || typeof THREE.Object3D !== 'function') {
      transforms.forEach((position) => addCylinder(radiusTop, radiusBottom, height, material, position, segments));
      return;
    }
    const itemGeometry = geometry(
      `cylinder:${radiusTop}:${radiusBottom}:${height}:${segments}`,
      () => new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments)
    );
    const instances = new THREE.InstancedMesh(itemGeometry, material, transforms.length);
    const transform = new THREE.Object3D();
    transforms.forEach((position, index) => {
      transform.position.set(position[0], position[1], position[2]);
      transform.rotation.set(0, 0, 0);
      transform.scale.set(1, 1, 1);
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    });
    if (instances.instanceMatrix && typeof instances.instanceMatrix.setUsage === 'function'
      && THREE.StaticDrawUsage !== undefined) {
      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    }
    if (instances.instanceMatrix) instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = false;
    instances.receiveShadow = true;
    instances.name = name;
    group.add(instances);
    meshCount += 1;
    instanceBatchCount += 1;
  };

  const addTorusBatch = (name, radius, tube, material, transforms, radialSegments = 6, tubularSegments = 20) => {
    if (!transforms.length || typeof THREE.InstancedMesh !== 'function' || typeof THREE.Object3D !== 'function') {
      transforms.forEach((position) => {
        const ring = addMesh(
          `torus:${radius}:${tube}:${radialSegments}:${tubularSegments}`,
          () => new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments),
          material,
          position
        );
        if (ring.rotation) ring.rotation.x = Math.PI / 2;
      });
      return;
    }

    const itemGeometry = geometry(
      `torus:${radius}:${tube}:${radialSegments}:${tubularSegments}`,
      () => new THREE.TorusGeometry(radius, tube, radialSegments, tubularSegments)
    );
    const instances = new THREE.InstancedMesh(itemGeometry, material, transforms.length);
    const transform = new THREE.Object3D();
    transforms.forEach((position, index) => {
      transform.position.set(position[0], position[1], position[2]);
      transform.rotation.set(Math.PI / 2, 0, 0);
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    });
    if (instances.instanceMatrix && typeof instances.instanceMatrix.setUsage === 'function'
      && THREE.StaticDrawUsage !== undefined) {
      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    }
    if (instances.instanceMatrix) instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = false;
    instances.receiveShadow = true;
    instances.name = name;
    group.add(instances);
    meshCount += 1;
    instanceBatchCount += 1;
  };

  const addBoxBatch = (name, size, material, transforms) => {
    if (!transforms.length || typeof THREE.InstancedMesh !== 'function' || typeof THREE.Object3D !== 'function') {
      transforms.forEach((entry) => addBox(size, material, entry.position, group, entry.rotation));
      return;
    }
    const [w, h, d] = size;
    const itemGeometry = geometry(`box:${w}:${h}:${d}`, () => new THREE.BoxGeometry(w, h, d));
    const instances = new THREE.InstancedMesh(itemGeometry, material, transforms.length);
    const transform = new THREE.Object3D();
    transforms.forEach((entry, index) => {
      transform.position.set(entry.position[0], entry.position[1], entry.position[2]);
      transform.rotation.set(...(entry.rotation || [0, 0, 0]));
      transform.updateMatrix();
      instances.setMatrixAt(index, transform.matrix);
    });
    if (instances.instanceMatrix && typeof instances.instanceMatrix.setUsage === 'function'
      && THREE.StaticDrawUsage !== undefined) {
      instances.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    }
    if (instances.instanceMatrix) instances.instanceMatrix.needsUpdate = true;
    instances.castShadow = false;
    instances.receiveShadow = true;
    instances.name = name;
    group.add(instances);
    meshCount += 1;
    instanceBatchCount += 1;
  };

  // Structural shafts and flutes are independent of optional base-footing decoration.
  const buildColumnShafts = () => {
    const shaftPositions = [];
    const flutePositions = [];

    for (const x of settings.columnXs) {
      for (const z of settings.columnZs) {
        shaftPositions.push([x, 4.05, z]);
        // Eight restrained gilded ribs catch the same warm altar lighting.
        for (let rib = 0; rib < 8; rib += 1) {
          const angle = rib * Math.PI / 4;
          flutePositions.push([
            x + Math.cos(angle) * 0.432,
            4.05,
            z + Math.sin(angle) * 0.432
          ]);
        }
      }
    }

    addCylinderBatch(
      'TemplePortraitColumnShafts',
      0.42, 0.5, 8.2, materials.agedWood, shaftPositions, 24
    );
    addCylinderBatch(
      'TemplePortraitColumnFlutes',
      0.012, 0.012, 5.9, materials.mutedGold, flutePositions, 6
    );
  };

  const buildColumnBases = () => {
    const stoneDarkTransforms = [];
    const stoneTransforms = [];
    const lacquerTransforms = [];
    const collarTransforms = [];
    const ringPositions = [];
    const studTransforms = [];
    const cylinderPositions = [];

    for (const x of settings.columnXs) {
      for (const z of settings.columnZs) {
        const y = settings.columnBaseY;
        // Three stepped stone courses visually anchor each timber shaft.
        stoneDarkTransforms.push({ position: [x, y + 0.09, z] });
        stoneTransforms.push({ position: [x, y + 0.23, z] });
        lacquerTransforms.push({ position: [x, y + 0.34, z] });
        cylinderPositions.push([x, y + 0.45, z]);
        ringPositions.push([x, y + 0.54, z]);

        if (settings.detailLevel === 'high') {
          for (let side = 0; side < 4; side += 1) {
            const angle = side * Math.PI / 2 + Math.PI / 4;
            studTransforms.push({
              position: [x + Math.cos(angle) * 0.57, y + 0.34, z + Math.sin(angle) * 0.57],
              rotation: [0, angle, Math.PI / 4]
            });
          }
        }
      }
    }

    addBoxBatch('TempleColumnBaseStoneFootings', [1.46, 0.18, 1.46], materials.stoneDark, stoneDarkTransforms);
    addBoxBatch('TempleColumnBaseStoneCaps', [1.3, 0.12, 1.3], materials.stone, stoneTransforms);
    addBoxBatch('TempleColumnBaseLacquerCourses', [1.12, 0.1, 1.12], materials.lacquer, lacquerTransforms);
    addCylinderBatch('TempleColumnBaseCollars', 0.59, 0.64, 0.14, materials.mutedGold, cylinderPositions, 12);
    addTorusBatch('TempleColumnBaseRings', 0.53, 0.018, materials.bronze, ringPositions, 6, 24);
    if (studTransforms.length) {
      addBoxBatch('TempleColumnBaseStuds', [0.075, 0.075, 0.035], materials.mutedGold, studTransforms);
    }
  };

  const buildCapitalBrackets = () => {
    const lowerTransforms = [];
    const lacquerTransforms = [];
    const upperBeamTransforms = [];
    const bracketTransforms = [];
    const collarPositions = [];
    const frontPlaqueTransforms = [];
    const frontGemTransforms = [];

    for (const x of settings.columnXs) {
      for (const z of settings.columnZs) {
        // A compact capital stack adds a crafted transition into the open beam line.
        lowerTransforms.push({ position: [x, 7.55, z] });
        lacquerTransforms.push({ position: [x, 7.69, z] });
        upperBeamTransforms.push({ position: [x, 7.82, z] });
        collarPositions.push([x, 7.43, z]);

        // Keep these two tiny static plaque batches on low-end devices as well.
        // Only the more substantial corbel geometry is omitted in low detail.
        frontPlaqueTransforms.push({
          position: [x, 6.2, z + 0.48],
          rotation: [0, 0, Math.PI / 4]
        });
        frontGemTransforms.push({
          position: [x, 6.2, z + 0.515],
          rotation: [0, 0, Math.PI / 4]
        });

        if (settings.detailLevel !== 'low') {
          for (const direction of [-1, 1]) {
            bracketTransforms.push({
              position: [x + direction * 0.56, 7.34, z],
              rotation: [0, 0, direction * -0.16]
            });
            bracketTransforms.push({
              position: [x, 7.34, z + direction * 0.56],
              rotation: [direction * 0.16, 0, 0]
            });
          }
        }
      }
    }

    addBoxBatch('TempleCapitalLowerStacks', [1.18, 0.18, 1.18], materials.darkWood, lowerTransforms);
    addBoxBatch('TempleCapitalLacquerStacks', [1.38, 0.12, 1.38], materials.lacquer, lacquerTransforms);
    addBoxBatch('TempleCapitalUpperBeams', [1.55, 0.16, 0.72], materials.agedWood, upperBeamTransforms);
    addTorusBatch('TempleCapitalCollars', 0.57, 0.022, materials.mutedGold, collarPositions, 6, 24);
    if (frontPlaqueTransforms.length) {
      addBoxBatch('TempleColumnFrontPlaques', [0.18, 0.18, 0.04], materials.goldBright, frontPlaqueTransforms);
      addBoxBatch('TempleColumnFrontGems', [0.095, 0.095, 0.045], materials.redBright, frontGemTransforms);
    }
    if (bracketTransforms.length) {
      addBoxBatch('TempleCapitalCorbels', [0.24, 0.58, 0.34], materials.darkWood, bracketTransforms);
    }
  };

  const buildGalleryScreens = () => {
    const railTransforms = [];
    const postTransforms = [];
    const centerBarTransforms = [];
    const latticeTransforms = [];
    const width = settings.galleryScreenWidth;
    const height = settings.screenHeight;
    const baseY = settings.galleryScreenBaseY;

    for (const x of settings.galleryScreenXs) {
      for (const z of settings.galleryBayZs) {
        // Side relief screens extend the rear altar wall into the narrow portrait margins.
        railTransforms.push({ position: [x, baseY + height, z] });
        railTransforms.push({ position: [x, baseY + 0.08, z] });
        postTransforms.push({ position: [x - width / 2, baseY + height / 2, z] });
        postTransforms.push({ position: [x + width / 2, baseY + height / 2, z] });
        centerBarTransforms.push({ position: [x, baseY + height / 2, z + 0.025] });

        if (settings.detailLevel !== 'low') {
          for (const offset of [-0.28, 0.28]) {
            latticeTransforms.push({
              position: [x + offset, baseY + height / 2, z + 0.045],
              rotation: [0, 0, Math.PI / 4]
            });
          }
        }
      }
    }

    addBoxBatch('TempleGalleryScreenRails', [width, 0.1, 0.12], materials.darkWood, railTransforms);
    addBoxBatch('TempleGalleryScreenPosts', [0.1, height, 0.12], materials.agedWood, postTransforms);
    addBoxBatch('TempleGalleryScreenCenterBars', [0.035, height - 0.22, 0.1], materials.mutedGold, centerBarTransforms);
    if (latticeTransforms.length) {
      addBoxBatch('TempleGalleryLattice', [0.055, height * 0.72, 0.055], materials.mutedGold, latticeTransforms);
    }
  };

  const buildFloorInlays = () => {
    const horizontalTransforms = [];
    const verticalTransforms = [];
    const medallionTransforms = [];
    const inlayY = settings.gallerySurfaceY + 0.0175;

    for (const side of [-1, 1]) {
      const x = side * settings.floorInlayX;
      for (const z of settings.floorInlayZs) {
        horizontalTransforms.push({ position: [x, inlayY, z] });
        verticalTransforms.push({ position: [x, inlayY, z] });
        medallionTransforms.push({
          position: [x, settings.gallerySurfaceY + 0.0475, z],
          rotation: [0, 0, 0]
        });
      }
    }

    addBoxBatch('TempleFloorInlayHorizontal', [0.82, 0.035, 0.06], materials.bronze, horizontalTransforms);
    addBoxBatch('TempleFloorInlayVertical', [0.06, 0.035, 0.82], materials.bronze, verticalTransforms);
    if (settings.detailLevel === 'high') {
      addBoxBatch('TempleFloorInlayStuds', [0.09, 0.025, 0.09], materials.mutedGold, medallionTransforms);
    }
  };

  try {
    // Column shafts are structural elements; the base toggle controls only
    // their decorative footings and must not remove the columns themselves.
    buildColumnShafts();
    if (settings.enableColumnBases) buildColumnBases();
    if (settings.enableCapitalBrackets) buildCapitalBrackets();
    if (settings.enableGalleryScreens) buildGalleryScreens();
    if (settings.enableFloorInlays) buildFloorInlays();
    scene.add(group);
  } catch (error) {
    dispose();
    throw error;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    if (group.parent && typeof group.parent.remove === 'function') group.parent.remove(group);
    else scene.remove(group);

    // Dispose only resources created by this module. Consumers may attach
    // external objects to the returned group and retain ownership of their assets.
    ownedGeometries.forEach((item) => {
      if (item && typeof item.dispose === 'function') item.dispose();
    });
    ownedMaterials.forEach((item) => {
      if (!item) return;
      for (const value of Object.values(item)) {
        if (value && value.isTexture && typeof value.dispose === 'function') value.dispose();
      }
      if (typeof item.dispose === 'function') item.dispose();
    });
    geometryCache.clear();
    ownedGeometries.clear();
    ownedMaterials.clear();
  }

  return {
    group,
    update() {},
    dispose,
    metadata: {
      system: 'temple-environment',
      roofless: true,
      detailLevel: settings.detailLevel,
      meshCount: () => meshCount,
      instanceBatchCount: () => instanceBatchCount,
      columnCount: settings.columnXs.length * settings.columnZs.length,
      galleryScreenCount: settings.enableGalleryScreens
        ? settings.galleryScreenXs.length * settings.galleryBayZs.length
        : 0
    }
  };
}

export default createTempleEnvironment;
