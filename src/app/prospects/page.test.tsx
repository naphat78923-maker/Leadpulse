// Component tests for the Prospect Review screen.
//
// These cover the four states the screen can be in — loading, error, empty, and a
// populated candidate list — plus the two interactions in the acceptance criteria:
// filter the list, and expand one candidate to inspect its explanation.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

// This repo's vitest setup does not auto-clean between tests (existing component
// tests call cleanup explicitly), so repeated renders stack in the DOM otherwise.
afterEach(() => cleanup());

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

// The saved-review writer is mocked here on purpose: this suite covers the read-only
// candidate list and its states. Importing the real module would pull the Supabase
// client into the test environment (and attempt a realtime connection) for no benefit.
const reviewWriter = vi.hoisted(() => ({
  loadProspectReviews: vi.fn(
    async (): Promise<{ ok: true; rows: unknown[] } | { ok: false; error: string; tableMissing: boolean }> => ({
      ok: true,
      rows: [],
    })
  ),
  saveProspectReview: vi.fn(),
  restoreProspectReview: vi.fn(),
  clearProspectReview: vi.fn(),
  setDealFollowupDate: vi.fn(),
}));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
vi.mock('@/components/motion', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock('@/lib/prospectReviews', () => reviewWriter);

import ProspectReviewPage from './page';

function setCrm(v: Record<string, unknown>) {
  crm.value = { deals: [], meetings: [], accountEvents: [], contacts: [], loading: false, refresh: async () => {}, ...v };
}

const candidate = {
  id: 'c1',
  name: 'Green Bowl',
  status: 'prospect',
  industry: 'Vegan restaurant',
  tags: ['vegan'],
  website: 'https://example.test',
};

describe('Prospect Review screen', () => {
  it('shows a loading state while CRM data is in flight', () => {
    setCrm({ companies: [], loading: true });
    render(<ProspectReviewPage />);
    expect(screen.getByText(/Loading CRM data for the candidate list/i)).toBeTruthy();
  });

  it('shows an error state with what failed, and states that nothing was written', () => {
    // A malformed payload makes the derivation throw, which is what the guard is for.
    setCrm({ companies: null });
    render(<ProspectReviewPage />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/could not be built/i)).toBeTruthy();
    expect(screen.getByText(/nothing was written/i)).toBeTruthy();
  });

  it('shows an empty state instead of falling back to sample data', () => {
    setCrm({ companies: [] });
    render(<ProspectReviewPage />);
    expect(screen.getByText(/never falls back to sample data/i)).toBeTruthy();
  });

  it('labels the list as candidates, not qualified accounts', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);
    expect(screen.getByText(/candidates, not qualified accounts/i)).toBeTruthy();
    expect(screen.getByText(/no suppression check exists in this app/i)).toBeTruthy();
  });

  it('lists a matching company and expands it to the full explanation', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);

    const row = screen.getByRole('button', { name: /Green Bowl/ });
    fireEvent.click(row);

    // classification detail
    expect(screen.getByText(/Proposed role and how it was decided/i)).toBeTruthy();
    expect(screen.getByText(/why it matched/i)).toBeTruthy();
    // heuristic confidence is named as heuristic, not as a verified fact
    expect(screen.getByText(/heuristic confidence, not a verified business fact/i)).toBeTruthy();
    // source attribution is present
    expect(screen.getAllByText(/^source:/i).length).toBeGreaterThan(2);
  });

  it('keeps serviceability, qualification and authorisation separate and un-assessed', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);
    expect(screen.getByText('Serviceability')).toBeTruthy();
    expect(screen.getByText('Sales qualification')).toBeTruthy();
    expect(screen.getByText('Outreach authorisation')).toBeTruthy();
    expect(screen.getAllByText(/not assessed in this app/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not authorised/i).length).toBeGreaterThan(0);
  });

  it('links to the existing company view with the company id', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);
    fireEvent.click(screen.getByRole('button', { name: /Green Bowl/ }));
    const link = screen.getByRole('link', { name: /Open the company record/i });
    expect(link.getAttribute('href')).toBe('/companies?company=c1');
  });

  it('filters the list and reports when nothing matches', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);
    fireEvent.change(screen.getByLabelText(/search candidates/i), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No candidate matches the current search or filters/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/search candidates/i), { target: { value: 'green' } });
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
  });

  it('filters by archetype from the published list, not a local copy', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);
    const select = screen.getByLabelText(/filter by archetype/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values[0]).toBe('');
    expect(values.length).toBeGreaterThan(1);
  });

  // ── saved review state (Slice A) ──

  const savedReview = {
    id: 'row-1',
    company_id: 'c1',
    decision: 'shortlist',
    reason_code: 'verified_route',
    reason_note: null,
    criterion_ref: null,
    reviewed_at: '2026-09-11T10:00:00.000Z',
    next_action: 'Send the sample list',
    next_action_owner: 'Pat',
    next_action_due: null,
    evidence_note: null,
    evidence_links: null,
    needs_data_review: false,
    created_at: '2026-09-11T10:00:00.000Z',
    updated_at: '2026-09-11T10:00:00.000Z',
  };

  it('reports review progress from the saved rows, reconciled against the candidate set', async () => {
    reviewWriter.loadProspectReviews.mockResolvedValueOnce({ ok: true, rows: [savedReview] });
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);

    expect(await screen.findByText('Review progress')).toBeTruthy();
    expect(screen.getAllByText('Shortlisted').length).toBeGreaterThan(1);
    expect(screen.getByText('Unreviewed')).toBeTruthy();
    expect(screen.getByText(/computed from the saved review rows against the candidate set · reconciliation OK/)).toBeTruthy();
  });

  it('filters the candidate list by saved review state', async () => {
    reviewWriter.loadProspectReviews.mockResolvedValueOnce({ ok: true, rows: [savedReview] });
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);
    await screen.findByText('Review progress');

    fireEvent.change(screen.getByLabelText(/filter by saved review decision/i), { target: { value: 'unreviewed' } });
    expect(screen.getByText(/No candidate matches the current search or filters/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/filter by saved review decision/i), { target: { value: 'not_a_fit' } });
    expect(screen.getByText(/No candidate matches the current search or filters/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/filter by saved review decision/i), { target: { value: 'shortlist' } });
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
  });

  it('says saved reviews are unavailable, without hiding the candidate list, when the table is missing', async () => {
    reviewWriter.loadProspectReviews.mockResolvedValueOnce({
      ok: false,
      error: 'relation "public.prospect_reviews" does not exist',
      tableMissing: true,
    });
    setCrm({ companies: [candidate] });
    render(<ProspectReviewPage />);

    expect(await screen.findByText(/until the prospect_reviews migration is applied/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
  });
});
