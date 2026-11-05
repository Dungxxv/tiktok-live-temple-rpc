const DEFAULT_CLIP_ALIASES = {
  idle: ['idle', 'breathing', 'breath', 'resting', 'standing', 'stand'],
  walk: ['walking', 'walk', 'locomotion', 'approach', 'travel', 'running', 'run', 'movement', 'move'],
  bow: ['prostrate', 'worshipping', 'worshiping', 'worship', 'praying', 'prayer', 'pray', 'kneeling', 'kneel', 'bowing', 'bow']
};

function hasNameToken(name, token) {
  return (` ${name} `).includes(` ${token} `);
}

function normalizeClipName(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_|./-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(' ')
    .filter(Boolean)
    .join(' ');
}

/**
 * Select one best clip per action without assigning the same clip to multiple
 * states. Explicit aliases rank above generic synonyms; source order breaks
 * otherwise equal scores deterministically.
 */
export function findBestAnimationClip(animations = [], aliases = DEFAULT_CLIP_ALIASES) {
  const actions = Object.keys(aliases);
  const selected = Object.fromEntries(actions.map((action) => [action, null]));
  const candidates = [];

  for (const [action, tokens] of Object.entries(aliases)) {
    animations.forEach((clip, index) => {
      const normalized = normalizeClipName(clip?.name);
      if (!normalized) return;
      const aliasIndex = tokens.findIndex((token) => hasNameToken(normalized, token));
      if (aliasIndex < 0) return;
      // Ritual clips often contain "Idle" in names such as "Praying Idle".
      // Their explicit ritual intent must win over incidental idle tokens.
      const hasRitualIntent = aliases.bow?.some((token) => hasNameToken(normalized, token));
      if (hasRitualIntent && action !== 'bow') return;
      const exact = normalized === tokens[aliasIndex];
      candidates.push({
        action,
        clip,
        index,
        score: (exact ? 10000 : 5000) - aliasIndex * 100 - normalized.length
      });
    });
  }

  candidates.sort((a, b) => b.score - a.score || a.index - b.index);
  const usedClips = new Set();
  for (const candidate of candidates) {
    if (selected[candidate.action] || usedClips.has(candidate.clip)) continue;
    selected[candidate.action] = candidate.clip;
    usedClips.add(candidate.clip);
  }
  return selected;
}

export { DEFAULT_CLIP_ALIASES };
