import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import {
  buildCloseUpdate,
  orderAmountForRecord,
  resolveCloseAction,
  WON_IS_NOT_CASH_COPY,
} from './deal-close';

const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · Alice Bakery',
  stage: 'negotiation',
  product: 'Butter',
  client: 'Alice Bakery',
  company_id: 'company-1',
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: 'Follow up and confirm the decision',
  followup_date: '2026-09-20',
  last_outcome: '2026-09-10 02:00:00 UTC] Customer reply (positive): They liked it',
  nudge_count: 0,
  workflow_action: 'testing',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

describe('resolving the pre-close sales action', () => {
  it('completes the action and archives it instead of leaving it as the recommendation', () => {
    const resolution = resolveCloseAction(deal, { resolution: 'complete' });

    expect(resolution.updates).toEqual({ next_action: null, followup_date: null });
    expect(resolution.actionNote).toMatch(/Previous action marked done: Follow up and confirm the decision/);
    expect(resolution.error).toBeNull();
  });

  it('replaces it with an explicit post-sale action and date', () => {
    const resolution = resolveCloseAction(deal, {
      resolution: 'replace',
      action: 'Send the first invoice',
      date: '2026-10-01',
    });

    expect(resolution.updates).toEqual({ next_action: 'Send the first invoice', followup_date: '2026-10-01' });
    expect(resolution.actionNote).toMatch(/Post-sale action: Send the first invoice/);
  });

  it('refuses a replacement with no action named', () => {
    const resolution = resolveCloseAction(deal, { resolution: 'replace', action: '   ' });
    expect(resolution.error).toMatch(/post-sale action/i);
    expect(resolution.updates).toEqual({});
  });

  it('keeps the action only when that choice is explicit, and writes nothing', () => {
    const resolution = resolveCloseAction(deal, { resolution: 'keep' });

    expect(resolution.updates).toEqual({});
    expect(resolution.actionNote).toMatch(/kept on purpose/);
  });

  it('leaves an already-empty action alone rather than inventing a note', () => {
    const resolution = resolveCloseAction({ ...deal, next_action: null }, { resolution: 'complete' });
    expect(resolution.updates).toEqual({ next_action: null, followup_date: null });
    expect(resolution.actionNote).toBeNull();
  });
});

describe('sale signals from a close', () => {
  it('records nothing when the value is unknown', () => {
    expect(orderAmountForRecord(null)).toBeNull();
    expect(orderAmountForRecord(undefined)).toBeNull();
    expect(orderAmountForRecord(0)).toBeNull();
    expect(orderAmountForRecord(Number.NaN)).toBeNull();
  });

  it('records a positive order value as given', () => {
    expect(orderAmountForRecord(50000)).toBe(50000);
    expect(orderAmountForRecord(Number('1250.5'))).toBe(1250.5);
  });
});

describe('buildCloseUpdate', () => {
  it('marks won with the resolved action and no manufactured order amount', () => {
    const { updates, recordOrderAmount } = buildCloseUpdate(deal, { kind: 'won', close_date: '2026-09-14' });

    expect(updates).toMatchObject({
      stage: 'closed_won',
      workflow_action: 'success',
      close_date: '2026-09-14',
      next_action: null,
      followup_date: null,
      nudge_stage: null,
    });
    expect(recordOrderAmount).toBeNull();
    // The previous action is archived in the journal, not lost.
    expect(updates.last_outcome).toMatch(/Marked won/);
    expect(updates.last_outcome).toMatch(/Previous action marked done/);
    expect(updates.last_outcome).toContain('Customer reply (positive)');
  });

  it('keeps a blank value unknown rather than writing zero', () => {
    const { updates } = buildCloseUpdate(deal, { kind: 'won', value: null });
    expect(updates).not.toHaveProperty('value');
  });

  it('records the order amount only when a positive value was given', () => {
    expect(buildCloseUpdate(deal, { kind: 'won', value: 42000 }).recordOrderAmount).toBe(42000);
    expect(buildCloseUpdate(deal, { kind: 'won', value: 0 }).recordOrderAmount).toBeNull();
  });

  it('preserves the action when the user chooses to keep it', () => {
    const { updates } = buildCloseUpdate(deal, { kind: 'won', action: { resolution: 'keep' } });

    expect(updates).not.toHaveProperty('next_action');
    expect(updates).not.toHaveProperty('followup_date');
    expect(updates.last_outcome).toMatch(/kept on purpose/);
  });

  it('reports an error and changes nothing when a replacement has no action', () => {
    const { updates, error } = buildCloseUpdate(deal, { kind: 'won', action: { resolution: 'replace', action: '' } });

    expect(error).toMatch(/post-sale action/i);
    expect(updates).toEqual({});
  });

  it('marks lost and park through the same path, keeping the park revisit date', () => {
    const lost = buildCloseUpdate(deal, { kind: 'lost', lost_reason: 'price' });
    expect(lost.updates).toMatchObject({ stage: 'closed_lost', workflow_action: 'parked', lost_reason: 'price' });

    const park = buildCloseUpdate(deal, { kind: 'park', park_reason: 'Budget freeze', followup_date: '2026-11-01' });
    expect(park.updates).toMatchObject({ workflow_action: 'parked', park_reason: 'Budget freeze', followup_date: '2026-11-01' });
    // The action resolution belongs to the Won exit only.
    expect(park.updates).not.toHaveProperty('next_action');
    expect(park.recordOrderAmount).toBeNull();
  });

  it('states plainly that won is not cash', () => {
    expect(WON_IS_NOT_CASH_COPY).toMatch(/not an order, delivery, or payment/i);
  });
});
