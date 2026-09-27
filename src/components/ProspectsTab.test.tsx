import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { ProspectCandidate } from '@/utils/prospectFit';

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const data = vi.hoisted(() => ({ candidates: [] as unknown[], reviews: [] as unknown[] }));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/utils/prospectReview', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/prospectReview')>()),
  buildProspectSourceRows: () => [],
}));
vi.mock('@/utils/prospectFit', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/utils/prospectFit')>()),
  buildProspectFitReport: () => ({ candidates: data.candidates }),
}));
vi.mock('@/lib/prospectReviews', () => ({
  loadProspectReviews: async () => ({ ok: true, rows: data.reviews }),
}));
vi.mock('@/components/ProspectReviewPanel', () => ({
  default: ({ companyName }: { companyName: string }) => <div data-testid="review-panel">Review {companyName}</div>,
}));

import ProspectsTab from './ProspectsTab';

afterEach(() => cleanup());

const candidate = (company_id: string, name: string): ProspectCandidate => ({
  company_id,
  name,
  industry: null,
  tags: [],
  website: null,
  reachability: 'route_only',
  already_touched: false,
  gaps: [],
});

function setup({ inPipeline = [] as string[] } = {}) {
  data.candidates = [candidate('c1', 'Alpha Bakery'), candidate('c2', 'Beta Cafe'), candidate('c3', 'Gamma Hotel')];
  data.reviews = [{ company_id: 'c2', decision: 'shortlist', next_action_due: null }];
  crm.value = {
    companies: [],
    contacts: [],
    meetings: [],
    accountEvents: [],
    deals: inPipeline.map((id) => ({ id: `deal-${id}`, company_id: id, stage: 'contacted', workflow_action: 'outreach' })),
    refresh: vi.fn(),
  };
}

describe('Pipeline → Prospects tab', () => {
  it('shows unreviewed prospects first and filters by saved decision', async () => {
    setup();
    render(<ProspectsTab onStartDeal={vi.fn()} />);

    await waitFor(() => expect(screen.queryByText('Beta Cafe')).toBeNull());
    expect(screen.getByText('Alpha Bakery')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /unreviewed 2/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('tab', { name: /shortlisted 1/i }));
    expect(screen.getByText('Beta Cafe')).toBeTruthy();
    expect(screen.queryByText('Alpha Bakery')).toBeNull();
  });

  it('starts a deal from a prospect, and hides ones already in the pipeline unless asked', async () => {
    const onStartDeal = vi.fn();
    setup({ inPipeline: ['c3'] });
    render(<ProspectsTab onStartDeal={onStartDeal} />);

    fireEvent.click(await screen.findByText('Alpha Bakery'));
    expect(screen.getByTestId('review-panel').textContent).toContain('Alpha Bakery');
    expect(screen.getByRole('link', { name: 'Open account' }).getAttribute('href')).toBe('/companies?company=c1');
    fireEvent.click(screen.getByRole('button', { name: /start a deal/i }));
    expect(onStartDeal).toHaveBeenCalledExactlyOnceWith('c1');

    expect(screen.queryByText('Gamma Hotel')).toBeNull();
    fireEvent.click(screen.getByLabelText(/include 1 already in the pipeline/i));
    fireEvent.click(screen.getByText('Gamma Hotel'));
    expect(screen.getByText('In pipeline')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /start a deal/i })).toBeNull();
  });

  it('searches by name', async () => {
    setup();
    render(<ProspectsTab onStartDeal={vi.fn()} />);

    fireEvent.change(screen.getByPlaceholderText(/search prospects/i), { target: { value: 'gamma' } });
    await waitFor(() => expect(screen.queryByText('Alpha Bakery')).toBeNull());
    expect(screen.getByText('Gamma Hotel')).toBeTruthy();
  });
});
