import { describe, expect, it } from 'vitest';
import {
  formatBaht,
  sumLaneValues,
  bangkokDateKey,
  formatBangkokWeekdayDate,
  bangkokHour,
  APP_TIMEZONE,
} from './format';

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

describe('bangkokDateKey', () => {
  it('returns Asia/Bangkok calendar day even when UTC is still the previous day', () => {
    // Sat Sep 5 20:00 UTC == Sun Sep 6 03:00 Bangkok
    const utcSatEvening = new Date('2026-09-05T20:00:00Z');
    expect(APP_TIMEZONE).toBe('Asia/Bangkok');
    expect(bangkokDateKey(utcSatEvening)).toBe('2026-09-06');
    expect(formatBangkokWeekdayDate(utcSatEvening)).toBe('Sunday · Sep 6');
  });

  it('keeps Saturday when Bangkok is still Saturday', () => {
    // Sat Sep 5 10:00 UTC == Sat Sep 5 17:00 Bangkok
    const utcSat = new Date('2026-09-05T10:00:00Z');
    expect(bangkokDateKey(utcSat)).toBe('2026-09-05');
    expect(formatBangkokWeekdayDate(utcSat)).toBe('Saturday · Sep 5');
  });
});

describe('bangkokHour', () => {
  it('reads Bangkok wall-clock hour', () => {
    // 2026-09-06T02:30:00Z == 09:30 Bangkok
    expect(bangkokHour(new Date('2026-09-06T02:30:00Z'))).toBe(9);
  });
});
