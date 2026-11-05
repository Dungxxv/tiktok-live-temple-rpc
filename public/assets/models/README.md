# Optional 3D model assets

The 3D scene keeps its procedural statue and character as reliable local fallbacks.
Do not add a model to this directory until its exact file, creator, license and any
attribution terms have been checked.

## Buddha statue

Preferred model (user-selected): **Gold Buddha Statue — Kenny Hsieh**
- https://sketchfab.com/3d-models/gold-buddha-statue-641d85153dd849d3b33bb69bd3ff6748
- Model UID: `641d85153dd849d3b33bb69bd3ff6748`
- Published license: **CC BY**; retain attribution to Kenny Hsieh and link to the Sketchfab model wherever the asset is distributed or shown.
- Expected file: `buddha-selected.glb`; the loader tries this file first.

Bundled public fallback: **Seated Buddha, date unknown — Minneapolis Institute of Art**
- Original record: https://zenodo.org/records/10337923 (DOI: `10.5281/zenodo.10337923`)
- Source model: https://sketchfab.com/3d-models/seated-buddha-date-unknown-c1c3d5a4878c42778eceded83673dea7
- The exact Artheon artwork record lists this individual scan as **CC0 (Public Domain)**: https://www.artheonmuseum.org/artwork/seated-buddha-date-unknown-c1c3d5. The Artheon Buddhist & Hindu catalogue also lists it as CC0. The Zenodo record identifies the object as a gilt-bronze Seated Buddha in the Minneapolis Institute of Art collection and hosts the binary, but its own Rights field does not state the license.
- Downloaded file: `buddha-cc0-fallback.glb` (5.5 MB); MD5 `a00f6c35ae853c830faff61404265c5c`.
- The fallback is only used when `buddha-selected.glb` is absent or fails to load. Keep the original collection/source credit with the asset.

The GitHub Actions workflow `.github/workflows/fetch-buddha-cc0-fallback.yml` downloads this public GLB, verifies the published MD5, inspects the glTF structure and commits the binary to the feature branch. Do not use viewer extraction or third-party rippers for the preferred Kenny Hsieh model.

The character GLB is expected at `devotee-selected.glb`; the loader normalizes it to 1.72 world units and clones the rig for every devotee. Animation clips are detected by names containing idle/stand/breath, walk/run/approach and bow/pray/worship/kneel. The procedural character remains visible if loading fails or `models=1` is omitted.

The optional loader normalizes the statue to approximately 5.88 world units high,
centers it on X/Z and grounds it at local Y=0. The statue wrapper remains at the
existing altar transform. To preview the optional bundled model, open the 3D
scene with `?3d=1&buddha=1` to preview just the Buddha, or
`?3d=1&models=1` to load both the Buddha and optional devotee rigs. The loader
tries `buddha-selected.glb` first, then `buddha-cc0-fallback.glb`; the
procedural statue remains active if neither file loads or both flags are omitted.

## Human devotee

Once the selected Sketchfab girl model is downloaded through its official
Download 3D Model action (or supplied by its creator) and have its license and
rig/animation clips inspected before it is added. Do not place it here as a
default model until the bow-from-waist and approach animations have been mapped
to the existing devotee state machine.

Selected source (license, downloadable status and rig still need confirmation):
- https://sketchfab.com/3d-models/girl-82f0a2eff77b47448402f40264b82055
- Model UID: `82f0a2eff77b47448402f40264b82055`

## Inspecting a GLB before integration

Run:

```bash
bun run inspect:glb -- public/assets/models/buddha-selected.glb
```

The inspector reports the GLB version, mesh/primitive counts, triangle estimate,
materials, skins, animations, node names and any external buffer/image references.
For reproducible runtime loading, prefer a self-contained GLB with embedded images.
