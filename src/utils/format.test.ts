import { describe, expect, it } from 'vitest';
import { formatBaht, sumLaneValues } from './format';

describe('formatBaht', () => {
  it('formats a plain number with thousands separators', () => {
    expect(formatBaht(12345)).toBe('฿12,345');
  });
  it('rounds to the nearest baht', () => {
    expect(formatBaht(1234.6)).toBe('฿1,235');
  });
  it('treats null/undefined as zero', () => {
    expect(formatBaht(null)).toBe('฿0');
    expect(formatBaht(undefined)).toBe('฿0');
  });
});

describe('sumLaneValues', () => {
  const lanes = [{ id: 'outreach' }, { id: 'sample' }, { id: 'parked' }];

  it('sums non-null deal values per lane', () => {
    const byAction: Record<string, { value: number | null }[]> = {
      outreach: [{ value: 1000 }, { value: 2500 }],
      sample: [{ value: 500 }],
      parked: [{ value: null }],
    };
    expect(sumLaneValues(lanes, byAction)).toEqual({ outreach: 3500, sample: 500, parked: 0 });
  });

  it('returns zero for lanes with no deals', () => {
    expect(sumLaneValues(lanes, {})).toEqual({ outreach: 0, sample: 0, parked: 0 });
  });

  it('ignores null values rather than counting them as zero incorrectly', () => {
    const byAction: Record<string, { value: number | null }[]> = {
      outreach: [{ value: null }, { value: 800 }],
    };
    expect(sumLaneValues(lanes, byAction).outreach).toBe(800);
  });
});
