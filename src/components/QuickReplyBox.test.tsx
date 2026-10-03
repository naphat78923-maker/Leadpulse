import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Deal } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({ updateDealIfUnchanged: vi.fn() }));
vi.mock('@/lib/crm', () => crmMocks);
const provider = vi.hoisted(() => ({ addMeeting: vi.fn(), logActivity: vi.fn(), refresh: vi.fn() }));
vi.mock('@/components/CrmProvider', () => ({ useCrm: () => provider }));
const addToast = vi.hoisted(() => vi.fn());
vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ addToast }) }));

import QuickReplyBox from './QuickReplyBox';

const deal: Deal = {
  id: 'd1', title: 'Butter · A', stage: 'proposal', product: 'Butter', client: 'Alpha Bakery', company_id: 'co1',
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: null, nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

describe('QuickReplyBox', () => {
  beforeEach(() => {
    crmMocks.updateDealIfUnchanged = vi.fn().mockResolvedValue(undefined);
    provider.addMeeting = vi.fn().mockResolvedValue(undefined);
    provider.logActivity = vi.fn();
    provider.refresh = vi.fn().mockResolvedValue(undefined);
    addToast.mockReset();
  });
  afterEach(cleanup);

  it('cannot save until something is pasted', () => {
    render(<QuickReplyBox deal={deal} />);
    expect((screen.getByRole('button', { name: 'Save reply' }) as HTMLButtonElement).disabled).toBe(true);
    expect(provider.addMeeting).not.toHaveBeenCalled();
  });

  it('logs an inbound interaction and saves the exact words in one step', async () => {
    render(<QuickReplyBox deal={deal} />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Please quote 20 kg.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reply' }));

    await waitFor(() => expect(addToast).toHaveBeenCalled());
    expect(provider.addMeeting).toHaveBeenCalledWith(expect.objectContaining({ deal_id: 'd1', direction: 'inbound', type: 'dm' }));
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith('d1', deal.updated_at, { buyer_reply: 'Please quote 20 kg.' });
    expect(provider.logActivity).toHaveBeenCalledWith(expect.objectContaining({ undoPayload: { buyer_reply: null } }));
    expect(box.value).toBe('');
  });

  it('keeps the pasted words and says so when the save fails', async () => {
    crmMocks.updateDealIfUnchanged = vi.fn().mockRejectedValue(new Error('stale'));
    render(<QuickReplyBox deal={deal} />);
    const box = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'Please quote 20 kg.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save reply' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/Could not save the reply/);
    expect(box.value).toBe('Please quote 20 kg.');
  });
});
