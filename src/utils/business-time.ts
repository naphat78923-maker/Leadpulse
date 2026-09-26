// Business-timezone date handling.
//
// LeadPulse's calendar dates (follow-up dates, due-today/overdue boundaries) are the
// business's dates, not the device's and not UTC. `log_day`-style event timestamps stay UTC;
// a date-only value like `deals.followup_date` must be derived from Bangkok's calendar or a
// phone set to another timezone (or a UTC server) would disagree about which day a deal is due.
export const BUSINESS_TIMEZONE = 'Asia/Bangkok';

const DATE_KEY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** True for a date-only key ('YYYY-MM-DD') — never for a timestamp. */
export function isDateKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && DATE_KEY_PATTERN.test(value);
}

/** 'YYYY-MM-DD' for an instant, in the configured business timezone. */
export function businessDateKey(date: Date = new Date()): string {
  // formatToParts keeps this independent of the host locale and of ICU's en-CA quirks.
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const get = (type: string) => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Milliseconds until the next midnight on the business calendar. */
export function millisecondsUntilNextBusinessMidnight(now: Date = new Date()): number {
  if (!Number.isFinite(now.getTime())) throw new RangeError('now must be a valid instant');
  const [year, month, day] = businessDateKey(now).split('-').map(Number);
  const targetUtcMidnight = Date.UTC(year, month - 1, day + 1);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: BUSINESS_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(targetUtcMidnight));
  const value = (type: string) => Number(parts.find(part => part.type === type)?.value);
  const localAsUtc = Date.UTC(value('year'), value('month') - 1, value('day'), value('hour'), value('minute'), value('second'));
  const offsetAtTarget = localAsUtc - targetUtcMidnight;
  const nextMidnightInstant = targetUtcMidnight - offsetAtTarget;
  return Math.max(1, nextMidnightInstant - now.getTime());
}

/** Consecutive business-calendar date keys, oldest first and ending on `date`'s business day. */
export function businessDateKeysEndingAt(date: Date, count: number): string[] {
  if (count <= 0) return [];
  const [year, month, day] = businessDateKey(date).split('-').map(Number);
  const end = Date.UTC(year, (month || 1) - 1, day || 1);
  return Array.from({ length: count }, (_, index) => {
    const current = new Date(end - (count - 1 - index) * 86400000);
    return current.toISOString().slice(0, 10);
  });
}

/**
 * True for a real calendar date key ('YYYY-MM-DD') — the strict sibling of
 * `isDateKey`: it also rejects impossible dates such as '2026-02-30' and
 * '2026-13-01'. Use it wherever a bad date must not be silently treated as a
 * real one (scoring, due dates, evidence labels).
 */
export function isCalendarDateKey(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !DATE_KEY_PATTERN.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Days from `from` to `to` on the business calendar (negative when `to` is earlier). */
export function businessDaysBetween(from: string, to: string): number {
  const parse = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y, (m || 1) - 1, d || 1);
  };
  return Math.round((parse(to) - parse(from)) / 86400000);
}
