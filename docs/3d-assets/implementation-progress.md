# 3D Sanctuary Implementation Progress

Updated: 2026-11-01

## Implemented on `main`

- `7a28894` — courtyard tile field now uses two `THREE.InstancedMesh` batches instead of hundreds of individual tile meshes. This is a draw-call reduction only; actual frame-rate impact still needs browser profiling.
- `3a6f2cc` — replaced the flat eave strips with two curved roof surfaces, raised corner profiles, low-count longitudinal tile seams, a ridge cap and end finials. Procedural geometry only; it is not a scanned or authored temple asset.
- `07621a3` — shortened the roof surface to the rear half and moved the ridge cap so the fixed +Z camera has an open sightline into the main hall. This is a camera-occlusion precaution; visual confirmation is still pending.
- `71bcdb9` — moved roof boundary constants into the outer scope so ridge/finial construction can reference them safely.
- `99b07f3` — added a separate foreground offering table with bronze incense vessel and sticks, paired lotus vases, fruit offerings and butter-lamp flames. Procedural meshes; no external assets.
- `0cb53cb` — added two soft altar spotlights, a warm fill light, and subtle animated candle/altar glow. Spotlights do not cast shadows to avoid extra mobile GPU shadow passes.
- `8381713` — added 3D world-space gift reactions: rocket projectile and explosion sparks, flying green dragon/gust, spinning donut with ring trail, and rising rose bloom/petals. Existing 2D gift effects and audio remain intact; no camera movement is added.
- `f05d61c`–`2bb7c0f` — corrected the idle-altar gift path: a gift now owns the state-machine effect lifecycle even when no devotee is active, and a dedicated `temple:gift-action` event drives the 3D reaction exactly once when each effect starts (including queued effects). The character-interruption event remains reserved for actual devotee interruptions.
- `4a69b83` — recorded a 10th-century Thai seated Buddha scan listed as CC0 in the Artheon collection as a candidate only; its individual record, file and visual suitability remain to be checked.
- `7a28894` — added a rear altar screen with red lacquer panels, gold framing, lattice relief and a central medallion to give the Buddha focal plane more depth.
- `4a077fe` — expanded the asset inventory with an East Asian ceremonial hall candidate pack and Buddhist sculpture scan collection. Both remain candidates, not integrated runtime assets.
- `d309611` — added CI source guards for the instanced courtyard and altar screen.
- `3ccaefa` — added CI source guards for the curved roof geometry.
- `8867574` — added CI source guards for the open near-side roof/camera sightline.
- `5c2153b` — added a CI scope-order guard for roof boundary constants before ridge construction.
- `eafcd62` — added CI source guards for the offering table, incense vessel and lotus vases.
- `606039c` — added CI source guards for altar spotlights and candle flicker.
- `99c7feb` — added CI source guards for all four 3D gift actions and the interruption-event bridge.

## Human devotee and stone Buddha update

- `5898435` — replaced the temporary Corgi/Duck congregation with locally constructed stylized human avatars: long brown hair, pink top, blue trousers, white shoes, facial features and simple idle/walk limb motion. The lead visitor uses the same art direction.
- `5898435` — replaced the gold primitive Buddha blockout with a seated grey-stone figure, robe folds, elongated ears, curled hair, facial carving, meditation hands and a stone aureole with restrained gold trim.
- `5898435` — removed full-width crossbeams and the low ceiling slab from the central view corridor. These structures were projecting as opaque horizontal bars across the statue and altar in the supplied screenshot. Side supports and upper roof details remain.
- `a1bc291` — updated CI source guards and JavaScript syntax checks for the new human avatar, stone statue and clear central sightline.
- `53534d0`, `30e0593`, `10559e5`, `d103679` — marked the animal prototype as retired and removed the Corgi/Duck public assets. They remain in Git history only.
- `d103679` — GitHub Actions CI completed successfully: [workflow run](https://github.com/aigrouphobinh/tiktok-live-temple-rpc/actions/runs/41267333750).
- The human avatars and Buddha are currently procedural Three.js geometry, not imported GLB assets. They are a functional art-direction replacement, not yet a final high-detail character/sculpture asset.

## Preserved requirements

- Three.js remains opt-in via `?3d=1`; 2D remains the fallback.
- Existing camera position and fixed elevated main-hall composition are unchanged.
- The separate camera director still selects one subtle preset at ritual start and returns to the master view; gifts do not direct the camera.
- Gift priority, coalescing, and the bounded effect queue remain intact. The 3D scene listens to the dedicated `temple:gift-action` lifecycle event; camera/character interruption remains separate and is emitted only when a devotee was actually active.

## Not yet verified

- Corgi and Duck are bundled locally; external asset-host availability is no longer a runtime dependency.
- No actual browser screenshot or WebGL visual inspection has been performed for the new human avatar, stone Buddha or horizontal-band fix; the user must reload the local scene and provide a fresh screenshot for visual tuning.
- No mobile GPU/frame-time/draw-call profile has been recorded.
- No real TikTok LIVE payload test has been performed.
- The GitHub workflow wrapper available here only returns PR-triggered runs for a commit; it returned an empty list for the push commit. Check the repository Actions page for the push-triggered CI result.

## Next work

1. Visually inspect the new human avatar, stone Buddha and clear central sightline from the fixed elevated camera; tune scale and placement from a fresh screenshot.
2. Research higher-detail, correctly licensed GLB assets for the female devotee and seated Buddha; integrate only after pose, license, scale and texture checks.
3. Improve procedural facial details, robe folds, hands and avatar animation if no suitable licensed assets are selected.
4. Inspect Corgi and Duck in the actual fixed 9:16 browser camera; tune their scale, spacing and animation transitions, verify the local GLBs in the actual fixed 9:16 browser camera and tune their scale, spacing and animation transitions.
5. Add asset loading failure handling and performance budgets, then perform actual browser/device validation.
6. Verify 3D gift reaction timing and composition in-browser alongside the existing CSS effects; tune depth/scale only after visual inspection.
7. Test rocket, dragon, donut and rose payloads both with an active devotee and with an empty altar; confirm one 3D reaction per started effect and no camera movement.
