import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Company, Deal } from '@/types/crm';
import LayaScoreCard from './LayaScoreCard';
import { bangkokDateKey } from '@/utils/format';

const deal: Deal = {
  id: 'deal-buyer-reply',
  title: 'Butter · Bakery',
  stage: 'contacted',
  product: 'Butter',
  client: 'Private bakery name',
  company_id: 'company-bakery',
  contact_ids: [],
  value: 30000,
  value_type: 'estimated',
  priority: 'medium',
  next_action: null,
  draft_primary_ask: null,
  // Business "today" (Asia/Bangkok) — not a hardcoded date, so this assertion
  // can't rot into "overdue" the way a fixed calendar date does.
  followup_date: bangkokDateKey(),
  last_outcome: 'Prior rep note: requested price',
  buyer_reply: 'Please send us a quotation for 20 kg.',
  nudge_count: 0,
  workflow_action: 'reply',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const company = {
  id: 'company-bakery',
  industry: 'Bakery',
  tags: ['bakery', 'foodservice'],
} as Company;

function response(body: string, recommendation = 'requested_next_step') {
  const probabilities = {
    unclear: 0.1,
    no_commitment: 0.1,
    declined: 0.1,
    deferred: 0.1,
    requested_next_step: 0.6,
  };
  return {
    ok: true,
    json: async () => ({
      question: 'buyer_response',
      recommendation,
      confidence: probabilities[recommendation as keyof typeof probabilities],
      probabilities,
      usage: { input_tokens: 60, output_tokens: 0 },
      trace: {
        scored_input: JSON.parse(body),
        model: { repository: 'laya-local', source_revision: 'rev1', package_sha256: 'sha256', engine: 'cpu_gpu' },
        scored_at: '2026-09-24T00:00:00Z',
      },
    }),
  };
}

describe('Laya buyer-response card', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('scores only the verbatim buyer reply and keeps the commercial facts visible for human review', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) =>
      response(init.body as string));
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} company={company} />);

    expect(screen.getByText('bakery, foodservice')).toBeTruthy();
    expect(document.body.textContent).toContain('Stage: contacted');
    expect(document.body.textContent).toContain('THB 30,000 · estimated');
    expect(document.body.textContent).toContain('Follow-up: today');
    expect(document.body.textContent).toContain('Outcome: Prior rep note: requested price');

    fireEvent.click(screen.getByRole('button', { name: /score buyer reply/i }));
    expect(await screen.findByText('Buyer-request signal — review this deal')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
    expect(Object.keys(body.questions)).toEqual(['buyer_response']);
    expect(body.state).toContain('Please send us a quotation for 20 kg.');
    expect(body.state).not.toContain('THB 30,000');
    expect(body.state).not.toContain('foodservice');
    expect(body.state).not.toContain('Prior rep note');
    expect(screen.getByText(/not an order probability/i)).toBeTruthy();
  });

  it('does not score a paraphrased outcome when no verbatim buyer reply is saved', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={{ ...deal, buyer_reply: null }} company={company} />);
    expect(screen.getByText(/No verbatim buyer reply recorded/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /score buyer reply/i })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    ['closed_won', 'reply'],
    ['closed_lost', 'reply'],
    ['contacted', 'parked'],
  ] as const)('does not score closed or parked deal state (%s / %s)', (stage, workflow_action) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={{ ...deal, stage, workflow_action }} company={company} />);
    expect(screen.getByText(/Closed or parked deals are not scored/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /score buyer reply/i })).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('routes every non-request prediction to manual triage, never a priority label', async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) =>
      response(init.body as string, 'declined'));
    vi.stubGlobal('fetch', fetchMock);
    render(<LayaScoreCard deal={deal} company={company} />);
    fireEvent.click(screen.getByRole('button', { name: /score buyer reply/i }));
    expect(await screen.findByText(/Manual review required/i)).toBeTruthy();
    expect(document.body.textContent).toContain('Declined');
    expect(screen.queryByText(/prioritise/i)).toBeNull();
  });
});
