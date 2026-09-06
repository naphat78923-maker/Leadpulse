import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import {
  deriveNudge,
  formatDerivedNudgeBadge,
  isOnJourneyBoard,
  WORKFLOW_LANES,
  outboundSendCountForDeal,
  stageFromSendCount,
  NUDGE_SEND_LIMIT,
} from './deal-workflow';

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

const meeting = (overrides: Partial<{ deal_id: string | null; type: string; direction: string | null }>) => ({
  deal_id: 'd1',
  type: 'call',
  direction: 'outbound',
  ...overrides,
});

describe('journey board + send-count nudges', () => {
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

  it('counts only outbound call / email / DM sends per deal', () => {
    const meetings = [
      meeting({ type: 'call' }),                       // outbound call → send
      meeting({ type: 'email' }),                      // outbound email → send
      meeting({ type: 'dm', direction: null }),        // legacy row without direction → send
      meeting({ type: 'dm', direction: 'unknown' }),   // legacy unknown → send
      meeting({ type: 'dm', direction: 'inbound' }),   // captured reply → NOT a send
      meeting({ type: 'meeting', direction: 'outbound' }), // meeting → NOT a send
      meeting({ type: 'note', direction: 'internal' }),    // note → NOT a send
      meeting({ type: 'call', deal_id: 'other' }),     // different deal → NOT counted
    ];
    expect(outboundSendCountForDeal(meetings, 'd1')).toBe(4);
    expect(outboundSendCountForDeal(meetings, 'other')).toBe(1);
    expect(outboundSendCountForDeal([], 'd1')).toBe(0);
  });

  it('maps send count to ladder stages and caps at 4', () => {
    expect(stageFromSendCount(0)).toBeNull();
    expect(stageFromSendCount(1)).toBe('warm');
    expect(stageFromSendCount(2)).toBe('remind');
    expect(stageFromSendCount(3)).toBe('firm');
    expect(stageFromSendCount(4)).toBe('parking');
    expect(stageFromSendCount(9)).toBe('parking');
    expect(NUDGE_SEND_LIMIT).toBe(4);
  });

  it('derives Warm/Remind/Firm/Park badges from outbound send count', () => {
    const today = '2026-09-06';
    expect(deriveNudge(deal(), today, { sendCount: 0 })).toBeNull();
    expect(formatDerivedNudgeBadge(deriveNudge(deal(), today, { sendCount: 1 })!)).toBe('1/4 Warm NG-001');
    expect(formatDerivedNudgeBadge(deriveNudge(deal(), today, { sendCount: 2 })!)).toBe('2/4 Remind NG-002');
    expect(formatDerivedNudgeBadge(deriveNudge(deal(), today, { sendCount: 3 })!)).toBe('3/4 Firm NG-003');
    const park = deriveNudge(deal(), today, { sendCount: 4 })!;
    expect(formatDerivedNudgeBadge(park)).toBe('4/4 Suggest Park NG-004');
    expect(park.suggestPark).toBe(true);
    // Stops at 4 — a 6th send still reads 4/4
    expect(formatDerivedNudgeBadge(deriveNudge(deal(), today, { sendCount: 6 })!)).toBe('4/4 Suggest Park NG-004');
  });

  it('never nudges parked or closed deals', () => {
    const today = '2026-09-06';
    expect(deriveNudge(deal({ workflow_action: 'parked' }), today, { sendCount: 3 })).toBeNull();
    expect(deriveNudge(deal({ stage: 'closed_won', workflow_action: 'success' }), today, { sendCount: 3 })).toBeNull();
    expect(deriveNudge(deal({ stage: 'closed_lost', workflow_action: 'parked' }), today, { sendCount: 3 })).toBeNull();
  });
});
