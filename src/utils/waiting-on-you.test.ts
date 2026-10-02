import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import type { DealGrade } from './grade';
import { buildWaitingOnYou, unansweredReplyDate, waitingLabel } from './waiting-on-you';

const TODAY = '2026-10-02';

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, title: 'Butter', stage: 'proposal', product: 'Butter', client: id, company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: null, nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...over,
});

const row = (dealId: string, date: string, direction: string, outcome: string | null = null, type = 'email') =>
  ({ deal_id: dealId, type, direction, outcome, date, created_at: `${date}T09:00:00Z` });

const grade = (p: number): DealGrade => ({
  status: 'graded', baseTier: 'B', tier: 'B', suggestedTier: 'B', momentum: 0, reasons: [], review: [], quantity: 'none', pRequestedNextStep: p,
});

describe('unansweredReplyDate', () => {
  it('is the reply date when the buyer spoke last', () => {
    const meetings = [row('a', '2026-09-20', 'outbound'), row('a', '2026-09-28', 'inbound')];
    expect(unansweredReplyDate(meetings, 'a')).toBe('2026-09-28');
  });

  it('is null once something outbound follows the reply', () => {
    const meetings = [row('a', '2026-09-28', 'inbound'), row('a', '2026-09-29', 'outbound', null, 'sample_sent')];
    expect(unansweredReplyDate(meetings, 'a')).toBeNull();
  });

  it('counts a call the buyer answered as a reply, and ignores internal notes after it', () => {
    const meetings = [row('a', '2026-09-28', 'outbound', 'positive', 'call'), row('a', '2026-09-29', 'internal', null, 'note')];
    expect(unansweredReplyDate(meetings, 'a')).toBe('2026-09-28');
  });

  it('is null when the buyer never replied, or only on another deal', () => {
    expect(unansweredReplyDate([row('a', '2026-09-20', 'outbound', 'no_response')], 'a')).toBeNull();
    expect(unansweredReplyDate([row('b', '2026-09-28', 'inbound')], 'a')).toBeNull();
  });
});

describe('buildWaitingOnYou', () => {
  const meetings = [
    row('old', '2026-09-22', 'inbound'),
    row('new', '2026-10-01', 'inbound'),
    row('asked', '2026-10-02', 'inbound'),
    row('later', '2026-09-30', 'inbound'),
    row('closed', '2026-09-30', 'inbound'),
  ];

  it('lists deals where the buyer spoke last: asked first, then longest wait', () => {
    const items = buildWaitingOnYou({
      deals: [deal('new'), deal('old'), deal('asked'), deal('quiet')],
      meetings, grades: new Map([['asked', grade(0.9)], ['new', grade(0.4)]]), today: TODAY,
    });
    expect(items.map(i => [i.deal.id, i.daysWaiting, i.asked])).toEqual([['asked', 0, true], ['old', 10, false], ['new', 1, false]]);
  });

  it('leaves out a deal with a follow-up scheduled for later, unless the buyer asked for a next step', () => {
    const scheduled = deal('later', { followup_date: '2026-10-09' });
    expect(buildWaitingOnYou({ deals: [scheduled], meetings, today: TODAY })).toEqual([]);
    expect(buildWaitingOnYou({ deals: [scheduled], meetings, grades: new Map([['later', grade(0.8)]]), today: TODAY })).toHaveLength(1);
    // Due today or overdue is still waiting.
    expect(buildWaitingOnYou({ deals: [deal('later', { followup_date: TODAY })], meetings, today: TODAY })).toHaveLength(1);
  });

  it('ignores closed and parked deals', () => {
    expect(buildWaitingOnYou({ deals: [deal('closed', { stage: 'closed_lost' })], meetings, today: TODAY })).toEqual([]);
    expect(buildWaitingOnYou({ deals: [deal('closed', { workflow_action: 'parked' })], meetings, today: TODAY })).toEqual([]);
  });
});

describe('waitingLabel', () => {
  it('words the wait', () => {
    expect([waitingLabel(0), waitingLabel(1), waitingLabel(5)]).toEqual(['today', 'yesterday', '5 days ago']);
  });
});
