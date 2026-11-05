/** Pure gift-name normalization and visual action selection. */
export function normalizeGiftName(event) {
  return String(event?.giftName || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd');
}

export function resolveGiftAction(event) {
  const name = normalizeGiftName(event);
  if (/\b(rocket|ten lua)\b/.test(name)) return 'rocket';
  if (/\b(dragon|rong)\b/.test(name)) return 'dragon';
  if (/\b(donut|doughnut)\b/.test(name)) return 'donut';
  if (/\b(rose|hoa hong)\b/.test(name)) return 'rose';
  return null;
}


/**
 * Select a restrained acknowledgement intensity from the actual gift value.
 * Streak delta is incremental, so cumulative TikTok frames are not double-counted.
 */
export function resolveGiftReactionProfile(event = {}) {
  const diamonds = Number(event.diamondCount);
  const delta = Number(event.giftComboDelta);
  const unitValue = Number.isFinite(diamonds) && diamonds > 0 ? diamonds : 1;
  const count = Number.isFinite(delta) && delta > 0 ? Math.min(10000, Math.floor(delta)) : 1;
  const total = Math.min(1000000, unitValue * count);
  if (total >= 1000) return { tier: 'special', totalDiamonds: total, durationMs: 3800, intensity: 1, bowAmount: 0.3 };
  if (total >= 500) return { tier: 'large', totalDiamonds: total, durationMs: 3000, intensity: 0.88, bowAmount: 0.22 };
  if (total >= 100) return { tier: 'medium', totalDiamonds: total, durationMs: 2300, intensity: 0.72, bowAmount: 0.14 };
  return { tier: 'small', totalDiamonds: total, durationMs: 1800, intensity: 0.55, bowAmount: 0.08 };
}
