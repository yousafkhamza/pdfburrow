// How compression is attempted. Pure, unit tested.
//
// Two methods:
//   keep-text — re-save the photos inside the PDF smaller; text and vectors stay sharp and selectable.
//   pages     — turn each page into a JPEG; much smaller for scans, but text is no longer selectable.
// With a target size we walk from the best quality down and stop at the first attempt that fits.
// "pages" is only tried when keep-text can't reach the target, and the result says so.

export const KEEP_TEXT_LEVELS = [
  { method: 'keep-text', maxPx: 2200, quality: 0.75 },
  { method: 'keep-text', maxPx: 1700, quality: 0.62 },
  { method: 'keep-text', maxPx: 1300, quality: 0.5 },
  { method: 'keep-text', maxPx: 1000, quality: 0.4 },
  { method: 'keep-text', maxPx: 750, quality: 0.32 },
];

export const PAGE_LEVELS = [
  { method: 'pages', dpi: 150, quality: 0.7 },
  { method: 'pages', dpi: 120, quality: 0.6 },
  { method: 'pages', dpi: 100, quality: 0.5 },
  { method: 'pages', dpi: 85, quality: 0.42 },
  { method: 'pages', dpi: 72, quality: 0.35 },
  { method: 'pages', dpi: 60, quality: 0.3 },
];

/** Fixed levels when the user picks a quality rather than a size. */
export const QUALITY_PRESETS = {
  light: [KEEP_TEXT_LEVELS[0]],
  recommended: [KEEP_TEXT_LEVELS[1]],
  strong: [KEEP_TEXT_LEVELS[3]],
  smallest: [PAGE_LEVELS[2]],
};

/** Target sizes with their own landing pages, in KB. */
export const TARGET_SIZES = [100, 200, 300, 500, 1024, 2048];

export function targetLabel(kb) {
  return kb >= 1024 ? `${kb / 1024} MB` : `${kb} KB`;
}

export function targetSlug(kb) {
  return kb >= 1024 ? `${kb / 1024}mb` : `${kb}kb`;
}

/** The attempts to make, in order from best quality to smallest. */
export function attempts({ targetBytes = null, preset = 'recommended', allowPages = true } = {}) {
  if (!targetBytes) return QUALITY_PRESETS[preset] ?? QUALITY_PRESETS.recommended;
  return allowPages ? [...KEEP_TEXT_LEVELS, ...PAGE_LEVELS] : [...KEEP_TEXT_LEVELS];
}

/**
 * Decide whether to stop after an attempt.
 * Stop as soon as a result fits the target (they are tried best-quality first).
 */
export function fits(size, targetBytes) {
  return targetBytes ? size <= targetBytes : true;
}

/** Below this saving (without a target size) a new file isn't worth downloading. */
export const MIN_SAVING = 8 * 1024;

/**
 * Choose what to give the user.
 * results: [{ size, level }] in the order tried; original: size of the input.
 * - first result that fits the target wins (highest quality that fits)
 * - otherwise the smallest result
 * - with a target: any result smaller than the original is worth giving
 * - without a target: only if it saves at least 5% and 8 KB, else "already small"
 */
export function choose(results, original, targetBytes = null) {
  const valid = results.filter((r) => Number.isFinite(r.size) && r.size > 0);
  if (!valid.length) return { pick: null, met: false, reason: 'failed' };
  const fitting = targetBytes ? valid.find((r) => r.size <= targetBytes) : null;
  const smallest = valid.reduce((a, b) => (b.size < a.size ? b : a));
  const pick = fitting ?? smallest;
  const saving = original - pick.size;
  const worth = targetBytes ? pick.size < original : saving >= Math.max(original * 0.05, MIN_SAVING);
  if (!worth) {
    return { pick: null, met: targetBytes ? original <= targetBytes : false, reason: 'already-small' };
  }
  return { pick, met: targetBytes ? pick.size <= targetBytes : true, reason: fitting || !targetBytes ? 'ok' : 'target-not-reached' };
}
