import { describe, expect, it } from 'vitest';
import type { AttentionCandidate } from './followup-policy';
import type { CheckInRow } from './this-week-queue';
import { checkInSplit, dueByDay, groupOverdueByAge, touchesLastSevenDays } from './this-week-stats';

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
    ], today);

    expect(touches).toEqual({ total: 2, positive: 1, series: [1, 0, 0, 0, 0, 0, 1] });
  });
});
