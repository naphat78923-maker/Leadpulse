// Component tests for the saved-review panel.
//
// These cover the properties that make a saved review safe, each of which is an
// acceptance criterion:
//   * nothing is written on field change — the writers are only reached through Save
//   * an incomplete draft is refused, and refused before anything is written
//   * the panel names the deal it is about to change, and says when there is none
//   * the save offers an undo that restores both the review row and the deal date

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

afterEach(() => cleanup());

// Without this, one test's writes are visible to the next and the "writes nothing"
// assertions below become meaningless.
beforeEach(() => {
  writers.saveProspectReview.mockClear();
  writers.restoreProspectReview.mockClear();
  writers.clearProspectReview.mockClear();
  writers.setDealFollowupDate.mockClear();
  toast.addToast.mockClear();
});

const writers = vi.hoisted(() => ({
  saveProspectReview: vi.fn(async (payload: Record<string, unknown>) => ({
    ...payload,
    id: 'row-1',
    created_at: '2026-09-11T10:00:00.000Z',
    updated_at: '2026-09-11T10:00:00.000Z',
  })),
  restoreProspectReview: vi.fn(async () => ({})),
  clearProspectReview: vi.fn(async () => {}),
  setDealFollowupDate: vi.fn(async () => {}),
}));

const toast = vi.hoisted(() => ({ addToast: vi.fn() }));

vi.mock('@/lib/prospectReviews', () => writers);
vi.mock('@/components/ToastProvider', () => ({ useToast: () => toast }));

import ProspectReviewPanel from './ProspectReviewPanel';
import type { ProspectReviewRow } from '@/lib/prospectReviews';
import type { FollowupDeal } from '@/utils/prospectReviewDecision';

const ARCHETYPE = 'plant_based_restaurant_cafe';

function deal(over: Partial<FollowupDeal> = {}): FollowupDeal {
  return { id: 'd1', company_id: 'c1', stage: 'research', title: 'Butter · Cafe', followup_date: null, ...over };
}

const previousReview: ProspectReviewRow = {
  id: 'row-0',
  company_id: 'c1',
  decision: 'needs_research',
  reason_code: 'route_unverified',
  reason_note: null,
  criterion_ref: null,
  reviewed_at: '2026-09-01T10:00:00.000Z',
  next_action: null,
  next_action_owner: null,
  next_action_due: null,
  evidence_note: null,
  evidence_links: null,
  needs_data_review: false,
  created_at: '2026-09-01T10:00:00.000Z',
  updated_at: '2026-09-01T10:00:00.000Z',
};

function renderPanel(over: { deals?: FollowupDeal[]; review?: ProspectReviewRow | null } = {}) {
  const onChanged = vi.fn();
  render(
    <ProspectReviewPanel
      companyId="c1"
      companyName="Green Bowl"
      archetypeId={ARCHETYPE}
      deals={over.deals ?? [deal()]}
      review={over.review ?? null}
      onChanged={onChanged}
    />
  );
  return { onChanged };
}

function fillValidShortlist() {
  fireEvent.click(screen.getByRole('button', { name: 'Shortlist' }));
  fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'verified_route' } });
  fireEvent.change(screen.getByLabelText('Next action'), { target: { value: 'Send the sample list' } });
  fireEvent.change(screen.getByLabelText('Owner'), { target: { value: 'Pat' } });
  fireEvent.change(screen.getByLabelText(/due date/i), { target: { value: '2026-09-30' } });
}

describe('ProspectReviewPanel', () => {
  it('states that nothing is written until Save, and writes nothing on field change', () => {
    renderPanel();
    fillValidShortlist();

    expect(screen.getByText(/Nothing changes until you press Save/i)).toBeTruthy();
    expect(writers.saveProspectReview).not.toHaveBeenCalled();
    expect(writers.setDealFollowupDate).not.toHaveBeenCalled();
  });

  it('refuses a decision with no reason, before writing anything', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Shortlist' }));
    fireEvent.click(screen.getByRole('button', { name: /Save review/i }));

    expect(await screen.findByText(/Fix the highlighted fields before saving/i)).toBeTruthy();
    expect(screen.getByText(/never saved on the note alone/i)).toBeTruthy();
    expect(writers.saveProspectReview).not.toHaveBeenCalled();
  });

  it('refuses a rejection with no note: an exclusion states what it saw', async () => {
    renderPanel();
    fireEvent.click(screen.getByRole('button', { name: 'Not a fit' }));
    fireEvent.change(screen.getByLabelText('Reason'), { target: { value: 'wrong_business_type' } });
    fireEvent.click(screen.getByRole('button', { name: /Save review/i }));

    expect(await screen.findByText(/needs a note/i)).toBeTruthy();
    expect(writers.saveProspectReview).not.toHaveBeenCalled();
  });

  it('names the deal it will change before the save, and writes one field on save', async () => {
    const { onChanged } = renderPanel();
    fillValidShortlist();

    expect(screen.getByText(/Sets the follow-up date on "Butter · Cafe"/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Save review/i }));

    await waitFor(() => expect(writers.saveProspectReview).toHaveBeenCalledTimes(1));
    const payload = writers.saveProspectReview.mock.calls[0][0];
    expect(payload).toMatchObject({
      company_id: 'c1',
      decision: 'shortlist',
      reason_code: 'verified_route',
      next_action: 'Send the sample list',
      next_action_owner: 'Pat',
      next_action_due: '2026-09-30',
    });
    expect(Object.keys(payload)).not.toContain('status');

    expect(writers.setDealFollowupDate).toHaveBeenCalledWith('d1', '2026-09-30');
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(toast.addToast).toHaveBeenCalledWith(
      'Review saved · deal follow-up updated',
      'success',
      expect.objectContaining({ label: 'Undo' })
    );
  });

  it('offers an undo that restores the previous review and the previous deal date', async () => {
    renderPanel({ deals: [deal({ followup_date: '2026-08-20' })], review: previousReview });
    fillValidShortlist();
    fireEvent.click(screen.getByRole('button', { name: /Save review/i }));

    await waitFor(() => expect(toast.addToast).toHaveBeenCalled());
    const action = toast.addToast.mock.calls[0][2] as { onClick: () => void };
    action.onClick();

    await waitFor(() => expect(writers.restoreProspectReview).toHaveBeenCalledWith(previousReview));
    expect(writers.setDealFollowupDate).toHaveBeenLastCalledWith('d1', '2026-08-20');
    expect(writers.clearProspectReview).not.toHaveBeenCalled();
  });

  it('clears a review that never existed, rather than restoring an empty row', async () => {
    renderPanel({ review: null });
    fillValidShortlist();
    fireEvent.click(screen.getByRole('button', { name: /Save review/i }));

    await waitFor(() => expect(toast.addToast).toHaveBeenCalled());
    const action = toast.addToast.mock.calls[0][2] as { onClick: () => void };
    action.onClick();

    await waitFor(() => expect(writers.clearProspectReview).toHaveBeenCalledWith('c1'));
    expect(writers.restoreProspectReview).not.toHaveBeenCalled();
  });

  it('states plainly when there is no open deal to update, and writes nothing to the board', async () => {
    renderPanel({ deals: [deal({ stage: 'closed_won' })] });
    fillValidShortlist();

    expect(screen.getByText(/No open deal is linked to this company/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Save review/i }));

    await waitFor(() => expect(writers.saveProspectReview).toHaveBeenCalled());
    expect(writers.setDealFollowupDate).not.toHaveBeenCalled();
    expect(toast.addToast).toHaveBeenCalledWith('Review saved', 'success', expect.objectContaining({ label: 'Undo' }));
  });

  it('asks which deal when more than one is open instead of picking one', () => {
    renderPanel({ deals: [deal(), deal({ id: 'd2', title: 'Second deal' })] });
    fillValidShortlist();

    expect(screen.getByText(/more than one open deal/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Which deal?'), { target: { value: 'd2' } });
    fireEvent.click(screen.getByRole('button', { name: /Save review/i }));

    return waitFor(() => expect(writers.setDealFollowupDate).toHaveBeenCalledWith('d2', '2026-09-30'));
  });

  it('reopens a saved review with its stored values and offers to clear it', () => {
    renderPanel({ review: previousReview });

    expect(screen.getByText(/last reviewed 2026-09-01/)).toBeTruthy();
    expect((screen.getByLabelText('Reason') as HTMLSelectElement).value).toBe('route_unverified');
    expect(screen.getByRole('button', { name: /Clear review/i })).toBeTruthy();
    expect(screen.getByText(/No reviewer identity is recorded/i)).toBeTruthy();
  });
});
