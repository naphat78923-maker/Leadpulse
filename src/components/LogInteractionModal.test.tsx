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
    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Sent outbound email, no reply yet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'No reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

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

    const description = screen.getByLabelText('What happened') as HTMLTextAreaElement;
    fireEvent.change(description, { target: { value: 'Call notes that must survive' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

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

    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Alice asked for pricing' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Positive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

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

    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Sent follow-up email, no reply yet' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
    fireEvent.click(screen.getByRole('button', { name: 'No reply' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

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

    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Alice asked for pricing' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /They replied/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Positive' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ direction: 'inbound', outcome: 'positive' }));
    // Keeping the current lane is still a no-write: the event does not move the journey.
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });

  it('does not offer "No reply" for a client reply, and drops it when switching to a reply', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'No reply' }));
    fireEvent.click(screen.getByRole('radio', { name: /They replied/i }));
    expect(screen.queryByRole('button', { name: 'No reply' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ direction: 'inbound', outcome: null }));
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

    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'They replied without detail' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /They replied/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

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

    fireEvent.click(screen.getByRole('radio', { name: 'Note' }));
    expect(screen.queryByRole('radiogroup', { name: /Deal stage/i })).toBeNull();
    expect(screen.queryByRole('radiogroup', { name: 'Channel' })).toBeNull();
    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Internal pricing reminder' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ direction: 'internal', type: 'note' }));
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });

  describe('deal schedule', () => {
    const scheduledDeal: Deal = { ...deal, followup_date: '2026-09-15', next_action: 'Follow up on the offer' };

    const renderModal = (props: Partial<React.ComponentProps<typeof LogInteractionModal>> = {}) => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();
      render(
        <LogInteractionModal
          isOpen
          onClose={onClose}
          onSave={onSave}
          deals={[scheduledDeal]}
          contacts={[]}
          companies={[]}
          selectedDealId={scheduledDeal.id}
          {...props}
        />
      );
      return { onSave, onClose };
    };

    it('shows the deal\'s current follow-up and keeps it by default', () => {
      renderModal();

      expect(screen.getByText(/now 15 Sept? 2026/)).toBeTruthy();
      expect(screen.getByRole('radio', { name: 'Keep' }).getAttribute('aria-checked')).toBe('true');
    });

    it('writes the schedule into the SAME update as the lane move', async () => {
      const { onSave, onClose } = renderModal();
      crmMocks.updateDealIfUnchanged.mockResolvedValue({ ...scheduledDeal, workflow_action: 'reply' });

      fireEvent.change(screen.getByLabelText('What happened'), {
        target: { value: 'Sent follow-up email, no reply yet' },
      });
      fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
      fireEvent.click(screen.getByRole('radio', { name: 'Pick date' }));
      fireEvent.change(screen.getByLabelText(/Next follow-up date/i), { target: { value: '2099-09-22' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledTimes(1);
      expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith(
        scheduledDeal.id,
        scheduledDeal.updated_at,
        expect.objectContaining({ workflow_action: 'reply', followup_date: '2099-09-22' })
      );
    });

    it('leaves the deal schedule alone and records no date when Keep is chosen', async () => {
      const { onSave, onClose } = renderModal();

      fireEvent.change(screen.getByLabelText('What happened'), {
        target: { value: 'Called about the trial' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ followup_date: null }));
      expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
    });

    it('sets the deal\'s follow-up from a quick option in one version-checked write', async () => {
      const { onSave, onClose } = renderModal();
      crmMocks.updateDealIfUnchanged.mockResolvedValue(scheduledDeal);

      fireEvent.click(screen.getByRole('radio', { name: /^\+1 week/ }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      const [, , updates] = crmMocks.updateDealIfUnchanged.mock.calls[0];
      expect(updates).toEqual({ followup_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ followup_date: updates.followup_date }));
    });

    it('clears the schedule only when the user explicitly asks', async () => {
      const { onClose } = renderModal();
      crmMocks.updateDealIfUnchanged.mockResolvedValue({ ...scheduledDeal, followup_date: null });

      fireEvent.change(screen.getByLabelText('What happened'), {
        target: { value: 'No longer chasing this' },
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Clear' }));
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledWith(
        scheduledDeal.id,
        scheduledDeal.updated_at,
        { followup_date: null }
      );
    });

    it('keeps a partial failure visible and retries the schedule with the same payload', async () => {
      const { onSave, onClose } = renderModal();
      crmMocks.updateDealIfUnchanged
        .mockRejectedValueOnce(new Error('write failed'))
        .mockResolvedValueOnce({ ...scheduledDeal, followup_date: '2099-09-22' });

      fireEvent.change(screen.getByLabelText('What happened'), {
        target: { value: 'Confirm the sampling slot' },
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Pick date' }));
      fireEvent.change(screen.getByLabelText(/Next follow-up date/i), { target: { value: '2099-09-22' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      expect((await screen.findByRole('alert')).textContent).toMatch(/deal update was not confirmed/i);
      // Half the action saved: the interaction went in once, the deal did not.
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(onClose).not.toHaveBeenCalled();

      fireEvent.click(screen.getByRole('button', { name: 'Retry deal update' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledTimes(1);
      expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledTimes(2);
      expect(crmMocks.updateDealIfUnchanged.mock.calls[1][2]).toEqual({ followup_date: '2099-09-22' });
    });

    it('never schedules a deal from an unlinked note', async () => {
      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      render(
        <LogInteractionModal
          isOpen
          onClose={onClose}
          onSave={onSave}
          deals={[scheduledDeal]}
          contacts={[]}
          companies={[]}
        />
      );

      fireEvent.change(screen.getByLabelText('What happened'), {
        target: { value: 'Note with no linked deal' },
      });
      fireEvent.click(screen.getByRole('radio', { name: 'Pick date' }));
      fireEvent.change(screen.getByLabelText(/Next follow-up date/i), { target: { value: '2099-09-22' } });
      fireEvent.click(screen.getByRole('button', { name: 'Save' }));

      await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
      expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ deal_id: null, followup_date: '2099-09-22' }));
      expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
    });
  });
});

describe('LogInteractionModal next action continuation', () => {
  beforeEach(() => {
    crmMocks.updateDeal.mockReset();
    crmMocks.updateDealIfUnchanged.mockReset().mockResolvedValue(deal);
    refresh.mockReset().mockResolvedValue(undefined);
    logActivity.mockReset();
  });

  afterEach(cleanup);

  it('writes a typed next action in the same version-checked deal update', async () => {
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

    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    expect(screen.getByPlaceholderText('Keep: Send intro email')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Called, chef asked for pricing' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'No reply' }));
    fireEvent.change(screen.getByLabelText('Next action on this deal'), {
      target: { value: 'Send pricing sheet' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(crmMocks.updateDealIfUnchanged).toHaveBeenCalledTimes(1);
    const [dealId, expectedAt, updates] = crmMocks.updateDealIfUnchanged.mock.calls[0];
    expect(dealId).toBe(deal.id);
    expect(expectedAt).toBe(deal.updated_at);
    expect(updates).toEqual({ next_action: 'Send pricing sheet' });
  });

  it('never writes the next action when the field is untouched or unchanged', async () => {
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

    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Called, no answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'No reply' }));
    fireEvent.click(screen.getByRole('button', { name: /More/ }));
    // Same text as the current next action, just padded — a no-op, not a write.
    fireEvent.change(screen.getByLabelText('Next action on this deal'), {
      target: { value: '  Send intro email  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(crmMocks.updateDealIfUnchanged).not.toHaveBeenCalled();
  });
});


describe('LogInteractionModal quick logging', () => {
  beforeEach(() => {
    crmMocks.updateDealIfUnchanged.mockReset();
    refresh.mockReset().mockResolvedValue(undefined);
    logActivity.mockReset();
  });

  afterEach(cleanup);

  const renderQuick = () => {
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
    return { onSave, onClose };
  };

  it('saves with nothing typed, titled from the channel', async () => {
    const { onSave, onClose } = renderQuick();

    fireEvent.click(screen.getByRole('radio', { name: 'Email' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ description: 'Sent an email', summary: null, type: 'email' }));
  });

  it('uses the first line as the title and the rest as notes', async () => {
    const { onSave, onClose } = renderQuick();

    fireEvent.change(screen.getByLabelText('What happened'), {
      target: { value: 'Chef liked the sample\nWants 5 kg trial next month\nCall back Tuesday' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      description: 'Chef liked the sample',
      summary: 'Wants 5 kg trial next month\nCall back Tuesday',
    }));
  });

  it('saves on Cmd/Ctrl+Enter', async () => {
    const { onSave, onClose } = renderQuick();

    fireEvent.keyDown(screen.getByLabelText('What happened'), { key: 'Enter', metaKey: true });

    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledTimes(1);
  });
});
