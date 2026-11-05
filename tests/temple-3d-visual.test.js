import { describe, expect, it } from 'bun:test';
import { readFileSync } from 'node:fs';
import { findBestAnimationClip } from '../public/js/three-animation-utils.js';

const css = readFileSync(new URL('../public/css/live.css', import.meta.url), 'utf8');

describe('3D sanctuary visual treatment', () => {
  it('adds a non-interactive cinematic vignette only in 3D mode', () => {
    expect(css).toContain('.stage-9x16.temple-3d-mode::after');
    expect(css).toContain('pointer-events: none;');
    expect(css).toContain('radial-gradient(ellipse at 50% 43%');
    expect(css).toContain('linear-gradient(180deg');
  });

  it('turns procedural devotees toward incoming gifts with a bounded head acknowledgement', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('giftReactionUntil: 0');
    expect(scene).toContain('const giftReaction = getAvatarGiftReactionBlend(avatar, time) * (avatar.giftReactionProfile?.intensity || 0.55);');
    expect(scene).toContain('avatar.head.rotation.y = Math.sin(time*0.0011+avatar.phase)*0.035 + giftReaction * 0.2;');
    expect(scene).toContain('avatar.head.rotation.z = Math.sin(time*0.0014+avatar.phase)*0.008 + giftReaction * Math.sin(avatar.phase) * 0.035;');
    expect(scene).toContain('const resolved = profile || { tier: \'small\', intensity: 0.55, bowAmount: 0.08, durationMs: 1800 };');
    expect(scene).toContain('avatar.giftReactionStartedAt = now + (phase / (Math.PI * 2)) * 420;');
    expect(scene).toContain('if (resolved.intensity >= (avatar.giftReactionProfile?.intensity || 0)) avatar.giftReactionProfile = resolved;');
    expect(scene).toContain('for (const avatar of allHumanAvatars) {');
    expect(scene).toContain('avatar.giftReactionUntil = avatar.giftReactionStartedAt + resolved.durationMs;');
    expect(scene).toContain('if (resolved.intensity >= (avatar.giftReactionProfile?.intensity || 0)) avatar.giftReactionProfile = resolved;');
  });

  it('updates gratitude intensity for combo frames without replaying the world gift effect', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    const engine = readFileSync(new URL('../public/js/gift-action-engine.js', import.meta.url), 'utf8');
    expect(engine).toContain("new CustomEvent('temple:gift-reaction'");
    expect(engine).toContain('resolveGiftReactionProfile(event)');
    expect(scene).toContain('function onTempleGiftReaction(event)');
    expect(scene).toContain('applyGiftReactionProfile(event.detail?.reactionProfile);');
    expect(scene).toContain("window.addEventListener('temple:gift-reaction', onTempleGiftReaction);");
    expect(scene).toContain('// Combo frames update gratitude intensity without replaying the 3D gift effect.');
  });

  it('turns the devotee crowd toward the live audience and adds a restrained thank-you expression', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('avatar.root.rotation.y = Math.PI * (1 - giftReaction);');
    expect(scene).toContain('avatar.smile.scale.x = 1 + giftReaction * 0.2;');
    expect(scene).toContain('avatar.smile.scale.y = 1 + giftReaction * 0.12 - avatar.bowAmount * 0.12;');
    expect(scene).toContain('for (const eyeWhite of avatar.eyeWhites) eyeWhite.scale.x = 1 + giftReaction * 0.045;');
    expect(scene).toContain('// Devotees briefly turn from the altar toward the live audience, then ease back.');
  });

  it('scales the thank-you bow and hand gesture from the incoming gift tier', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const strength = blend * profile.intensity;');
    expect(scene).toContain('avatar.upperBody.rotation.x = upperPose.torsoLean - blend * profile.bowAmount;');
    expect(scene).toContain('const thankYouLift = strength * (0.92 + Math.sin(time * 0.007) * 0.025);');
    expect(scene).toContain('function getAvatarGiftReactionBlend(avatar, time)');
    expect(scene).toContain('getGiftReactionBlend(avatar.giftReactionUntil - time, duration);');
    expect(scene).toContain('const giftReaction = getAvatarGiftReactionBlend(avatar, time) * (avatar.giftReactionProfile?.intensity || 0.55);');
  });

  it('raises both hands into a restrained thank-you gesture during gift reactions', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('function applyGiftThankYouGesture(avatar, time)');
    expect(scene).toContain('const thankYouLift = strength * (0.92 + Math.sin(time * 0.007) * 0.025);');
    expect(scene).toContain('avatar.leftArm.rotation.z = upperPose.armOpen + thankYouLift;');
    expect(scene).toContain('avatar.rightArm.rotation.z = -upperPose.armOpen - thankYouLift;');
    expect(scene).toContain('avatar.leftHand.rotation.z = -upperPose.armOpen * 0.18 - blend * 0.06;');
    expect(scene).toContain('avatar.rightHand.rotation.z = upperPose.armOpen * 0.18 + blend * 0.06;');
    expect(scene).toContain('applyGiftThankYouGesture(avatar, time);');
    expect(scene).toContain('applyGiftThankYouGesture(mainHuman, now);');
    expect(scene).toContain('if (avatar.gltfRoot) return;');
  });



  it('reveals a warm Buddha halo and lotus aura only for special gift reactions', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const lotusGiftAuraMaterial = new THREE.MeshBasicMaterial({');
    expect(scene).toContain('const lotusGiftAura = new THREE.Mesh(new THREE.TorusGeometry(1.78, 0.035, 8, 96), lotusGiftAuraMaterial);');
    expect(scene).toContain('const haloGiftAuraMaterial = new THREE.MeshBasicMaterial({');
    expect(scene).toContain('const haloGiftAura = new THREE.Mesh(new THREE.TorusGeometry(2.48, 0.055, 8, 112), haloGiftAuraMaterial);');
    expect(scene).toContain("avatar.giftReactionProfile?.tier === 'special' ? getAvatarGiftReactionBlend(avatar, now) : 0");
    expect(scene).toContain('haloGiftAuraMaterial.opacity = auraPulse * 0.42;');
    expect(scene).toContain('lotusGiftAuraMaterial.opacity = auraPulse * 0.34;');
    expect(scene).toContain('haloGlow.intensity = 8 + auraPulse * 13;');
    expect(scene).toContain('const lotusPetalRings = [];');
    expect(scene).toContain('lotusPetalRings.push(ring);');
    expect(scene).toContain('ring.scale.set(1 + opening, 1, 1 + opening);');
    expect(scene).toContain('const opening = auraPulse * (index === 0 ? 0.13 : 0.09);');
    expect(scene).toContain('const lotusSparkCount = 32;');
    expect(scene).toContain('const lotusSparkPositions = new Float32Array(lotusSparkCount * 3);');
    expect(scene).toContain('const lotusSparkGeometry = new THREE.BufferGeometry();');
    expect(scene).toContain('lotusSparkMaterial.opacity = auraPulse * 0.88;');
    expect(scene).toContain('lotusSparkGeometry.attributes.position.needsUpdate = true;');
    expect(scene).toContain('lotusSparkPositions[offset + 1] = 0.32 + progress * 3.55;');
    expect(scene).toContain('const statueRimLight = new THREE.DirectionalLight(0xffc982, 0.82);');
    expect(scene).toContain('statueRimLight.castShadow = false;');
    expect(scene).toContain('statueRimLight.intensity = 0.82 + auraPulse * 1.1;');
    expect(scene).toContain('mats.goldBright.emissiveIntensity = 0.25 + auraPulse * 0.38;');
    expect(scene).toContain('mats.statueStone.emissiveIntensity = 0.035 + auraPulse * 0.045;');
  });

  it('stagger congregation gift reactions and pulse altar lighting with the shared response', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('giftReactionStartedAt: 0, giftReactionUntil: 0');
    expect(scene).toContain('const phase = ((avatar.phase % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);');
    expect(scene).toContain('avatar.giftReactionStartedAt = now + (phase / (Math.PI * 2)) * 420;');
    expect(scene).toContain('avatar.giftReactionUntil = avatar.giftReactionStartedAt + resolved.durationMs;');
    expect(scene).toContain('const congregationGiftGlow = allHumanAvatars.reduce((peak, avatar) => Math.max(');
    expect(scene).toContain('buddhaLight.intensity = 14 + Math.sin(elapsed * 0.0018) * 1.0 + congregationGiftGlow * 2.2;');
    expect(scene).toContain('altarFill.intensity = 17 + Math.sin(elapsed * 0.0045 + 0.8) * 2.2 + congregationGiftGlow * 4.5;');
  });

  it('animates subtle torso breathing and head micro-movements without moving the planted root', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('root, upperBody, torso, head, eyeWhites, eyePupils, eyebrows, smile,');
    expect(scene).toContain('const breathCycle = time * 0.00135 + avatar.phase;');
    expect(scene).toContain('avatar.torso.scale.y = 1 + breath * 0.012;');
    expect(scene).toContain('avatar.torso.position.y = 0.40 + breath * 0.0025;');
    expect(scene).toContain('avatar.head.rotation.x = Math.sin(time*0.00082+avatar.phase*0.7)*0.012 - giftReaction * 0.045;');
    expect(scene).toContain('avatar.root.position.y = (walking ? 0 : Math.sin(time*0.0015+avatar.phase)*0.012) - avatar.kneelBlend * 0.1;');
  });

  it('adds animated blinking, eye gaze and a restrained bow expression to procedural faces', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const eyeWhites = [], eyePupils = [], eyebrows = [];');
    expect(scene).toContain('eyeWhites, eyePupils, eyebrows, smile,');
    expect(scene).toContain('const blinkCycle = ((time * 0.001 + avatar.phase * 0.17) % 4.6 + 4.6) % 4.6;');
    expect(scene).toContain('avatar.eyeWhites[index].scale.y = eyeOpen;');
    expect(scene).toContain('avatar.eyePupils[index].position.x = Math.sin(time*0.00065+avatar.phase)*0.006 + giftReaction * (index === 0 ? 0.009 : -0.009);');
    expect(scene).toContain('avatar.eyePupils[index].position.y = giftReaction * 0.008;');
    expect(scene).toContain('for (const { mesh, side } of avatar.eyebrows) mesh.rotation.z = -side * 0.12 + giftReaction * side * 0.035;');
    expect(scene).toContain('avatar.head.rotation.z = Math.sin(time*0.0014+avatar.phase)*0.008 + giftReaction * Math.sin(avatar.phase) * 0.035;');
    expect(scene).toContain('avatar.smile.scale.y = 1 + giftReaction * 0.12 - avatar.bowAmount * 0.12;');
  });

  it('builds articulated palms and fingers for the procedural devotee', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const leftHand = new THREE.Group();');
    expect(scene).toContain('const rightHand = new THREE.Group();');
    expect(scene).toContain('Small articulated palms and separated fingers keep the prayer gesture readable at scene scale.');
    expect(scene).toContain('for(let finger=0;finger<4;finger++){');
    expect(scene).toContain('root, upperBody, torso, head, eyeWhites, eyePupils, eyebrows, smile, leftArm, rightArm, leftHand, rightHand,');
    expect(scene).toContain('avatar.leftHand.rotation.z = -upperPose.armOpen * 0.18;');
    expect(scene).toContain('avatar.rightHand.rotation.z = upperPose.armOpen * 0.18;');
  });

  it('uses the shared upper-body pose for a procedural kneeling bow', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('getHumanUpperPose, getRitualPoseState');
    expect(scene).toContain('function applyHumanBow(avatar, amount, kneelBlend = 0)');
    expect(scene).toContain('const upperPose = getHumanUpperPose({ kneelBlend, bowAmount: amount });');
    expect(scene).toContain('avatar.upperBody.rotation.x = upperPose.torsoLean;');
    expect(scene).toContain('avatar.head.rotation.x = upperPose.headCounter;');
    expect(scene).toContain('avatar.leftArm.rotation.x = upperPose.armReach;');
    expect(scene).toContain('avatar.rightArm.rotation.x = upperPose.armReach;');
    expect(scene).toContain('applyHumanBow(mainHuman, ritualPose.bowAmount, ritualPose.kneelBlend);');
  });

  it('sequences the main devotee through approach, kneel and bow with a shared timeline', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("getHumanFootPose, getHumanUpperPose, getRitualPoseState, getGiftReactionBlend } from './three-gait-utils.js';");
    expect(scene).toContain('mainHuman.kneelBlend = ritualPose.kneelBlend;');
    expect(scene).toContain('mainHuman.kneeling = ritualPose.kneelBlend > 0.035;');
    expect(scene).toContain('avatar.root.position.y = (walking ? 0 : Math.sin(time*0.0015+avatar.phase)*0.012) - avatar.kneelBlend * 0.1;');
    expect(scene).toContain('animateHuman(mainHuman, now, ritualPose.walking, walkPhase);');
    expect(scene).toContain('applyHumanBow(mainHuman, ritualPose.bowAmount, ritualPose.kneelBlend);');
    expect(scene).toContain('devoteeState.arrivedAt = now;');
    expect(scene).toContain('mainHuman.kneelBlend = 0;');
  });

  it('adds an instanced gilded outer aureole and warm focal glow', async () => {
    const scene = (await import('node:fs')).readFileSync(
      new URL('../public/js/temple-3d.js', import.meta.url), 'utf8'
    );
    expect(scene).toContain('new THREE.TorusGeometry(2.3,0.035,8,96)');
    expect(scene).toContain('new THREE.InstancedMesh(');
    expect(scene).toContain('new THREE.SphereGeometry(0.045,8,6), mats.goldBright, 32');
    expect(scene).toContain('new THREE.PointLight(0xffbd69, 8, 7, 2)');
  });

  it('uses one static instanced mesh for gilded column fluting', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('new THREE.CylinderGeometry(0.012, 0.012, 5.9, 6)');
    expect(scene).toContain('mats.goldBright, 10 * 8');
    expect(scene).toContain('columnFlutes.instanceMatrix.setUsage(THREE.StaticDrawUsage)');
    expect(scene).toContain('columnFlutes.castShadow = false');
  });

  it('adds a small stone urna relief to the Buddha forehead without a gold ornament', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("// The Buddha's urna is a restrained stone relief, not a metallic jewel.");
    expect(scene).toContain('], 0.0055, mats.statueShadow);');
    expect(scene).toContain('], 0.004, mats.statueLight);');
    expect(scene).toContain('sphere(0.019, mats.statueLight, 0, 5.03, 0.557, 0.82, 1.12, 0.48, statue);');
  });

  it('adds two instanced curl courses that follow the Buddha ushnisha surface', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const ushnishaCurlPolarAngles = [0.56, 0.98];');
    expect(scene).toContain('const ushnishaCurlCounts = [8, 12];');
    expect(scene).toContain("ushnishaCurls.name = 'BuddhaUshnishaCurls';");
    expect(scene).toContain('ushnishaCurls.instanceMatrix.needsUpdate = true;');
    expect(scene).toContain('0.2952 * sinPolar * Math.cos(angle)');
    expect(scene).toContain('0.02 + 0.2808 * sinPolar * Math.sin(angle)');
  });

  it('adds instanced brass collars to the foot and crown of each timber column', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('new THREE.TorusGeometry(0.49, 0.035, 8, 24)');
    expect(scene).toContain('new THREE.InstancedMesh(columnCollarGeometry, mats.goldBright, 10 * 2)');
    expect(scene).toContain('for (const y of [0.86, 7.18])');
    expect(scene).toContain('columnCollars.instanceMatrix.setUsage(THREE.StaticDrawUsage)');
    expect(scene).toContain('world.add(columnCollars)');
  });

  it('frames the processional carpet with low curbs and brass inlay', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('box(0.22, 0.16, 27.2, mats.stone, side * 3.08, 0.025, 3)');
    expect(scene).toContain('box(0.035, 0.025, 27.0, mats.goldBright, side * 3.19, 0.115, 3)');
    expect(scene).toContain('for (const z of [16.8, 17.45])');
  });

  it('adds low raised galleries beyond both side-column rows', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const x = side * 9.15');
    expect(scene).toContain('box(2.35, 0.18, 25.5, mats.wood, x, -0.055, 2.2)');
    expect(scene).toContain('box(2.2, 0.045, 25.2, mats.stone, x, 0.06, 2.2)');
    expect(scene).toContain('side * 10.25');
  });

  it('adds open timber balustrades along both raised gallery edges', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const railX = side * 10.18');
    expect(scene).toContain('box(0.14, 0.14, 24.8, mats.woodLight, railX, 0.66, 2.2)');
    expect(scene).toContain('box(0.1, 0.09, 24.8, mats.goldBright, railX, 0.79, 2.2)');
    expect(scene).toContain('sphere(0.075, mats.goldBright, railX, 1.02, z, 1, 0.7, 1)');
  });

  it('separates the 3D footer into independent floating console panels', () => {
    expect(css).toContain('3D HUD refinement: split the legacy footer');
    expect(css).toContain('.stage-9x16.temple-3d-mode .hud-left-col::before');
    expect(css).toContain('.stage-9x16.temple-3d-mode .hud-right-leaderboard::before');
    expect(css).toContain('height: 276px;');
    expect(css).toContain('background: transparent;');
  });

  it('cache-busts the live stylesheet so the 3D HUD redesign reaches browsers', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('/css/live.css?v=3d-ritual-console-20261101-7');
  });

  it('replaces the compact legacy cards with a sculpted 3D broadcast console', () => {
    expect(css).toContain('3D BROADCAST INTERFACE');
    expect(css).toContain('.stage-9x16.temple-3d-mode .bottom-hud-bar');
    expect(css).toContain('height: 218px;');
    expect(css).toContain('border-radius: 22px 8px 22px 8px;');
    expect(css).toContain('.stage-9x16.temple-3d-mode .hud-gift-card:hover');
    expect(css).toContain('font-size: 38px;');
    expect(css).toContain('.stage-9x16.temple-3d-mode .hud-right-leaderboard');
    expect(css).toContain('height: 188px;');
  });

  it('builds a distinct ceremonial 3D interaction console without changing 2D markup behavior', () => {
    const html = readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
    expect(html).toContain('hud-panel-kicker');
    expect(html).toContain('NGHI LỄ • CÚNG DƯỜNG');
    expect(css).toContain('.stage-9x16.temple-3d-mode .hud-panel-kicker');
    expect(css).toContain('.stage-9x16.temple-3d-mode .hud-gift-card:nth-child(3)::before');
    expect(css).toContain('.stage-9x16.temple-3d-mode .leader-item:first-child .leader-rank');
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
  });

  it('models the bell, wooden fish and fortune cylinder as 3D sanctuary props', async () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('function makeRitualStation(x, z, kind)');
    expect(scene).toContain("makeRitualStation(-3.75, -1.2, 'bell')");
    expect(scene).toContain("makeRitualStation(3.75, -1.2, 'woodfish')");
    expect(scene).toContain("makeRitualStation(3.75, -5.4, 'fortune')");
    expect(scene).toContain('const ritualStations = [];');
    expect(scene).toContain('camera.position.set(0, 11.75, 28.5);');
    expect(scene).toContain('camera.lookAt(0, -1.5, -5.5);');
  });

  it('makes modeled ritual stations directly clickable through raycasting', async () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('new THREE.Raycaster()');
    expect(scene).toContain('ritualRaycaster.intersectObjects(ritualHitMeshes, false)');
    expect(scene).toContain("bell: 'ringBell'");
    expect(scene).toContain("woodfish: 'strikeWoodenFish'");
    expect(scene).toContain("fortune: 'drawFortune'");
    expect(scene).toContain("canvas.addEventListener('pointerup', onWorldPointerUp)");
    expect(scene).toContain("canvas.addEventListener('pointermove', onWorldPointerMove");
    expect(scene).toContain("window.dispatchEvent(new CustomEvent('temple:ritual'");
    expect(scene).toContain('canvas.removeEventListener(\'pointerup\', onWorldPointerUp)');
    expect(scene).toContain('canvas.removeEventListener(\'pointermove\', onWorldPointerMove)');
  });

  it('requires pointer down and pointer up on the same station before firing a ritual', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('let pressedRitualStation = null;');
    expect(scene).toContain("canvas.addEventListener('pointerdown', onWorldPointerDown)");
    expect(scene).toContain('if (!station || station !== pressedStation) return;');
    expect(scene).toContain("canvas.addEventListener('pointercancel', onWorldPointerCancel)");
    expect(scene).toContain("canvas.removeEventListener('pointerdown', onWorldPointerDown)");
    expect(scene).toContain("canvas.removeEventListener('pointercancel', onWorldPointerCancel)");
  });

  it('animates each physical ritual prop when its matching ritual event fires', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("station.userData.ritualKind = kind;");
    expect(scene).toContain('station.userData.animation.bellPivot = bellPivot');
    expect(scene).toContain('station.userData.animation.malletPivot = malletPivot');
    expect(scene).toContain('station.userData.animation.fortuneDrum = fortuneDrum');
    expect(scene).toContain("ringBell: 'bell'");
    expect(scene).toContain("strikeWoodenFish: 'woodfish'");
    expect(scene).toContain("drawFortune: 'fortune'");
    expect(scene).toContain('animation.bellPivot.rotation.z = Math.sin(progress * Math.PI * 8)');
    expect(scene).toContain('animation.malletPivot.rotation.z = Math.sin(progress * Math.PI * 4)');
    expect(scene).toContain('animation.fortuneDrum.rotation.y = Math.PI * 2 * 3 * spinEase');
    expect(scene).toContain('updateRitualStationAnimations(now)');
  });

  it('enables pointer and touch input only for the active 3D canvas', () => {
    const canvasRule = css.slice(css.lastIndexOf('.stage-9x16.temple-3d-mode #temple3dCanvas'));
    expect(canvasRule).toContain('pointer-events: auto;');
    expect(canvasRule).toContain('touch-action: manipulation;');
    const baseCanvas = css.slice(css.indexOf('#temple3dCanvas {'), css.indexOf('#temple3dCanvas[hidden]'));
    expect(baseCanvas).toContain('pointer-events: none;');
  });

  it('places ritual feedback at the visible 3D station coordinates', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("makeRing(-3.75, 1.85, -1.2, 0xffe18a)");
    expect(scene).toContain('makeRing(3.75, 0.9, -1.2)');
    expect(scene).toContain('makeRing(3.75, 0.85, -5.4, 0xffdf83)');
  });

  it('keeps the procedural statue as fallback and gates local GLB replacement behind models=1', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("get('models') === '1'");
    expect(scene).toContain('await isLocalModelAvailable(selectedUrl)');
    expect(scene).toContain('if (disposed) {');
    expect(scene).toContain('statue.add(asset.root)');
    expect(scene).toContain('Optional Buddha GLB unavailable; keeping procedural statue');
    expect(scene).toContain('const statue = new THREE.Group()');
  });

  it('tries Kenny first, then the CC0 scan, and exposes a Buddha-only preview flag', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    const start = scene.indexOf('async function upgradeBuddhaFromGLB()');
    const end = scene.indexOf('function addEffect', start);
    const loader = scene.slice(start, end);
    const selectedIndex = loader.indexOf("loadGLTFAsset(selectedUrl");
    const fallbackIndex = loader.indexOf("loadGLTFAsset(fallbackUrl");
    const preflightIndex = loader.indexOf("await isLocalModelAvailable(selectedUrl)");
    const fallbackPreflightIndex = loader.indexOf("await isLocalModelAvailable(fallbackUrl)");
    expect(preflightIndex).toBeGreaterThanOrEqual(0);
    expect(preflightIndex).toBeLessThan(selectedIndex);
    expect(fallbackPreflightIndex).toBeLessThan(fallbackIndex);
    expect(scene).toContain("method: 'HEAD'");
    expect(loader).toContain('skipping its load request');
    expect(scene).toContain("modelParams.get('buddha') === '1'");
    expect(scene).toContain('modelsRequested || buddhaModelRequested');
    expect(scene).toContain("window.__TEMPLE_BUDDHA_MODEL_SOURCE__ = 'loading'");
    expect(loader).toContain("assetSource = 'mia-cc0-gilt-bronze'");
    expect(loader).toContain("assetSource === 'mia-cc0-gilt-bronze'");
    expect(scene).toContain('function applyGiltFinish(root)');
    expect(scene).toContain('material.color.setHex(0xc99a3c)');
    expect(scene).toContain('material.metalness = 0.68');
    expect(scene).toContain('material.roughness = 0.42');
    expect(loader).toContain('Optional Buddha GLB unavailable; keeping procedural statue');
  });

  it('normalizes bundled GLB assets and keeps GLTFLoader lazy-loaded', () => {
    const loader = readFileSync(new URL('../public/js/three-model-loader.js', import.meta.url), 'utf8');
    expect(loader).toContain("url.startsWith('/assets/models/')");
    expect(loader).toContain("import('three/addons/loaders/GLTFLoader.js')");
    expect(loader).toContain('root.scale.setScalar(scale)');
    expect(loader).toContain('-normalizedBounds.min.y');
    expect(loader).toContain('disposeThreeSceneResources(root)');
  });

  it('recognizes common Mixamo and side-suffixed GLB bone naming conventions', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("leftArm: ['leftupperarm', 'leftarm', 'upperarmleft', 'armleft', 'upperarml', 'arml', 'lupperarm', 'larm', 'jbiplupperarm']");
    expect(scene).toContain("rightArm: ['rightupperarm', 'rightarm', 'upperarmright', 'armright', 'upperarmr', 'armr', 'rupperarm', 'rarm', 'jbiprupperarm']");
    expect(scene).toContain("leftLeg: ['leftupperleg', 'leftupleg', 'leftthigh', 'leftleg', 'upperlegleft', 'thighleft', 'upperlegl', 'thighl', 'legl', 'lupperleg', 'lthigh', 'lleg', 'jbiplupperleg']");
    expect(scene).toContain("rightLeg: ['rightupperleg', 'rightupleg', 'rightthigh', 'rightleg', 'upperlegright', 'thighright', 'upperlegr', 'thighr', 'legr', 'rupperleg', 'rthigh', 'rleg', 'jbiprupperleg']");
    expect(scene).toContain('const aliasIndex = aliases.findIndex((alias) => name === alias || name.endsWith(alias));');
  });

  it('supports VRM J_Bip and Unity-style side-prefixed bone names', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("'lupperarm', 'larm'");
    expect(scene).toContain("'rupperarm', 'rarm'");
    expect(scene).toContain("'lupperleg', 'lthigh', 'lleg'");
    expect(scene).toContain("'rupperleg', 'rthigh', 'rleg'");
    expect(scene).toContain("'spine01', 'spine1', 'spine02', 'spine2'");
  });

  it('maps VRM J_Bip central and limb bones and keeps neck separate for bowing', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("spine: ['spine', 'spine01', 'spine1', 'spine02', 'spine2', 'chest', 'upperbody', 'jbipcspine', 'jbipcchest']");
    expect(scene).toContain("neck: ['neck', 'jbipcneck']");
    expect(scene).toContain("'jbipchead'");
    expect(scene).toContain("'jbiplupperarm'");
    expect(scene).toContain("'jbiprupperarm'");
    expect(scene).toContain("'jbiplupperleg'");
    expect(scene).toContain("'jbiprupperleg'");
    expect(scene).toContain('neckRest: bones.neck?.rotation.clone()');
    expect(scene).toContain('rig.neck.rotation.x = rig.neckRest.x - amount * 0.12;');
  });

  it('selects the strongest bone alias instead of relying on GLB traversal order', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const boneScores = {};');
    expect(scene).toContain('const aliasIndex = aliases.findIndex((alias) => name === alias || name.endsWith(alias));');
    expect(scene).toContain('const exact = name === aliases[aliasIndex];');
    expect(scene).toContain('const score = (exact ? 20000 : 10000) - aliasIndex * 100 + aliases[aliasIndex].length;');
    expect(scene).toContain("if (score > (boneScores[slot] || 0))");
    expect(scene).toContain("'rig:', Object.fromEntries(Object.entries(allHumanAvatars[0]?.gltfRig || {})");
  });

  it('diagnoses ordered GLB leg chains and measures world-space segment lengths', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const inspectLegChain = (upper, lower, foot) => {');
    expect(scene).toContain('!descendsFrom(lower, upper) || !descendsFrom(foot, lower)');
    expect(scene).toContain('model.updateWorldMatrix(true, true);');
    expect(scene).toContain('upperLength: Number(upperPosition.distanceTo(lowerPosition).toFixed(4))');
    expect(scene).toContain('lowerLength: Number(lowerPosition.distanceTo(footPosition).toFixed(4))');
    expect(scene).toContain('left: allHumanAvatars[0]?.gltfRig?.leftLegChain');
    expect(scene).toContain('right: allHumanAvatars[0]?.gltfRig?.rightLegChain');
    expect(scene).toContain('do not enable world-space IK until the');
  });

  it('reports available GLB animation names, duration, tracks and targets', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("'available clips:', animations.map((clip) => ({");
    expect(scene).toContain("name: clip.name || '(unnamed)'");
    expect(scene).toContain('duration: Number.isFinite(clip.duration)');
    expect(scene).toContain('tracks: clip.tracks.length');
    expect(scene).toContain("track.name.split('.')[0]");
  });

  it('recognizes descriptive locomotion, rest and prostration clip names', () => {
    const clips = [
      { name: 'Standing Idle' },
      { name: 'Walk Forward' },
      { name: 'Prayer-Kneel' }
    ];
    const actions = findBestAnimationClip(clips);
    expect(actions.idle).toBe(clips[0]);
    expect(actions.walk).toBe(clips[1]);
    expect(actions.bow).toBe(clips[2]);
  });

  it('blends fallback gait smoothly and restores the rig pose after walking', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('function applyGLTFFallbackWalk(avatar, gaitPhase, weight = 1)');
    expect(scene).toContain("import { getFootPlantingPose, getFootPlantingStep, getHumanFootPose, getHumanUpperPose, getRitualPoseState, getGiftReactionBlend } from './three-gait-utils.js';");
    expect(scene).toContain('const leftStep = getFootPlantingStep(gaitPhase + avatar.phase);');
    expect(scene).toContain('const rightStep = getFootPlantingStep(gaitPhase + avatar.phase + Math.PI);');
    expect(scene).toContain('const leftKnee = new THREE.Group(); leftKnee.position.y = -0.24; leftLeg.add(leftKnee);');
    expect(scene).toContain('const rightKnee = new THREE.Group(); rightKnee.position.y = -0.24; rightLeg.add(rightKnee);');
    expect(scene).toContain('avatar.leftKnee.rotation.x = leftFootPose.kneeRotationX;');
    expect(scene).toContain('avatar.leftFoot.position.y = -0.24 + leftFootPose.footLift;');
    expect(scene.match(/avatar\.root\.position\.y = walking \? 0/g)).toHaveLength(1);
    expect(scene).toContain('leftKnee: bones.leftKnee');
    expect(scene).toContain('leftFoot: bones.leftFoot');
    expect(scene).toContain('rig.leftKnee.rotation.x = base(rig.leftKnee, rig.leftKneeRest) + leftPose.kneeFlex * weight;');
    expect(scene).toContain('const walkTarget = walking && !avatar.gltfActions?.walk ? 1 : 0;');
    expect(scene).toContain('const walkBlend = 1 - Math.exp(-delta / 0.16);');
    expect(scene).toContain('avatar.gltfWalkBlend += (walkTarget - avatar.gltfWalkBlend) * walkBlend;');
    expect(scene).toContain('applyGLTFFallbackWalk(avatar, gaitPhase, avatar.gltfWalkBlend)');
    expect(scene).toContain('const base = (bone, rest) => avatar.gltfActions?.idle ? bone?.rotation.x : rest?.x;');
    expect(scene).toContain('avatar.gltfWalkBlend = 0;');
    expect(scene).toContain('function animateHuman(avatar, time, walking = false, walkPhase = null)');
    expect(scene).toContain('const gaitPhase = Number.isFinite(walkPhase) ? walkPhase : time * 0.009;');
    expect(scene).toContain('const eased = travel * travel * (3 - 2 * travel);');
    expect(scene).toContain('const walkPhase = (eased * 11.2 / 2.2) * Math.PI * 2;');
  });

  it('returns a manually posed GLB bow to rest when the bow state ends', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('if (!avatar.gltfActions?.bow) applyHumanBow(avatar, avatar.bowing ? avatar.bowAmount : 0);');
    expect(scene).toContain('rig.spine.rotation.x = rig.spineRest.x - amount * 0.46;');
    expect(scene).toContain('rig.head.rotation.x = rig.headRest.x + amount * 0.16;');
  });

  it('does not fade an animation action out against itself when states share a fallback clip', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    const start = scene.indexOf('function playGLTFHumanAction(avatar, mode)');
    const end = scene.indexOf('function applyHumanBow(', start);
    const action = scene.slice(start, end);
    expect(action).toContain('avatar.gltfCurrentClip === clip');
    expect(action).toContain('current.setLoop(isBow ? THREE.LoopOnce : THREE.LoopRepeat');
    expect(action).toContain('current.stopFading().setEffectiveWeight(1);');
    expect(action).toContain('next.stopFading().setEffectiveWeight(1);');
    expect(action).toContain('if (current && current !== next) current.stopFading().fadeOut(0.18);');
    expect(action).toContain('avatar.gltfCurrentClip = clip;');
    expect(action).toContain('avatar.gltfCurrentAction?.stopFading().fadeOut(0.18);');
    expect(scene).toContain('avatar.gltfCurrentClip = null;');
  });

  it('keeps the hidden source GLB in the scene so cloned avatar resources have one disposal owner', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    const start = scene.indexOf('async function upgradeDevoteesFromGLB()');
    const end = scene.indexOf('function animateHuman(', start);
    const loader = scene.slice(start, end);
    expect(loader).toContain('asset.root.visible = false;');
    expect(loader).toContain('world.add(asset.root);');
    expect(loader.indexOf('world.add(asset.root);')).toBeLessThan(loader.indexOf('clone(asset.root)'));
    expect(loader).toContain('SkeletonUtils');
  });

  it('supports optional rigged devotee GLBs while preserving procedural fallback', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("loadGLTFAsset('/assets/models/devotee-selected.glb'");
    expect(scene).toContain("import('three/addons/utils/SkeletonUtils.js')");
    expect(scene).toContain('allHumanAvatars.map(() => clone(asset.root))');
    expect(scene).toContain('new THREE.AnimationMixer(model)');
    expect(scene).toContain('findBestAnimationClip(animations)');


    expect(scene).toContain('function applyHumanBow(avatar, amount, kneelBlend = 0)');
    expect(scene).toContain("Optional devotee GLB unavailable; keeping procedural characters");
    expect(scene).toContain('void upgradeDevoteesFromGLB()');
  });

  it('keeps the vignette below the live HUD layer', () => {
    const overlay = css.slice(css.lastIndexOf('.stage-9x16.temple-3d-mode::after'));
    const hudLayer = css.slice(0, css.lastIndexOf('.stage-9x16.temple-3d-mode::after'));
    expect(overlay).toContain('z-index: 2;');
    expect(hudLayer).toContain('.stage-9x16.temple-3d-mode .minimal-top-bar');
    expect(hudLayer).toContain('.stage-9x16.temple-3d-mode .bottom-hud-bar');
    expect(hudLayer).toContain('z-index: 30;');
  });

  it('adds the antique-brass perimeter frame only to the 3D stage', () => {
    expect(css).toContain('.stage-9x16.temple-3d-mode::before');
    expect(css).toContain('inset: 16px;');
    expect(css).toContain('border: 3px solid rgba(186, 137, 51, .82);');
    expect(css).toContain('border-radius: 34px;');
    expect(css).toContain('pointer-events: none;');
  });

  it('uses warm ivory stone for the Buddha and the aureole in the reference palette', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('color: 0x98866d');
    expect(scene).toContain('color: 0x493724');
    expect(scene).toContain('color: 0xd9c7a5');
    expect(scene).toContain('color:0xa59a83');
  });


  it('builds layered red side altar niches with gilded inner mouldings', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('box(1.34, 3.55, 0.05, mats.redBright, x, 4.05, -10.90)');
    expect(scene).toContain('box(0.065, 3.68, 0.1, mats.gold, x + side * 0.72, 4.05, -10.78)');
    expect(scene).toContain('box(1.5, 0.075, 0.1, mats.goldBright, x, y, -10.78)');
    expect(scene).toContain('sphere(0.075, mats.goldBright, x + side * 0.72, y, -10.69, 1, 1, 0.55)');
  });


  it('finishes the offering table with a lacquered front apron and gilded seal', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('box(5.32, 0.3, 0.12, mats.redBright, 0, 1.38, 0.755, offeringTable)');
    expect(scene).toContain('box(5.28, 0.035, 0.15, mats.goldBright, 0, 1.55, 0.765, offeringTable)');
    expect(scene).toContain('const tableSeal = box(0.25, 0.25, 0.065, mats.goldBright, 0, 1.38, 0.84, offeringTable)');
    expect(scene).toContain('tableSeal.rotation.z = Math.PI / 4;');
  });


  it('softens shadow acne and animates independent warm temple light sources', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('key.shadow.bias = -0.00018; key.shadow.normalBias = 0.025; key.shadow.radius = 3;');
    expect(scene).toContain('buddhaLight.intensity = 14 + Math.sin(elapsed * 0.0018) * 1.0 + congregationGiftGlow * 2.2;');
    expect(scene).toContain('altarFill.intensity = 17 + Math.sin(elapsed * 0.0045 + 0.8) * 2.2 + congregationGiftGlow * 4.5;');
    expect(scene).toContain('Math.sin(elapsed * 0.007 + i) * 0.35');
  });

  it('keeps low-cost ambient incense wisps moving above the altar burner', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const incenseSmokeGeometry = new THREE.SphereGeometry(0.105, 8, 6)');
    expect(scene).toContain("const incenseWispCount = renderProfile.tier === 'low' ? 3");
    expect(scene).toContain("const incenseWisps = Array.from({ length: incenseWispCount }");
    expect(scene).toContain('function updateIncenseWisps(time)');
    expect(scene).toContain('wisp.material.opacity = 0.105 * envelope');
    expect(scene).toContain('updateIncenseWisps(now);');
  });

  it('adds restrained per-tile color variation without increasing the courtyard draw-call count', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const tilePalette = index === 0');
    expect(scene).toContain('instances.setColorAt(instanceIndex, tileColors[paletteIndex])');
    expect(scene).toContain('if (instances.instanceColor) instances.instanceColor.needsUpdate = true;');
    expect(scene).toContain('new THREE.InstancedMesh(tileGeometry, material, tilePositions[index].length)');
  });

  it('builds two instanced lotus tiers from a curved tapered petal mesh', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('function createLotusPetalGeometry()');
    expect(scene).toContain('geometry.computeVertexNormals();');
    expect(scene).toContain('new THREE.InstancedMesh(lotusPetalGeometry, mats.redBright, redCount)');
    expect(scene).toContain('new THREE.InstancedMesh(lotusPetalGeometry, mats.goldBright, goldCount)');
    expect(scene).toContain('createLotusPetalRing(16, 1.46, 0.02, 1.0, 0.1)');
    expect(scene).toContain('createLotusPetalRing(12, 1.12, 0.1, 0.78, 0.06)');
    expect(scene).toContain('petals.instanceMatrix.setUsage(THREE.StaticDrawUsage)');
  });

  it('finishes the Buddha pedestal with static brass mouldings and a beaded red tier', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const pedestalTrimGeometry = new THREE.TorusGeometry(1.94, 0.026, 8, 64)');
    expect(scene).toContain('new THREE.InstancedMesh(pedestalTrimGeometry, mats.goldBright, 2)');
    expect(scene).toContain('pedestalTrim.instanceMatrix.setUsage(THREE.StaticDrawUsage)');
    expect(scene).toContain('new THREE.InstancedMesh(pedestalStudGeometry, mats.goldBright, 32)');
    expect(scene).toContain('pedestalStuds.instanceMatrix.setUsage(THREE.StaticDrawUsage)');
    expect(scene).toContain('pedestalTrim.castShadow = false;');
    expect(scene).toContain('pedestalStuds.castShadow = false;');
    expect(scene).toContain('world.add(pedestalTrim);');
    expect(scene).toContain('world.add(pedestalStuds);');
  });


  it('renders the Buddha hair curls as one static instanced batch', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const hairCurlRows = [9, 7, 5, 3]');
    expect(scene).toContain('const hairCurlCount = hairCurlRows.reduce((total, count) => total + count, 0)');
    expect(scene).toContain('new THREE.SphereGeometry(0.075, 24, 16)');
    expect(scene).toContain('new THREE.InstancedMesh(hairCurlGeometry, mats.statueShadow, hairCurlCount)');
    expect(scene).toContain('hairCurls.instanceMatrix.setUsage(THREE.StaticDrawUsage)');
    expect(scene).toContain('hairCurls.castShadow = true;');
    expect(scene).toContain('hairCurls.receiveShadow = false;');
    expect(scene).toContain('statue.add(hairCurls);');
    expect(scene).not.toContain('sphere(0.075,mats.statueShadow');
  });


  it('adds a raised stone robe hem with a recessed shadow groove', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const robeHemCurve = new THREE.CatmullRomCurve3([');
    expect(scene).toContain('new THREE.TubeGeometry(robeHemCurve, 48, 0.032, 8, false)');
    expect(scene).toContain('mats.statueLight');
    expect(scene).toContain('const robeHemGrooveCurve = new THREE.CatmullRomCurve3(');
    expect(scene).toContain('new THREE.TubeGeometry(robeHemGrooveCurve, 48, 0.014, 6, false)');
    expect(scene).toContain('robeHem.castShadow = true;');
    expect(scene).toContain('robeHemGroove.castShadow = false;');
    expect(scene).toContain('statue.add(robeHem);');
    expect(scene).toContain('statue.add(robeHemGroove);');
  });


  it('adds paired carved seams and ivory ridges over both Buddha shoulders', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const shoulderSeam = [');
    expect(scene).toContain('robeFold(shoulderSeam, 0.016);');
    expect(scene).toContain('new THREE.TubeGeometry(shoulderRidge, 32, 0.01, 6, false)');
    expect(scene).toContain('mats.statueLight');
    expect(scene).toContain('ridgeMesh.castShadow = false;');
    expect(scene).toContain('statue.add(ridgeMesh);');
  });


  it('adds two restrained diagonal robe folds across the Buddha chest', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('Two restrained chest folds follow the robe diagonally toward the lap.');
    expect(scene).toContain('robeFold([[-0.38,3.28,0.69],[-0.12,3.18,0.77],[0.16,3.04,0.75],[0.39,2.9,0.67]],0.018);');
    expect(scene).toContain('robeFold([[-0.3,3.12,0.73],[-0.04,3.02,0.79],[0.22,2.88,0.73],[0.43,2.76,0.62]],0.014);');
  });


  it('models the Buddha meditation mudra with rounded palms and individual fingers', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('Build the palms and digits as rounded stone volumes; avoid thin tube strokes');
    expect(scene).toContain('for (let finger = 0; finger < 4; finger++)');
    expect(scene).toContain('Small knuckle reliefs sit flush with the finger volumes.');
    expect(scene).toContain('The thumbs curve inward and meet softly above the joined palms.');
    expect(scene).toContain('sphere(0.018, mats.statueShadow, 0, 2.84, 0.925, 0.8, 0.6, 0.7, statue);');
  });


  it('models the Buddha nose as soft stone volume rather than linework alone', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('The nose is modeled as a continuous stone volume first; fine lines only describe its transitions.');
    expect(scene).toContain('sphere(0.085, mats.statueStone, 0, 4.515, 0.69, 0.62, 1.45, 0.68, statue);');
    expect(scene).toContain('sphere(0.075, mats.statueStone, 0, 4.425, 0.725, 0.92, 0.78, 0.72, statue);');
  });

  it('adds restrained lower eyelid, cheek and lower-lip details to the Buddha face', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('Lower eyelids and cheek transitions soften the serene carved expression.');
    expect(scene).toContain('], 0.012, mats.statueLight);');
    expect(scene).toContain('], 0.014, mats.statueShadow);');
    expect(scene).toContain('A restrained lower-lip crease adds definition without a pronounced smile.');
    expect(scene).toContain('statueLine([[-0.105,4.27,0.685],[0,4.255,0.715],[0.105,4.27,0.685]],0.009,mats.statueLight);');
  });


  it('adds carved inner-ear grooves and fine temple arcs to the Buddha head', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('Shallow inner-ear grooves make the elongated stone ears read as sculpted forms.');
    expect(scene).toContain('[side * 0.64, 4.68, 0.105]');
    expect(scene).toContain('], 0.012);');
    expect(scene).toContain('Fine temple arcs connect the curled cap to the head silhouette.');
    expect(scene).toContain('], 0.014, mats.statueLight);');
  });


  it('adds a lightweight deterministic mineral grain bump map to Buddha stone materials', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('A tiny deterministic grayscale bump tile gives the carved stone a restrained mineral grain.');
    expect(scene).toContain('new Uint8Array(stoneGrainSize * stoneGrainSize * 4)');
    expect(scene).toContain('new THREE.DataTexture(');
    expect(scene).toContain('stoneGrain.repeat.set(3, 3);');
    expect(scene).toContain('material.bumpMap = stoneGrain;');
    expect(scene).toContain('material.bumpScale = material === mats.statueStone ? 0.022 : 0.012;');
  });


  it('adds a restrained curved neckline and collar ridge to blend the Buddha neck into the shoulders', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('A shallow curved neckline softens the join between neck, shoulders and chest.');
    expect(scene).toContain('new THREE.TubeGeometry(necklineCurve, 32, 0.018, 6, false)');
    expect(scene).toContain('new THREE.TubeGeometry(collarRidgeCurve, 32, 0.01, 6, false)');
    expect(scene).toContain('neckline.castShadow = false;');
    expect(scene).toContain('collarRidge.castShadow = false;');
  });


  it('uses one continuous paired robe contour from shoulder toward the resting hands', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('One continuous shoulder-to-hand robe contour avoids stacked parallel seams.');
    expect(scene).toContain('const shoulderSeam = [');
    expect(scene).toContain('[side * 0.34, 2.78, 0.68]');
    expect(scene).toContain('robeFold(shoulderSeam, 0.016);');
    expect(scene).toContain('new THREE.TubeGeometry(shoulderRidge, 32, 0.01, 6, false)');
    expect(scene).toContain('ridgeMesh.castShadow = false;');
    expect(scene).not.toContain('const armEdge = [');
  });


  it('adds restrained paired robe creases at the Buddha elbows', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('Small paired elbow creases connect the upper-arm drape to the resting forearms.');
    expect(scene).toContain('const elbowCrease = [');
    expect(scene).toContain('robeFold(elbowCrease, 0.012);');
    expect(scene).toContain('new THREE.TubeGeometry(elbowRidgeCurve, 16, 0.008, 6, false)');
    expect(scene).toContain('elbowRidge.castShadow = false;');
    expect(scene).toContain('statue.add(elbowRidge);');
  });


});
  it('eases the devotee bow pose smoothly into and out of the ritual', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('const ritualPose = getRitualPoseState({');
    expect(scene).toContain('elapsedAfterArrival: devoteeState.arrivedAt ? now - devoteeState.arrivedAt : 0,');
    expect(scene).toContain('remainingMs: ritualUntil - now');
    expect(scene).toContain('mainHuman.kneelBlend = ritualPose.kneelBlend;');
    expect(scene).toContain('applyHumanBow(mainHuman, ritualPose.bowAmount, ritualPose.kneelBlend);');
  });

  it('routes procedural avatars through the shared idle, walk and kneel foot-pose controller', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain("import { getFootPlantingPose, getFootPlantingStep, getHumanFootPose, getHumanUpperPose, getRitualPoseState, getGiftReactionBlend }");
    expect(scene).toContain("const footMode = walking ? 'walk' : avatar.kneeling ? 'kneel' : 'idle';");
    expect(scene).toContain("getHumanFootPose({ mode: footMode, phase: gaitPhase + avatar.phase, blend: footMode === 'kneel' ? avatar.kneelBlend : 1 });");
    expect(scene).toContain("getHumanFootPose({ mode: footMode, phase: gaitPhase + avatar.phase + Math.PI, blend: footMode === 'kneel' ? avatar.kneelBlend : 1 });");
    expect(scene).toContain('avatar.leftFoot.position.y = -0.24 + leftFootPose.footLift;');
  });

  it('retains hidden procedural fallbacks without disposing shared cached geometry', () => {
    const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
    expect(scene).toContain('for (const child of avatar.root.children) child.visible = false;');
    expect(scene).toContain('for (const child of statue.children) child.visible = false;');
    expect(scene).not.toContain('disposeThreeObjectTree(child)');
    expect(scene).not.toContain('node.geometry.dispose()');
  });



it('adds procedural roughness detail and a physical clearcoat to lacquer and gilding', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const makeRoughnessTexture = (kind) => {');
  expect(scene).toContain("const woodRoughness = makeRoughnessTexture('wood');");
  expect(scene).toContain("const lacquerRoughness = makeRoughnessTexture('lacquer');");
  expect(scene).toContain("const goldRoughness = makeRoughnessTexture('gold');");
  expect(scene).toContain('material.roughnessMap = woodRoughness');
  expect(scene).toContain('material.roughnessMap = lacquerRoughness');
  expect(scene).toContain('material.roughnessMap = goldRoughness');
  expect(scene).toContain('redBright: new THREE.MeshPhysicalMaterial');
  expect(scene).toContain('clearcoat: 0.42, clearcoatRoughness: 0.22');
  expect(scene).toContain('texture.generateMipmaps = true;');
});


it('adds instanced brass rosettes and ruby centres to the altar side panels', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const panelRosetteGeometry = new THREE.TorusGeometry(0.085, 0.012, 6, 20);');
  expect(scene).toContain('new THREE.InstancedMesh(panelRosetteGeometry, mats.goldBright, 10)');
  expect(scene).toContain('new THREE.InstancedMesh(panelGemGeometry, mats.redBright, 10)');
  expect(scene).toContain('for (const ornamentY of [2.72, 3.38, 4.05, 4.72, 5.38])');
  expect(scene).toContain('panelRosettes.instanceMatrix.setUsage(THREE.StaticDrawUsage);');
  expect(scene).toContain('world.add(panelRosettes, panelGems);');
});


it('adds instanced ruby-and-brass diamond plaques to the temple pillars', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const columnPlaqueGeometry = new THREE.BoxGeometry(0.16, 0.16, 0.035);');
  expect(scene).toContain('new THREE.InstancedMesh(columnPlaqueGeometry, mats.goldBright, 10 * 3)');
  expect(scene).toContain('new THREE.InstancedMesh(columnPlaqueGemGeometry, mats.redBright, 10 * 3)');
  expect(scene).toContain('for (const y of [1.55, 4.05, 6.55])');
  expect(scene).toContain('world.add(columnPlaques, columnPlaqueGems);');
});


it('adds a dedicated high-roughness mineral map to the Buddha stone materials', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain("else if (kind === 'stone') value = 222 + grain * 7 + noise * 10;");
  expect(scene).toContain("const stoneRoughness = makeRoughnessTexture('stone');");
  expect(scene).toContain('for (const material of [mats.statueStone, mats.statueShadow, mats.statueLight]) material.roughnessMap = stoneRoughness;');
  expect(scene).toContain("kind === 'stone' ? 4 : 3");
});

it('adds paired wrist transitions and palm creases to the Buddha meditation mudra', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('// Fine wrist transitions and palm creases finish the joined meditation hands.');
  expect(scene).toContain('[side * 0.31, 2.69, 0.82]');
  expect(scene).toContain('[side * 0.445, 2.72, 0.79]');
  expect(scene).toContain('[side * 0.105, 2.655, 0.795]');
  expect(scene).toContain('[side * 0.295, 2.69, 0.795]');
});

it('adds layered side-torso and lower-elbow robe folds on both sides', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('// A short side-torso pleat and lower elbow fold create a quiet layered transition.');
  expect(scene).toContain('[side * 0.48, 3.48, 0.71]');
  expect(scene).toContain('[side * 0.66, 3.33, 0.67]');
  expect(scene).toContain('[side * 0.56, 3.105, 0.635]');
  expect(scene).toContain('sideTorsoPleatRidgeMesh');
  expect(scene).toContain('elbowLowerFoldMesh');
});

it('adds fine paired upper-chest pleats with restrained ivory ridges to the Buddha robe', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('// Fine upper-chest pleats carry the robe\'s drape from the neckline into the chest.');
  expect(scene).toContain('[side * 0.14, 3.72, 0.69]');
  expect(scene).toContain('[side * 0.28, 3.4, 0.78]');
  expect(scene).toContain('upperChestPleatRidgeMesh');
  expect(scene).toContain('robeFold(upperChestPleat, 0.011);');
});

it('adds subtle neck contours and paired shoulder drape creases to the Buddha robe', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('// Subtle neck tendons and shoulder drape creases bridge the head into the robe.');
  expect(scene).toContain('new THREE.Vector3(side * 0.22, 4.2, 0.235)');
  expect(scene).toContain('[side * 0.55, 3.88, 0.51]');
  expect(scene).toContain('shoulderDrapeHighlightMesh');
});

it('adds gentle cheekbone highlights and jaw transition grooves to the Buddha face', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('// Soft cheekbone highlights and jaw transitions give the face a gently sculpted profile.');
  expect(scene).toContain('[side * 0.37, 4.565, 0.635]');
  expect(scene).toContain('[side * 0.34, 4.245, 0.625]');
  expect(scene).toContain('[side * 0.2, 4.17, 0.68]');
});

it('refines the Buddha closed eyelids with shallow upper folds and outer corners', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('// Fine upper-lid folds and outer eye corners define the closed, meditative gaze.');
  expect(scene).toContain('[side * 0.31, 4.81, 0.665]');
  expect(scene).toContain('[side * 0.39, 4.735, 0.625]');
  expect(scene).toContain('[side * 0.53, 4.745, 0.52]');
});

it('adds subtle nose-wing, nostril and philtrum carving to the Buddha face', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('// Refine the nose wings and philtrum with restrained, shallow stone carving.');
  expect(scene).toContain('[side * 0.105, 4.425, 0.704]');
  expect(scene).toContain('[side * 0.055, 4.405, 0.718]');
  expect(scene).toContain('[side * 0.04, 4.355, 0.72]');
  expect(scene).toContain('statueLine([[-0.13,4.315,0.686]');
});

it('extends the Buddha hair curl pattern down both temples with one instanced batch', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const templeCurlCount = 8;');
  expect(scene).toContain('new THREE.InstancedMesh(hairCurlGeometry, mats.statueShadow, templeCurlCount)');
  expect(scene).toContain('templeCurlTransform.position.set(side * (0.53 - row * 0.018), 5.13 - row * 0.105, 0.36 + row * 0.035);');
  expect(scene).toContain('statue.add(templeCurls);');
});


it('adds paired stone highlights and shadow grooves to the Buddha lap robe folds', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const lapFoldPoints = [[x,2.55,0.72],[x*1.3,2.25,0.82],[x*1.7,1.95,0.78]];');
  expect(scene).toContain('const lapFoldHighlight = new THREE.CatmullRomCurve3');
  expect(scene).toContain('const lapFoldGroove = new THREE.CatmullRomCurve3');
  expect(scene).toContain('new THREE.TubeGeometry(lapFoldHighlight, 24, 0.008, 6, false)');
  expect(scene).toContain('new THREE.TubeGeometry(lapFoldGroove, 24, 0.007, 6, false)');
  expect(scene).toContain('statue.add(highlightMesh, grooveMesh);');
});


it('adds curved carved fillets across the lower Buddha base to blend into the lotus throne', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const statueBaseBandPoints = [];');
  expect(scene).toContain('const statueBaseHighlightPoints = [];');
  expect(scene).toContain('1 - ((1.24 - 1.45) / 0.42) ** 2 - (x / 1.512) ** 2');
  expect(scene).toContain('new THREE.TubeGeometry(new THREE.CatmullRomCurve3(statueBaseBandPoints), 48, 0.018, 6, false)');
  expect(scene).toContain('new THREE.TubeGeometry(new THREE.CatmullRomCurve3(statueBaseHighlightPoints), 48, 0.009, 6, false)');
  expect(scene).toContain('statue.add(statueBaseBand, statueBaseHighlight);');
});


it('adds curved-front ruby-and-brass lotus plaques to the Buddha pedestal band', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const pedestalPlaqueXs = [-1.35, -0.9, -0.45, 0, 0.45, 0.9, 1.35];');
  expect(scene).toContain('new THREE.InstancedMesh(pedestalPlaqueGeometry, mats.goldBright, pedestalPlaqueXs.length)');
  expect(scene).toContain('new THREE.InstancedMesh(pedestalGemGeometry, mats.red, pedestalPlaqueXs.length)');
  expect(scene).toContain('Math.sqrt(1.94 * 1.94 - x * x)');
  expect(scene).toContain('world.add(pedestalPlaques, pedestalGems);');
});


it('adds instanced raised gold midribs to both lotus petal rings', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('const lotusVeinGeometry = new THREE.TubeGeometry(lotusVeinCurve, 16, 0.009, 5, false);');
  expect(scene).toContain('const petalVeins = new THREE.InstancedMesh(lotusVeinGeometry, mats.goldBright, count);');
  expect(scene).toContain('petalVeins.setMatrixAt(i, transform.matrix);');
  expect(scene).toContain('ring.add(redPetals, goldPetals, petalVeins);');
  expect(scene).toContain('petals.castShadow = false;');
});


it('shows a designed and truthful empty state for the 3D merit panel', () => {
  expect(css).toContain('.stage-9x16.temple-3d-mode .hud-lb-list:empty::before');
  expect(css).toContain('.stage-9x16.temple-3d-mode .hud-lb-list:empty::after');
  expect(css).toContain('Chưa có lượt cúng dường\\A Mỗi tấm lòng đều được trân trọng');
  expect(css).toContain('white-space: pre-line;');
  expect(css).toContain('border: 1px solid rgba(230, 190, 119, .34);');
});


it('uses warm aged-stone tones and a controlled Buddha focal fill', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('statueStone: new THREE.MeshStandardMaterial({ color: 0x98866d, roughness: 0.92 })');
  expect(scene).toContain('statueShadow: new THREE.MeshStandardMaterial({ color: 0x493724, roughness: 0.96 })');
  expect(scene).toContain('statueLight: new THREE.MeshStandardMaterial({ color: 0xd9c7a5, roughness: 0.9 })');
  expect(scene).toContain('new THREE.PointLight(0xffd1a0, 15, 18, 2)');
  expect(scene).toContain('buddhaLight.intensity = 14 + Math.sin(elapsed * 0.0018) * 1.0 + congregationGiftGlow * 2.2;');
  expect(scene).toContain('A warm, restrained focal fill keeps the stone readable without bleaching its carved planes.');
});

it('validates gift-burst renderer cost against each profile idle baseline', () => {
  const auditScript = readFileSync(new URL('../scripts/capture-temple-3d-visual.mjs', import.meta.url), 'utf8');
  expect(auditScript).toContain('giftBurstDrawCallsIncreased: Number.isFinite(idleStats?.drawCalls)');
  expect(auditScript).toContain('stressStats.drawCalls > idleStats.drawCalls');
  expect(auditScript).toContain('const idleDrawCallsStrictlyIncrease = idleDrawCalls.every(Number.isFinite)');
  expect(auditScript).toContain('maxDrawCallsBudget: 1200');
  expect(auditScript).not.toContain('giftBurstEffectsIncreaseByTier');
  const modelSettledIndex = auditScript.indexOf(
    '() => window.__TEMPLE_BUDDHA_MODEL_SOURCE__ !== undefined'
  );
  const idleSampleCountIndex = auditScript.indexOf(
    'const samplesBeforeIdle = rendererStatsSamples.length;'
  );
  const idleSampleWaitIndex = auditScript.indexOf(
    'samplesBeforeIdle + 1'
  );
  expect(modelSettledIndex).toBeGreaterThanOrEqual(0);
  expect(idleSampleCountIndex).toBeGreaterThan(modelSettledIndex);
  expect(idleSampleWaitIndex).toBeGreaterThan(idleSampleCountIndex);
  expect(auditScript).not.toContain('waitForRendererSample(rendererStatsSamples, 1)');
});

it('widens the MIA gilt-bronze scan without changing its normalized height', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain("if (assetSource === 'mia-cc0-gilt-bronze') {");
  expect(scene).toContain('asset.root.scale.x *= 1.1;');
  expect(scene).toContain('const originalCenter = new THREE.Box3()');
  expect(scene).toContain('const widenedCenter = new THREE.Box3()');
  expect(scene).toContain('asset.root.position.x += originalCenter.x - widenedCenter.x;');
  expect(scene).toContain('asset.root.position.z += originalCenter.z - widenedCenter.z;');
  expect(scene).not.toContain('asset.root.scale.y *= 1.1;');
});

it('uses a restrained aged-gilt PBR finish for the MIA Buddha scan', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  const start = scene.indexOf('function applyGiltFinish(root)');
  const end = scene.indexOf('async function upgradeBuddhaFromGLB()', start);
  const finish = scene.slice(start, end);
  expect(finish).toContain('material.color.setHex(0xc99a3c)');
  expect(finish).toContain("material.metalness = 0.68");
  expect(finish).toContain("material.roughness = 0.42");
  expect(finish).toContain("material.envMapIntensity = 1.15");
  expect(finish).toContain('material.emissiveIntensity = 0.035');
  expect(finish).not.toContain('material.emissiveIntensity = 0.08');
});

it('gives the custom Buddha a fuller seated silhouette and softer facial volume', () => {
  const scene = readFileSync(new URL('../public/js/temple-3d.js', import.meta.url), 'utf8');
  expect(scene).toContain('statue.scale.set(1.16, 1, 1.04)');
  expect(scene).toContain('sphere(0.8, mats.statueStone, 0, 3.72, -0.015, 1.18, 0.72, 0.8, statue);');
  expect(scene).toContain('sphere(0.66,mats.statueStone,0,4.62,0.02,0.98,1.1,0.82,statue);');
  expect(scene).toContain('Soft cheek and chin masses turn the face from a narrow mask into a fuller, calm sculpture.');
  expect(scene).toContain('sphere(0.22, mats.statueStone, 0, 4.32, 0.49, 0.82, 0.58, 0.72, statue);');
});

