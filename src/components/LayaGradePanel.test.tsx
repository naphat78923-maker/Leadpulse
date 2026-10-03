import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Deal } from '@/types/crm';
import LAYA_CUTOFFS from '@/utils/laya-cutoffs.json';
import { dealInputSha256 } from '@/utils/laya-freshness';

const crmMocks = vi.hoisted(() => ({ getLatestDealJudgment: vi.fn() }));
vi.mock('@/lib/crm', () => crmMocks);
vi.mock('@/components/CrmProvider', () => ({ useCrm: () => ({ meetings: [] }) }));

import LayaGradePanel from './LayaGradePanel';

const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · Bakery',
  stage: 'proposal',
  product: 'Butter',
  client: 'Bakery',
  company_id: null,
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: null,
  followup_date: null,
  last_outcome: null,
  buyer_reply: 'We tested the sample and loved it. Please quote 40 kg per month.',
  nudge_count: 0,
  workflow_action: 'sample',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

function row(inputSha: string, probabilities: Record<string, number>, nouls: Record<string, number> = {}) {
  const answers: Record<string, unknown> = { buyer_response: { probabilities } };
  for (const id of Object.keys(LAYA_CUTOFFS.deal)) if (id !== 'buyer_response') answers[id] = { noul: nouls[id] ?? 0.05 };
  return {
    deal_id: deal.id, question_set: 'terminal', input_sha256: inputSha, status: 'scored', not_scored_code: null,
    answers, model_package_sha256: 'a'.repeat(64), scored_at: '2026-10-01T12:00:00Z',
  };
}

const warm = { requested_next_step: 0.9, declined: 0.02, deferred: 0.02, unclear: 0.03, no_commitment: 0.03 };

describe('LayaGradePanel', () => {
  // A fresh spy per test: a reused (reset or cleared) spy re-reported the handled error in
  // the 'unavailable' test as a test failure, although the panel handles it.
  beforeEach(() => { crmMocks.getLatestDealJudgment = vi.fn(); });
  afterEach(cleanup);

  it('shows a graded tier move with its reasons for a fresh judgment', async () => {
    crmMocks.getLatestDealJudgment.mockResolvedValue(row((await dealInputSha256(deal))!, warm, { trial_reported: 0.9, trial_positive: 0.9 }));
    render(<LayaGradePanel deal={deal} />);
    expect(await screen.findByText('Laya grade · graded')).toBeTruthy();
    const panel = screen.getByTestId('laya-grade-panel');
    expect(panel.textContent).toMatch(/Laya → /);
    expect(panel.textContent).toMatch(/buyer reported a good trial/);
    expect(panel.textContent).toMatch(/order size over 15 kg/);
    expect(crmMocks.getLatestDealJudgment).toHaveBeenCalledWith(deal.id);
    // Reasons are grouped; numbers stay hidden until asked for.
    expect(panel.querySelector('[data-reason-group="buyer"]')!.textContent).toMatch(/What the buyer said.*asked for a next step/);
    expect(panel.querySelector('[data-reason-group="order"]')!.textContent).toMatch(/order size: large/);
    expect(panel.textContent).not.toMatch(/\(P 0\.9\)|momentum|declined/);
    fireEvent.click(screen.getByRole('button', { name: 'Show the numbers' }));
    expect(panel.textContent).toMatch(/asked for a next step \(P 0\.9\).*\+0\.27/);
    expect(panel.textContent).toMatch(/momentum \+/);
    // No history reader in this mock: the grade shows without a trend.
    expect(screen.queryByTestId('laya-trend')).toBeNull();
  });

  it('never applies a judgment made on an older reply', async () => {
    crmMocks.getLatestDealJudgment.mockResolvedValue(row('b'.repeat(64), warm));
    render(<LayaGradePanel deal={deal} />);
    expect(await screen.findByText('Laya grade · not graded')).toBeTruthy();
    expect(screen.getByTestId('laya-grade-panel').textContent).toMatch(/older reply/);
  });

  it('routes an unsure judgment to Pat, open by default, with the would-be tier', async () => {
    crmMocks.getLatestDealJudgment.mockResolvedValue(
      row((await dealInputSha256(deal))!, { requested_next_step: 0.5, declined: 0.1, deferred: 0.1, unclear: 0.2, no_commitment: 0.1 }),
    );
    render(<LayaGradePanel deal={deal} />);
    expect(await screen.findByText('Laya grade · needs your review')).toBeTruthy();
    const panel = screen.getByTestId('laya-grade-panel');
    expect(panel.textContent).toMatch(/unclear whether the buyer asked for a next step/);
    expect(panel.textContent).toMatch(/if you confirm/);
    expect(panel.closest('details')?.open).toBe(true);
  });

  it('saves Pat\'s decision on a review and takes the deal off review', async () => {
    const sha = (await dealInputSha256(deal))!;
    crmMocks.getLatestDealJudgment.mockResolvedValue(
      row(sha, { requested_next_step: 0.5, declined: 0.1, deferred: 0.1, unclear: 0.2, no_commitment: 0.1 }),
    );
    const add = vi.fn().mockImplementation(async (saved: Record<string, unknown>) => ({ ...saved, decided_at: '2026-10-03T00:00:00Z' }));
    (crmMocks as Record<string, unknown>).addReviewDecision = add;
    render(<LayaGradePanel deal={deal} />);
    await screen.findByText('Laya grade · needs your review');
    fireEvent.click(screen.getByRole('button', { name: /Disagree: keep/ }));
    expect(await screen.findByText('Laya grade · graded')).toBeTruthy();
    expect(screen.getByTestId('laya-decision').textContent).toMatch(/You disagreed with Laya/);
    expect(add).toHaveBeenCalledWith(expect.objectContaining({ deal_id: deal.id, input_sha256: sha, decision: 'reject' }));
    expect(screen.queryByRole('group', { name: 'Your decision' })).toBeNull();
    delete (crmMocks as Record<string, unknown>).addReviewDecision;
  });

  it('says not judged yet when no judgment is saved', async () => {
    crmMocks.getLatestDealJudgment.mockResolvedValue(null);
    render(<LayaGradePanel deal={deal} />);
    expect(await screen.findByText('Laya grade · not graded')).toBeTruthy();
    expect(screen.getByTestId('laya-grade-panel').textContent).toMatch(/not judged yet/);
  });

  it('shows the read as unavailable instead of crashing', async () => {
    crmMocks.getLatestDealJudgment.mockImplementation(() => { throw new Error('network'); });
    render(<LayaGradePanel deal={deal} />);
    expect(await screen.findByText('Laya grade · unavailable')).toBeTruthy();
    expect(screen.getByTestId('laya-grade-panel').textContent).toMatch(/deterministic tier is unaffected/);
  });

  it('says whether this reply reads warmer or cooler than the previous one', async () => {
    const sha = (await dealInputSha256(deal))!;
    const current = row(sha, warm, { trial_reported: 0.9, trial_positive: 0.9 });
    const previous = { ...row('b'.repeat(64), { requested_next_step: 0.1, declined: 0.02, deferred: 0.02, unclear: 0.8, no_commitment: 0.06 }), scored_at: '2026-09-20T12:00:00Z' };
    crmMocks.getLatestDealJudgment.mockResolvedValue(current);
    (crmMocks as Record<string, unknown>).getDealJudgmentHistory = vi.fn().mockResolvedValue([current, previous]);
    render(<LayaGradePanel deal={deal} />);
    const trend = await screen.findByTestId('laya-trend');
    expect(trend.getAttribute('data-trend')).toBe('up');
    expect(trend.textContent).toMatch(/warmer than the previous reply/);
    delete (crmMocks as Record<string, unknown>).getDealJudgmentHistory;
  });
});
