import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { buildInteractionWorkflowUpdate } from './interaction-workflow';

const baseDeal: Deal = {
  id: 'deal-1',
  title: 'Butter · Alice Bakery',
  stage: 'research',
  product: 'Butter',
  client: 'Alice Bakery',
  company_id: null,
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: 'Send intro email',
  followup_date: null,
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('buildInteractionWorkflowUpdate', () => {
  it('keeps the current lane by default even after an outbound no-response touch', () => {
    const updates = buildInteractionWorkflowUpdate(baseDeal, 'outreach', {
      outcome: 'no_response',
      interactionDescription: 'Sent follow-up email',
    });

    expect(updates).toBeNull();
  });

  it('does not allow no response to be recorded as a client reply', () => {
    expect(() => buildInteractionWorkflowUpdate(baseDeal, 'reply', {
      outcome: 'no_response',
      interactionDescription: 'Sent follow-up email',
    })).toThrow(/customer reply/i);
  });

  it('moves to client reply only after an explicit supported outcome', () => {
    const updates = buildInteractionWorkflowUpdate(baseDeal, 'reply', {
      outcome: 'positive',
      interactionDescription: 'Alice asked for pricing',
    });

    expect(updates).toMatchObject({
      workflow_action: 'reply',
      stage: 'contacted',
    });
    // Journaling belongs to LogInteractionModal's mirror, not the lane util.
    expect(updates?.last_outcome).toBeUndefined();
  });

  it('requires sent or received status before moving to Sample', () => {
    const replyDeal = { ...baseDeal, workflow_action: 'reply' as const, stage: 'contacted' as const };

    expect(() => buildInteractionWorkflowUpdate(replyDeal, 'sample', {
      outcome: 'positive',
      interactionDescription: 'Client requested a sample',
    })).toThrow(/sample status/i);
  });

  it('requires a testing date before moving to Testing', () => {
    const sampleDeal = { ...baseDeal, workflow_action: 'sample' as const, stage: 'proposal' as const, sample_status: 'sent' as const };

    expect(() => buildInteractionWorkflowUpdate(sampleDeal, 'testing', {
      outcome: 'positive',
      interactionDescription: 'Sample arrived',
    })).toThrow(/testing date/i);
  });

  it('advances Testing to Follow-up — won is never via log/drag', () => {
    const testingDeal = { ...baseDeal, workflow_action: 'testing' as const, stage: 'negotiation' as const, followup_date: '2026-09-01' };

    expect(() => buildInteractionWorkflowUpdate(testingDeal, 'success', {
      outcome: 'positive',
      interactionDescription: 'Test completed',
      confirmSuccess: true,
    })).toThrow(/exit menu/i);

    const updates = buildInteractionWorkflowUpdate(testingDeal, 'reschedule', {
      outcome: 'positive',
      interactionDescription: 'Feedback due Friday',
      testingDate: '2026-09-05',
    });
    expect(updates).toMatchObject({
      workflow_action: 'reschedule',
      followup_date: '2026-09-05',
    });
  });
});
