import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import {
  dealToEditDraft,
  mergeDraft,
  detectDraftConflicts,
  buildDealEditPayload,
  type DealEditDraft,
} from './deal-edit-draft';

const deal: Deal = {
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
  draft_primary_ask: 'Ask for first feedback',
  followup_date: '2026-09-15',
  last_outcome: '2026-09-10 [old] Outreach logged',
  nudge_count: 0,
  workflow_action: 'outreach',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

const laneMovedDeal: Deal = {
  ...deal,
  workflow_action: 'reply',
  stage: 'contacted',
  followup_date: '2026-09-20',
  last_outcome: '2026-09-10 [old] Outreach logged\n---\n2026-09-14 [new] Outreach logged — waiting on reply',
  updated_at: '2026-09-14T04:00:00Z',
};

describe('dealToEditDraft', () => {
  it('reads the authoritative record into the editor defaults', () => {
    expect(dealToEditDraft(laneMovedDeal)).toMatchObject({
      workflow_action: 'reply',
      followup_date: '2026-09-20',
      next_action: 'Send intro email',
      value: '',
      sample_status: '',
      last_outcome_new: '',
    });
  });

  it('renders a missing value as the unknown blank, not zero', () => {
    expect(dealToEditDraft(deal).value).toBe('');
  });
});

describe('mergeDraft', () => {
  it('lays user edits over the authoritative record', () => {
    const base = dealToEditDraft(deal);
    const merged = mergeDraft(base, { next_action: 'Confirm the sampling slot' });
    expect(merged.next_action).toBe('Confirm the sampling slot');
    expect(merged.product).toBe('Butter');
  });

  it('keeps unrelated fields following the latest record after a background refresh', () => {
    const merged = mergeDraft(dealToEditDraft(laneMovedDeal), { next_action: 'Confirm the sampling slot' });
    expect(merged.workflow_action).toBe('reply');
    expect(merged.followup_date).toBe('2026-09-20');
    expect(merged.next_action).toBe('Confirm the sampling slot');
  });
});

describe('detectDraftConflicts', () => {
  it('reports a field the record changed while the user had an unsaved edit on it', () => {
    const previousBase: DealEditDraft = dealToEditDraft(deal);
    const currentBase: DealEditDraft = dealToEditDraft(laneMovedDeal);
    const edits: Partial<DealEditDraft> = { followup_date: '2026-10-01' };

    expect(detectDraftConflicts(previousBase, currentBase, edits)).toEqual(['followup_date']);
  });

  it('stays quiet when the record moved while the user touched nothing', () => {
    expect(detectDraftConflicts(dealToEditDraft(deal), dealToEditDraft(laneMovedDeal), {})).toEqual([]);
  });

  it('stays quiet when the user edited a field the record did not move', () => {
    const edits: Partial<DealEditDraft> = { next_action: 'Call back' };
    expect(detectDraftConflicts(dealToEditDraft(deal), dealToEditDraft(laneMovedDeal), edits)).toEqual([]);
  });
});

describe('buildDealEditPayload', () => {
  const draftOf = (d: Deal, edits: Partial<DealEditDraft> = {}) => mergeDraft(dealToEditDraft(d), edits);

  it('writes only the fields the user actually edited', () => {
    const payload = buildDealEditPayload({
      deal,
      draft: draftOf(deal, { draft_primary_ask: 'Ask only for trial feedback' }),
      editedFields: new Set(['draft_primary_ask']),
    });

    expect(payload).toEqual({ draft_primary_ask: 'Ask only for trial feedback' });
  });

  it('never reverts a field the record changed while the editor was open', () => {
    const draft = draftOf(laneMovedDeal, { next_action: 'Confirm the sampling slot' });
    const payload = buildDealEditPayload({
      deal: laneMovedDeal,
      draft,
      editedFields: new Set(['next_action']),
    });

    expect(payload).toEqual({ next_action: 'Confirm the sampling slot' });
    expect(payload).not.toHaveProperty('workflow_action');
    expect(payload).not.toHaveProperty('followup_date');
    expect(payload).not.toHaveProperty('last_outcome');
  });

  it('reports an empty payload when nothing changed, so no write is attempted', () => {
    const payload = buildDealEditPayload({
      deal,
      draft: draftOf(deal),
      editedFields: new Set(),
    });

    expect(payload).toEqual({});
  });

  it('treats a blank optional field the user cleared as an explicit null', () => {
    const payload = buildDealEditPayload({
      deal,
      draft: draftOf(deal, { next_action: '' }),
      editedFields: new Set(['next_action']),
    });

    expect(payload).toEqual({ next_action: null });
  });

  it('keeps the value unknown when the user cleared it', () => {
    const payload = buildDealEditPayload({
      deal,
      draft: draftOf(deal, { value: '' }),
      editedFields: new Set(['value']),
    });

    expect(payload).toEqual({ value: null });
  });

  it('records a lane change with its stage and clears the deprecated stored nudge stage', () => {
    const payload = buildDealEditPayload({
      deal,
      draft: draftOf(deal, { workflow_action: 'reply' }),
      editedFields: new Set(['workflow_action']),
    });

    expect(payload).toMatchObject({ workflow_action: 'reply', stage: 'contacted', nudge_stage: null });
  });

  it('appends a new journal entry to the latest record, not to the draft copy', () => {
    const payload = buildDealEditPayload({
      deal: laneMovedDeal,
      draft: draftOf(laneMovedDeal, { last_outcome_new: 'Buyer asked for pricing' }),
      editedFields: new Set(['last_outcome_new']),
    });

    expect(payload.last_outcome).toContain('2026-09-14 [new] Outreach logged — waiting on reply');
    expect(payload.last_outcome).toMatch(/Buyer asked for pricing$/);
    expect(payload).not.toHaveProperty('next_action');
  });
});
