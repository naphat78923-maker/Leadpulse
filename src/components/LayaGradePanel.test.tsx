import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
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
});
