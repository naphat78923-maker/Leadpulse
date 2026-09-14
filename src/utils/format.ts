/** Thai baht formatter. Shared so the board, analytics, and signals agree. */
import { businessDateKey } from '@/utils/business-time';

export function formatBaht(n: number | null | undefined): string {
  if (n == null) return '฿0';
  return '฿' + Math.round(n).toLocaleString('en-US');
}

/**
 * Sum non-null deal.value per workflow lane (folk-style "total per stage").
 * Mirrors the board's grouping so the header rollups stay consistent with the cards.
 */
export function sumLaneValues(
  lanes: { id: string }[],
  byAction: Record<string, { value: number | null }[]>
): Record<string, number> {
  const sums: Record<string, number> = {};
  for (const lane of lanes) {
    const deals = byAction[lane.id] || [];
    sums[lane.id] = deals.reduce((acc, d) => acc + (d.value || 0), 0);
  }
  return sums;
}

/** LeadPulse runs on Asia/Bangkok — never trust host/UTC calendar day for "today". */
export const APP_TIMEZONE = 'Asia/Bangkok';

/** YYYY-MM-DD in Asia/Bangkok for the given instant (defaults to now). */
export function bangkokDateKey(date: Date = new Date()): string {
  // Delegates to the one business-calendar implementation (src/utils/business-time.ts) so the
  // timezone and the key format can never diverge between the dashboard and the boards.
  return businessDateKey(date);
}

/** e.g. "Sunday · Sep 6" for headers — always Bangkok wall clock. */
export function formatBangkokWeekdayDate(date: Date = new Date()): string {
  const weekday = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    weekday: 'long',
  }).format(date);
  const monthDay = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    month: 'short',
    day: 'numeric',
  }).format(date);
  return `${weekday} · ${monthDay}`;
}

/** Hour 0–23 in Asia/Bangkok (for greetings). */
export function bangkokHour(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIMEZONE,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(date);
  const hour = parts.find(p => p.type === 'hour')?.value;
  return hour ? Number(hour) % 24 : date.getHours();
}
