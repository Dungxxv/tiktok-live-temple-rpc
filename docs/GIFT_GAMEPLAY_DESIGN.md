# Gift Gameplay Design — Temple Live 9:16

## Current implementation boundary
This document defines the intended interaction rules. The current frontend implementation adds **visual-only** Rocket, Dragon and Donut interruptions when a central devotee is active. Server-side merit, incense totals and leaderboard updates are unchanged. Do not describe the current version as cancelling server rewards or enforcing cooldowns.

## Core rules
- The main temple scene remains one continuous elevated 9:16 camera view. Camera variation begins only when the queued character actually takes ownership, not when the event first arrives.
- Gifts target the active in-scene devotee, never the camera and never a separate viewer shot.
- One active character/action controller owns the central devotee at a time.
- A higher-priority effect may replace a lower-priority visual action. Lower-priority effects must not interrupt a higher-priority one.
- Bound effect queues and discard stale callbacks when a newer effect takes ownership.
- Do not infer gift IDs. TikTok `giftId`, display name and diamond value are now carried into the ritual event; populate an ID mapping only after observing real connector payloads.

## Initial gift action tiers

| Priority | Gift/action | Visual script | Suggested interruption/cooldown |
|---|---|---|---|
| S | Rocket | Rocket crosses the same scene, impact burst; active devotee is knocked to the side and returns | 15–25s |
| A | Dragon / other verified high-tier gift | Large ceremonial creature/wind effect; brief knockback or grand blessing | 10–18s |
| B | Donut / Doughnut | Donut passes through the scene; devotee leaves the incense position to chase it, then returns | 8–12s |
| C | Rose / Heart / Butterfly | Small petals/hearts/butterfly distract the devotee briefly | 4–7s |
| D | Other small gifts | Small prop/bird/flower cue; short pause only | 1–3s |

Durations are design targets, not currently enforced game cooldowns. Do not activate a tier based only on diamond thresholds if the actual gift identity is known.

## Event and identity contract
- Keep the existing WebSocket `temple.event` contract.
- `offerGift` event fields include `giftId`, `giftName`, `giftType`, `coins`, `user`, `uniqueId` and `avatar`.
- `giftId` is forwarded from the TikTok connector without inventing or remapping IDs.
- Initial frontend matching supports display-name aliases `Rocket`, `Tên Lửa`, `Dragon`, `Rồng`, `Donut`, and `Doughnut`; verify exact production gift names/IDs from real LIVE payloads before relying on them.
- Non-matching gifts retain the existing gift visual behavior.

## Character state model
```text
IDLE
  -> APPROACHING_INCENSE
  -> OFFERING_INCENSE
  -> BOWING
  -> RETURNING
  -> IDLE

Any active incense state
  -> INTERRUPTED_BY_GIFT
  -> EFFECT_ANIMATION
  -> COOLDOWN
  -> QUEUED_TO_RETURN
  -> APPROACHING_INCENSE
```

The frontend state model is implemented in a dedicated character controller. Server-side reward/cooldown semantics remain unchanged. It must distinguish:
- the TikTok gift sender (`event.user`)
- the active devotee being interrupted (current central character)
- the queued devotee waiting to enter the ritual

Never assume the gift sender is the character being interrupted.

## Queue and priority policy
1. Rocket (S) supersedes any lower tier. Dragon (A) supersedes Donut (B), but cannot supersede Rocket (S).
2. A higher tier can replace a lower tier; a lower tier cannot replace a higher tier.
3. Equal-tier effects are queued in arrival order rather than stacked on the same character.
4. Only one effect may animate the central character at a time.
5. An interrupted incense ritual reuses its locked camera preset when the same devotee resumes; a completed new ritual may select a fresh preset.
6. Gift effects never change camera position, camera identity, stage size or 9:16 stage bounds.

## Character controller implementation
- A single state machine owns the central character. New incense, prayer, bell, fortune and gift visits queue instead of replacing the active character.
- Current phases: `IDLE` → `APPROACHING` → `OFFERING` → `BOWING`; interruption enters `INTERRUPTED` → `COOLDOWN` before the active devotee is resumed.
- An interruption puts the interrupted devotee at the front of the character queue. Priority is Rocket > Dragon/Rồng > Donut/Doughnut; stronger effects supersede weaker active effects and weaker effects wait in a priority-sorted queue.
- Character queue is bounded to 40 entries; excess new visits are rejected from the visual queue only. If an active devotee is interrupted while the queue is full, the newest queued visual request is evicted so the interrupted devotee can resume first. Server-side event, merit and leaderboard accounting remain untouched.
- Ring-bell and fortune actions are serialized through the same character owner. Fortune receives a longer visual slot to allow its narration/modal sequence.
- The camera and fixed HUD are independent: the shared scene rig moves together, while top/bottom HUD, ceremony banner and fortune modal remain pinned to the 9:16 stage.

## Implementation status
- [x] Forward TikTok giftId into `offerGift` event for later verified mapping.
- [x] Add visual-only Rocket, Dragon and Donut interruptions during active incense.
- [x] Preserve the single-camera composition; gift effects do not change camera.
- [ ] Verify actual Rocket/Dragon/Donut gift IDs and display names from real connector events.
- [x] Implement a dedicated character state machine with one active devotee, FIFO queue (max 40), and priority-sorted interruption effects.
- [ ] Decide server-side reward/cooldown behavior explicitly before changing merit accounting.
- [x] Add deterministic tests for FIFO ownership, interruption/requeue, Rocket-over-Donut priority, effect queue and bounded capacity.
- [ ] Validate all effects in the browser at 1080x1920 and measure FPS.

## Safety and compatibility
- No paid assets or external models are required; use procedural or emoji/DOM effects until free licensed models are verified.
- Keep the original 2D ritual flow as fallback.
- Do not change existing RPC method names or server reward semantics as part of a visual-only release.


## Audio and impact VFX implementation update — 2026-11-01
- Rocket now has synthesized launch/flight audio and a synthesized low-frequency explosion impact.
- Rocket impact visual now includes an expanding ring shockwave and outward sparks, in addition to the existing 💥 impact cue and devotee knockback.
- Dragon has a synthesized wind/flight whoosh; Donut has a short playful three-note chime.
- Sound is routed through the shared TempleAudioEngine and remains subject to its SFX enabled guard and browser audio unlock.
- These sounds are procedural prototypes. They still need listening/mix validation; they are not final recorded sound assets.
- Remaining VFX polish: rocket flame/smoke trail, impact flash and debris/smoke layering; replace emoji placeholders with consistent game art; refine Dragon and Donut animations.
- External capture software is not part of game acceptance or completion criteria.


## Expanded gift and audio behavior — 2026-11-01
- Rose/hoa hồng is now a low-priority visual action: rose bloom, drifting petals and a soft chime. The display-name match is a provisional alias; confirm the exact LIVE gift name before numeric ID mapping.
- Rocket includes an exhaust trail, flash, shockwave, smoke, debris and sparks. Impact is placed at the rocket's end position in the game stage.
- SFX now has a persisted master toggle and independent volume control, separate from background music and TTS.
- TikTok combo metadata is forwarded into the browser event. Streakable frames sharing one group are coalesced into one cinematic with small combo pulses; real-room validation is pending.


- Dragon now layers a low synthesized roar and an expanding impact ring into the existing fly-through/wind knockback. The delayed impact checks the active effect token so superseded Dragon callbacks do not fire.
