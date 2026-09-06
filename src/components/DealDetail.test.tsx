import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Deal } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({
  updateDeal: vi.fn(),
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

  it('saves next action and drafting brief when editing', async () => {
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    // Expand drafting brief
    fireEvent.click(screen.getByText('Ebimaru drafting brief'));
    const ask = screen.getByPlaceholderText('What one thing should the client answer?');
    fireEvent.change(ask, { target: { value: 'Ask only for first trial feedback' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save deal' }));

    await waitFor(() => expect(crmMocks.updateDeal).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateDeal).toHaveBeenCalledWith(
      'deal-1',
      expect.objectContaining({
        next_action: 'Capture feedback and send application notes',
        draft_primary_ask: 'Ask only for first trial feedback',
        nudge_stage: null,
      })
    );
  });
});
