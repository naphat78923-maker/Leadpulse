import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { splitToContact } from './to-contact';

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, title: 'Butter', stage: 'research', product: 'Butter', client: id, company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  nudge_count: 0, workflow_action: 'outreach', nudge_stage: null, sample_status: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...over,
} as Deal);

describe('splitToContact', () => {
  it('queues Outreach deals with no logged call, email, DM or meeting', () => {
    const { toContact, inConversation } = splitToContact(
      [deal('untouched'), deal('emailed'), deal('noted')],
      [{ deal_id: 'emailed', type: 'email' }, { deal_id: 'noted', type: 'note' }],
    );
    expect(toContact.map(d => d.id)).toEqual(['noted', 'untouched']);
    expect(inConversation.map(d => d.id)).toEqual(['emailed']);
  });

  it('keeps a deal moved past Outreach on the board even with nothing logged', () => {
    const { toContact, inConversation } = splitToContact([deal('waiting', { workflow_action: 'reply' })], []);
    expect(toContact).toEqual([]);
    expect(inConversation.map(d => d.id)).toEqual(['waiting']);
  });

  it('leaves out closed and parked deals, and puts planned outreach first', () => {
    const { toContact, inConversation } = splitToContact([
      deal('b-undated'),
      deal('late', { followup_date: '2026-09-08' }),
      deal('later', { followup_date: '2026-09-17' }),
      deal('a-undated'),
      deal('lost', { stage: 'closed_lost' }),
      deal('parked', { workflow_action: 'parked' }),
    ], []);
    expect(toContact.map(d => d.id)).toEqual(['late', 'later', 'a-undated', 'b-undated']);
    expect(inConversation).toEqual([]);
  });
});
