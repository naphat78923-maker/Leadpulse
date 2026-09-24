import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { bestLeadSignal, calculateLeadScore, dealsWithVerbatimBuyerReply } from './lead-scoring';

let seq = 0;
function makeDeal(overrides: Partial<Deal> = {}): Deal {
  seq += 1;
  return {
    id: `deal-${seq}`,
    title: `Deal ${seq}`,
    stage: 'contacted',
    product: 'Butter',
    client: 'Client',
    company_id: 'company-1',
    contact_ids: [],
    value: null,
    priority: 'medium',
    next_action: null,
    followup_date: null,
    last_outcome: null,
    buyer_reply: null,
    nudge_count: 0,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

describe('bestLeadSignal', () => {
  it('returns null when there are no deals or none are open and active', () => {
    expect(bestLeadSignal([])).toBeNull();
    expect(bestLeadSignal([
      makeDeal({ stage: 'closed_won' }),
      makeDeal({ stage: 'closed_lost' }),
      makeDeal({ workflow_action: 'parked' }),
      makeDeal({ workflow_action: 'success' }),
    ])).toBeNull();
  });

  it('picks the highest-scoring open deal and exposes score and tier', () => {
    const cool = makeDeal({ id: 'cool' });
    const hot = makeDeal({ id: 'hot', stage: 'negotiation', priority: 'high', value: 300000 });
    const signal = bestLeadSignal([cool, hot]);
    expect(signal?.deal.id).toBe('hot');
    expect(signal?.score).toBe(calculateLeadScore(hot));
    expect(signal?.score).toBe(70);
    expect(signal?.tier).toBe('A');
  });

  it('ignores deal order in the input list', () => {
    const hot = makeDeal({ id: 'hot', stage: 'negotiation', priority: 'high', value: 300000 });
    const cool = makeDeal({ id: 'cool' });
    expect(bestLeadSignal([hot, cool])?.deal.id).toBe('hot');
  });
});

describe('dealsWithVerbatimBuyerReply', () => {
  it('keeps only open deals with a non-blank verbatim reply, hottest first', () => {
    const noReply = makeDeal({ id: 'none' });
    const blank = makeDeal({ id: 'blank', buyer_reply: '   ' });
    const closed = makeDeal({ id: 'closed', stage: 'closed_won', buyer_reply: 'Send the contract.' });
    const parked = makeDeal({ id: 'parked', workflow_action: 'parked', buyer_reply: 'Revisit in Q4.' });
    const cool = makeDeal({ id: 'cool', buyer_reply: 'Interesting.' });
    const hot = makeDeal({ id: 'hot', stage: 'negotiation', priority: 'high', value: 300000, buyer_reply: 'Please quote 20 kg.' });

    expect(
      dealsWithVerbatimBuyerReply([noReply, blank, closed, parked, cool, hot]).map(d => d.id),
    ).toEqual(['hot', 'cool']);
  });

  it('returns an empty list when nothing is scorable', () => {
    expect(dealsWithVerbatimBuyerReply([makeDeal(), makeDeal({ buyer_reply: null })])).toEqual([]);
  });
});
