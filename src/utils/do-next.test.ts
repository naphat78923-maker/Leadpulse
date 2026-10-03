import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import type { DealGrade } from './grade';
import { buildDoNext } from './do-next';
import { laneTimelines } from './lane-time';

const TODAY = '2026-10-03';
const NOW = Date.parse('2026-10-03T03:00:00Z');

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, title: 'Butter', stage: 'proposal', product: 'Butter', client: id, company_id: null,
  contact_ids: ['c1'], value: 1000, priority: 'medium', next_action: 'Send the price list', followup_date: null, last_outcome: null,
  buyer_reply: null, nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-30T00:00:00Z', updated_at: '2026-09-30T00:00:00Z', ...over,
});

const inbound = (dealId: string, date: string) =>
  ({ deal_id: dealId, type: 'email', direction: 'inbound', outcome: null, date, created_at: `${date}T09:00:00Z` });

const grade = (over: Partial<DealGrade>): DealGrade => ({
  status: 'graded', baseTier: 'B', tier: 'B', suggestedTier: 'B', momentum: 0, reasons: [], review: [], quantity: 'none', ...over,
});

const run = (deals: Deal[], meetings: ReturnType<typeof inbound>[], grades = new Map<string, DealGrade>()) =>
  buildDoNext({ deals, meetings, grades, timelines: laneTimelines(deals, []), today: TODAY, now: NOW });

describe('buildDoNext', () => {
  it('is empty when nothing needs attention', () => {
    expect(run([deal('calm')], [])).toEqual([]);
  });

  it('lists a deal once, with every reason, strongest first', () => {
    const stalledAndWaiting = deal('both', { created_at: '2026-09-01T00:00:00Z' });
    const [item] = run([stalledAndWaiting], [inbound('both', '2026-09-28')]);
    expect(item.reasons.map(r => r.kind)).toEqual(['waiting', 'reply-words', 'stalled']);
    expect(item.reasons[0].label).toBe('Buyer replied 5 days ago, nothing sent since');
    expect(item.reasons[2].label).toBe('32 days in Sample');
  });

  it('ranks asked, then review, then waiting, then missing words, then stalled', () => {
    const deals = [
      deal('stalled', { created_at: '2026-09-01T00:00:00Z' }),
      deal('waiting', { buyer_reply: 'Thanks, noted.' }),
      deal('asked', { buyer_reply: 'Please send a quotation.' }),
      deal('review', { buyer_reply: 'ขอใบเสนอราคา' }),
    ];
    const meetings = [inbound('waiting', '2026-10-02'), inbound('asked', '2026-10-02')];
    const grades = new Map([
      ['asked', grade({ pRequestedNextStep: 0.9 })],
      ['review', grade({ status: 'needs_review', review: ['Thai reply — review it yourself'] })],
    ]);
    const items = run(deals, meetings, grades);
    expect(items.map(i => [i.deal.id, i.reasons[0].kind])).toEqual([
      ['asked', 'asked'], ['review', 'review'], ['waiting', 'waiting'], ['stalled', 'stalled'],
    ]);
    expect(items[1].reasons[0].label).toMatch(/Laya needs your call: Thai reply/);
  });

  it('puts a deal with more reasons above one with the same top reason', () => {
    const deals = [deal('one', { buyer_reply: 'ok' }), deal('two', { created_at: '2026-09-01T00:00:00Z', buyer_reply: 'ok' })];
    const items = run(deals, [inbound('one', '2026-10-02'), inbound('two', '2026-10-02')]);
    expect(items.map(i => i.deal.id)).toEqual(['two', 'one']);
  });
});
