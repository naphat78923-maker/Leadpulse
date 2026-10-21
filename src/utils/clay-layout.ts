// ─── This week's clay scenes: where things go, before three.js draws them ───
// Pure numbers so the layout is testable without WebGL. Drawing is components/clay3d.

export const MAX_PEBBLES = 15;

/** Scale counts down to fit `cap` while keeping every non-empty group visible. */
export function fitCounts(counts: number[], cap: number): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total <= cap) return counts;
  const scaled = counts.map((c) => (c > 0 ? Math.max(1, Math.round((c / total) * cap)) : 0));
  // Rounding can overshoot; trim from the largest group.
  while (scaled.reduce((a, b) => a + b, 0) > cap) {
    const i = scaled.indexOf(Math.max(...scaled));
    scaled[i]--;
  }
  return scaled;
}

export interface Pebble { x: number; y: number; z: number; group: number }

/**
 * A pile: rows of 5, 4, 3, 2, 1 stacked into a pyramid, filled bottom row first with the
 * oldest group, so the heaviest colour sits at the base.
 */
export function pebblePile(groups: number[]): Pebble[] {
  const fitted = fitCounts(groups, MAX_PEBBLES);
  const order = fitted.flatMap((n, group) => Array.from({ length: n }, () => group));
  const out: Pebble[] = [];
  let row = 0;
  let i = 0;
  while (i < order.length) {
    const width = 5 - row;
    const inRow = Math.min(width, order.length - i);
    for (let k = 0; k < inRow; k++, i++) {
      out.push({ x: (k - (inRow - 1) / 2) * 0.8, y: 0.27 + row * 0.48, z: row % 2 ? -0.12 : 0.12, group: order[i] });
    }
    row++;
  }
  return out;
}

/** Pillar heights for the seven days: a stub for an empty day, taller with more due. */
export function pillarHeights(counts: number[], max = 2.4): number[] {
  const top = Math.max(1, ...counts);
  return counts.map((c) => (c > 0 ? 0.55 + (c / top) * (max - 0.55) : 0.14));
}

export interface Arc { start: number; length: number; index: number }

/** Ring segments for tier counts, each with a small gap; one full ring when all are empty. */
export function ringArcs(counts: number[], gap = 0.06): Arc[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return [];
  const shown = counts.map((c, index) => ({ c, index })).filter((s) => s.c > 0);
  let start = 0;
  return shown.map(({ c, index }) => {
    const span = (c / total) * Math.PI * 2;
    const arc = { start, length: shown.length > 1 ? Math.max(0.02, span - gap) : span, index };
    start += span;
    return arc;
  });
}

/** Ribbon points for the touches series, plus the height of last week's daily average. */
export function ribbonPoints(series: number[], previousTotal: number): { points: [number, number, number][]; baseline: number } {
  const avg = previousTotal / 7;
  const top = Math.max(1, avg, ...series);
  const span = 5.4;
  const step = series.length > 1 ? span / (series.length - 1) : 0;
  return {
    points: series.map((v, i) => [i * step - span / 2, 0.25 + (v / top) * 1.6, Math.sin(i * 0.9) * 0.3]),
    baseline: 0.25 + (avg / top) * 1.6,
  };
}
