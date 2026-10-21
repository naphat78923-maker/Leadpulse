// Numbers behind This week's stat cards and age groups. Pure; dates are Bangkok date keys.

import type { Meeting } from '../types/crm';
import type { HealthTier } from './accountHealth';
import { businessDaysBetween, isCalendarDateKey } from './business-time';
import { addDaysToDateKey } from './deal-workflow';
import type { AttentionCandidate } from './followup-policy';
import type { CheckInRow } from './this-week-queue';

export type AgeGroupId = 'over_two_weeks' | 'last_week' | 'this_week';

export const AGE_GROUP_LABEL: Record<AgeGroupId, string> = {
  over_two_weeks: 'Over 2 weeks',
  last_week: 'Last week',
  this_week: 'This week',
};

/** How many days past its date an item is (0 when not overdue or undated). */
export function daysOverdue(dueDate: string | null, today: string): number {
  if (!dueDate || !isCalendarDateKey(dueDate)) return 0;
  return Math.max(0, businessDaysBetween(dueDate, today));
}

export function ageGroup(days: number): AgeGroupId {
  if (days > 14) return 'over_two_weeks';
  if (days > 7) return 'last_week';
  return 'this_week';
}

/** Overdue items grouped oldest first; empty groups are dropped. */
export function groupOverdueByAge(overdue: readonly AttentionCandidate[], today: string) {
  const order: AgeGroupId[] = ['over_two_weeks', 'last_week', 'this_week'];
  return order
    .map(id => ({
      id,
      label: AGE_GROUP_LABEL[id],
      items: overdue.filter(item => ageGroup(daysOverdue(item.dueDate, today)) === id),
    }))
    .filter(group => group.items.length > 0);
}

/** Items due today and over the next six days, one bucket per day. */
export function dueByDay(items: readonly AttentionCandidate[], today: string) {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = addDaysToDateKey(today, offset);
    return { date, offset, items: items.filter(item => item.dueDate === date) };
  });
}

export function checkInSplit(checkIns: readonly CheckInRow[]): Record<HealthTier | 'reorder_only', number> {
  const split = { healthy: 0, watch: 0, at_risk: 0, dormant: 0, reorder_only: 0 };
  for (const row of checkIns) split[row.tier ?? 'reorder_only'] += 1;
  return split;
}

/**
 * Real touches in the last seven days (today included): calls, emails, DMs and
 * meetings with a client. Internal notes and reward logs don't count. `previous` is
 * the same count over the seven days before.
 */
export function touchesLastSevenDays(meetings: readonly Pick<Meeting, 'date' | 'type' | 'direction' | 'outcome'>[], today: string) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysToDateKey(today, i - 6));
  const counts = new Map(days.map(day => [day, 0]));
  // The seven days before those, for the comparison.
  const previousFrom = addDaysToDateKey(today, -13);
  let total = 0;
  let positive = 0;
  let previous = 0;
  for (const m of meetings) {
    const day = m.date?.slice(0, 10);
    if (!day) continue;
    if (m.type === 'reward' || m.type === 'note' || m.direction === 'internal') continue;
    if (!counts.has(day)) {
      if (day >= previousFrom && day < days[0]) previous += 1;
      continue;
    }
    counts.set(day, (counts.get(day) ?? 0) + 1);
    total += 1;
    if (m.outcome === 'positive') positive += 1;
  }
  return { total, positive, previous, series: days.map(day => counts.get(day) ?? 0) };
}

/* ── Written lines under each card's number ───────────────────────────────── */

function weekday(dateKey: string): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'UTC' });
}

/** "11 waiting over 2 weeks. Oldest: 34 days." */
export function overdueLine(overdue: readonly AttentionCandidate[], today: string): string {
  if (overdue.length === 0) return 'Nothing overdue.';
  const ages = overdue.map(item => daysOverdue(item.dueDate, today));
  const oldest = Math.max(...ages);
  const old = ages.filter(days => ageGroup(days) === 'over_two_weeks').length;
  const lead = old > 0 ? `${old} waiting over 2 weeks.` : 'All under 2 weeks.';
  return `${lead} Oldest: ${oldest} day${oldest === 1 ? '' : 's'}.`;
}

/** "1 tomorrow, 2 on Tuesday. Today is clear." */
export function dueWeekLine(days: ReturnType<typeof dueByDay>): string {
  const busy = days.filter(d => d.items.length > 0);
  if (busy.length === 0) return 'Nothing due in the next 7 days.';
  const when = (d: (typeof days)[number]) => (d.offset === 0 ? 'today' : d.offset === 1 ? 'tomorrow' : `on ${weekday(d.date)}`);
  const parts = busy.slice(0, 2).map(d => `${d.items.length} ${when(d)}`);
  const more = busy.length > 2 ? ', and more later' : '';
  const clear = days[0].items.length === 0 ? ' Today is clear.' : '';
  return `${parts.join(', ')}${more}.${clear}`;
}

/** "12 at risk, 9 to watch, 3 dormant, 2 reorders due." */
export function checkInLine(split: ReturnType<typeof checkInSplit>): string {
  const parts = [
    split.at_risk && `${split.at_risk} at risk`,
    split.watch && `${split.watch} to watch`,
    split.dormant && `${split.dormant} dormant`,
    split.reorder_only && `${split.reorder_only} reorder${split.reorder_only === 1 ? '' : 's'} due`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(', ')}.` : 'Everyone is healthy.';
}

/** "Up from 2 the week before. Busiest: Thursday." */
export function touchesLine(touches: ReturnType<typeof touchesLastSevenDays>, today: string): string {
  if (touches.total === 0) return touches.previous ? `None yet, after ${touches.previous} the week before.` : 'No touches in the last 7 days.';
  const trend = touches.total > touches.previous ? `Up from ${touches.previous}` : touches.total < touches.previous ? `Down from ${touches.previous}` : 'Same as';
  const peak = Math.max(...touches.series);
  const busiest = addDaysToDateKey(today, touches.series.indexOf(peak) - 6);
  return `${trend} the week before. Busiest: ${busiest === today ? 'today' : weekday(busiest)}.`;
}
