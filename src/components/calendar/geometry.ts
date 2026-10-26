/** Shared horizontal geometry so the day header cells and grid columns line up. */
export const GMT_WIDTH = 44;
export const COL_GAP = 8;
/** Grid gutter = GMT cell + gap, so column x positions match the header. */
export const GUTTER = GMT_WIDTH + COL_GAP;
export const MIN_COL_WIDTH = 96;

/**
 * Week view shows seven full days and a sliver of the eighth, as in the
 * reference, at any panel width (columns never narrower than MIN_COL_WIDTH).
 */
export function weekColumnWidth(available: number): number {
  return Math.max(MIN_COL_WIDTH, Math.floor((available - GUTTER - 7 * COL_GAP) / 7.25));
}

export function columnLeft(index: number, colWidth: number): number {
  return GUTTER + index * (colWidth + COL_GAP);
}
