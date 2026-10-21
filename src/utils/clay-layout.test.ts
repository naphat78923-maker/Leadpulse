import { describe, expect, it } from 'vitest';
import { fitCounts, MAX_PEBBLES, pebblePile, pillarHeights, ribbonPoints, ringArcs } from './clay-layout';

describe('fitCounts', () => {
  it('leaves small counts alone and scales big ones to the cap, keeping every group', () => {
    expect(fitCounts([11, 0, 2], 15)).toEqual([11, 0, 2]);
    const fitted = fitCounts([50, 1, 9], 15);
    expect(fitted.reduce((a, b) => a + b, 0)).toBe(15);
    expect(fitted[1]).toBe(1);
  });
});

describe('pebblePile', () => {
  it('stacks one pebble per overdue item, oldest group at the base', () => {
    const pile = pebblePile([11, 0, 2]);
    expect(pile).toHaveLength(13);
    expect(pile.slice(0, 5).every((p) => p.group === 0 && p.y < 0.3)).toBe(true);
    expect(pile.at(-1)!.group).toBe(2);
    expect(Math.max(...pile.map((p) => p.y))).toBeGreaterThan(1);
  });

  it('never draws more than the cap', () => {
    expect(pebblePile([80, 20, 5])).toHaveLength(MAX_PEBBLES);
    expect(pebblePile([0, 0, 0])).toEqual([]);
  });
});

describe('pillarHeights', () => {
  it('gives empty days a stub and the busiest day the full height', () => {
    expect(pillarHeights([0, 1, 0, 0, 0, 0, 2])).toEqual([0.14, 0.55 + 0.5 * 1.85, 0.14, 0.14, 0.14, 0.14, 2.4]);
  });
});

describe('ringArcs', () => {
  it('splits the ring by count with gaps, skipping empty tiers', () => {
    const arcs = ringArcs([12, 3, 9, 2, 0]);
    expect(arcs.map((a) => a.index)).toEqual([0, 1, 2, 3]);
    expect(arcs[1].start).toBeCloseTo((12 / 26) * Math.PI * 2);
    expect(arcs[0].length).toBeCloseTo((12 / 26) * Math.PI * 2 - 0.06);
    expect(ringArcs([0, 0, 4])).toEqual([{ start: 0, length: Math.PI * 2, index: 2 }]);
    expect(ringArcs([0, 0])).toEqual([]);
  });
});

describe('ribbonPoints', () => {
  it('spans the week and puts last week’s average on the same scale', () => {
    const { points, baseline } = ribbonPoints([0, 1, 0, 5, 2, 3, 1], 14);
    expect(points).toHaveLength(7);
    expect(points[0][0]).toBeCloseTo(-2.7);
    expect(points[6][0]).toBeCloseTo(2.7);
    expect(points[3][1]).toBeCloseTo(1.85);
    expect(baseline).toBeCloseTo(0.25 + (2 / 5) * 1.6);
  });
});
