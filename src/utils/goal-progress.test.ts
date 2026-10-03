import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { goalProgress, monthStart } from './goal-progress';
import { laneTimelines } from './lane-time';

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, title: 'Butter', stage: 'proposal', product: 'Butter', client: id, company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: null, nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...over,
});

const won = (id: string, value: number, over: Partial<Deal> = {}) =>
  deal(id, { stage: 'closed_won', workflow_action: 'success', value, ...over });

describe('goalProgress', () => {
  const deals = [
    won('this-month', 40000, { close_date: '2026-10-02' }),
    won('logged', 10000),
    won('last-month', 99000, { close_date: '2026-09-20' }),
    won('undated', 5000),
    deal('open-a', { value: 60000 }),
    deal('open-b', { value: null }),
    deal('parked', { value: 70000, workflow_action: 'parked' }),
  ];
  const timelines = laneTimelines(deals, [
    { entity: 'deal', entityId: 'logged', timestamp: Date.parse('2026-10-01T05:00:00Z'), undoPayload: { workflow_action: 'testing', stage: 'negotiation' } },
  ]);

  it('counts deals won in the month, by close date or the logged move to won', () => {
    expect(goalProgress({ deals, timelines, today: '2026-10-03', goal: 100000 })).toEqual({
      won: 50000, wonDeals: 2, undatedWon: 1, openPipeline: 60000, gap: 50000, coverage: 1.2,
    });
  });

  it('has no gap or coverage without a goal, and no coverage once the goal is met', () => {
    expect(goalProgress({ deals, timelines, today: '2026-10-03', goal: null })).toMatchObject({ gap: null, coverage: null });
    expect(goalProgress({ deals, timelines, today: '2026-10-03', goal: 30000 })).toMatchObject({ gap: 0, coverage: null });
  });
});

describe('monthStart', () => {
  it('is the first day of the date key month', () => {
    expect(monthStart('2026-10-03')).toBe('2026-10-01');
  });
});
