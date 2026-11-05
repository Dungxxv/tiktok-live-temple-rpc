describe('getTempleRenderProfile', () => {
  it('reduces pixel ratio, shadow-map size and environment detail for low-end devices', () => {
    expect(getTempleRenderProfile({
      devicePixelRatio: 2,
      deviceMemory: 2,
      hardwareConcurrency: 4
    })).toEqual({
      tier: 'low',
      maxPixelRatio: 1,
      pixelRatio: 1,
      shadowMapSize: 512,
      environmentDetail: 'low'
    });
  });

  it('uses balanced environment detail and preserves the existing shadow-map budget for mid-range devices', () => {
    expect(getTempleRenderProfile({
      devicePixelRatio: 2,
      deviceMemory: 6,
      hardwareConcurrency: 8
    })).toEqual({
      tier: 'medium',
      maxPixelRatio: 1.15,
      pixelRatio: 1.15,
      shadowMapSize: 1024,
      environmentDetail: 'medium'
    });
  });

  it('keeps high detail and caps strong devices at the existing 1.25x ceiling', () => {
    expect(getTempleRenderProfile({
      devicePixelRatio: 2,
      deviceMemory: 16,
      hardwareConcurrency: 16
    })).toEqual({
      tier: 'high',
      maxPixelRatio: 1.25,
      pixelRatio: 1.25,
      shadowMapSize: 1024,
      environmentDetail: 'high'
    });
  });

  it('handles an invalid DPR without changing the selected device tier', () => {
    expect(getTempleRenderProfile({
      devicePixelRatio: Number.NaN,
      deviceMemory: 8,
      hardwareConcurrency: 8
    }).pixelRatio).toBe(1);
  });
});

import { describe, expect, it } from 'bun:test';
import {
  getTemplePixelRatio,
  getTempleRenderQuality,
  getTempleRenderProfile
} from '../public/js/temple-render-quality.js';

describe('getTempleRenderQuality', () => {
  it('selects low quality for low-memory devices', () => {
    expect(getTempleRenderQuality({ deviceMemory: 2, hardwareConcurrency: 8 }))
      .toEqual({ tier: 'low', maxPixelRatio: 1 });
  });

  it('selects low quality for low-core devices', () => {
    expect(getTempleRenderQuality({ deviceMemory: 8, hardwareConcurrency: 2 }))
      .toEqual({ tier: 'low', maxPixelRatio: 1 });
  });

  it('selects medium quality for mid-range devices', () => {
    expect(getTempleRenderQuality({ deviceMemory: 6, hardwareConcurrency: 8 }))
      .toEqual({ tier: 'medium', maxPixelRatio: 1.15 });
    expect(getTempleRenderQuality({ deviceMemory: 8, hardwareConcurrency: 6 }))
      .toEqual({ tier: 'medium', maxPixelRatio: 1.15 });
  });

  it('retains the legacy low-tier cap for devices at or below 4 GB or 4 cores', () => {
    expect(getTempleRenderQuality({ deviceMemory: 4, hardwareConcurrency: 8 }))
      .toEqual({ tier: 'low', maxPixelRatio: 1 });
    expect(getTempleRenderQuality({ deviceMemory: 8, hardwareConcurrency: 4 }))
      .toEqual({ tier: 'low', maxPixelRatio: 1 });
  });

  it('selects high quality when all available hints indicate a strong device', () => {
    expect(getTempleRenderQuality({ deviceMemory: 8, hardwareConcurrency: 8 }))
      .toEqual({ tier: 'high', maxPixelRatio: 1.25 });
  });

  it('does not penalize a strong device when one browser hint is missing', () => {
    expect(getTempleRenderQuality({ hardwareConcurrency: 8 }))
      .toEqual({ tier: 'high', maxPixelRatio: 1.25 });
    expect(getTempleRenderQuality({ deviceMemory: 8 }))
      .toEqual({ tier: 'high', maxPixelRatio: 1.25 });
  });

  it('uses the remaining hint when the other device capability is unavailable', () => {
    expect(getTempleRenderQuality({ hardwareConcurrency: 2 }).tier).toBe('low');
    expect(getTempleRenderQuality({ deviceMemory: 2 }).tier).toBe('low');
    expect(getTempleRenderQuality({ hardwareConcurrency: 6 }).tier).toBe('medium');
    expect(getTempleRenderQuality({ deviceMemory: 6 }).tier).toBe('medium');
  });

  it('uses balanced quality when both device hints are missing or invalid', () => {
    expect(getTempleRenderQuality()).toEqual({ tier: 'medium', maxPixelRatio: 1.15 });
    expect(getTempleRenderQuality({
      deviceMemory: undefined,
      hardwareConcurrency: undefined
    })).toEqual({ tier: 'medium', maxPixelRatio: 1.15 });
    expect(getTempleRenderQuality({
      deviceMemory: 0,
      hardwareConcurrency: -1
    })).toEqual({ tier: 'medium', maxPixelRatio: 1.15 });
    expect(getTempleRenderQuality({
      deviceMemory: Number.NaN,
      hardwareConcurrency: Number.POSITIVE_INFINITY
    })).toEqual({ tier: 'medium', maxPixelRatio: 1.15 });
  });

  it('treats fractional device memory thresholds consistently', () => {
    expect(getTempleRenderQuality({ deviceMemory: 1.5, hardwareConcurrency: 8 }).tier)
      .toBe('low');
    expect(getTempleRenderQuality({ deviceMemory: 3.5, hardwareConcurrency: 8 }).tier)
      .toBe('low');
    expect(getTempleRenderQuality({ deviceMemory: 5.5, hardwareConcurrency: 8 }).tier)
      .toBe('medium');
    expect(getTempleRenderQuality({ deviceMemory: 8, hardwareConcurrency: 8 }).tier)
      .toBe('high');
  });
});

describe('getTemplePixelRatio', () => {
  it('preserves the no-argument API and defaults to a safe ratio', () => {
    expect(getTemplePixelRatio()).toBe(1);
  });

  it('caps low-end devices at 1x', () => {
    expect(getTemplePixelRatio({
      devicePixelRatio: 3,
      deviceMemory: 2,
      hardwareConcurrency: 8
    })).toBe(1);
  });

  it('uses an intermediate cap for medium devices', () => {
    expect(getTemplePixelRatio({
      devicePixelRatio: 2,
      deviceMemory: 6,
      hardwareConcurrency: 8
    })).toBe(1.15);
    expect(getTemplePixelRatio({
      devicePixelRatio: 1.1,
      deviceMemory: 6,
      hardwareConcurrency: 8
    })).toBe(1.1);
  });

  it('retains the existing 1.25x ceiling on strong desktops', () => {
    expect(getTemplePixelRatio({
      devicePixelRatio: 2,
      deviceMemory: 16,
      hardwareConcurrency: 16
    })).toBe(1.25);
  });

  it('does not upscale when the reported DPR is below one', () => {
    expect(getTemplePixelRatio({
      devicePixelRatio: 0.75,
      deviceMemory: 8,
      hardwareConcurrency: 8
    })).toBe(1);
  });

  it('falls back to 1x when DPR is missing or invalid', () => {
    expect(getTemplePixelRatio({
      devicePixelRatio: undefined,
      deviceMemory: 8,
      hardwareConcurrency: 8
    })).toBe(1);
    expect(getTemplePixelRatio({
      devicePixelRatio: Number.NaN,
      deviceMemory: 8,
      hardwareConcurrency: 8
    })).toBe(1);
    expect(getTemplePixelRatio({
      devicePixelRatio: Number.POSITIVE_INFINITY,
      deviceMemory: 8,
      hardwareConcurrency: 8
    })).toBe(1);
    expect(getTemplePixelRatio({
      devicePixelRatio: 0,
      deviceMemory: 8,
      hardwareConcurrency: 8
    })).toBe(1);
    expect(getTemplePixelRatio({
      devicePixelRatio: -2,
      deviceMemory: 8,
      hardwareConcurrency: 8
    })).toBe(1);
  });

  it('handles missing device hints without throwing or over-allocating', () => {
    expect(getTemplePixelRatio({ devicePixelRatio: 2 })).toBe(1.15);
    expect(getTemplePixelRatio({
      devicePixelRatio: 2,
      deviceMemory: undefined,
      hardwareConcurrency: 8
    })).toBe(1.25);
  });
});
