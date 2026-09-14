import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { buildLaneGateDecision } from './lane-gate';

const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · Alice Bakery',
  stage: 'research',
  product: 'Butter',
  client: 'Alice Bakery',
  company_id: 'company-1',
  contact_ids: ['contact-1'],
  value: null,
  priority: 'medium',
  next_action: 'Send the intro email',
  followup_date: null,
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const opts = { dateKey: '2026-09-15' };

describe('dragging into Waiting on reply', () => {
  it('does not claim a client reply when the outcome is "no response"', () => {
    const { updates, meeting } = buildLaneGateDecision(
      deal,
      { target: 'reply', channel: 'call', reply_outcome: 'no_response' },
      opts
    );

    expect(meeting).toMatchObject({ type: 'call', direction: 'outbound', outcome: 'no_response' });
    expect(updates.last_outcome).toMatch(/Outreach logged — waiting on reply/);
    // The fabricated reply line is gone.
    expect(updates.last_outcome).not.toMatch(/Client replied/);
  });

  it('records a real client reply as inbound', () => {
    const { updates, meeting } = buildLaneGateDecision(
      deal,
      { target: 'reply', channel: 'dm', reply_outcome: 'positive', reply_summary: 'Asked for pricing' },
      opts
    );

    expect(meeting).toMatchObject({ direction: 'inbound', outcome: 'positive', summary: 'Asked for pricing' });
    expect(updates.last_outcome).toMatch(/Client replied — positive: Asked for pricing/);
  });

  it('treats an absent outcome as a wait, not as a reply', () => {
    const { meeting, updates } = buildLaneGateDecision(deal, { target: 'reply', channel: 'email' }, opts);

    expect(meeting).toMatchObject({ direction: 'outbound', outcome: 'no_response' });
    expect(updates.last_outcome).toMatch(/Outreach logged/);
  });
});

describe('other lane moves', () => {
  it('logs an outreach channel as an outbound attempt', () => {
    const { meeting, updates } = buildLaneGateDecision(
      deal,
      { target: 'outreach', channel: 'email', next_action: 'Call the buyer' },
      opts
    );

    expect(meeting).toMatchObject({ type: 'email', direction: 'outbound', outcome: null });
    expect(updates).toMatchObject({ workflow_action: 'outreach', next_action: 'Call the buyer', nudge_stage: null });
    expect(updates).not.toHaveProperty('last_outcome');
  });

  it('logs a sample dispatch without an outcome claim', () => {
    const { meeting } = buildLaneGateDecision(deal, { target: 'sample', sample_status: 'sent' }, opts);
    expect(meeting).toMatchObject({ type: 'sample_sent', direction: 'outbound', outcome: null });
  });

  it('dates the interaction on the business calendar it is given', () => {
    const { meeting } = buildLaneGateDecision(deal, { target: 'outreach', channel: 'call' }, opts);
    expect(meeting?.date).toBe('2026-09-15');
  });

  it('logs nothing for a follow-up move that carries no interaction', () => {
    const { meeting, updates } = buildLaneGateDecision(deal, { target: 'reschedule', followup_date: '2026-09-20' }, opts);
    expect(meeting).toBeNull();
    expect(updates).toMatchObject({ workflow_action: 'reschedule', followup_date: '2026-09-20' });
  });
});
