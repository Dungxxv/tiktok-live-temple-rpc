export function getFootPlantingPose(phase) {
  if (!Number.isFinite(phase)) {
    return {
      step: 0,
      kneeFlex: 0,
      footLift: 0,
      swingProgress: 0,
      stanceProgress: 0,
      isStance: true
    };
  }
  const cycle = ((phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const stance = 0.62;
  const progress = cycle / (Math.PI * 2);
  if (progress < stance) {
    return {
      step: -1 + 2 * (progress / stance),
      kneeFlex: 0.035,
      footLift: 0,
      swingProgress: 0,
      stanceProgress: progress / stance,
      isStance: true
    };
  }
  const swingProgress = (progress - stance) / (1 - stance);
  const eased = swingProgress * swingProgress * (3 - 2 * swingProgress);
  return {
    step: 1 - 2 * eased,
    kneeFlex: Math.sin(Math.PI * swingProgress) * 0.72,
    footLift: Math.sin(Math.PI * swingProgress) * 0.13,
    swingProgress,
    stanceProgress: 0,
    isStance: false
  };
}


/**
 * Return procedural leg/foot offsets for a named character state.
 * Angles are additive local-X offsets from the procedural rig's neutral pose.
 * GLB rigs deliberately use their own animation/diagnostic path until axes are verified.
 */
export function getHumanFootPose({ mode = 'idle', phase = 0, blend = 1 } = {}) {
  const amount = Number.isFinite(blend) ? Math.min(1, Math.max(0, blend)) : 0;
  const safePhase = Number.isFinite(phase) ? phase : 0;
  if (mode === 'kneel') {
    return {
      hipRotationX: -0.28 * amount,
      kneeRotationX: 1.18 * amount,
      footRotationX: -0.72 * amount,
      footLift: 0,
      planted: true
    };
  }
  if (mode !== 'walk') {
    return { hipRotationX: 0, kneeRotationX: 0, footRotationX: 0, footLift: 0, planted: true };
  }
  const pose = getFootPlantingPose(safePhase);
  const step = pose.step;
  return {
    hipRotationX: -step * 0.48 * amount,
    kneeRotationX: pose.kneeFlex * amount,
    footRotationX: (step * 0.22 - pose.kneeFlex * 0.65) * amount,
    footLift: pose.footLift * amount,
    planted: pose.isStance
  };
}


/**
 * Timeline for the altar visit: approach, settle into a kneel, then bow.
 * Times are milliseconds relative to arrival; outputs are safe blend weights.
 */

/**
 * Procedural upper-body pose for a kneeling devotee.
 * Angles are additive local-X/Z offsets from the avatar's neutral pose.
 */
export function getHumanUpperPose({ kneelBlend = 0, bowAmount = 0 } = {}) {
  const kneel = Number.isFinite(kneelBlend) ? Math.min(1, Math.max(0, kneelBlend)) : 0;
  const bow = Number.isFinite(bowAmount) ? Math.min(1, Math.max(0, bowAmount)) : 0;
  return {
    torsoLean: -(kneel * 0.2 + bow * 0.72),
    headCounter: kneel * 0.06 + bow * 0.16,
    armReach: -(kneel * 0.7 + bow * 0.12),
    armOpen: kneel * 0.08 + bow * 0.34
  };
}

export function getRitualPoseState({
  travel = 0,
  elapsedAfterArrival = 0,
  remainingMs = 7800,
  kneelInMs = 320,
  bowDelayMs = 900,
  bowInMs = 650,
  exitFadeMs = 650
} = {}) {
  const clamp01 = (value) => Math.min(1, Math.max(0, value));
  const smoothstep = (value) => {
    const t = clamp01(value);
    return t * t * (3 - 2 * t);
  };
  const progress = Number.isFinite(travel) ? clamp01(travel) : 0;
  const elapsed = Number.isFinite(elapsedAfterArrival) ? Math.max(0, elapsedAfterArrival) : 0;
  const remaining = Number.isFinite(remainingMs) ? Math.max(0, remainingMs) : 0;
  const hasArrived = progress >= 1;
  const kneelBlend = hasArrived
    ? smoothstep(elapsed / Math.max(1, kneelInMs)) * smoothstep(remaining / Math.max(1, exitFadeMs))
    : 0;
  const bowAmount = hasArrived
    ? smoothstep((elapsed - bowDelayMs) / Math.max(1, bowInMs))
      * smoothstep(remaining / Math.max(1, exitFadeMs))
    : 0;
  return {
    walking: progress < 0.92,
    kneelBlend,
    bowAmount
  };
}

export function getFootPlantingStep(phase) {
  return getFootPlantingPose(phase).step;
}

/**
 * Solve a two-segment limb in world space using the law of cosines.
 * Vectors are [x, y, z]. The pole point selects which side the joint bends to.
 * Returns null for invalid inputs; unreachable targets are clamped safely.
 */
export function solveTwoBoneIK({ root, target, pole, upperLength, lowerLength }) {
  const vectorIsFinite = (value) => Array.isArray(value) && value.length === 3
    && value.every(Number.isFinite);
  if (!vectorIsFinite(root) || !vectorIsFinite(target) || !vectorIsFinite(pole)
    || !Number.isFinite(upperLength) || !Number.isFinite(lowerLength)
    || upperLength <= 0 || lowerLength <= 0) return null;

  const subtract = (a, b) => a.map((value, index) => value - b[index]);
  const addScaled = (a, b, scale) => a.map((value, index) => value + b[index] * scale);
  const dot = (a, b) => a.reduce((sum, value, index) => sum + value * b[index], 0);
  const length = (value) => Math.sqrt(dot(value, value));
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
  const safeNormalize = (value, fallback) => {
    const magnitude = length(value);
    return magnitude > 1e-8 ? value.map((part) => part / magnitude) : fallback;
  };

  const toTarget = subtract(target, root);
  const rawDistance = length(toTarget);
  const direction = safeNormalize(toTarget, [0, -1, 0]);
  const minReach = Math.abs(upperLength - lowerLength) + 1e-6;
  const maxReach = upperLength + lowerLength - 1e-6;
  const distance = Math.min(maxReach, Math.max(minReach, rawDistance));
  const solvedTarget = addScaled(root, direction, distance);

  let bend = subtract(pole, root);
  bend = subtract(bend, direction.map((part) => part * dot(bend, direction)));
  if (length(bend) <= 1e-8) {
    const fallbackAxis = Math.abs(direction[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    bend = cross(direction, fallbackAxis);
  }
  bend = safeNormalize(bend, [1, 0, 0]);

  const along = (upperLength * upperLength - lowerLength * lowerLength + distance * distance)
    / (2 * distance);
  const height = Math.sqrt(Math.max(0, upperLength * upperLength - along * along));
  const knee = addScaled(addScaled(root, direction, along), bend, height);

  return {
    root: [...root],
    knee,
    target: solvedTarget,
    requestedTarget: [...target],
    distance,
    reachable: Math.abs(distance - rawDistance) < 1e-7
  };
}

/**
 * Produce a world-space foot target and immutable stance-lock state.
 * hip, strideDirection and targets use [x, y, z] world coordinates.
 */
export function getFootPlantingWorldTarget({
  phase, hip, strideDirection, strideLength, groundY, lockState = null
}) {
  const validVector = (value) => Array.isArray(value) && value.length === 3
    && value.every(Number.isFinite);
  if (!Number.isFinite(phase) || !validVector(hip) || !validVector(strideDirection)
    || !Number.isFinite(strideLength) || strideLength < 0 || !Number.isFinite(groundY)) return null;

  const horizontal = [strideDirection[0], 0, strideDirection[2]];
  const magnitude = Math.hypot(horizontal[0], horizontal[2]);
  if (magnitude <= 1e-8) return null;
  const direction = [horizontal[0] / magnitude, 0, horizontal[2] / magnitude];
  const pose = getFootPlantingPose(phase);
  const offset = pose.step * strideLength * 0.5;
  const swingTarget = [
    hip[0] + direction[0] * offset,
    groundY + pose.footLift,
    hip[2] + direction[2] * offset
  ];

  if (pose.isStance) {
    const canKeepLock = lockState?.wasStance === true
      && validVector(lockState.lockedTarget);
    const lockedTarget = canKeepLock ? [...lockState.lockedTarget] : [
      swingTarget[0], groundY, swingTarget[2]
    ];
    return {
      target: lockedTarget,
      planted: true,
      pose,
      lockState: { wasStance: true, lockedTarget }
    };
  }

  return {
    target: swingTarget,
    planted: false,
    pose,
    lockState: { wasStance: false, lockedTarget: null }
  };
}

/**
 * Apply a solved two-bone chain to a Three.js upper/lower bone pair.
 * The foot/ankle joint is the lower bone's child. Segment lengths are measured
 * from the current world pose, so avatar scaling is naturally respected.
 */
export function applyTwoBoneIKToBones(THREE, upperBone, lowerBone, footBone, target, pole) {
  if (!THREE?.Vector3 || !THREE?.Quaternion || !upperBone?.isBone
    || !lowerBone?.isBone || !footBone?.isBone
    || !Array.isArray(target) || target.length !== 3 || !target.every(Number.isFinite)
    || !Array.isArray(pole) || pole.length !== 3 || !pole.every(Number.isFinite)) return null;

  // The two joints must belong to the same ordered hierarchy. Name-based rig
  // matching alone is insufficient: unrelated bones can share common aliases.
  const isDescendantOf = (node, ancestor) => {
    for (let parent = node?.parent; parent; parent = parent.parent) {
      if (parent === ancestor) return true;
    }
    return false;
  };
  if (!isDescendantOf(lowerBone, upperBone) || !isDescendantOf(footBone, lowerBone)) return null;

  const rootPosition = new THREE.Vector3();
  const kneePosition = new THREE.Vector3();
  const anklePosition = new THREE.Vector3();
  upperBone.updateWorldMatrix(true, false);
  lowerBone.updateWorldMatrix(true, false);
  footBone.updateWorldMatrix(true, false);
  upperBone.getWorldPosition(rootPosition);
  lowerBone.getWorldPosition(kneePosition);
  footBone.getWorldPosition(anklePosition);
  const upperLength = rootPosition.distanceTo(kneePosition);
  const lowerLength = kneePosition.distanceTo(anklePosition);
  if (upperLength <= 1e-6 || lowerLength <= 1e-6) return null;

  const solved = solveTwoBoneIK({
    root: rootPosition.toArray(),
    target,
    pole,
    upperLength,
    lowerLength
  });
  if (!solved) return null;

  const aimBone = (bone, child, desiredEnd) => {
    bone.updateWorldMatrix(true, false);
    child.updateWorldMatrix(true, false);
    const start = bone.getWorldPosition(new THREE.Vector3());
    const end = child.getWorldPosition(new THREE.Vector3());
    const currentDirection = end.sub(start).normalize();
    const desiredDirection = new THREE.Vector3(...desiredEnd).sub(
      bone.getWorldPosition(new THREE.Vector3())
    ).normalize();
    if (currentDirection.lengthSq() < 1e-10 || desiredDirection.lengthSq() < 1e-10) return false;

    const worldRotation = bone.getWorldQuaternion(new THREE.Quaternion());
    const delta = new THREE.Quaternion().setFromUnitVectors(currentDirection, desiredDirection);
    worldRotation.premultiply(delta);
    const parentRotation = bone.parent
      ? bone.parent.getWorldQuaternion(new THREE.Quaternion()).invert()
      : new THREE.Quaternion();
    bone.quaternion.copy(parentRotation.multiply(worldRotation));
    bone.updateWorldMatrix(true, false);
    return true;
  };

  if (!aimBone(upperBone, lowerBone, solved.knee)) return null;
  if (!aimBone(lowerBone, footBone, solved.target)) return null;
  return solved;
}


/**
 * Smooth, bounded response envelope for short-lived gift acknowledgements.
 * The first and last 260ms are eased to avoid a mechanical snap.
 */
export function getGiftReactionBlend(remainingMs, durationMs = 1800, rampMs = 260) {
  if (!Number.isFinite(remainingMs) || !Number.isFinite(durationMs) || durationMs <= 0) return 0;
  const remaining = Math.min(durationMs, Math.max(0, remainingMs));
  const ramp = Math.min(durationMs / 2, Math.max(0, Number.isFinite(rampMs) ? rampMs : 260));
  if (ramp <= 0) return remaining > 0 ? 1 : 0;
  const elapsed = durationMs - remaining;
  const ease = (value) => { const t = Math.min(1, Math.max(0, value)); return t * t * (3 - 2 * t); };
  return Math.min(ease(elapsed / ramp), ease(remaining / ramp));
}
