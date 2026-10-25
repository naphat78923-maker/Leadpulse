import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { NUDGE_SEND_LIMIT } from './deal-workflow';
import { buildParkSuggestions, parkSuggestionLabel } from './park-suggestion';

function deal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'd1',
    title: 't',
    stage: 'contacted',
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
    workflow_action: 'reply',
    nudge_stage: null,
    sample_status: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  };
}

const send = (date: string, dealId = 'd1') => ({ deal_id: dealId, type: 'dm', direction: 'outbound', outcome: null, date });
const reply = (date: string, dealId = 'd1') => ({ deal_id: dealId, type: 'dm', direction: 'inbound', outcome: null, date });
const sends = (count: number, dealId = 'd1') =>
  Array.from({ length: count }, (_, i) => send(`2026-10-${String(i + 1).padStart(2, '0')}`, dealId));

describe('buildParkSuggestions', () => {
  it('asks about a deal at the nudge limit with no reply', () => {
    const [item, ...rest] = buildParkSuggestions({ deals: [deal()], meetings: sends(NUDGE_SEND_LIMIT) });
    expect(rest).toHaveLength(0);
    expect(item).toMatchObject({ sends: 4, buyerReplied: false });
    expect(parkSuggestionLabel(item)).toBe('4 sends, no reply');
  });

  it('waits until the limit', () => {
    expect(buildParkSuggestions({ deals: [deal()], meetings: sends(NUDGE_SEND_LIMIT - 1) })).toEqual([]);
  });

  it('does not ask once the buyer has replied since', () => {
    const meetings = [...sends(4), reply('2026-10-20')];
    expect(buildParkSuggestions({ deals: [deal()], meetings })).toEqual([]);
  });

  it('counts only the sends since the last reply', () => {
    const meetings = [send('2026-09-01'), reply('2026-09-02'), ...sends(4)];
    const [item] = buildParkSuggestions({ deals: [deal()], meetings });
    expect(item).toMatchObject({ sends: 4, buyerReplied: true });
    expect(parkSuggestionLabel(item)).toBe('4 sends since their last reply');
  });

  it('never asks about a parked or closed deal', () => {
    const meetings = sends(5);
    for (const closed of [
      deal({ workflow_action: 'parked' }),
      deal({ stage: 'closed_won', workflow_action: 'success' }),
      deal({ stage: 'closed_lost', workflow_action: 'parked' }),
    ]) {
      expect(buildParkSuggestions({ deals: [closed], meetings })).toEqual([]);
    }
  });

  it('only suggests: the deals come back untouched', () => {
    const original = deal();
    const [item] = buildParkSuggestions({ deals: [original], meetings: sends(4) });
    expect(item.deal).toBe(original);
    expect(original.workflow_action).toBe('reply');
  });

  it('lists the longest-chased first', () => {
    const deals = [deal({ id: 'a', client: 'Alpha' }), deal({ id: 'b', client: 'Beta' })];
    const meetings = [...sends(4, 'a'), ...sends(6, 'b')];
    expect(buildParkSuggestions({ deals, meetings }).map(item => item.deal.client)).toEqual(['Beta', 'Alpha']);
  });
});
