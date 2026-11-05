/**
 * Single-camera director for the 9:16 temple scene.
 * Runs only after the optional Three.js layer reports that WebGL is ready.
 * It transforms one shared scene wrapper; it never cuts or follows a viewer.
 */
const enabled = new URLSearchParams(location.search).get('3d') === '1';
const stage = document.getElementById('stage9x16');

if (enabled && stage) {
  let rig = stage.querySelector(':scope > .temple-camera-rig');
  if (!rig) {
    // Keep UI overlays pinned to the 1080x1920 output; only the temple scene
    // layers move together beneath them.
    const fixedSelectors = '.minimal-top-bar, .bottom-hud-bar, #grandCeremonyBanner, #fortuneModal';
    const fixedNodes = Array.from(stage.children).filter((node) => node.matches(fixedSelectors));
    fixedNodes.forEach((node) => node.remove());

    rig = document.createElement('div');
    rig.className = 'temple-camera-rig';
    while (stage.firstChild) rig.appendChild(stage.firstChild);
    stage.appendChild(rig);
    fixedNodes.forEach((node) => stage.appendChild(node));
  }

  const presets = [
    { x: -3, y: 2, scale: 1.012, tiltX: 0.07, tiltY: -0.08 },
    { x: 3, y: -2, scale: 1.012, tiltX: -0.06, tiltY: 0.08 },
    { x: 0, y: 3, scale: 1.01, tiltX: 0.08, tiltY: 0.02 }
  ];
  const MASTER = 'translate3d(0, 0, 0) scale(1) rotateX(0deg) rotateY(0deg)';
  const RITUAL_HOLD_MS = 7800;
  let webglReady = false;
  let active = false;
  let returnTimer = 0;
  let currentPreset = null;
  let pendingIncense = false;

  function apply(transform, duration = 1100) {
    rig.style.transition = `transform ${duration}ms cubic-bezier(0.22, 0.75, 0.25, 1)`;
    rig.style.transform = transform;
  }

  function transformFor(preset) {
    return `translate3d(${preset.x}px, ${preset.y}px, 0) scale(${preset.scale}) rotateX(${preset.tiltX}deg) rotateY(${preset.tiltY}deg)`;
  }

  function returnToMaster(clearPreset = false) {
    clearTimeout(returnTimer);
    if (!active && !currentPreset) return;
    active = false;
    if (clearPreset) currentPreset = null;
    apply(MASTER, 1250);
  }

  function startOrExtendRitual() {
    if (!webglReady) {
      pendingIncense = true;
      return;
    }
    pendingIncense = false;
    if (!active) {
      active = true;
      if (!currentPreset) currentPreset = presets[Math.floor(Math.random() * presets.length)];
      apply(transformFor(currentPreset), 1250);
    }
    // Further devotees extend the same shot; they never select another angle.
    clearTimeout(returnTimer);
    returnTimer = window.setTimeout(() => returnToMaster(true), RITUAL_HOLD_MS);
  }

  window.addEventListener('temple:3d-ready', () => {
    webglReady = true;
    if (pendingIncense) startOrExtendRitual();
  }, { once: true });

  window.addEventListener('temple:3d-unavailable', () => {
    webglReady = false;
    pendingIncense = false;
    clearTimeout(returnTimer);
    active = false;
    currentPreset = null;
    rig.style.transition = 'none';
    rig.style.transform = MASTER;
  });

  window.addEventListener('temple:character-start', (event) => {
    if (event.detail?.type === 'burnIncense') startOrExtendRitual();
  });

  window.addEventListener('temple:character-interrupted', (event) => {
    if (event.detail?.event?.type === 'burnIncense') {
      pendingIncense = false;
      returnToMaster(false);
    }
  });

  window.addEventListener('temple:character-complete', (event) => {
    if (event.detail?.type === 'burnIncense') {
      pendingIncense = false;
      returnToMaster(true);
    }
  });

  window.addEventListener('pagehide', () => {
    clearTimeout(returnTimer);
  }, { once: true });

  // A module may finish booting before this listener is installed.
  if (window.__TEMPLE_3D_READY__ === true) {
    webglReady = true;
  }
}
