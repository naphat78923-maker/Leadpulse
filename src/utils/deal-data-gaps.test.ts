import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { buildDataGapReport, buyerHasReplied, dataGaps, dealIdsWithGap, isDataGap } from './deal-data-gaps';

const complete: Deal = {
  id: 'd1', title: 'Butter · A', stage: 'proposal', product: 'Butter', client: 'Alpha Bakery', company_id: null,
  contact_ids: ['c1'], value: 12000, priority: 'medium', next_action: 'Send the price list', followup_date: null, last_outcome: null,
  buyer_reply: null, nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

const inbound = { deal_id: 'd1', type: 'email', direction: 'inbound', outcome: null, date: '2026-09-10', created_at: '2026-09-10T00:00:00Z' } as never;

describe('dataGaps', () => {
  it('finds nothing on a complete deal', () => {
    expect(dataGaps(complete, false)).toEqual([]);
  });

  it('lists each gap, most actionable first', () => {
    const bare = { ...complete, contact_ids: [], value: null, next_action: 'Waiting for reply' };
    expect(dataGaps(bare, true)).toEqual(['reply-words', 'next-action', 'contact', 'value']);
  });

  it('asks for exact words only when the buyer has replied and none are pasted', () => {
    expect(dataGaps(complete, true)).toEqual(['reply-words']);
    expect(dataGaps({ ...complete, buyer_reply: 'Please quote 20 kg.' }, true)).toEqual([]);
    expect(dataGaps(complete, false)).toEqual([]);
  });

  it('keeps a zero value: only an unset value is a gap', () => {
    expect(dataGaps({ ...complete, value: 0 }, false)).toEqual([]);
  });

  it('ignores closed and parked deals', () => {
    const bare = { ...complete, contact_ids: [], value: null, next_action: null };
    expect(dataGaps({ ...bare, stage: 'closed_lost' }, true)).toEqual([]);
    expect(dataGaps({ ...bare, workflow_action: 'parked' }, true)).toEqual([]);
  });
});

describe('buyerHasReplied', () => {
  it('is true for an inbound interaction on the deal', () => {
    expect(buyerHasReplied(complete, [inbound])).toBe(true);
    expect(buyerHasReplied({ ...complete, id: 'other' }, [inbound])).toBe(false);
  });

  it('is true for a logged reply note without an interaction', () => {
    expect(buyerHasReplied({ ...complete, last_outcome: '💬 Client replied — positive: wants a quote' }, [])).toBe(true);
    expect(buyerHasReplied(complete, [])).toBe(false);
  });
});

describe('buildDataGapReport', () => {
  const noValue = { ...complete, id: 'd2', value: null };
  const noContact = { ...complete, id: 'd3', contact_ids: [], value: null };
  const report = buildDataGapReport([complete, noValue, noContact], [inbound]);

  it('counts deals per gap and deals with any gap', () => {
    expect(report.total).toBe(3);
    expect(report.counts).toEqual({ 'reply-words': 1, 'next-action': 0, contact: 1, value: 2 });
    expect(report.byDeal.get('d3')).toEqual(['contact', 'value']);
  });

  it('gives the ids for one gap or for any', () => {
    expect([...dealIdsWithGap(report, 'value')]).toEqual(['d2', 'd3']);
    expect([...dealIdsWithGap(report, 'all')]).toEqual(['d1', 'd2', 'd3']);
  });
});

describe('isDataGap', () => {
  it('accepts only known gaps', () => {
    expect(isDataGap('value')).toBe(true);
    expect(isDataGap('all')).toBe(false);
    expect(isDataGap(null)).toBe(false);
  });
});
