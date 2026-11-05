# Camera Direction Specification — Temple Live 9:16

## Visual reference
Use the existing 9:16 demo frame as the composition reference:
https://github.com/zane-tv/tiktok-live-temple-rpc/blob/main/docs/demo/demo-obs-9x16.png

## Non-negotiable camera rules
1. Keep one continuous virtual camera for the entire live scene.
2. The default/master view is the existing elevated view looking down into the main temple hall. The Buddha altar, central incense burner, carpet and congregation remain part of the same 9:16 composition.
3. Never cut/switch between separate cameras, character cameras, close-up feeds or per-viewer shots.
4. Never automatically reframe to whichever viewer sent a gift. A gift targets the in-scene character/action only; it must not change camera ownership or jump the frame to another person.
5. Preserve the 1080x1920 logical stage, 9:16 aspect ratio and existing stage scaling. No layout resize, portrait crop drift, black bars or off-stage camera movement.
6. Camera motion must be restrained and deterministic. No rapid cuts, shaking that loses the composition, large zooms, or rotation that makes the temple layout hard to recognize.

## Incense interaction camera behavior
- Keep the elevated temple overview as the permanent camera identity.
- When an incense ritual begins, choose **one** subtle, pre-approved angle variation at random (a small pan/tilt/orbit or framing offset within the same elevated viewpoint).
- Choose once at ritual start; lock that preset for the whole active ritual. Do not reroll every frame, every animation tick, every incoming viewer, or every gift.
- Variations are composition-safe: keep the altar and incense area visible, keep the active devotee in the established central action area, and keep the 9:16 stage boundaries fixed.
- After the ritual ends or is interrupted, ease back to the master elevated overview. Do not hard-cut.
- If multiple devotees are active/queued, camera remains on the same master view/preset. Character activity can animate within the scene, but camera must not chase/switch between them.
- Gift actions (Rocket, Donut, etc.) animate the target character and props inside the existing scene. They do not create a new camera or trigger a camera cut. Any camera response to a powerful gift is limited to a very brief, low-amplitude impact cue that preserves the full composition; default is no camera shake.

## Suggested safe preset policy
- Master: elevated centered temple overview.
- Variation A: same elevated viewpoint, tiny horizontal framing offset.
- Variation B: same elevated viewpoint, tiny vertical framing offset.
- Variation C: same elevated viewpoint, very small orbit/tilt variation.
These are variations of one camera, not separate camera shots. Exact amplitudes must be validated against the OBS reference and 9:16 safe area before implementation.

## Implementation constraints
- Use one camera instance and one camera controller/state machine.
- Camera states: `MASTER` -> `RITUAL_VARIATION_LOCKED` -> `RETURN_TO_MASTER`.
- Random selection happens only on the transition into `RITUAL_VARIATION_LOCKED`; ignore repeated start events while the same ritual is active.
- Camera transitions must be eased and cancellable. On interruption, return smoothly to master; do not let delayed callbacks from an old ritual override a newer state.
- Keep camera logic separate from character/gift action logic. Character state changes must never directly instantiate or select another camera.
- Default to the original static camera if the 3D feature flag is off, Three.js fails, WebGL is lost, or camera code errors.
- Do not alter server/RPC contracts just to animate the camera.

## Acceptance checks
- [ ] One continuous elevated temple view; no camera cuts.
- [ ] Incense start selects at most one random safe variation and locks it for the ritual.
- [ ] Multiple incoming viewers/gifts do not cause camera switching or repeated randomization.
- [ ] All characters and gift effects remain within the same 9:16 composition.
- [ ] Altar and incense area remain visible throughout.
- [ ] Ritual completion/interruption smoothly restores the master view.
- [ ] The in-game 1080x1920 stage remains 9:16 with no layout drift.
- [ ] With 3D disabled or unavailable, the original static view is unchanged.

## Runtime camera ownership integration
- The controller listens to `temple:character-start`, not raw `temple:ritual`, so queued incense requests cannot move the camera before the devotee starts.
- `temple:character-interrupted` returns to the master overview but retains the chosen preset; resuming the interrupted devotee reuses that same preset.
- `temple:character-complete` returns to master and clears the preset, allowing a fresh random choice for the next completed incense ritual.
- Fixed top/bottom HUD, grand-ceremony banner and fortune modal remain outside the scene rig.
