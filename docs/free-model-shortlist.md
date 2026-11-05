# User-selected 3D assets — approved targets (2026-11-01)

The user explicitly selected these two Sketchfab models. Treat these as the preferred targets over the earlier researched candidates; do not silently substitute another asset.

## Buddha statue — selected
- Sketchfab: https://sketchfab.com/3d-models/tam-the-phat-do-go-thanh-anh-93ccd334332a40218bdc3a2e6e849966
- Model UID: `93ccd334332a40218bdc3a2e6e849966`
- Search index identifies the title as **Tam The Phat - Do Go Thanh Anh**.
- License, downloadable status, file format, textures, scale and polygon count: **not yet verified**. Sketchfab model page currently blocks automated page inspection (HTTP 403); do not infer that the model is free or redistributable.
- Intended integration: replace only the procedural seated Buddha; preserve the altar, custom aureole unless model includes a better one, ritual gift effects, and fixed elevated camera.

## Human character — selected
- Sketchfab: https://sketchfab.com/3d-models/girl-82f0a2eff77b47448402f40264b82055
- Model UID: `82f0a2eff77b47448402f40264b82055`
- Title supplied by user: **Girl**.
- Creator, license, downloadable status, file format, textures, rig and animation clips: **not yet verified**. Sketchfab model page currently blocks automated page inspection (HTTP 403); do not infer that the model is free or redistributable.
- Intended integration: replace procedural human devotee after verifying rig/animations; preserve the bow-from-waist animation and crowd/gift action state machine.

## Required asset handoff and acceptance checks
1. Download each model through its official Sketchfab **Download 3D Model** action if the creator enables it, and provide the downloaded GLB/glTF package (including textures if separate). If the Download action is unavailable, ask the creator for permission/a source file; do not rip the viewer or bypass access controls.
2. Confirm the license and attribution requirements on each model's page before bundling it in the public game repository.
3. Inspect GLB scene graph, units, forward axis, bounding box, materials/textures, triangle count, skeleton and animation clips.
4. Normalize model scale/orientation in a wrapper group; never change the master camera to compensate.
5. Add a graceful fallback if model loading fails; keep 2D mode and existing procedural fallback operational.
6. Test bow-from-waist, idle, walking/approach, prayer, leave, and all gift actions with the replacement character; test statue lighting and halo occlusion.
7. Commit actual binary assets only after provenance/license review and local GLTFLoader validation. Do not claim integration from documentation-only changes.

---

This file records researched candidates only. A model is not considered integrated until its exact downloaded file, license/provenance, dimensions, materials, rig and runtime rendering have been checked.

## Buddha statue — first choice

**10th C CE Thai Seated Buddha — Minneapolis Institute of Art**
- Source page: https://sketchfab.com/3d-models/10th-c-ce-thai-seated-buddha-black-background-31857e30bf9249f788aed2dfe5eb6673
- Download mirror: https://zenodo.org/records/10242851
- Exact GLB: https://zenodo.org/records/10242851/files/31857e30bf9249f788aed2dfe5eb6673.glb?download=1
- License: CC0 / public domain.
- Reported size: 4.8 MB; about 64k triangles.
- Why: a real seated Thai Buddha scan, rather than a primitive procedural figure. Rebuild/override the bronze material as matte light-grey stone to match the approved reference; retain a separate custom carved aureole behind it.
- Integration checks: inspect orientation and origin, remove/ignore baked black background if present, normalize height, recalculate normals if needed, verify texture/material transparency, optimize mesh and confirm the GLB works with Three.js GLTFLoader.

## Better visual-match alternatives to inspect

**Seated bodhisattva Guanyin, 12th C CE — Minneapolis Institute of Art**
- Discovery page: https://www.artheonmuseum.org/artwork/seated-bodhisattva-guanyin-12th-c-ce-2c8658
- Listed as a CC0 museum 3D scan.
- This is a seated bodhisattva and may be a closer silhouette match to the supplied seated statue reference than the bronze Thai Buddha. Inspect the actual GLB and hand/mudra before choosing; do not assume it depicts Shakyamuni Buddha.
- Candidate only: Artheon is a discovery/index page, not the asset's original host.

**White marble bodhisattva, 6th C CE — Minneapolis Institute of Art**
- Discovery page: https://www.artheonmuseum.org/artwork/white-marble-bodhisattva-6th-c-ce-345b66
- Listed as a CC0 museum 3D scan.
- Strong material/color reference for the supplied grey-white stone statue, but verify whether the full figure is standing or seated before using it.

## Human devotee — closest visual candidate

**Stylized Cute Girl Character — Asim-ali**
- Source: https://sketchfab.com/3d-models/stylized-cute-girl-character-low-poly-ready-cf4e14b0a6ae434eb143bdd72b742986
- Reported: rigged, expressive large eyes, modern outfit, ~11.6k triangles; FBX and GLB/glTF formats listed.
- License: Creative Commons Attribution (CC BY); attribution must be included in the project credits.
- Why: closest researched match to the supplied cute human-avatar reference. Inspect the downloadable GLB and animation/rig compatibility before replacing the current procedural stand-in.

**Animated Woman — Quaternius / Poly Pizza**
- Discovery mirror: https://kivloft.com/files/poly-pizza-niitlv9nxs
- Original Poly Pizza model: https://poly.pizza/m/nIItLV9nxS
- Reported: GLB, about 350 KB, 3,282 triangles, animated.
- License: CC0 1.0; mirror says the original attribution is optional, but preserve the supplied license metadata with the downloaded file.
- Why: small, game-ready fallback for the current low-poly crowd; compare its actual silhouette and clothing to the supplied pink-top/blue-jeans reference before adopting.

**Do not bundle the ManNeko Low Poly Girl as a default choice**
- Its page advertises commercial use but prohibits resale/redistribution of the raw model. Since this game bundles assets to players, that restriction needs separate legal review and is less suitable than CC0.

## Additional verified public candidates (research only; do not auto-substitute)

**10th C CE Thai Seated Buddha — Minneapolis Institute of Art / artsmia**
- Original model listing: https://sketchfab.com/3d-models/10th-c-ce-thai-seated-buddha-black-background-31857e30bf9249f788aed2dfe5eb6673
- Archival GLB: https://zenodo.org/records/10242851
- Sketchfab listing states CC0 Public Domain; Zenodo archives the matching GLB at about 4.8 MB.
- About 64k triangles. It is a bronze Thai Buddha scan, not the user's selected wood-carved Buddha; keep as an alternate only unless the user approves a visual substitution.
- The binary could not be fetched into this runtime, so polygon topology, embedded textures, scale, orientation and actual rendering remain uninspected.

**Female-character, Woman, Girl — Quaternius_CC0 on Pixabay**
- Official listing: https://pixabay.com/3d-models/female-character-woman-girl-human-809/
- Listing states Pixabay Content License, GLB format, textures and animations, 2,642 vertices, published June 1, 2025.
- Potential crowd/stand-in candidate only. Its actual skeleton and clip names must be inspected before mapping it to the existing bow/walk state machine.

## Lightweight fallback

**Female-character / Woman / Girl — Quaternius_CC0 on Pixabay**
- Source: https://pixabay.com/3d-models/female-character-woman-girl-human-809/
- Reported: GLB, textured, animated, 2,642 vertices; Pixabay Content License.
- Why: lightweight and animated, but its blockier low-poly style is less close to the supplied avatar reference. Keep as a fallback only.

## UI direction from the 2026-11-01 screenshot

- Keep the 9:16 portrait stage and fixed elevated main-hall camera.
- Shrink the footer HUD so the sanctuary remains the hero; simplify borders, shadows and ornamental pseudo-elements.
- Keep the live status pill compact and the supporter leaderboard readable.
- Do not hide gift actions or change TikTok event wiring.
- Do not alter the default 2D mode when styling the optional 3D mode.

## 2026-11-01 implementation notes
- Main branch includes a compact 3D-only livestream HUD refresh.
- Roof footprint was narrowed to 7.8 units per side and moved rearward; tile seams now use the same center/half-length curve as the roof surface.
- The original 2D view and fixed elevated sanctuary camera remain unchanged.
- Model files have not yet been vendored for the statue or humanoid. Do not describe either as integrated until a binary GLB has been downloaded, inspected and committed.
