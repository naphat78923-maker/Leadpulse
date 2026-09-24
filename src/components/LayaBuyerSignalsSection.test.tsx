import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Company, Deal } from '@/types/crm';
import LayaBuyerSignalsSection from './LayaBuyerSignalsSection';

let seq = 0;
function makeDeal(overrides: Partial<Deal> = {}): Deal {
  seq += 1;
  return {
    id: `deal-${seq}`,
    title: `Deal ${seq}`,
    stage: 'contacted',
    product: 'Butter',
    client: 'Client',
    company_id: 'company-1',
    contact_ids: [],
    value: null,
    priority: 'medium',
    next_action: null,
    followup_date: null,
    last_outcome: null,
    buyer_reply: null,
    nudge_count: 0,
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    ...overrides,
  };
}

const company = {
  id: 'company-1',
  name: 'Bakery Co',
  industry: 'Bakery',
  tags: ['bakery'],
} as Company;

describe('LayaBuyerSignalsSection', () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('renders nothing when no open deal carries a verbatim buyer reply', () => {
    const { container } = render(
      <LayaBuyerSignalsSection
        deals={[makeDeal(), makeDeal({ buyer_reply: '   ' }), makeDeal({ last_outcome: 'Buyer asked for price' })]}
        companyFor={() => company}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('stays quiet for closed or parked deals even with a buyer reply recorded', () => {
    const { container } = render(
      <LayaBuyerSignalsSection
        deals={[
          makeDeal({ stage: 'closed_won', buyer_reply: 'Send the contract.' }),
          makeDeal({ workflow_action: 'parked', buyer_reply: 'Revisit next quarter.' }),
        ]}
        companyFor={() => company}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('lists scorable deals hottest-first with an on-demand scorer each', () => {
    render(
      <LayaBuyerSignalsSection
        deals={[
          makeDeal({ id: 'cool', title: 'Cool deal', buyer_reply: 'Looks interesting.' }),
          makeDeal({ id: 'hot', title: 'Hot deal', stage: 'negotiation', priority: 'high', value: 300000, buyer_reply: 'Please send a quotation.' }),
        ]}
        companyFor={() => company}
      />,
    );

    const titles = screen.getAllByText(/^(Hot|Cool) deal$/).map(el => el.textContent);
    expect(titles).toEqual(['Hot deal', 'Cool deal']);
    expect(screen.getAllByRole('button', { name: /score buyer reply with laya/i })).toHaveLength(2);
    expect(screen.getByTestId('laya-buyer-signals')).toBeTruthy();
  });

  it('never triggers a model call on render — scoring is explicit-only', () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    render(
      <LayaBuyerSignalsSection
        deals={[makeDeal({ buyer_reply: 'Please send a quotation.' })]}
        companyFor={() => company}
      />,
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
