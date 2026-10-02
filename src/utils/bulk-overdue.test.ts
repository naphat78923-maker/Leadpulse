import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { planBulkPark, planBulkSnooze } from './bulk-overdue';

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, title: id, stage: 'contacted', product: 'Butter', client: `Client ${id}`, company_id: null, contact_ids: [],
  value: null, priority: 'medium', next_action: 'Call', followup_date: '2026-09-08', last_outcome: 'Earlier note',
  nudge_count: 0, workflow_action: 'reply', nudge_stage: null, sample_status: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...over,
});

describe('planBulkSnooze', () => {
  it('moves every deal to the same date and keeps each old date for undo', () => {
    const { date, items } = planBulkSnooze([deal('a'), deal('b', { followup_date: '2026-09-20' })], '2026-10-02', 7);
    expect(date).toBe('2026-10-09');
    expect(items.map(i => i.updates)).toEqual([{ followup_date: '2026-10-09' }, { followup_date: '2026-10-09' }]);
    expect(items.map(i => i.before)).toEqual([{ followup_date: '2026-09-08' }, { followup_date: '2026-09-20' }]);
    expect(items[0].description).toBe('Client a follow-up moved to 2026-10-09');
  });

  it('crosses a month boundary correctly', () => {
    expect(planBulkSnooze([deal('a')], '2026-10-30', 3).date).toBe('2026-11-02');
  });
});

describe('planBulkPark', () => {
  it('requires a reason, exactly like a single park', () => {
    expect(planBulkPark([deal('a')], { reason: '   ' })).toEqual({ items: [], error: 'Give a reason for parking these deals.' });
  });

  it('rejects a malformed revisit date', () => {
    expect(planBulkPark([deal('a')], { reason: 'No reply', revisitDate: 'next month' }).error).toMatch(/revisit date/);
  });

  it('parks through the same rules as a single park and snapshots what undo restores', () => {
    const { items, error } = planBulkPark([deal('a')], { reason: 'No reply after 4 nudges', revisitDate: '2026-11-16' });
    expect(error).toBeNull();
    expect(items[0].updates).toMatchObject({
      stage: 'research', workflow_action: 'parked', nudge_stage: null,
      park_reason: 'No reply after 4 nudges', followup_date: '2026-11-16',
    });
    // The journal is appended to, never replaced.
    expect(items[0].updates.last_outcome).toMatch(/^Earlier note\n---\n\[.*\] ⏸ Parked — No reply after 4 nudges · revisit 2026-11-16$/);
    expect(items[0].before).toEqual({
      stage: 'contacted', workflow_action: 'reply', nudge_stage: null, last_outcome: 'Earlier note',
      park_reason: null, followup_date: '2026-09-08',
    });
  });

  it('parks without a revisit date', () => {
    expect(planBulkPark([deal('a')], { reason: 'Closed for season' }).items[0].updates.followup_date).toBeNull();
  });
});
