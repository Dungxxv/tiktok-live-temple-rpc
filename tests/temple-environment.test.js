import { describe, expect, it } from 'bun:test';
import { createTempleEnvironment } from '../public/js/temple-environment.js';

class FakeDisposable {
  constructor() { this.disposed = false; }
  dispose() { this.disposed = true; }
}
class FakeGeometry extends FakeDisposable {
  constructor(...args) { super(); this.args = args; }
}
class FakeMaterial extends FakeDisposable {
  constructor(options) { super(); Object.assign(this, options); }
}
class FakeObject3D {
  constructor() {
    this.children = [];
    this.position = { set: (...values) => { this.position.values = values; } };
    this.rotation = { set: (...values) => { this.rotation.values = values; } };
    this.scale = { set: (...values) => { this.scale.values = values; } };
    this.userData = {};
    this.parent = null;
    this.matrix = {};
  }
  add(...objects) {
    objects.forEach((object) => {
      if (object.parent && object.parent.remove) object.parent.remove(object);
      object.parent = this;
      this.children.push(object);
    });
  }
  remove(object) {
    this.children = this.children.filter((child) => child !== object);
    object.parent = null;
  }
  traverse(callback) {
    callback(this);
    this.children.forEach((child) => child.traverse ? child.traverse(callback) : callback(child));
  }
  updateMatrix() {
    this.matrix = {
      position: this.position.values ? [...this.position.values] : [0, 0, 0],
      rotation: this.rotation.values ? [...this.rotation.values] : [0, 0, 0],
      scale: this.scale.values ? [...this.scale.values] : [1, 1, 1]
    };
  }
}
class FakeMesh extends FakeObject3D {
  constructor(geometry, material) { super(); this.geometry = geometry; this.material = material; }
}
class FakeInstancedMesh extends FakeMesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instanceMatrix = { setUsage() {}, needsUpdate: false };
    this.matrices = [];
    this.setMatrixAt = (index, matrix) => { this.matrices[index] = matrix; };
  }
}
const fakeTHREE = {
  Group: FakeObject3D,
  Object3D: FakeObject3D,
  Mesh: FakeMesh,
  InstancedMesh: FakeInstancedMesh,
  BoxGeometry: FakeGeometry,
  CylinderGeometry: FakeGeometry,
  TorusGeometry: FakeGeometry,
  MeshStandardMaterial: FakeMaterial,
  StaticDrawUsage: 35044
};

function createScene() { return new FakeObject3D(); }

describe('Temple environment architecture module', () => {
  it('exports a factory and creates a roofless environment group with defaults', () => {
    const scene = createScene();
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene });
    expect(typeof createTempleEnvironment).toBe('function');
    expect(result.group.name).toBe('TempleEnvironmentArchitecture');
    expect(result.group.parent).toBe(scene);
    expect(result.metadata.roofless).toBe(true);
    expect(result.metadata.columnCount).toBe(2);
    expect(result.metadata.galleryScreenCount).toBe(2);
    expect(result.metadata.meshCount()).toBeGreaterThan(0);
    result.dispose();
  });

  it('builds the repeated architecture using instanced batches', () => {
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene: createScene() });
    expect(result.metadata.instanceBatchCount()).toBeGreaterThanOrEqual(10);
    const names = [];
    result.group.traverse((object) => { if (object.name) names.push(object.name); });
    expect(names).toContain('TempleColumnBaseRings');
    expect(names).toContain('TempleCapitalCorbels');
    expect(names).toContain('TempleColumnFrontPlaques');
    expect(names).toContain('TempleColumnFrontGems');
    expect(names).toContain('TempleGalleryLattice');
    expect(names).toContain('TempleGalleryScreenRails');
    expect(names).toContain('TempleColumnBaseStoneFootings');
    expect(names).toContain('TemplePortraitColumnShafts');
    expect(names).toContain('TemplePortraitColumnFlutes');
    result.dispose();
  });

  it('adds paired front-facing lotus seals to the portrait column capitals', () => {
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene: createScene() });
    const batches = new Map();
    result.group.traverse((object) => {
      if (object instanceof FakeInstancedMesh) batches.set(object.name, object);
    });
    const plaques = batches.get('TempleColumnFrontPlaques');
    const gems = batches.get('TempleColumnFrontGems');
    expect(plaques?.count).toBe(2);
    expect(gems?.count).toBe(2);
    expect(plaques.matrices.map((matrix) => matrix.position[0]).sort((a, b) => a - b))
      .toEqual([-5.15, 5.15]);
    expect(plaques.matrices.every((matrix) => matrix.position[1] === 6.2
      && matrix.position[2] > -9.55
      && Math.abs(matrix.rotation[2] - Math.PI / 4) < 1e-8)).toBe(true);
    expect(gems.matrices.every((matrix) => matrix.position[2] > -9.52
      && Math.abs(matrix.rotation[2] - Math.PI / 4) < 1e-8)).toBe(true);
    result.dispose();
  });

  it('uses owned bright-gold and ruby materials for the paired capital ornaments', () => {
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene: createScene() });
    const batches = new Map();
    result.group.traverse((object) => {
      if (object instanceof FakeInstancedMesh) batches.set(object.name, object);
    });

    const plaques = batches.get('TempleColumnFrontPlaques');
    const gems = batches.get('TempleColumnFrontGems');
    expect(plaques?.material?.color).toBe(0xd6ad55);
    expect(plaques?.material?.metalness).toBe(0.72);
    expect(gems?.material?.color).toBe(0x9f1828);
    expect(gems?.material?.metalness).toBe(0.28);

    const ownedMaterials = new Set();
    result.group.traverse((object) => {
      if (object.material) ownedMaterials.add(object.material);
    });
    expect(ownedMaterials.has(plaques.material)).toBe(true);
    expect(ownedMaterials.has(gems.material)).toBe(true);

    result.dispose();
    expect(plaques.material.disposed).toBe(true);
    expect(gems.material.disposed).toBe(true);
  });

  it('marks every populated instance matrix for GPU upload', () => {
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene: createScene() });
    const batches = [];
    result.group.traverse((object) => {
      if (object instanceof FakeInstancedMesh) batches.push(object);
    });
    expect(batches.length).toBeGreaterThan(0);
    expect(batches.every((batch) => batch.instanceMatrix.needsUpdate === true)).toBe(true);
    result.dispose();
  });

  it('places complete architectural side columns and relief panels inside the portrait camera margins', () => {
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene: createScene() });
    const batches = new Map();
    result.group.traverse((object) => {
      if (object instanceof FakeInstancedMesh) batches.set(object.name, object);
    });
    const shafts = batches.get('TemplePortraitColumnShafts');
    const screens = batches.get('TempleGalleryScreenRails');
    const inlays = batches.get('TempleFloorInlayHorizontal');
    expect(shafts?.count).toBe(2);
    expect(shafts.matrices.map((matrix) => matrix.position[0]).sort((a, b) => a - b))
      .toEqual([-5.15, 5.15]);
    expect(shafts.matrices.every((matrix) => matrix.position[1] === 4.05
      && matrix.position[2] === -10)).toBe(true);
    expect(screens?.count).toBe(4);
    expect(inlays?.count).toBe(8);
    expect(inlays.matrices.every((matrix) => Math.abs(Math.abs(matrix.position[0]) - 3.82) < 1e-8)).toBe(true);
    result.dispose();
  });

  it('keeps structural column shafts when decorative column bases are disabled', () => {
    const result = createTempleEnvironment({
      THREE: fakeTHREE,
      scene: createScene(),
      config: { enableColumnBases: false }
    });
    const batches = new Map();
    result.group.traverse((object) => {
      if (object instanceof FakeInstancedMesh) batches.set(object.name, object);
    });
    expect(batches.get('TemplePortraitColumnShafts')?.count).toBe(2);
    expect(batches.has('TemplePortraitColumnFlutes')).toBe(true);
    expect(batches.has('TempleColumnBaseStoneFootings')).toBe(false);
    expect(batches.has('TempleColumnBaseRings')).toBe(false);
    result.dispose();
  });

  it('keeps optional architectural detail toggles independent', () => {
    const result = createTempleEnvironment({
      THREE: fakeTHREE,
      scene: createScene(),
      config: {
        enableColumnBases: false,
        enableCapitalBrackets: false,
        enableGalleryScreens: false,
        enableFloorInlays: false
      }
    });
    const names = new Set();
    result.group.traverse((object) => { if (object.name) names.add(object.name); });
    expect(names.has('TemplePortraitColumnShafts')).toBe(true);
    expect(names.has('TemplePortraitColumnFlutes')).toBe(true);
    expect(names.has('TempleColumnBaseStoneFootings')).toBe(false);
    expect(names.has('TempleCapitalLowerStacks')).toBe(false);
    expect(names.has('TempleGalleryScreenRails')).toBe(false);
    expect(names.has('TempleFloorInlayHorizontal')).toBe(false);
    expect(result.metadata.columnCount).toBe(2);
    expect(result.metadata.galleryScreenCount).toBe(0);
    result.dispose();
  });

  it('accepts detail and layout overrides while clamping unsafe dimensions', () => {
    const result = createTempleEnvironment({
      THREE: fakeTHREE,
      scene: createScene(),
      config: {
        detailLevel: 'low',
        columnXs: [-6, 6],
        columnZs: [-8, 0, 8],
        screenHeight: 99
      }
    });
    expect(result.metadata.detailLevel).toBe('low');
    expect(result.metadata.columnCount).toBe(6);
    expect(result.metadata.galleryScreenCount).toBe(2);
    const lowNames = [];
    result.group.traverse((object) => { if (object.name) lowNames.push(object.name); });
    expect(lowNames).toContain('TempleColumnFrontPlaques');
    expect(lowNames).toContain('TempleColumnFrontGems');
    expect(lowNames).not.toContain('TempleCapitalCorbels');
    expect(result.group.userData.roofless).toBe(true);
    result.dispose();
  });

  it('applies progressively richer low, medium, and high detail presets', () => {
    const presets = ['low', 'medium', 'high'].map((detailLevel) => {
      const result = createTempleEnvironment({
        THREE: fakeTHREE,
        scene: createScene(),
        config: { detailLevel }
      });
      const names = new Set();
      result.group.traverse((object) => { if (object.name) names.add(object.name); });
      return {
        result,
        names,
        meshCount: result.metadata.meshCount(),
        batchCount: result.metadata.instanceBatchCount()
      };
    });

    const [low, medium, high] = presets;
    for (const preset of presets) {
      expect(preset.names.has('TemplePortraitColumnShafts')).toBe(true);
      expect(preset.names.has('TemplePortraitColumnFlutes')).toBe(true);
      expect(preset.names.has('TempleGalleryScreenRails')).toBe(true);
      expect(preset.names.has('TempleFloorInlayHorizontal')).toBe(true);
    }

    expect(low.names.has('TempleCapitalCorbels')).toBe(false);
    expect(low.names.has('TempleGalleryLattice')).toBe(false);
    expect(low.names.has('TempleColumnBaseStuds')).toBe(false);
    expect(low.names.has('TempleFloorInlayStuds')).toBe(false);

    expect(medium.names.has('TempleCapitalCorbels')).toBe(true);
    expect(medium.names.has('TempleGalleryLattice')).toBe(true);
    expect(medium.names.has('TempleColumnBaseStuds')).toBe(false);
    expect(medium.names.has('TempleFloorInlayStuds')).toBe(false);

    expect(high.names.has('TempleCapitalCorbels')).toBe(true);
    expect(high.names.has('TempleGalleryLattice')).toBe(true);
    expect(high.names.has('TempleColumnBaseStuds')).toBe(true);
    expect(high.names.has('TempleFloorInlayStuds')).toBe(true);
    expect(low.meshCount).toBeLessThan(medium.meshCount);
    expect(medium.meshCount).toBeLessThan(high.meshCount);
    expect(low.batchCount).toBeLessThan(medium.batchCount);
    expect(medium.batchCount).toBeLessThan(high.batchCount);

    presets.forEach(({ result }) => result.dispose());
  });

  it('falls back to individual meshes when InstancedMesh is unavailable', () => {
    const fallbackTHREE = { ...fakeTHREE };
    delete fallbackTHREE.InstancedMesh;
    const result = createTempleEnvironment({ THREE: fallbackTHREE, scene: createScene() });
    expect(result.metadata.meshCount()).toBeGreaterThan(20);
    expect(result.metadata.instanceBatchCount()).toBe(0);
    result.dispose();
  });

  it('keeps peripheral floor inlays flush with the raised gallery surface', () => {
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene: createScene() });
    const batches = new Map();
    result.group.traverse((object) => {
      if (object instanceof FakeInstancedMesh) batches.set(object.name, object);
    });
    const horizontal = batches.get('TempleFloorInlayHorizontal');
    const vertical = batches.get('TempleFloorInlayVertical');
    const studs = batches.get('TempleFloorInlayStuds');
    expect(horizontal?.count).toBe(8);
    expect(vertical?.count).toBe(8);
    expect(studs?.count).toBe(8);
    for (const batch of [horizontal, vertical]) {
      expect(batch.matrices.every((matrix) => Math.abs(matrix.position[1] + 0.065) < 1e-8)).toBe(true);
    }
    expect(studs.matrices.every((matrix) => Math.abs(matrix.position[1] + 0.035) < 1e-8)).toBe(true);
    result.dispose();
  });

  it('throws helpful errors for missing or invalid inputs', () => {
    expect(() => createTempleEnvironment()).toThrow(/THREE namespace/);
    expect(() => createTempleEnvironment({ THREE: fakeTHREE, scene: null })).toThrow(/scene/);
    expect(() => createTempleEnvironment({
      THREE: { ...fakeTHREE, TorusGeometry: undefined },
      scene: createScene()
    })).toThrow(/TorusGeometry/);
  });

  it('disposes owned geometry and materials once and tolerates repeated cleanup', () => {
    const scene = createScene();
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene });
    const geometries = new Set();
    const materials = new Set();
    result.group.traverse((object) => {
      if (object.geometry) geometries.add(object.geometry);
      if (object.material) materials.add(object.material);
    });
    result.dispose();
    result.dispose();
    expect(result.group.parent).toBe(null);
    expect([...geometries].every((item) => item.disposed)).toBe(true);
    expect([...materials].every((item) => item.disposed)).toBe(true);
    expect(scene.children).toHaveLength(0);
  });

  it('does not dispose externally owned resources attached to its group', () => {
    const result = createTempleEnvironment({ THREE: fakeTHREE, scene: createScene() });
    const externalGeometry = new FakeGeometry();
    const externalMaterial = new FakeMaterial({ color: 0xffffff });
    const externalMesh = new FakeMesh(externalGeometry, externalMaterial);
    result.group.add(externalMesh);

    result.dispose();

    expect(externalGeometry.disposed).toBe(false);
    expect(externalMaterial.disposed).toBe(false);
    expect(result.group.children).toContain(externalMesh);
  });

  it('cleans up resources created before a construction failure', () => {
    const createdGeometries = [];
    const createdMaterials = [];
    class TrackingGeometry extends FakeGeometry {
      constructor(...args) {
        super(...args);
        createdGeometries.push(this);
      }
    }
    class TrackingMaterial extends FakeMaterial {
      constructor(options) {
        super(options);
        createdMaterials.push(this);
      }
    }
    class FailingBoxGeometry extends TrackingGeometry {
      constructor(...args) {
        if (args[0] === 1.46) throw new Error('simulated geometry failure');
        super(...args);
      }
    }
    const failingTHREE = {
      ...fakeTHREE,
      BoxGeometry: FailingBoxGeometry,
      CylinderGeometry: TrackingGeometry,
      TorusGeometry: TrackingGeometry,
      MeshStandardMaterial: TrackingMaterial
    };
    const scene = createScene();

    expect(() => createTempleEnvironment({ THREE: failingTHREE, scene }))
      .toThrow('simulated geometry failure');
    expect(scene.children).toHaveLength(0);
    expect(createdGeometries.length).toBeGreaterThan(0);
    expect(createdGeometries.every((item) => item.disposed)).toBe(true);
    expect(createdMaterials.every((item) => item.disposed)).toBe(true);
  });

  it('does not introduce roof geometry or an independent renderer/animation loop', async () => {
    const source = await Bun.file(new URL('../public/js/temple-environment.js', import.meta.url)).text();
    expect(source).not.toMatch(/RoofGeometry|createRoof|new THREE\.WebGLRenderer|requestAnimationFrame/);
    expect(source).toContain('roofless: true');
    expect(source).toContain('scene.add(group)');
  });
});
