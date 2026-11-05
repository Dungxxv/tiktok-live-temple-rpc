import { describe, expect, it } from 'bun:test';
import { getFootPlantingPose, getFootPlantingStep, applyTwoBoneIKToBones, getFootPlantingWorldTarget, solveTwoBoneIK, getHumanFootPose, getHumanUpperPose, getRitualPoseState, getGiftReactionBlend } from '../public/js/three-gait-utils.js';

describe('getFootPlantingStep', () => {
  const tau = Math.PI * 2;
  const stance = 0.62;

  it('moves the planted foot steadily from rear to front during stance', () => {
    expect(getFootPlantingStep(0)).toBeCloseTo(-1, 8);
    expect(getFootPlantingStep(tau * stance * 0.5)).toBeCloseTo(0, 8);
    expect(getFootPlantingStep(tau * stance)).toBeCloseTo(1, 8);
  });

  it('returns the foot smoothly toward the rear during swing', () => {
    expect(getFootPlantingStep(tau * (stance + (1 - stance) * 0.5))).toBeCloseTo(0, 8);
    expect(getFootPlantingStep(tau)).toBeCloseTo(-1, 8);
  });

  it('wraps negative and repeated phases into the same gait cycle', () => {
    expect(getFootPlantingStep(-tau * 0.25)).toBeCloseTo(getFootPlantingStep(tau * 0.75), 8);
    expect(getFootPlantingStep(tau * 2.25)).toBeCloseTo(getFootPlantingStep(tau * 0.25), 8);
  });
});

describe('getFootPlantingPose', () => {
  const tau = Math.PI * 2;
  const stance = 0.62;

  it('keeps the knee nearly straight and foot grounded during stance', () => {
    const pose = getFootPlantingPose(tau * stance * 0.5);
    expect(pose.kneeFlex).toBeCloseTo(0.035, 8);
    expect(pose.footLift).toBe(0);
    expect(pose.swingProgress).toBe(0);
  });

  it('flexes the knee and lifts the foot through the swing arc', () => {
    const pose = getFootPlantingPose(tau * (stance + (1 - stance) * 0.5));
    expect(pose.kneeFlex).toBeCloseTo(0.72, 8);
    expect(pose.footLift).toBeCloseTo(0.13, 8);
    expect(pose.swingProgress).toBeCloseTo(0.5, 8);
  });

  it('returns to the grounded pose at the next cycle boundary', () => {
    const pose = getFootPlantingPose(tau);
    expect(pose.kneeFlex).toBeCloseTo(0.035, 8);
    expect(pose.footLift).toBe(0);
  });

  it('returns a finite neutral pose for non-finite phases', () => {
    for (const phase of [NaN, Infinity, -Infinity]) {
      const pose = getFootPlantingPose(phase);
      expect(pose).toEqual({
        step: 0, kneeFlex: 0, footLift: 0,
        swingProgress: 0, stanceProgress: 0, isStance: true
      });
      expect(getFootPlantingStep(phase)).toBe(0);
    }
  });
});

describe('getHumanUpperPose', () => {
  it('keeps the upper body neutral when the avatar is standing', () => {
    expect(getHumanUpperPose()).toEqual({
      torsoLean: -0, headCounter: 0, armReach: -0, armOpen: 0
    });
  });

  it('reaches both arms forward and inclines the torso during a kneeling bow', () => {
    const pose = getHumanUpperPose({ kneelBlend: 1, bowAmount: 1 });
    expect(pose.torsoLean).toBeCloseTo(-0.92, 8);
    expect(pose.headCounter).toBeCloseTo(0.22, 8);
    expect(pose.armReach).toBeCloseTo(-0.82, 8);
    expect(pose.armOpen).toBeCloseTo(0.42, 8);
  });

  it('clamps blend weights and treats invalid values as neutral', () => {
    expect(getHumanUpperPose({ kneelBlend: 3, bowAmount: -2 })).toEqual({
      torsoLean: -0.2, headCounter: 0.06, armReach: -0.7, armOpen: 0.08
    });
    expect(getHumanUpperPose({ kneelBlend: NaN, bowAmount: Infinity })).toEqual({
      torsoLean: -0, headCounter: 0, armReach: -0, armOpen: 0
    });
  });
});

describe('getRitualPoseState', () => {
  it('walks toward the altar before beginning a kneel', () => {
    expect(getRitualPoseState({ travel: 0.5 })).toEqual({
      walking: true, kneelBlend: 0, bowAmount: 0
    });
    expect(getRitualPoseState({ travel: 1, elapsedAfterArrival: 0 }).kneelBlend).toBe(0);
  });

  it('eases into a grounded kneel before smoothly beginning the bow', () => {
    const settling = getRitualPoseState({ travel: 1, elapsedAfterArrival: 1600, remainingMs: 4000 });
    expect(settling.walking).toBe(false);
    expect(settling.kneelBlend).toBeCloseTo(1, 8);
    expect(settling.bowAmount).toBeCloseTo(1, 8);
    const halfway = getRitualPoseState({ travel: 1, elapsedAfterArrival: 1225, remainingMs: 4000 });
    expect(halfway.bowAmount).toBeGreaterThan(0);
    expect(halfway.bowAmount).toBeLessThan(1);
  });

  it('fades the kneel and bow out together at the end of the ritual', () => {
    const pose = getRitualPoseState({ travel: 1, elapsedAfterArrival: 2500, remainingMs: 325 });
    expect(pose.kneelBlend).toBeGreaterThan(0);
    expect(pose.kneelBlend).toBeLessThan(1);
    expect(pose.bowAmount).toBeGreaterThan(0);
    expect(pose.bowAmount).toBeLessThan(1);
    expect(getRitualPoseState({ travel: 1, elapsedAfterArrival: 3000, remainingMs: 0 })).toEqual({
      walking: false, kneelBlend: 0, bowAmount: 0
    });
  });

  it('clamps invalid timeline values to safe neutral outputs', () => {
    expect(getRitualPoseState({ travel: NaN, elapsedAfterArrival: Infinity, remainingMs: NaN })).toEqual({
      walking: true, kneelBlend: 0, bowAmount: 0
    });
  });
});

describe('getHumanFootPose', () => {
  it('keeps idle and bow foot poses neutral and grounded', () => {
    for (const mode of ['idle', 'bow']) {
      expect(getHumanFootPose({ mode })).toEqual({
        hipRotationX: 0, kneeRotationX: 0, footRotationX: 0, footLift: 0, planted: true
      });
    }
  });

  it('bends the procedural leg chain into a grounded kneeling pose', () => {
    const pose = getHumanFootPose({ mode: 'kneel' });
    expect(pose.hipRotationX).toBeCloseTo(-0.28, 8);
    expect(pose.kneeRotationX).toBeCloseTo(1.18, 8);
    expect(pose.footRotationX).toBeCloseTo(-0.72, 8);
    expect(pose.footLift).toBe(0);
    expect(pose.planted).toBe(true);
  });

  it('scales walking joint offsets and foot lift by the blend weight', () => {
    const full = getHumanFootPose({ mode: 'walk', phase: Math.PI, blend: 1 });
    const half = getHumanFootPose({ mode: 'walk', phase: Math.PI, blend: 0.5 });
    expect(half.hipRotationX).toBeCloseTo(full.hipRotationX * 0.5, 8);
    expect(half.kneeRotationX).toBeCloseTo(full.kneeRotationX * 0.5, 8);
    expect(half.footRotationX).toBeCloseTo(full.footRotationX * 0.5, 8);
    expect(half.footLift).toBeCloseTo(full.footLift * 0.5, 8);
  });

  it('clamps blend weights and treats invalid values as neutral', () => {
    expect(getHumanFootPose({ mode: 'kneel', blend: 4 }).kneeRotationX).toBeCloseTo(1.18, 8);
    expect(getHumanFootPose({ mode: 'kneel', blend: NaN }).kneeRotationX).toBe(0);
    expect(getHumanFootPose({ mode: 'walk', phase: Infinity }).footLift).toBe(0);
  });
});

describe('solveTwoBoneIK', () => {
  const lengths = { upperLength: 2, lowerLength: 2 };

  it('places the joint at equal distance from both segment endpoints', () => {
    const result = solveTwoBoneIK({
      root: [0, 0, 0], target: [0, -3, 0], pole: [1, 0, 0], ...lengths
    });
    const distance = (a, b) => Math.hypot(...a.map((value, index) => value - b[index]));
    expect(result).not.toBeNull();
    expect(distance(result.root, result.knee)).toBeCloseTo(2, 8);
    expect(distance(result.knee, result.target)).toBeCloseTo(2, 8);
    expect(result.target).toEqual([0, -3, 0]);
    expect(result.reachable).toBe(true);
  });

  it('uses the pole point to choose a stable bend direction', () => {
    const result = solveTwoBoneIK({
      root: [0, 0, 0], target: [0, -3, 0], pole: [-2, 0, 0], ...lengths
    });
    expect(result.knee[0]).toBeLessThan(0);
    expect(result.knee.every(Number.isFinite)).toBe(true);
  });

  it('clamps targets beyond maximum reach without producing invalid coordinates', () => {
    const result = solveTwoBoneIK({
      root: [0, 0, 0], target: [0, -8, 0], pole: [1, 0, 0], ...lengths
    });
    expect(result.reachable).toBe(false);
    expect(Math.hypot(...result.target)).toBeCloseTo(4 - 1e-6, 7);
    expect(result.knee.every(Number.isFinite)).toBe(true);
  });

  it('handles a zero-distance target and a collinear pole safely', () => {
    const result = solveTwoBoneIK({
      root: [1, 2, 3], target: [1, 2, 3], pole: [1, 4, 3], ...lengths
    });
    expect(result).not.toBeNull();
    expect(result.reachable).toBe(false);
    expect(result.knee.every(Number.isFinite)).toBe(true);
  });

  it('rejects missing vectors and invalid segment lengths', () => {
    expect(solveTwoBoneIK({ root: [0, 0, 0], target: [0, 1, 0], pole: [1, 0, 0], upperLength: 0, lowerLength: 1 })).toBeNull();
    expect(solveTwoBoneIK({ root: [0, 0], target: [0, 1, 0], pole: [1, 0, 0], ...lengths })).toBeNull();
  });
});

describe('getFootPlantingWorldTarget', () => {
  const tau = Math.PI * 2;
  const stanceEnd = 0.62;

  it('captures a world-space target at stance start and holds it as the hip moves', () => {
    const first = getFootPlantingWorldTarget({
      phase: 0, hip: [0, 1, 0], strideDirection: [0, 0, -1],
      strideLength: 2, groundY: 0
    });
    const moved = getFootPlantingWorldTarget({
      phase: tau * 0.3, hip: [0, 1, -0.8], strideDirection: [0, 0, -1],
      strideLength: 2, groundY: 0, lockState: first.lockState
    });
    expect(first.planted).toBe(true);
    expect(moved.planted).toBe(true);
    expect(moved.target).toEqual(first.target);
    expect(moved.target[1]).toBe(0);
  });

  it('releases the stance lock during swing and follows the moving hip', () => {
    const stance = getFootPlantingWorldTarget({
      phase: 0, hip: [0, 1, 0], strideDirection: [0, 0, -1],
      strideLength: 2, groundY: 0
    });
    const swing = getFootPlantingWorldTarget({
      phase: tau * (stanceEnd + 0.5 * (1 - stanceEnd)),
      hip: [0, 1, -1], strideDirection: [0, 0, -1],
      strideLength: 2, groundY: 0, lockState: stance.lockState
    });
    expect(swing.planted).toBe(false);
    expect(swing.lockState.lockedTarget).toBeNull();
    expect(swing.target[2]).toBeCloseTo(-1, 8);
    expect(swing.target[1]).toBeCloseTo(0.13, 8);
  });

  it('captures a fresh target on the next stance after releasing the old lock', () => {
    const swing = getFootPlantingWorldTarget({
      phase: tau * 0.8, hip: [0, 1, -1], strideDirection: [0, 0, -1],
      strideLength: 2, groundY: 0,
      lockState: { wasStance: false, lockedTarget: null }
    });
    const next = getFootPlantingWorldTarget({
      phase: tau, hip: [0, 1, -2], strideDirection: [0, 0, -1],
      strideLength: 2, groundY: 0, lockState: swing.lockState
    });
    expect(next.planted).toBe(true);
    expect(next.target[2]).toBeCloseTo(-1, 8);
  });

  it('rejects invalid world-space inputs and zero horizontal direction', () => {
    expect(getFootPlantingWorldTarget({
      phase: 0, hip: [0, 1, 0], strideDirection: [0, 1, 0],
      strideLength: 1, groundY: 0
    })).toBeNull();
    expect(getFootPlantingWorldTarget({
      phase: 0, hip: [0, 1], strideDirection: [0, 0, -1],
      strideLength: 1, groundY: 0
    })).toBeNull();
  });
});


describe('applyTwoBoneIKToBones', () => {
  class Vector3 {
    constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
    clone() { return new Vector3(this.x, this.y, this.z); }
    copy(v) { this.x=v.x;this.y=v.y;this.z=v.z;return this; }
    sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
    add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
    normalize() { const n = Math.hypot(this.x, this.y, this.z) || 1; this.x /= n; this.y /= n; this.z /= n; return this; }
    lengthSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
    distanceTo(v) { return Math.hypot(this.x-v.x, this.y-v.y, this.z-v.z); }
    toArray() { return [this.x, this.y, this.z]; }
    applyQuaternion(q) {
      const x=this.x,y=this.y,z=this.z,qx=q.x,qy=q.y,qz=q.z,qw=q.w;
      const ix=qw*x+qy*z-qz*y, iy=qw*y+qz*x-qx*z, iz=qw*z+qx*y-qy*x, iw=-qx*x-qy*y-qz*z;
      this.x=ix*qw+iw*-qx+iy*-qz-iz*-qy;
      this.y=iy*qw+iw*-qy+iz*-qx-ix*-qz;
      this.z=iz*qw+iw*-qz+ix*-qy-iy*-qx;
      return this;
    }
  }
  class Quaternion {
    constructor(x=0,y=0,z=0,w=1) { this.x=x;this.y=y;this.z=z;this.w=w; }
    clone() { return new Quaternion(this.x,this.y,this.z,this.w); }
    copy(q) { this.x=q.x;this.y=q.y;this.z=q.z;this.w=q.w;return this; }
    normalize() { const n=Math.hypot(this.x,this.y,this.z,this.w)||1;this.x/=n;this.y/=n;this.z/=n;this.w/=n;return this; }
    multiply(q) {
      const ax=this.x,ay=this.y,az=this.z,aw=this.w,bx=q.x,by=q.y,bz=q.z,bw=q.w;
      this.x=ax*bw+aw*bx+ay*bz-az*by;this.y=ay*bw+aw*by+az*bx-ax*bz;
      this.z=az*bw+aw*bz+ax*by-ay*bx;this.w=aw*bw-ax*bx-ay*by-az*bz;return this;
    }
    premultiply(q) { return this.copy(q.clone().multiply(this)); }
    invert() { this.x=-this.x;this.y=-this.y;this.z=-this.z;return this; }
    setFromUnitVectors(a,b) {
      let r=a.x*b.x+a.y*b.y+a.z*b.z+1;
      if(r<1e-7) { r=0; if(Math.abs(a.x)>Math.abs(a.z)){this.x=-a.y;this.y=a.x;this.z=0;}else{this.x=0;this.y=-a.z;this.z=a.y;} }
      else { this.x=a.y*b.z-a.z*b.y;this.y=a.z*b.x-a.x*b.z;this.z=a.x*b.y-a.y*b.x; }
      this.w=r;return this.normalize();
    }
    equals(q) { return this.x===q.x&&this.y===q.y&&this.z===q.z&&this.w===q.w; }
  }
  class Node {
    constructor(isBone=false) { this.isBone=isBone;this.position=new Vector3();this.quaternion=new Quaternion();this.parent=null;this.children=[]; }
    add(child) { child.parent=this;this.children.push(child);return this; }
    updateWorldMatrix() {}
    getWorldQuaternion(out=new Quaternion()) {
      if(!this.parent)return out.copy(this.quaternion);
      return out.copy(this.parent.getWorldQuaternion()).multiply(this.quaternion);
    }
    getWorldPosition(out=new Vector3()) {
      if(!this.parent)return out.copy(this.position);
      return out.copy(this.position).applyQuaternion(this.parent.getWorldQuaternion()).add(this.parent.getWorldPosition());
    }
  }
  const THREE = { Vector3, Quaternion };
  function makeChain() {
    const root=new Node(true),knee=new Node(true),ankle=new Node(true),rig=new Node();
    knee.position=new Vector3(0,-1,0);ankle.position=new Vector3(0,-1,0);
    root.add(knee);knee.add(ankle);rig.add(root);
    return {root,knee,ankle,rig};
  }

  it('rotates a bone chain toward a reachable world target', () => {
    const chain=makeChain();
    const result=applyTwoBoneIKToBones(THREE,chain.root,chain.knee,chain.ankle,[1,-1,0],[1,0,0]);
    const actual=chain.ankle.getWorldPosition();
    expect(result).not.toBeNull();
    expect(actual.distanceTo(new Vector3(1,-1,0))).toBeLessThan(1e-6);
    expect(result.reachable).toBe(true);
  });

  it('keeps the solved ankle stable when the same world target is applied repeatedly', () => {
    const chain=makeChain();
    const target=[0.8,-1.2,0.2];
    const first=applyTwoBoneIKToBones(THREE,chain.root,chain.knee,chain.ankle,target,[1,0,0]);
    const firstAnkle=chain.ankle.getWorldPosition();
    const second=applyTwoBoneIKToBones(THREE,chain.root,chain.knee,chain.ankle,target,[1,0,0]);
    const secondAnkle=chain.ankle.getWorldPosition();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(secondAnkle.distanceTo(firstAnkle)).toBeLessThan(1e-6);
    expect(secondAnkle.distanceTo(new Vector3(...target))).toBeLessThan(1e-6);
  });

  it('solves world targets when the entire bone rig has a rotated parent', () => {
    const chain=makeChain();
    const halfAngle=Math.PI/4;
    chain.rig.quaternion=new Quaternion(0,Math.sin(halfAngle),0,Math.cos(halfAngle));
    const target=[1.1,-1.2,-0.3];
    const result=applyTwoBoneIKToBones(THREE,chain.root,chain.knee,chain.ankle,target,[1,0,0]);
    expect(result).not.toBeNull();
    expect(chain.ankle.getWorldPosition().distanceTo(new Vector3(...target))).toBeLessThan(1e-6);
    expect(chain.root.getWorldPosition().distanceTo(chain.knee.getWorldPosition())).toBeCloseTo(1,7);
    expect(chain.knee.getWorldPosition().distanceTo(chain.ankle.getWorldPosition())).toBeCloseTo(1,7);
  });

  it('preserves segment lengths while aiming the chain', () => {
    const chain=makeChain();
    const beforeUpper=chain.root.getWorldPosition().distanceTo(chain.knee.getWorldPosition());
    const beforeLower=chain.knee.getWorldPosition().distanceTo(chain.ankle.getWorldPosition());
    applyTwoBoneIKToBones(THREE,chain.root,chain.knee,chain.ankle,[0.8,-1.2,0.2],[1,0,0]);
    expect(chain.root.getWorldPosition().distanceTo(chain.knee.getWorldPosition())).toBeCloseTo(beforeUpper,7);
    expect(chain.knee.getWorldPosition().distanceTo(chain.ankle.getWorldPosition())).toBeCloseTo(beforeLower,7);
  });

  it('rejects incomplete chains and malformed targets without mutating bones', () => {
    const chain=makeChain(),before=chain.root.quaternion.clone();
    expect(applyTwoBoneIKToBones(THREE,chain.root,chain.knee,null,[0,-1,0],[1,0,0])).toBeNull();
    expect(applyTwoBoneIKToBones(THREE,chain.root,chain.knee,chain.ankle,[0,1],[1,0,0])).toBeNull();
    expect(chain.root.quaternion.equals(before)).toBe(true);
  });

  it('rejects bones that do not form one ordered ancestor chain', () => {
    const chain=makeChain();
    const unrelated=new Node(true);
    chain.rig.add(unrelated);
    expect(applyTwoBoneIKToBones(
      THREE, chain.root, unrelated, chain.ankle, [0,-1,0], [1,0,0]
    )).toBeNull();
    expect(applyTwoBoneIKToBones(
      THREE, chain.root, chain.knee, unrelated, [0,-1,0], [1,0,0]
    )).toBeNull();
  });
});


describe('getGiftReactionBlend', () => {
  it('eases into and out of a short gift acknowledgement', () => {
    expect(getGiftReactionBlend(1800)).toBe(0);
    expect(getGiftReactionBlend(1670)).toBeGreaterThan(0);
    expect(getGiftReactionBlend(900)).toBe(1);
    expect(getGiftReactionBlend(130)).toBeGreaterThan(0);
    expect(getGiftReactionBlend(0)).toBe(0);
  });

  it('clamps time and safely handles invalid durations', () => {
    expect(getGiftReactionBlend(2400)).toBe(0);
    expect(getGiftReactionBlend(-20)).toBe(0);
    expect(getGiftReactionBlend(Number.NaN)).toBe(0);
    expect(getGiftReactionBlend(500, 0)).toBe(0);
  });
});
