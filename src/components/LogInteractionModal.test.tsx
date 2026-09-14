import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Deal } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({
  updateDeal: vi.fn(),
  updateDealIfUnchanged: vi.fn(),
}));
const refresh = vi.fn();
const logActivity = vi.fn();

vi.mock('@/lib/crm', () => crmMocks);
vi.mock('@/components/CrmProvider', () => ({
  useCrm: () => ({ refresh, logActivity }),
}));

import LogInteractionModal from './LogInteractionModal';

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
  followup_date: null,
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

describe('LogInteractionModal save recovery', () => {
  beforeEach(() => {
    crmMocks.updateDeal.mockReset();
    crmMocks.updateDealIfUnchanged.mockReset();
    refresh.mockReset().mockResolvedValue(undefined);
    logActivity.mockReset();
  });

  afterEach(cleanup);

  it('keeps the current lane by default and does not write the deal', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    expect(screen.getByRole('radio', { name: /Keep current/i }).getAttribute('aria-checked')).toBe('true');
    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Sent outbound email, no reply yet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'No Response' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });

  it('preserves the form and shows an error when the interaction write fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('interaction write failed'));
    const onClose = vi.fn();

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    const description = screen.getByPlaceholderText(/Follow-up call/i) as HTMLInputElement;
    fireEvent.change(description, { target: { value: 'Call notes that must survive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/interaction write failed/i);
    expect(description.value).toBe('Call notes that must survive');
    expect(onClose).not.toHaveBeenCalled();
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });

  it('retries only a version-checked deal update after the interaction already saved', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    crmMocks.updateDeal
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce({ ...deal, workflow_action: 'reply' });
    crmMocks.updateDealIfUnchanged
      .mockRejectedValueOnce(new Error('write failed'))
      .mockResolvedValueOnce({ ...deal, workflow_action: 'reply' });

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Alice asked for pricing' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Positive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/deal update was not confirmed/i);
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Retry deal update' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledTimes(2);
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith(
      deal.id,
      deal.updated_at,
      expect.objectContaining({ workflow_action: 'reply', stage: 'contacted' }),
    );
    expect(crmMocks.updateDeal).not.toHaveBeenCalled();
  });

  it('lets an outreach with no reply enter Waiting on reply — no fabricated outcome', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    crmMocks.updateDealIfUnchanged.mockResolvedValue({ ...deal, workflow_action: 'reply' });

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Sent follow-up email, no reply yet' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
    fireEvent.click(screen.getByRole('button', { name: 'No Response' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ direction: 'outbound', outcome: 'no_response', deal_id: deal.id })
    );
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith(
      deal.id,
      deal.updated_at,
      expect.objectContaining({ workflow_action: 'reply', stage: 'contacted' })
    );
    expect(crmMocks.updateDealIfUnchanged.mock.calls[0][2].last_outcome).toMatch(/waiting on reply/);
  });

  it('records a client reply as inbound and keeps the lane when the user chooses to', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Alice asked for pricing' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Client replied/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Positive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ direction: 'inbound', outcome: 'positive' }));
    // Keeping the current lane is still a no-write: the event does not move the journey.
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });

  it('refuses a client reply tagged as no response', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Something happened' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Client replied/i }));
    fireEvent.click(screen.getByRole('button', { name: 'No Response' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/cannot be recorded as 'No Response'/i);
    expect(onSave).not.toHaveBeenCalled();
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });

  it('accepts a client reply with the sentiment left blank', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), {
      target: { value: 'They replied without detail' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Client replied/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ direction: 'inbound', outcome: null }));
  });

  it('records an internal note as internal and offers it no journey move', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();

    render(
      <LogInteractionModal
        isOpen
        onClose={onClose}
        onSave={onSave}
        deals={[deal]}
        contacts={[]}
        companies={[]}
        selectedDealId={deal.id}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /^Note/ }));
    expect(screen.getByText(/never moves the journey or counts as outreach/i)).toBeTruthy();
    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Internal pricing reminder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ direction: 'internal', type: 'note' }));
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });
});
