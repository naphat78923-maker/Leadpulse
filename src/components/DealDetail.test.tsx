import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Deal } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({
  updateDeal: vi.fn(),
}));
const addToast = vi.fn();
const logActivity = vi.fn();

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
  }),
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

describe('DealDetail primary client ask', () => {
  beforeEach(() => {
    crmMocks.updateDeal.mockReset().mockResolvedValue({
      ...deal,
      draft_primary_ask: 'Ask only for first trial feedback',
    });
    addToast.mockReset();
    logActivity.mockReset();
  });

  afterEach(cleanup);

  it('saves the primary client ask independently from the CRM next action', async () => {
    render(<DealDetail deal={deal} onClose={vi.fn()} onSaved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    fireEvent.change(screen.getByLabelText('Primary client ask'), {
      target: { value: 'Ask only for first trial feedback' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save deal' }));

    await waitFor(() => expect(crmMocks.updateDeal).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateDeal).toHaveBeenCalledWith('deal-1', expect.objectContaining({
      next_action: 'Capture feedback and send application notes',
      draft_primary_ask: 'Ask only for first trial feedback',
    }));
  });

  it('removes the generated deal-name row and hides an empty drafting brief outside messaging lanes', () => {
    render(
      <DealDetail
        deal={{ ...deal, workflow_action: 'testing', draft_primary_ask: null }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.queryByText(/^Deal name/)).toBeNull();
    expect(screen.getByText('Commercial details')).toBeTruthy();
    expect(screen.queryByText('Primary client ask')).toBeNull();
  });

  it('keeps a stored client ask visible after a deal moves out of a messaging lane', () => {
    render(
      <DealDetail
        deal={{ ...deal, workflow_action: 'testing' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText('Primary client ask')).toBeTruthy();
    expect(screen.getByText("Ask for the team's first feedback")).toBeTruthy();
  });

  it('separates the confirmed sample milestone from the next action and shows pipeline stage', () => {
    render(
      <DealDetail
        deal={{
          ...deal,
          stage: 'proposal',
          workflow_action: 'sample',
          sample_status: 'received',
          next_action: 'Awaiting feedback',
        }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    expect(screen.getByText('CURRENT WORKFLOW STEP')).toBeTruthy();
    expect(screen.getByText('Pipeline stage: Proposal')).toBeTruthy();
    expect(screen.getByText('Track sample delivery')).toBeTruthy();
    expect(screen.getByText('Confirmed milestone: Received by client')).toBeTruthy();
    expect(screen.getByText('NEXT ACTION — WHAT YOU DO NEXT')).toBeTruthy();
  });

  it('flags passive next-action states until they become concrete', () => {
    render(
      <DealDetail
        deal={{ ...deal, next_action: 'Awaiting feedback' }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    const warning = screen.getByRole('alert');
    expect(warning.textContent).toContain('Needs a concrete action: start with follow up, ask, send, or confirm.');

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    fireEvent.change(screen.getByLabelText('Next action'), {
      target: { value: 'Follow up for sample-test feedback' },
    });

    expect(screen.queryByText('Needs a concrete action: start with follow up, ask, send, or confirm.')).toBeNull();
  });

  it('keeps a newly entered ask visible when the action lane changes before save', () => {
    render(
      <DealDetail
        deal={{ ...deal, draft_primary_ask: null }}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Edit deal' }));
    fireEvent.change(screen.getByLabelText('Primary client ask'), {
      target: { value: 'Ask for a test date' },
    });
    fireEvent.change(screen.getByLabelText('Action lane'), {
      target: { value: 'testing' },
    });

    expect(screen.getByLabelText('Primary client ask')).toBeTruthy();
  });
});
