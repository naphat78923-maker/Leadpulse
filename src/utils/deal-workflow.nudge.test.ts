import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { deriveNudge, formatDerivedNudgeBadge, isOnJourneyBoard, WORKFLOW_LANES } from './deal-workflow';

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'd1',
    title: 't',
    stage: 'research',
    product: 'Butter',
    client: 'Acme',
    company_id: null,
    contact_ids: [],
    value: null,
    priority: 'medium',
    next_action: null,
    followup_date: null,
    last_outcome: null,
    nudge_count: 0,
    workflow_action: 'reschedule',
    nudge_stage: null,
    sample_status: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

describe('journey board + derived nudges', () => {
  it('exposes only five journey columns', () => {
    expect(WORKFLOW_LANES.map(l => l.id)).toEqual([
      'outreach',
      'reply',
      'sample',
      'testing',
      'reschedule',
    ]);
    expect(WORKFLOW_LANES.find(l => l.id === 'reply')?.shortLabel).toBe('Waiting on reply');
  });

  it('excludes parked and closed from the journey board', () => {
    expect(isOnJourneyBoard(deal({ workflow_action: 'outreach' }))).toBe(true);
    expect(isOnJourneyBoard(deal({ workflow_action: 'parked' }))).toBe(false);
    expect(isOnJourneyBoard(deal({ stage: 'closed_won', workflow_action: 'success' }))).toBe(false);
    expect(isOnJourneyBoard(deal({ stage: 'closed_lost', workflow_action: 'parked' }))).toBe(false);
  });

  it('derives Warm/Remind/Firm/Park badges from silence past follow-up', () => {
    const today = '2026-09-06';
    expect(deriveNudge(deal({ followup_date: '2026-09-05' }), today)).toBeNull(); // 1d
    expect(formatDerivedNudgeBadge(deriveNudge(deal({ followup_date: '2026-09-03' }), today)!)).toBe('~3d Warm NG-001');
    expect(formatDerivedNudgeBadge(deriveNudge(deal({ followup_date: '2026-08-30' }), today)!)).toBe('~7d Remind NG-002');
    expect(formatDerivedNudgeBadge(deriveNudge(deal({ followup_date: '2026-08-23' }), today)!)).toBe('~14d Firm NG-003');
    const park = deriveNudge(deal({ followup_date: '2026-08-10' }), today)!;
    expect(formatDerivedNudgeBadge(park)).toBe('~21d Suggest Park NG-004');
    expect(park.suggestPark).toBe(true);
  });
});
