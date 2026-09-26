import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { from } }));

import { getAccountEvents, recordOrderForClosedDeal, updateDeal, updateDealIfUnchanged } from './crm';

function mockVersionConflict(current: Record<string, unknown>) {
  const maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
  const updateSelect = vi.fn(() => ({ maybeSingle }));
  const versionEq = vi.fn(() => ({ select: updateSelect }));
  const idEq = vi.fn(() => ({ eq: versionEq }));
  const update = vi.fn(() => ({ eq: idEq }));

  const single = vi.fn().mockResolvedValue({ data: current, error: null });
  const fetchEq = vi.fn(() => ({ single }));
  const fetchSelect = vi.fn(() => ({ eq: fetchEq }));

  from
    .mockReturnValueOnce({ update })
    .mockReturnValueOnce({ select: fetchSelect });

  return { update, idEq, versionEq };
}

describe('updateDealIfUnchanged', () => {
  beforeEach(() => from.mockReset());

  it('rejects a stale transition instead of overwriting a newer deal', async () => {
    const chain = mockVersionConflict({
      id: 'deal-1',
      workflow_action: 'sample',
      stage: 'proposal',
      last_outcome: 'Newer edit',
    });

    await expect(updateDealIfUnchanged(
      'deal-1',
      '2026-08-25T10:00:00Z',
      { workflow_action: 'reply', stage: 'contacted', last_outcome: 'Old edit' },
    )).rejects.toThrow(/changed while the interaction was saving/i);

    expect(chain.idEq).toHaveBeenCalledWith('id', 'deal-1');
    expect(chain.versionEq).toHaveBeenCalledWith('updated_at', '2026-08-25T10:00:00Z');
  });

  it('treats a lost response as success when the requested transition already landed', async () => {
    const current = {
      id: 'deal-1',
      workflow_action: 'reply',
      stage: 'contacted',
      last_outcome: 'Customer reply (positive): Asked for pricing',
    };
    mockVersionConflict(current);

    await expect(updateDealIfUnchanged(
      'deal-1',
      '2026-08-25T10:00:00Z',
      {
        workflow_action: 'reply',
        stage: 'contacted',
        last_outcome: 'Customer reply (positive): Asked for pricing',
      },
    )).resolves.toEqual(current);
  });
});

describe('recordOrderForClosedDeal', () => {
  beforeEach(() => from.mockReset());

  it('records a positive closed-won order with a stable deal-specific id', async () => {
    const existingSingle = vi.fn().mockResolvedValue({ data: null, error: null });
    const existingEq = vi.fn(() => ({ maybeSingle: existingSingle }));
    const existingSelect = vi.fn(() => ({ eq: existingEq }));
    const insertSingle = vi.fn().mockResolvedValue({ data: { order_id: 'deal_deal-1', amount: 4_200 }, error: null });
    const insertSelect = vi.fn(() => ({ single: insertSingle }));
    const insert = vi.fn(() => ({ select: insertSelect }));
    from
      .mockReturnValueOnce({ select: existingSelect })
      .mockReturnValueOnce({ insert });

    await expect(recordOrderForClosedDeal('deal-1', {
      companyId: 'company-1',
      eventDate: '2026-09-20',
      amount: 4_200,
      productLine: 'Butter',
    })).resolves.toEqual({ order_id: 'deal_deal-1', amount: 4_200 });

    expect(insert).toHaveBeenCalledWith(expect.objectContaining({
      company_id: 'company-1',
      event_date: '2026-09-20',
      amount: 4_200,
      product_line: 'Butter',
      order_id: 'deal_deal-1',
      source: 'app_closed_won',
    }));
  });
});

describe('getAccountEvents', () => {
  beforeEach(() => from.mockReset());

  it('loads source provenance with sales-history rows', async () => {
    const order = vi.fn().mockResolvedValue({ data: [], error: null });
    const select = vi.fn(() => ({ order }));
    from.mockReturnValueOnce({ select });

    await expect(getAccountEvents()).resolves.toEqual([]);

    expect(from).toHaveBeenCalledWith('account_events');
    expect(select).toHaveBeenCalledWith('company_id,event_date,amount,product_line,order_id,source');
    expect(order).toHaveBeenCalledWith('event_date', { ascending: true });
  });
});

 describe('updateDeal explicit outbound fields', () => {
  beforeEach(() => from.mockReset());

  it('stores a cleared primary client ask as null', async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: 'deal-1', draft_primary_ask: null }, error: null });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    from.mockReturnValueOnce({ update });

    await updateDeal('deal-1', { draft_primary_ask: '   ' });

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ draft_primary_ask: null }));
  });
});
