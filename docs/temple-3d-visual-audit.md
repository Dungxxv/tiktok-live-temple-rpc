# Temple 3D visual audit

The `Temple 3D visual audit` GitHub Actions workflow captures the 9:16 OBS scene in headless Chromium so visual changes can be reviewed without depending on a developer's local server.

## Run

The workflow runs when relevant `public/**` files change, on pull requests targeting `main`, or manually from GitHub Actions after this workflow has been merged to the default branch.

It starts the application server on the Actions runner and opens:

```text
/?obs=1&3d=1
```

The capture viewport is exactly `1080 × 1920`. Playwright waits for `window.__TEMPLE_3D_READY__ === true`, verifies that the canvas is visible and that the WebGL context is not lost, then captures the portrait stage and full viewport.

## Artifacts

Each run uploads `temple-3d-visual-audit` for seven days:

- `temple-3d-portrait.png` — clean 9:16 OBS stage.
- `temple-3d-full-page.png` — full viewport capture.
- `temple-3d-visual-report.json` — readiness, viewport, WebGL, console errors, and failed network requests.
- `temple-server.log` — server startup diagnostics.

## Isolated server mode

The workflow sets two optional environment variables:

- `DISABLE_TIKTOK_AUTOCONNECT=1` prevents the test server from connecting to the default TikTok room.
- `DISABLE_ZEROTTS_WORKER=1` skips the optional Python speech worker.

Both features retain their normal startup behavior when these variables are not set. The flags keep the visual audit isolated from external services and Python model dependencies.

## What this verifies

- The application server serves the real page and assets.
- The 3D scene reaches its ready state.
- WebGL 2.0 is available and the scene canvas is visible at the expected dimensions.
- The browser reports console errors and failed requests in the downloadable report.

This is a software-rendered Chromium smoke test. It does not validate physical GPU drivers, OBS Browser Source behavior on a production machine, audio/TTS quality, TikTok connectivity, or the visual quality of every frame on all devices. Review the screenshot artifact before changing camera framing, model placement, or architectural coordinates.
