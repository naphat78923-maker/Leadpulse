import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Deal } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({ getLatestDealJudgments: vi.fn() }));
vi.mock('@/lib/crm', () => crmMocks);

import LayaReviewCard from './LayaReviewCard';

const deal: Deal = {
  id: 'd1', title: 'Butter · Thai Shop', stage: 'proposal', product: 'Butter', client: 'Thai Shop', company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: 'ขอใบเสนอราคาครับ', nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

describe('LayaReviewCard', () => {
  // A fresh spy per test (see LayaGradePanel.test.tsx).
  beforeEach(() => { crmMocks.getLatestDealJudgments = vi.fn().mockResolvedValue([]); });
  afterEach(cleanup);

  it('lists a deal routed to Pat with its reason and a link to the deal', async () => {
    render(<LayaReviewCard deals={[deal]} meetings={[]} />);
    expect(await screen.findByText('Laya: needs your review · 1')).toBeTruthy();
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/deals?deal=d1');
    expect(link.textContent).toMatch(/Thai reply/);
  });

  it('renders nothing when no deal needs review, and skips the read when no deal has a reply', async () => {
    const { container } = render(<LayaReviewCard deals={[{ ...deal, buyer_reply: null }]} meetings={[]} />);
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(container.textContent).toBe('');
    expect(crmMocks.getLatestDealJudgments).not.toHaveBeenCalled();
  });
});
