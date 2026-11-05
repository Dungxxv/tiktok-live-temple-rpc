import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const artifactDir = 'artifacts';
const viewport = { width: 1080, height: 1920 };
const deviceScaleFactor = 2;
const scenarios = [
  { id: 'low', deviceMemory: 2, hardwareConcurrency: 8, expectedPixelRatio: 1 },
  { id: 'medium', deviceMemory: 6, hardwareConcurrency: 8, expectedPixelRatio: 1.15 },
  { id: 'high', deviceMemory: 8, hardwareConcurrency: 8, expectedPixelRatio: 1.25 }
];

/**
 * Wait for a fresh renderer diagnostic instead of assuming a fixed delay
 * produced another frame. Lower-end software-rendered profiles can take
 * longer to emit a sample while the browser is busy rendering the scene.
 */
async function waitForRendererSample(samples, targetCount, timeoutMs = 15000) {
  const startedAt = Date.now();
  while (samples.length < targetCount && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return samples.length >= targetCount ? samples[samples.length - 1] : null;
}

await mkdir(artifactDir, { recursive: true });

const report = {
  url: 'http://127.0.0.1:3000/?obs=1&3d=1&stats=1',
  capturedAt: new Date().toISOString(),
  viewport,
  deviceScaleFactor,
  ready: false,
  sceneCanvasVisible: false,
  webgl: null,
  stage: null,
  sceneCanvas: null,
  consoleErrors: [],
  failedRequests: [],
  note: 'Browser capability hints are overridden for deterministic profile coverage. This is a Chromium/SwiftShader visual and configuration audit, not a physical-GPU benchmark. Shadow-map size is reported from the selected render profile; it is not read back from a GPU allocation.',
  profiles: [],
  summary: {
    passed: false,
    allProfilesPassed: false,
    drawCallsStrictlyIncrease: false
  }
};

let browser;

try {
  browser = await chromium.launch({
    headless: true,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader'
    ]
  });

  for (const scenario of scenarios) {
    const errors = [];
    const failedRequests = [];
    const httpErrors = [];
    let page;
    const rendererStatsSamples = [];

    const profileReport = {
      id: scenario.id,
      requestedHints: {
        deviceMemory: scenario.deviceMemory,
        hardwareConcurrency: scenario.hardwareConcurrency
      },
      expectedPixelRatio: scenario.expectedPixelRatio,
      expectedShadowMapSize: scenario.id === 'low' ? 512 : 1024,
      expectedEnvironmentDetail: scenario.id,
      ready: false,
      sceneCanvasVisible: false,
      browserHints: null,
      renderProfile: null,
      stage: null,
      canvas: null,
      framebufferScale: null,
      webgl: null,
      rendererStats: null,
      consoleErrors: errors,
      failedRequests,
      httpErrors,
      checks: {}
    };

    try {
      page = await browser.newPage({ viewport, deviceScaleFactor });
      await page.addInitScript((hints) => {
        Object.defineProperty(navigator, 'deviceMemory', {
          configurable: true,
          get: () => hints.deviceMemory
        });
        Object.defineProperty(navigator, 'hardwareConcurrency', {
          configurable: true,
          get: () => hints.hardwareConcurrency
        });
      }, {
        deviceMemory: scenario.deviceMemory,
        hardwareConcurrency: scenario.hardwareConcurrency
      });

      page.on('console', async (message) => {
        if (message.type() === 'error') {
          const text = message.text();
          // Missing optional browser icons are reported as generic 404 console
          // errors. Track their URLs at the response layer; JS and WebGL errors
          // remain hard failures.
          if (!text.includes('Failed to load resource: the server responded with a status of 404 (Not Found)')) {
            errors.push(text);
          }
        }
        if (message.text().includes('[Temple3D] GPU frame stats')) {
          try {
            const args = message.args();
            const payload = await args[1]?.jsonValue();
            if (payload && typeof payload === 'object') {
              rendererStatsSamples.push({
                capturedAt: new Date().toISOString(),
                ...payload
              });
            }
          } catch (error) {
            errors.push(`Unable to read renderer stats: ${error.message}`);
          }
        }
      });
      page.on('pageerror', (error) => errors.push(error.stack || error.message));
      page.on('response', (response) => {
        if (response.status() >= 400) {
          httpErrors.push({
            url: response.url(),
            status: response.status(),
            statusText: response.statusText()
          });
        }
      });
      page.on('requestfailed', (request) => {
        const error = request.failure()?.errorText || 'request failed';
        let pathname = '';
        try { pathname = new URL(request.url()).pathname; } catch {}
        const isExpectedOptionalModelHeadProbe = request.method() === 'HEAD'
          && error === 'net::ERR_ABORTED'
          && [
            '/assets/models/buddha-selected.glb',
              '/assets/models/buddha-cc0-fallback.glb',
            '/assets/models/buddha-cc0-fallback.glb'
          ].includes(pathname);
        if (!isExpectedOptionalModelHeadProbe) {
          failedRequests.push({ url: request.url(), error });
        }
      });

      const profileUrl = new URL(report.url);
      profileUrl.searchParams.set('profileAudit', scenario.id);
      await page.goto(profileUrl.toString(), {
        waitUntil: 'domcontentloaded',
        timeout: 45000
      });

      try {
        await page.waitForFunction(
          () => window.__TEMPLE_3D_READY__ === true,
          null,
          { timeout: 60000 }
        );
        profileReport.ready = true;
      } catch (error) {
        profileReport.readinessError = error.message;
      }

      // Require the external Buddha GLB to finish loading before the visual capture.
      try {
        await page.waitForFunction(
          () => window.__TEMPLE_BUDDHA_MODEL_SOURCE__ !== undefined
            && window.__TEMPLE_BUDDHA_MODEL_SOURCE__ !== 'loading',
          null,
          { timeout: 30000 }
        );
      } catch (error) {
        profileReport.modelLoadError = error.message;
      }

      // The renderer may emit an initial sample while the procedural statue is
      // still visible. Start the idle baseline only from a fresh sample after
      // the optional GLB has reached its settled source state.
      const samplesBeforeIdle = rendererStatsSamples.length;
      const idleStats = await waitForRendererSample(
        rendererStatsSamples,
        samplesBeforeIdle + 1
      );
      const samplesBeforeGiftBurst = rendererStatsSamples.length;

      // Sustain the gift burst until a *new* renderer diagnostic is observed.
      // This avoids reusing the idle sample when a low-detail frame takes longer.
      await page.evaluate(() => {
        const actions = ['rocket', 'dragon', 'donut', 'rose'];
        let index = 0;
        const dispatch = () => {
          const action = actions[index % actions.length];
          index += 1;
          window.dispatchEvent(new CustomEvent('temple:gift-action', {
            detail: {
              action,
              reactionProfile: {
                tier: 'special',
                intensity: 0.9,
                bowAmount: 0.8,
                durationMs: 1800
              }
            }
          }));
        };
        dispatch();
        const timer = window.setInterval(dispatch, 600);
        window.__TEMPLE_AUDIT_STOP_GIFTS__ = () => window.clearInterval(timer);
      });
      const stressStats = await waitForRendererSample(
        rendererStatsSamples,
        samplesBeforeGiftBurst + 1
      );
      await page.evaluate(() => {
        window.__TEMPLE_AUDIT_STOP_GIFTS__?.();
        delete window.__TEMPLE_AUDIT_STOP_GIFTS__;
      });

      const scene = await page.evaluate(async () => {
        const stage = document.getElementById('stage9x16');
        const canvas = document.getElementById('temple3dCanvas');
        const stageRect = stage?.getBoundingClientRect();
        const canvasRect = canvas?.getBoundingClientRect();
        let context = null;
        try {
          context = canvas?.getContext('webgl2') || canvas?.getContext('webgl');
        } catch {}
        const quality = await import('/js/temple-render-quality.js');
        const renderProfile = quality.getTempleRenderProfile({
          devicePixelRatio: window.devicePixelRatio || 1,
          deviceMemory: navigator.deviceMemory,
          hardwareConcurrency: navigator.hardwareConcurrency
        });
        return {
          readyFlag: window.__TEMPLE_3D_READY__ === true,
          buddhaModelSource: window.__TEMPLE_BUDDHA_MODEL_SOURCE__ ?? null,
          userAgent: navigator.userAgent,
          devicePixelRatio: window.devicePixelRatio,
          browserHints: {
            deviceMemory: navigator.deviceMemory ?? null,
            hardwareConcurrency: navigator.hardwareConcurrency ?? null
          },
          renderProfile,
          stage: stageRect ? {
            x: stageRect.x, y: stageRect.y,
            width: stageRect.width, height: stageRect.height
          } : null,
          canvas: canvas ? {
            hidden: canvas.hidden,
            width: canvas.width,
            height: canvas.height,
            rect: canvasRect ? {
              x: canvasRect.x, y: canvasRect.y,
              width: canvasRect.width, height: canvasRect.height
            } : null
          } : null,
          webgl: context ? {
            version: context.getParameter(context.VERSION),
            renderer: context.getParameter(context.RENDERER),
            contextLost: context.isContextLost()
          } : null,
          backgroundDisplay: document.querySelector('.sanctuary-bg-img')
            ? getComputedStyle(document.querySelector('.sanctuary-bg-img')).display
            : null
        };
      });

      profileReport.buddhaModelSource = scene.buddhaModelSource;
      profileReport.httpErrors = httpErrors;
      profileReport.browserHints = scene.browserHints;
      profileReport.userAgent = scene.userAgent;
      profileReport.devicePixelRatio = scene.devicePixelRatio;
      profileReport.renderProfile = scene.renderProfile;
      profileReport.stage = scene.stage;
      profileReport.canvas = scene.canvas;
      profileReport.webgl = scene.webgl;
      profileReport.backgroundDisplay = scene.backgroundDisplay;
      profileReport.sceneCanvasVisible = scene.canvas?.hidden === false;
      profileReport.framebufferScale = scene.canvas ? {
        x: scene.canvas.width / viewport.width,
        y: scene.canvas.height / viewport.height
      } : null;
      profileReport.rendererStats = {
        idle: idleStats,
        giftBurst: stressStats,
        samplesCaptured: rendererStatsSamples.length
      };

      profileReport.checks = {
        hintsMatchRequested: scene.browserHints?.deviceMemory === scenario.deviceMemory
          && scene.browserHints?.hardwareConcurrency === scenario.hardwareConcurrency,
        expectedTierSelected: scene.renderProfile?.tier === scenario.id,
        expectedPixelRatioSelected: scene.renderProfile?.pixelRatio === scenario.expectedPixelRatio,
        shadowMapBudgetSelected: scene.renderProfile?.shadowMapSize === profileReport.expectedShadowMapSize,
        environmentDetailSelected: scene.renderProfile?.environmentDetail === scenario.id,
        framebufferScaleMatches: Boolean(scene.canvas)
          && Math.abs((scene.canvas.width / viewport.width) - scenario.expectedPixelRatio) < 0.002
          && Math.abs((scene.canvas.height / viewport.height) - scenario.expectedPixelRatio) < 0.002,
        rendererStatsCaptured: Boolean(idleStats),
        rendererPixelRatioMatches: idleStats?.pixelRatio === scenario.expectedPixelRatio,
        giftBurstStatsCaptured: Boolean(stressStats),
        giftBurstHadActiveEffects: Number(stressStats?.activeEffects) > 0,
        giftBurstDrawCallsIncreased: Number.isFinite(idleStats?.drawCalls)
          && Number.isFinite(stressStats?.drawCalls)
          && stressStats.drawCalls > idleStats.drawCalls,
        drawCallsWithinBudget: Number.isFinite(idleStats?.drawCalls)
          && Number.isFinite(stressStats?.drawCalls)
          && idleStats.drawCalls <= 1200
          && stressStats.drawCalls <= 1200,
        sceneReady: profileReport.ready && scene.readyFlag,
        buddhaModelLoaded: scene.buddhaModelSource === 'custom-procedural',
        canvasVisible: profileReport.sceneCanvasVisible,
        webgl2Available: scene.webgl?.version?.includes('WebGL 2') === true,
        contextHealthy: scene.webgl?.contextLost === false,
        noConsoleErrors: errors.length === 0,
        noFailedRequests: failedRequests.length === 0,
        noUnexpectedHttpErrors: httpErrors.every((item) => {
          let pathname = '';
          try { pathname = new URL(item.url).pathname; } catch {}
          return item.status === 404
            && [
              '/favicon.ico',
              '/favicon.png',
              '/apple-touch-icon.png',
              // The selected Kenny Hsieh GLB is user-supplied; its absence is
              // expected until the official download is added to this path.
              '/assets/models/buddha-selected.glb'
            ].includes(pathname);
        })
      };
      profileReport.checks.passed = Object.values(profileReport.checks).every(Boolean);

      if (profileReport.sceneCanvasVisible) {
        const screenshotPath = `${artifactDir}/temple-3d-${scenario.id}.png`;
        await page.locator('#stage9x16').screenshot({
          path: screenshotPath,
          animations: 'disabled',
          timeout: 45000,
          scale: 'css'
        });
        profileReport.screenshot = screenshotPath;

        if (scenario.id === 'high') {
          await page.screenshot({
            path: `${artifactDir}/temple-3d-full-page.png`,
            fullPage: false,
            animations: 'disabled',
            scale: 'css'
          });
          await copyFile(screenshotPath, `${artifactDir}/temple-3d-portrait.png`);
        }
      }
    } catch (error) {
      profileReport.fatalError = error.stack || error.message;
      profileReport.checks.passed = false;
    } finally {
      await page?.close();
    }

    report.profiles.push(profileReport);
    console.log(`[Temple 3D audit] ${scenario.id}: ${profileReport.checks.passed ? 'PASS' : 'FAIL'}`);
  }

  const idleDrawCallsByTier = Object.fromEntries(report.profiles.map((profile) => [
    profile.id,
    profile.rendererStats?.idle?.drawCalls ?? null
  ]));
  const giftBurstDrawCallsByTier = Object.fromEntries(report.profiles.map((profile) => [
    profile.id,
    profile.rendererStats?.giftBurst?.drawCalls ?? null
  ]));
  const giftBurstActiveEffectsByTier = Object.fromEntries(report.profiles.map((profile) => [
    profile.id,
    profile.rendererStats?.giftBurst?.activeEffects ?? null
  ]));
  const idleDrawCalls = [idleDrawCallsByTier.low, idleDrawCallsByTier.medium, idleDrawCallsByTier.high];
  const giftBurstDrawCalls = [
    giftBurstDrawCallsByTier.low,
    giftBurstDrawCallsByTier.medium,
    giftBurstDrawCallsByTier.high
  ];
  const idleDrawCallsWithinBudget = idleDrawCalls.every(
    (value) => Number.isFinite(value) && value <= 1200
  );
  const giftBurstDrawCallsWithinBudget = giftBurstDrawCalls.every(
    (value) => Number.isFinite(value) && value <= 1200
  );
  const idleDrawCallsStrictlyIncrease = idleDrawCalls.every(Number.isFinite)
    && idleDrawCalls[0] < idleDrawCalls[1]
    && idleDrawCalls[1] < idleDrawCalls[2];
  report.summary = {
    passed: report.profiles.length === scenarios.length
      && report.profiles.every((profile) => profile.checks.passed)
      && idleDrawCallsStrictlyIncrease
      && idleDrawCallsWithinBudget
      && giftBurstDrawCallsWithinBudget,
    allProfilesPassed: report.profiles.length === scenarios.length
      && report.profiles.every((profile) => profile.checks.passed),
    drawCallsByTier: idleDrawCallsByTier,
    idleDrawCallsStrictlyIncrease,
    giftBurstDrawCallsByTier,
    giftBurstActiveEffectsByTier,
    giftBurstDrawCallsStrictlyIncrease: giftBurstDrawCalls.every(Number.isFinite)
      && giftBurstDrawCalls[0] < giftBurstDrawCalls[1]
      && giftBurstDrawCalls[1] < giftBurstDrawCalls[2],
    idleDrawCallsWithinBudget,
    giftBurstDrawCallsWithinBudget,
    // activeEffects is diagnostic only: gift objects are independent of environment detail tier.
    maxDrawCallsBudget: 1200
  };
  // Keep the original summary field name for consumers of the first profile audit.
  report.summary.drawCallsStrictlyIncrease = report.summary.idleDrawCallsStrictlyIncrease;

  // Preserve the original single-profile report fields for older artifact consumers.
  const defaultProfile = report.profiles.find((profile) => profile.id === 'high')
    || report.profiles[0];
  report.ready = Boolean(defaultProfile?.ready);
  report.sceneCanvasVisible = Boolean(defaultProfile?.sceneCanvasVisible);
  report.webgl = defaultProfile?.webgl || null;
  report.stage = defaultProfile?.stage || null;
  report.sceneCanvas = defaultProfile?.canvas || null;
  report.consoleErrors = report.profiles.flatMap((profile) => profile.consoleErrors || []);
  report.failedRequests = report.profiles.flatMap((profile) => profile.failedRequests || []);

  // A stable detail profile should submit progressively more batches at higher tiers.
  report.summary.passed = report.summary.allProfilesPassed
    && report.summary.idleDrawCallsStrictlyIncrease
    && report.summary.idleDrawCallsWithinBudget
    && report.summary.giftBurstDrawCallsWithinBudget
    && report.profiles.every((profile) =>
      profile.checks.giftBurstStatsCaptured
      && profile.checks.giftBurstHadActiveEffects
      && profile.checks.giftBurstDrawCallsIncreased
      && profile.checks.drawCallsWithinBudget
    );

  await writeFile(
    `${artifactDir}/temple-3d-visual-report.json`,
    JSON.stringify(report, null, 2)
  );
  console.log(JSON.stringify(report, null, 2));
  if (!report.summary.passed) process.exitCode = 1;
} catch (error) {
  report.fatalError = error.stack || error.message;
  await writeFile(
    `${artifactDir}/temple-3d-visual-report.json`,
    JSON.stringify(report, null, 2)
  );
  console.error(report.fatalError);
  process.exitCode = 1;
} finally {
  await browser?.close();
}
