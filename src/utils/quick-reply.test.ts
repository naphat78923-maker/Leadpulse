import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { buildQuickReply } from './quick-reply';

const deal: Deal = {
  id: 'd1', title: 'Butter · A', stage: 'proposal', product: 'Butter', client: 'Alpha Bakery', company_id: 'co1',
  contact_ids: [], value: null, priority: 'medium', next_action: 'Send samples', followup_date: '2026-10-10', last_outcome: null,
  buyer_reply: 'Old reply', nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

describe('buildQuickReply', () => {
  it('builds an inbound interaction and the verbatim reply, and nothing else', () => {
    const reply = buildQuickReply(deal, '  Please quote 20 kg.  ', 'dm', '2026-10-03')!;
    expect(reply.meeting).toMatchObject({
      type: 'dm', direction: 'inbound', date: '2026-10-03', deal_id: 'd1', company_id: 'co1', outcome: null, followup_date: null,
    });
    expect(reply.dealPatch).toEqual({ buyer_reply: 'Please quote 20 kg.' });
    expect(reply.before).toEqual({ buyer_reply: 'Old reply' });
  });

  it('still logs the interaction when the same words are already saved, without rewriting the deal', () => {
    const reply = buildQuickReply(deal, 'Old reply', 'email', '2026-10-03')!;
    expect(reply.meeting.type).toBe('email');
    expect(reply.dealPatch).toEqual({});
  });

  it('builds nothing from an empty paste', () => {
    expect(buildQuickReply(deal, '   ', 'dm', '2026-10-03')).toBeNull();
  });
});
