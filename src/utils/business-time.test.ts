import { describe, expect, it } from 'vitest';
import { BUSINESS_TIMEZONE, businessDateKey, businessDateKeysEndingAt, isCalendarDateKey, isDateKey } from './business-time';

describe('business timezone date keys', () => {
  it('names the business timezone explicitly', () => {
    expect(BUSINESS_TIMEZONE).toBe('Asia/Bangkok');
  });

  it('uses the business day, not the UTC day', () => {
    // 03:00 on the 15th in Bangkok is still the 14th in UTC.
    expect(businessDateKey(new Date('2026-09-14T20:00:00Z'))).toBe('2026-09-15');
  });

  it('keeps the last minute of the business day on that day', () => {
    // 23:59 Bangkok.
    expect(businessDateKey(new Date('2026-09-14T16:59:00Z'))).toBe('2026-09-14');
  });

  it('rolls over exactly at the business midnight boundary', () => {
    expect(businessDateKey(new Date('2026-09-14T16:59:59.999Z'))).toBe('2026-09-14');
    expect(businessDateKey(new Date('2026-09-14T17:00:00.000Z'))).toBe('2026-09-15');
  });

  it('does not depend on the device timezone', () => {
    // Same instant, three different renderers: the key must not move with the host.
    const instant = new Date('2026-01-01T18:30:00Z');
    expect(businessDateKey(instant)).toBe('2026-01-02');
    expect(businessDateKey(instant)).toBe(businessDateKey(new Date(instant.getTime())));
  });

  it('builds a recent range from Bangkok calendar days even when UTC is still yesterday', () => {
    expect(businessDateKeysEndingAt(new Date('2026-09-14T20:00:00Z'), 3)).toEqual([
      '2026-09-13',
      '2026-09-14',
      '2026-09-15',
    ]);
  });

  it('recognises a date-only key', () => {
    expect(isDateKey('2026-09-15')).toBe(true);
    expect(isDateKey('2026-9-5')).toBe(false);
    expect(isDateKey('')).toBe(false);
    expect(isDateKey(null)).toBe(false);
    expect(isDateKey('2026-09-15T00:00:00Z')).toBe(false);
  });

  it('isCalendarDateKey additionally rejects impossible calendar dates', () => {
    // Pattern-only isDateKey accepts these; the strict sibling must not, because
    // scoring and evidence labels rely on the key being a real day.
    expect(isDateKey('2026-02-30')).toBe(true);
    expect(isCalendarDateKey('2026-02-30')).toBe(false);
    expect(isCalendarDateKey('2026-13-01')).toBe(false);
    expect(isCalendarDateKey('2026-04-31')).toBe(false);
  });

  it('isCalendarDateKey accepts real dates and rejects non-keys', () => {
    expect(isCalendarDateKey('2026-02-28')).toBe(true);
    expect(isCalendarDateKey('2028-02-29')).toBe(true); // leap year
    expect(isCalendarDateKey('2027-02-29')).toBe(false); // not a leap year
    expect(isCalendarDateKey('2026-09-15')).toBe(true);
    expect(isCalendarDateKey('2026-9-5')).toBe(false);
    expect(isCalendarDateKey('')).toBe(false);
    expect(isCalendarDateKey(null)).toBe(false);
    expect(isCalendarDateKey(undefined)).toBe(false);
    expect(isCalendarDateKey('2026-09-15T00:00:00Z')).toBe(false);
  });
});
