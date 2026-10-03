import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { buildDealTimeline } from './deal-timeline';
import { laneTimeline } from './lane-time';

const deal: Deal = {
  id: 'd1', title: 'Butter · A', stage: 'proposal', product: 'Butter', client: 'Alpha Bakery', company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: 'Please quote 20 kg.', nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T02:00:00Z', updated_at: '2026-09-01T02:00:00Z',
};

const touch = (id: string, date: string, type: string, direction: string, outcome: string | null = null, description = '') =>
  ({ id, deal_id: 'd1', type, date, description, summary: null, outcome, direction }) as never;

describe('buildDealTimeline', () => {
  const lane = laneTimeline(deal, [
    { entity: 'deal', entityId: 'd1', timestamp: Date.parse('2026-09-12T04:00:00Z'), undoPayload: { workflow_action: 'reply', stage: 'contacted' } },
  ]);
  const entries = buildDealTimeline(deal, [
    touch('m1', '2026-09-05', 'email', 'outbound', null, 'Intro email'),
    touch('m2', '2026-09-10', 'dm', 'inbound', null, 'Client reply'),
    touch('m3', '2026-09-20', 'dm', 'inbound'),
    touch('m4', '2026-09-15', 'call', 'outbound', 'positive'),
    touch('m5', '2026-09-16', 'note', 'internal', null, 'Check stock'),
    touch('m6', '2026-09-17', 'reward', 'internal'),
    { ...(touch('other', '2026-09-18', 'dm', 'inbound') as object), deal_id: 'd2' } as never,
  ], lane);

  it('lists touches, lane moves and creation newest first, leaving out rewards and other deals', () => {
    expect(entries.map(e => [e.date, e.kind])).toEqual([
      ['2026-09-20', 'theirs'], ['2026-09-16', 'note'], ['2026-09-15', 'ours'],
      ['2026-09-12', 'lane'], ['2026-09-10', 'theirs'], ['2026-09-05', 'ours'], ['2026-09-01', 'created'],
    ]);
  });

  it('words each entry for a reader', () => {
    expect(entries[0].title).toBe('They replied · DM');
    expect(entries[2].title).toBe('You reached out · Call');
    expect(entries[3]).toMatchObject({ title: 'Moved to Sample', detail: 'from Waiting on reply' });
    expect(entries[5].detail).toBe('Intro email');
  });

  it("puts the buyer's exact words on their newest reply only", () => {
    expect(entries[0].quote).toBe('Please quote 20 kg.');
    expect(entries.filter(e => e.quote)).toHaveLength(1);
  });

  it('has no quote without a reply in the thread or without saved words', () => {
    expect(buildDealTimeline(deal, [], lane).every(e => e.quote === null)).toBe(true);
    expect(buildDealTimeline({ ...deal, buyer_reply: null }, [touch('m2', '2026-09-10', 'dm', 'inbound')], lane)[1].quote).toBeNull();
  });
});
