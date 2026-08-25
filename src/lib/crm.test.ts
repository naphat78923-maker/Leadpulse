import { beforeEach, describe, expect, it, vi } from 'vitest';

const from = vi.hoisted(() => vi.fn());
vi.mock('./supabase', () => ({ supabase: { from } }));

import { updateDealIfUnchanged } from './crm';

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
