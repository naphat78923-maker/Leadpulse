import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import { buildInteractionWorkflowUpdate, laneTargetOptions, isLaneTargetAllowed } from './interaction-workflow';

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

const replyDeal = { ...baseDeal, workflow_action: 'reply' as const, stage: 'contacted' as const };
const sampleDeal = { ...baseDeal, workflow_action: 'sample' as const, stage: 'proposal' as const, sample_status: 'sent' as const };
const testingDeal = { ...baseDeal, workflow_action: 'testing' as const, stage: 'negotiation' as const, followup_date: '2026-09-01' };

describe('lane targets offered for an event', () => {
  it('offers Waiting on reply to an outbound attempt', () => {
    const options = laneTargetOptions(baseDeal, 'outbound_attempt');
    expect(options.map(o => o.target)).toEqual(['reply', 'reschedule']);
    expect(options[0].label).toBe('Log outreach and wait for reply');
  });

  it('never offers Waiting on reply to a recorded client reply', () => {
    const options = laneTargetOptions(baseDeal, 'customer_response');
    expect(options.map(o => o.target)).toEqual(['reschedule']);
    expect(isLaneTargetAllowed(baseDeal, 'reply', 'customer_response')).toBe(false);
  });

  it('offers no journey move to an internal note', () => {
    expect(laneTargetOptions(baseDeal, 'internal_note')).toEqual([]);
    expect(laneTargetOptions(replyDeal, 'internal_note')).toEqual([]);
  });

  it('keeps the normal forward chain intact for a reply record', () => {
    expect(laneTargetOptions(replyDeal, 'customer_response').map(o => o.target)).toEqual(['sample', 'reschedule']);
    expect(laneTargetOptions(sampleDeal, 'customer_response').map(o => o.target)).toEqual(['testing', 'reschedule']);
  });
});

describe('buildInteractionWorkflowUpdate', () => {
  it('keeps the current lane by default even after an outbound no-response touch', () => {
    const updates = buildInteractionWorkflowUpdate(baseDeal, 'outreach', {
      kind: 'outbound_attempt',
      outcome: 'no_response',
      interactionDescription: 'Sent follow-up email',
    });

    expect(updates).toBeNull();
  });

  it('lets an outreach with no reply enter Waiting on reply without inventing an outcome', () => {
    const updates = buildInteractionWorkflowUpdate(baseDeal, 'reply', {
      kind: 'outbound_attempt',
      outcome: 'no_response',
      interactionDescription: 'Sent follow-up email',
    });

    expect(updates).toMatchObject({ workflow_action: 'reply', stage: 'contacted' });
    expect(updates?.last_outcome).toMatch(/Outreach logged — waiting on reply/);
    expect(updates?.last_outcome).not.toMatch(/responded|reply from/i);
  });

  it('does not let a recorded client reply be logged as a wait', () => {
    expect(() => buildInteractionWorkflowUpdate(baseDeal, 'reply', {
      kind: 'customer_response',
      outcome: 'positive',
      interactionDescription: 'Alice asked for pricing',
    })).toThrow(/explicit next action/i);
  });

  it('refuses a client reply that is tagged no response, and keeps sentiment optional', () => {
    expect(() => buildInteractionWorkflowUpdate(baseDeal, 'reschedule', {
      kind: 'customer_response',
      outcome: 'no_response',
      interactionDescription: 'Tried to log a reply',
      testingDate: '2026-09-20',
    })).toThrow(/cannot be recorded as .No Response./i);

    const updates = buildInteractionWorkflowUpdate(baseDeal, 'reschedule', {
      kind: 'customer_response',
      outcome: null,
      interactionDescription: 'They replied without detail',
      testingDate: '2026-09-20',
    });
    expect(updates).toMatchObject({ workflow_action: 'reschedule', followup_date: '2026-09-20' });
    expect(updates?.last_outcome).toMatch(/Customer reply \(sentiment not recorded\)/);
  });

  it('takes a client reply to a direct follow-up without inventing a sample or testing step', () => {
    const updates = buildInteractionWorkflowUpdate(baseDeal, 'reschedule', {
      kind: 'customer_response',
      outcome: 'positive',
      interactionDescription: 'Alice asked for pricing',
      testingDate: '2026-09-20',
    });

    expect(updates).toMatchObject({ workflow_action: 'reschedule', followup_date: '2026-09-20' });
    expect(updates).not.toHaveProperty('sample_status');
    expect(updates?.last_outcome).toMatch(/Customer reply \(positive\): Alice asked for pricing/);
  });

  it('refuses to move a deal on the strength of an internal note', () => {
    expect(() => buildInteractionWorkflowUpdate(replyDeal, 'sample', {
      kind: 'internal_note',
      outcome: null,
      interactionDescription: 'Note to self',
      sampleStatus: 'sent',
    })).toThrow(/Choose the current lane|offered next actions/i);
  });

  it('requires sent or received status before moving to Sample', () => {
    expect(() => buildInteractionWorkflowUpdate(replyDeal, 'sample', {
      kind: 'customer_response',
      outcome: 'positive',
      interactionDescription: 'Client requested a sample',
    })).toThrow(/sample status/i);
  });

  it('requires a testing date before moving to Testing', () => {
    expect(() => buildInteractionWorkflowUpdate(sampleDeal, 'testing', {
      kind: 'customer_response',
      outcome: 'positive',
      interactionDescription: 'Sample arrived',
    })).toThrow(/testing date/i);
  });

  it('advances Testing to Follow-up — won is never via log/drag', () => {
    expect(() => buildInteractionWorkflowUpdate(testingDeal, 'success', {
      kind: 'customer_response',
      outcome: 'positive',
      interactionDescription: 'Test completed',
      confirmSuccess: true,
    })).toThrow(/exit menu/i);

    const updates = buildInteractionWorkflowUpdate(testingDeal, 'reschedule', {
      kind: 'customer_response',
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
