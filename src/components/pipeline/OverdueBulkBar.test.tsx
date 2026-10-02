import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Deal } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({ updateDealIfUnchanged: vi.fn() }));
const logActivity = vi.fn();
const addToast = vi.fn();
vi.mock('@/lib/crm', () => crmMocks);
vi.mock('@/components/CrmProvider', () => ({ useCrm: () => ({ logActivity }) }));
vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ addToast }) }));

import OverdueBulkBar from './OverdueBulkBar';

const deal = (id: string): Deal => ({
  id, title: id, stage: 'contacted', product: 'Butter', client: `Client ${id}`, company_id: null, contact_ids: [],
  value: null, priority: 'medium', next_action: 'Call', followup_date: '2026-09-08', last_outcome: null,
  nudge_count: 0, workflow_action: 'reply', nudge_stage: null, sample_status: null,
  created_at: '2026-09-01T00:00:00Z', updated_at: `2026-09-0${id}T00:00:00Z`,
});
const deals = [deal('1'), deal('2'), deal('3')];

describe('OverdueBulkBar', () => {
  beforeEach(() => {
    crmMocks.updateDealIfUnchanged = vi.fn().mockResolvedValue({});
    logActivity.mockClear();
    addToast.mockClear();
  });
  afterEach(cleanup);

  it('renders nothing when no overdue deal is shown', () => {
    expect(render(<OverdueBulkBar deals={[]} today="2026-10-02" onDone={vi.fn()} />).container.textContent).toBe('');
  });

  it('writes nothing until the snooze is confirmed, then updates every deal with its own undo', async () => {
    const onDone = vi.fn();
    render(<OverdueBulkBar deals={deals} today="2026-10-02" onDone={onDone} />);
    expect(screen.getByText('3 overdue deals')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Next week' }));
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: 'Confirm snooze' }).textContent).toMatch(/3 deals/);

    fireEvent.click(screen.getByRole('button', { name: 'Snooze 3 deals' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledTimes(3);
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith('1', deals[0].updated_at, { followup_date: '2026-10-09' });
    expect(logActivity).toHaveBeenCalledTimes(3);
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({ entityId: '1', undoPayload: { followup_date: '2026-09-08' } }));
    expect(addToast.mock.calls[0][0]).toMatch(/^Snoozed 3 deals to /);
  });

  it('cancel leaves everything untouched', () => {
    render(<OverdueBulkBar deals={deals} today="2026-10-02" onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '+3 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
    expect(screen.getByText('3 overdue deals')).toBeTruthy();
  });

  it('skips a deal that changed in the meantime and says so', async () => {
    crmMocks.updateDealIfUnchanged = vi.fn()
      .mockResolvedValueOnce({})
      .mockImplementationOnce(() => { throw new Error('This deal changed before the update was saved'); })
      .mockResolvedValueOnce({});
    const onDone = vi.fn();
    render(<OverdueBulkBar deals={deals} today="2026-10-02" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: '+3 days' }));
    fireEvent.click(screen.getByRole('button', { name: 'Snooze 3 deals' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(logActivity).toHaveBeenCalledTimes(2);
    expect(addToast.mock.calls[0][0]).toMatch(/^Snoozed 2 deals to .* · 1 skipped \(changed in the meantime\)$/);
  });

  it('will not park without a reason, then parks every deal with it', async () => {
    const onDone = vi.fn();
    render(<OverdueBulkBar deals={deals.slice(0, 1)} today="2026-10-02" onDone={onDone} />);
    fireEvent.click(screen.getByRole('button', { name: 'Park all…' }));
    fireEvent.click(screen.getByRole('button', { name: 'Park 1 deal' }));
    expect(screen.getByRole('alert').textContent).toMatch(/Give a reason/);
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText('Reason for parking'), { target: { value: 'No reply after 4 nudges' } });
    fireEvent.click(screen.getByRole('button', { name: 'Park 1 deal' }));
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith('1', deals[0].updated_at,
      expect.objectContaining({ workflow_action: 'parked', park_reason: 'No reply after 4 nudges' }));
    expect(addToast.mock.calls[0][0]).toBe('Parked 1 deal');
  });
});
