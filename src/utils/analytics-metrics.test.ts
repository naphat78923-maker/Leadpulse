import { describe, expect, it } from 'vitest';
import { Company, Deal } from '@/types/crm';
import { calculateSourcePerformance, calculateWeightedForecast, lostReasonTotals, parkReasonTotals, weightedLaneValues } from './analytics-metrics';

function deal(overrides: Partial<Deal>): Deal {
  return {
    id: crypto.randomUUID(),
    title: 'Butter opportunity',
    stage: 'research',
    product: 'Butter',
    client: 'Example buyer',
    company_id: null,
    contact_ids: [],
    value: null,
    priority: 'medium',
    next_action: null,
    followup_date: null,
    last_outcome: null,
    nudge_count: 0,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const referral: Company = {
  id: 'company-referral',
  name: 'Referral buyer',
  status: 'prospect',
  lead_source: 'Referral',
  account_owner: 'Pat',
  last_contact_date: null,
  tags: [],
  industry: null,
  size: null,
  address: null,
  website: null,
  notes: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

describe('analytics metrics', () => {
  it('counts closed losses in a lead source win-rate denominator', () => {
    const deals = [
      deal({ stage: 'closed_won', company_id: referral.id, value: 1000 }),
      ...Array.from({ length: 9 }, () => deal({ stage: 'closed_lost', company_id: referral.id, value: 1000 })),
    ];

    expect(calculateSourcePerformance(deals, [referral])).toEqual([
      { source: 'Referral', total: 10, won: 1, rate: 10 },
    ]);
  });

  it('forecasts active pipeline only and keeps closed revenue out of the forecast', () => {
    const deals = [
      deal({ stage: 'proposal', value: 20_000 }),
      deal({ stage: 'closed_won', value: 80_000 }),
    ];

    expect(calculateWeightedForecast(deals)).toBe(10_000);
  });
});

describe('weightedLaneValues', () => {
  it('weights each lane by the stage probability of its deals', () => {
    const byAction = {
      sample: [deal({ stage: 'proposal', value: 1000 }), deal({ stage: 'negotiation', value: 2000 })],
      outreach: [deal({ stage: 'research', value: null })],
    };
    expect(weightedLaneValues([{ id: 'sample' }, { id: 'outreach' }, { id: 'testing' }], byAction))
      .toEqual({ sample: 2000, outreach: 0, testing: 0 });
  });
});

describe('reason totals', () => {
  it('totals lost reasons with their labels, most common first and unrecorded last', () => {
    const deals = [
      deal({ lost_reason: 'no_reply' }), deal({ lost_reason: null }), deal({ lost_reason: null }), deal({ lost_reason: null }),
      deal({ lost_reason: 'price' }), deal({ lost_reason: 'no_reply' }),
    ];
    expect(lostReasonTotals(deals)).toEqual([
      { label: 'No reply', count: 2 }, { label: 'Price', count: 1 }, { label: 'Not recorded', count: 3 },
    ]);
  });

  it('counts the same park reason once whatever its capitals or spacing', () => {
    const deals = [
      deal({ park_reason: 'No reply after 4 nudges' }), deal({ park_reason: ' no reply  after 4 nudges ' }),
      deal({ park_reason: 'Budget next year' }), deal({ park_reason: '' }),
    ];
    expect(parkReasonTotals(deals)).toEqual([
      { label: 'No reply after 4 nudges', count: 2 }, { label: 'Budget next year', count: 1 }, { label: 'Not recorded', count: 1 },
    ]);
  });
});
