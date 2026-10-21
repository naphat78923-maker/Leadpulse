// ─── Sales page: each customer's order rhythm and where they stand today ───
// Pure. Rows come from the customer_rhythms() database function (lib/sales.ts).

import { businessDaysBetween } from './business-time.ts';

export interface CustomerRhythm {
  customer_id: string;
  name_en: string;
  name_th: string | null;
  crm_company_id: string | null;
  order_count: number;
  first_order: string;
  last_order: string;
  /** typical days between orders; null with a single order */
  median_gap_days: number | null;
  median_value: number;
}

export type RhythmStatus = 'on_track' | 'due' | 'late' | 'quiet';

export interface RhythmView extends CustomerRhythm {
  status: RhythmStatus;
  /** when the next order would come at the usual rhythm */
  expected: string | null;
  daysSinceLast: number;
}

/** A regular has ordered at least 3 times; one-off buyers aren't a rhythm. */
export const MIN_ORDERS = 3;
/** Past this, a regular has gone quiet whatever their rhythm. */
export const QUIET_AFTER_DAYS = 180;

function addDays(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * on track: before the usual next order · due: up to half a rhythm past it (at least a week) ·
 * late: beyond that · quiet: three rhythms without an order, or 180 days.
 */
export function rhythmStatus(r: CustomerRhythm, today: string): RhythmView {
  const daysSinceLast = businessDaysBetween(r.last_order, today);
  const gap = r.median_gap_days && r.median_gap_days > 0 ? r.median_gap_days : null;
  const expected = gap ? addDays(r.last_order, gap) : null;
  let status: RhythmStatus;
  if (!gap) status = daysSinceLast > QUIET_AFTER_DAYS ? 'quiet' : 'on_track';
  else if (daysSinceLast > Math.min(gap * 3, QUIET_AFTER_DAYS) && daysSinceLast > gap + 21) status = 'quiet';
  else if (daysSinceLast <= gap) status = 'on_track';
  else if (daysSinceLast <= gap + Math.max(7, Math.round(gap / 2))) status = 'due';
  else status = 'late';
  return { ...r, status, expected, daysSinceLast };
}

const RANK: Record<RhythmStatus, number> = { late: 0, due: 1, on_track: 2, quiet: 3 };

/** Regulars still buying (late first, then due, then on track by next order) and those gone quiet (biggest first). */
export function splitRegulars(rows: CustomerRhythm[], today: string): { regulars: RhythmView[]; quiet: RhythmView[] } {
  const views = rows.filter((r) => r.order_count >= MIN_ORDERS).map((r) => rhythmStatus(r, today));
  const regulars = views
    .filter((v) => v.status !== 'quiet')
    .sort((a, b) => RANK[a.status] - RANK[b.status] || (a.expected ?? '').localeCompare(b.expected ?? ''));
  const quiet = views
    .filter((v) => v.status === 'quiet')
    .sort((a, b) => b.median_value * b.order_count - a.median_value * a.order_count);
  return { regulars, quiet };
}

/** The usual month: median of full months with sales, so one big order doesn't set the bar. */
export function usualMonth(months: { month: string; amount: number }[], currentMonth: string): number | null {
  const amounts = months.filter((m) => m.month < currentMonth && m.amount > 0).map((m) => m.amount).sort((a, b) => a - b);
  if (!amounts.length) return null;
  const mid = Math.floor(amounts.length / 2);
  return amounts.length % 2 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
}

/** "Healthy Lux Co., Ltd. (Head Office)" → "Healthy Lux" for rows, when no account name is linked. */
export function shortCustomerName(name: string): string {
  return name
    .replace(/\s*\((head office|branch[^)]*|สำนักงานใหญ่)\)\s*/gi, ' ')
    .replace(/[,.]?\s*(co\.?,?\s*ltd\.?|company limited|public company limited|ltd\.?,?\s*part\.?|limited)\s*$/i, '')
    .trim();
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-09-07' → '7 Sep' (or '7 Sep 2026'); fixed names, so no locale writes "Sept". */
export function shortDate(key: string, withYear = false): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
}

/** '2026-09-01' → 'Sep 2026'. */
export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}
