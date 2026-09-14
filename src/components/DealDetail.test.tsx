import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Deal } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({
  updateDeal: vi.fn(),
  updateDealIfUnchanged: vi.fn(),
  updateContact: vi.fn(),
  createAccountEvent: vi.fn(),
}));
const addToast = vi.fn();
const logActivity = vi.fn();
const addMeeting = vi.fn();

vi.mock('@/lib/crm', () => crmMocks);
vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ addToast }),
}));
vi.mock('@/components/CrmProvider', () => ({
  useCrm: () => ({
    logActivity,
    deleteEntity: vi.fn(),
    companies: [],
    contacts: [],
    meetings: [],
    addMeeting,
  }),
}));
vi.mock('@/components/LogInteractionModal', () => ({
  default: () => null,
}));
vi.mock('@/components/ExitDealModal', () => ({
  default: () => null,
}));

import DealDetail from './DealDetail';

const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · GALLOTHAI',
  stage: 'research',
  product: 'Butter',
  client: 'GALLOTHAI',
  company_id: null,
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: 'Capture feedback and send application notes',
  draft_primary_ask: "Ask for the team's first feedback",
  followup_date: null,
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

describe('DealDetail journey modal', () => {
  beforeEach(() => {
    crmMocks.updateDeal.mockReset().mockResolvedValue({
      ...deal,
      draft_primary_ask: 'Ask only for first trial feedback',
    });
    crmMocks.updateDealIfUnchanged.mockReset().mockResolvedValue({
      ...deal,
      draft_primary_ask: 'Ask only for first trial feedback',
    });
    addToast.mockReset();
    logActivity.mockReset();
  });

  afterEach(cleanup);

  it('shows first-screen fields: lane, next action, follow-up, Log touch — not Open/Won/Lost', () => {
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    expect(screen.getByText('ACTION LANE')).toBeTruthy();
    expect(screen.getByText('NEXT ACTION')).toBeTruthy();
    expect(screen.getByText('Follow-up date')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log touch/i })).toBeTruthy();
    expect(screen.queryByText('DEAL STATUS')).toBeNull();
    expect(screen.queryByRole('button', { name: /● Open/ })).toBeNull();
  });

  it('does not expand drafting brief by default', () => {
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);
    const summary = screen.getByText('Ebimaru drafting brief');
    expect(summary).toBeTruthy();
    const details = summary.closest('details');
    expect(details).toBeTruthy();
    expect(details?.open).toBe(false);
  });

  it('keeps sample milestone visible and has exit actions without won column', () => {
    render(
      <DealDetail
        deal={{
          ...deal,
          stage: 'proposal',
          workflow_action: 'sample',
          sample_status: 'received',
          next_action: 'Confirm kitchen test slot',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText('Track sample delivery')).toBeTruthy();
    expect(screen.getByText(/Received by client/)).toBeTruthy();
    expect(screen.getByText('EXITS (not columns)')).toBeTruthy();
  });

  it('saves only the field the user edited, one write, no false success', async () => {
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    // Expand drafting brief
    fireEvent.click(screen.getByText('Ebimaru drafting brief'));
    const ask = screen.getByPlaceholderText('What one thing should the client answer?');
    fireEvent.change(ask, { target: { value: 'Ask only for first trial feedback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save deal' }));

    await waitFor(() => expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith(
      'deal-1',
      deal.updated_at,
      { draft_primary_ask: 'Ask only for first trial feedback' }
    );
    // A whole-record write is exactly the defect: untouched fields must not be resent.
    expect(crmMocks.updateDeal).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('Deal saved!');
  });

  const movedDeal: Deal = {
    ...deal,
    workflow_action: 'reply',
    stage: 'contacted',
    followup_date: '2026-09-20',
    last_outcome: '2026-09-10 02:00:00 UTC] ✅ Outreach logged: Sent intro email\n---\n2026-09-14 04:00:00 UTC] ✅ Outreach logged — waiting on reply: Sent follow-up email',
    updated_at: '2026-09-14T04:00:00Z',
  };

  it('shows the moved lane and the latest history after an interaction, without a reload', () => {
    const { rerender } = render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    rerender(<DealDetail deal={movedDeal} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));

    expect((screen.getByLabelText('Action lane') as HTMLSelectElement).value).toBe('reply');
    expect(screen.getByText(/waiting on reply: Sent follow-up email/)).toBeTruthy();
  });

  it('keeps unsaved edits while the record moves on, and names the conflicted field', () => {
    const { rerender } = render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Call the chef back' } });

    // The same field moved in another surface while the editor was open.
    rerender(
      <DealDetail
        deal={{ ...movedDeal, next_action: 'Confirm the trial slot' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect((screen.getByLabelText('Next action') as HTMLInputElement).value).toBe('Call the chef back');
    expect((screen.getByLabelText('Action lane') as HTMLSelectElement).value).toBe('reply');
    expect(screen.getByRole('status').textContent).toMatch(/Next action/);

    fireEvent.click(screen.getByRole('button', { name: /Use the latest saved values/i }));
    expect((screen.getByLabelText('Next action') as HTMLInputElement).value).toBe('Confirm the trial slot');
  });

  it('writes nothing and does not claim success when nothing was edited', () => {
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save deal' }));

    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
    expect(addToast).toHaveBeenCalledWith('No changes to save');
  });

  it('reports a failed save and keeps the form recoverable', async () => {
    crmMocks.updateDealIfUnchanged.mockRejectedValueOnce(new Error('network down'));
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Call the chef back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save deal' }));

    expect(await screen.findByText(/Could not save: network down/)).toBeTruthy();
    expect(addToast).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Next action') as HTMLInputElement).value).toBe('Call the chef back');
  });

  it('surfaces a rejected concurrent update instead of silently overwriting', async () => {
    crmMocks.updateDealIfUnchanged.mockRejectedValueOnce(
      new Error('This deal changed while the interaction was saving. Review its current lane before trying again.')
    );
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Call the chef back' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save deal' }));

    expect(await screen.findByText(/changed while the interaction was saving/i)).toBeTruthy();
    expect(addToast).not.toHaveBeenCalled();
  });
});
