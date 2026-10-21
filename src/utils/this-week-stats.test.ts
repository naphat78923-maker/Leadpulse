import { describe, expect, it } from 'vitest';
import type { AttentionCandidate } from './followup-policy';
import type { CheckInRow } from './this-week-queue';
import { checkInLine, checkInSplit, dueByDay, dueWeekLine, groupOverdueByAge, overdueLine, touchesLastSevenDays, touchesLine } from './this-week-stats';

const today = '2026-09-28';

const item = (id: string, dueDate: string | null) => ({ id, dueDate } as AttentionCandidate);

describe('this-week stats', () => {
  it('groups overdue items by age, oldest group first, dropping empty groups', () => {
    const groups = groupOverdueByAge([item('a', '2026-09-08'), item('b', '2026-09-25'), item('c', '2026-09-18')], today);

    expect(groups.map(g => [g.id, g.items.map(i => i.id)])).toEqual([
      ['over_two_weeks', ['a']],
      ['last_week', ['c']],
      ['this_week', ['b']],
    ]);
    expect(groupOverdueByAge([item('b', '2026-09-27')], today).map(g => g.label)).toEqual(['This week']);
  });

  it('buckets upcoming items into seven days starting today', () => {
    const days = dueByDay([item('t', today), item('w', '2026-10-01'), item('far', '2026-10-09')], today);

    expect(days).toHaveLength(7);
    expect(days[0].items.map(i => i.id)).toEqual(['t']);
    expect(days[3].items.map(i => i.id)).toEqual(['w']);
    expect(days.flatMap(d => d.items).map(i => i.id)).not.toContain('far');
  });

  it('splits check-ins by health, counting reorder-only rows separately', () => {
    const rows = [{ tier: 'at_risk' }, { tier: 'at_risk' }, { tier: 'dormant' }, { tier: null }] as CheckInRow[];
    expect(checkInSplit(rows)).toMatchObject({ at_risk: 2, dormant: 1, reorder_only: 1, watch: 0 });
  });

  it('counts real client touches over the last seven days only', () => {
    const touches = touchesLastSevenDays([
      { date: today, type: 'call', direction: 'outbound', outcome: 'positive' },
      { date: '2026-09-22', type: 'email', direction: 'outbound', outcome: null },
      { date: '2026-09-21', type: 'call', direction: 'outbound', outcome: null },
      { date: today, type: 'note', direction: 'internal', outcome: null },
      { date: today, type: 'reward', direction: null, outcome: 'positive' },
      { date: '2026-09-14', type: 'call', direction: 'outbound', outcome: null },
    ], today);

    expect(touches).toEqual({ total: 2, positive: 1, previous: 1, series: [1, 0, 0, 0, 0, 0, 1] });
  });
});

describe('written lines', () => {
  // 2026-09-28 is a Monday.
  it('says how many are old and how old the oldest is', () => {
    expect(overdueLine([item('a', '2026-09-08'), item('b', '2026-09-10'), item('c', '2026-09-25')], today)).toBe('2 waiting over 2 weeks. Oldest: 20 days.');
    expect(overdueLine([item('c', '2026-09-27')], today)).toBe('All under 2 weeks. Oldest: 1 day.');
    expect(overdueLine([], today)).toBe('Nothing overdue.');
  });

  it('names the next busy days and says when today is clear', () => {
    expect(dueWeekLine(dueByDay([item('t', '2026-09-29'), item('u', '2026-10-01'), item('v', '2026-10-01')], today))).toBe('1 tomorrow, 2 on Thursday. Today is clear.');
    expect(dueWeekLine(dueByDay([item('t', today), item('a', '2026-09-30'), item('b', '2026-10-02')], today))).toBe('1 today, 1 on Wednesday, and more later.');
    expect(dueWeekLine(dueByDay([], today))).toBe('Nothing due in the next 7 days.');
  });

  it('lists check-in tiers worst first and skips empty ones', () => {
    expect(checkInLine({ at_risk: 12, watch: 9, dormant: 3, reorder_only: 2, healthy: 0 })).toBe('12 at risk, 9 to watch, 3 dormant, 2 reorders due.');
    expect(checkInLine({ at_risk: 0, watch: 0, dormant: 0, reorder_only: 1, healthy: 4 })).toBe('1 reorder due.');
    expect(checkInLine({ at_risk: 0, watch: 0, dormant: 0, reorder_only: 0, healthy: 4 })).toBe('Everyone is healthy.');
  });

  it('compares touches with the week before and names the busiest day', () => {
    expect(touchesLine({ total: 12, positive: 0, previous: 2, series: [0, 1, 0, 5, 2, 3, 1] }, today)).toBe('Up from 2 the week before. Busiest: Friday.');
    expect(touchesLine({ total: 3, positive: 0, previous: 3, series: [0, 0, 0, 0, 0, 0, 3] }, today)).toBe('Same as the week before. Busiest: today.');
    expect(touchesLine({ total: 0, positive: 0, previous: 4, series: [0, 0, 0, 0, 0, 0, 0] }, today)).toBe('None yet, after 4 the week before.');
  });
});
