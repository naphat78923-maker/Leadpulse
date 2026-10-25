import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Deal, DealWorkflowAction } from '@/types/crm';
import LaneGateModal from './LaneGateModal';
import { localDateKey } from '@/utils/deal-board';
import { addDaysToDateKey } from '@/utils/deal-workflow';
import { LANE_PLAYBOOKS } from '@/utils/lane-playbook';

const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · Alice Bakery',
  stage: 'contacted',
  product: 'Butter',
  client: 'Alice Bakery',
  company_id: null,
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: 'Send intro email',
  followup_date: null,
  last_outcome: 'Called',
  nudge_count: 0,
  workflow_action: 'reply',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

const renderGate = (target: DealWorkflowAction, overrides: Partial<Deal> = {}) => {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  render(<LaneGateModal deal={{ ...deal, ...overrides }} targetLane={target} onCancel={() => {}} onConfirm={onConfirm} />);
  return onConfirm;
};
const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement;
const confirmSample = () => {
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Sent to client' }));
};

describe('LaneGateModal lane playbooks', () => {
  afterEach(cleanup);

  it('fills the Sample date and next action on a deal with no date, and saves them', async () => {
    const onConfirm = renderGate('sample');
    const expected = addDaysToDateKey(localDateKey(), LANE_PLAYBOOKS.sample!.days);
    expect(field('Follow-up date').value).toBe(expected);
    expect(field('Next action').value).toBe('Check the sample arrived');
    expect(screen.getByText('+3 days · Sample default')).toBeTruthy();
    expect(screen.getByText('Replaces: Send intro email')).toBeTruthy();

    confirmSample();
    fireEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ followup_date: expected, next_action: 'Check the sample arrived' });
  });

  it('keeps a date already on the deal and offers the default instead', async () => {
    const onConfirm = renderGate('sample', { followup_date: '2099-01-15' });
    expect(field('Follow-up date').value).toBe('2099-01-15');
    expect(screen.getByText(/The deal's date is kept/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Use +3 days' }));
    expect(field('Follow-up date').value).toBe(addDaysToDateKey(localDateKey(), 3));
    fireEvent.change(field('Follow-up date'), { target: { value: '2099-01-15' } });

    confirmSample();
    fireEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0].followup_date).toBe('2099-01-15');
  });

  it('lets Pat clear both before saving: nothing is written for them', async () => {
    const onConfirm = renderGate('sample');
    fireEvent.change(field('Follow-up date'), { target: { value: '' } });
    fireEvent.change(field('Next action'), { target: { value: '' } });

    confirmSample();
    fireEvent.click(screen.getByRole('button', { name: 'Move deal' }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    expect(onConfirm.mock.calls[0][0]).toMatchObject({ followup_date: null, next_action: null });
  });

  it('fills the Testing date, which a move into Testing needs', () => {
    renderGate('testing', { sample_status: 'received' });
    expect(field('Testing date').value).toBe(addDaysToDateKey(localDateKey(), 7));
    expect(field('Next action').value).toBe('Ask how the test went');
  });

  it('leaves an Outreach move as it was: no date and an empty next action', () => {
    renderGate('outreach');
    expect(screen.queryByLabelText('Follow-up date')).toBeNull();
    expect((screen.getByPlaceholderText(/Call K. Oil/) as HTMLInputElement).value).toBe('');
  });
});
