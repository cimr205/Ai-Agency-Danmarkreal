// Pure scroll math for the module cluster. Kept separate from
// ModuleCluster3D so the page can use it without pulling in three.js.
function ease(t: number) {
  const c = Math.min(Math.max(t, 0), 1);
  return c * c * (3 - 2 * c);
}

// 0 → 1 (apart, labels readable) → 0 (merged) across the section's scroll range
export function explodeFromProgress(p: number) {
  if (p < 0.32) return ease(p / 0.32);
  if (p < 0.58) return 1;
  return 1 - ease((p - 0.58) / 0.42);
}
