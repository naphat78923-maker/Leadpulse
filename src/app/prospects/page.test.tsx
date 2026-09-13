// Component tests for the Prospects review queue.
//
// These cover the states the screen can be in — loading, error, empty, and a populated
// candidate list — plus the interactions in the acceptance criteria: the review-state
// tabs and their live counts, search, the segment and contact filters, expanding one
// candidate to inspect its explanation, and keeping the fuller limitations available
// under "How matching works" without putting them back on the primary surface.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

// This repo's vitest setup does not auto-clean between tests (existing component
// tests call cleanup explicitly), so repeated renders stack in the DOM otherwise.
afterEach(() => cleanup());

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

// The saved-review writer is mocked here on purpose: this suite covers the candidate
// list and its states. Importing the real module would pull the Supabase client into
// the test environment (and attempt a realtime connection) for no benefit.
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

import ProspectsPage from './page';

function setCrm(v: Record<string, unknown>) {
  crm.value = {
    deals: [],
    meetings: [],
    accountEvents: [],
    contacts: [],
    loading: false,
    refresh: async () => {},
    ...v,
  };
}

const candidate = {
  id: 'c1',
  name: 'Green Bowl',
  status: 'prospect',
  industry: 'Vegan restaurant',
  tags: ['vegan'],
  website: 'https://example.test',
};

const bakery = {
  id: 'c2',
  name: 'Second Rise Bakery',
  status: 'prospect',
  industry: 'Artisan bakery',
  tags: [],
  website: null,
};

describe('Prospects review queue', () => {
  it('shows a loading state while CRM data is in flight', () => {
    setCrm({ companies: [], loading: true });
    render(<ProspectsPage />);
    expect(screen.getByText(/Loading CRM data for the candidate list/i)).toBeTruthy();
  });

  it('shows an error state with what failed, and states that nothing was written', () => {
    // A malformed payload makes the derivation throw, which is what the guard is for.
    setCrm({ companies: null });
    render(<ProspectsPage />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText(/could not be built/i)).toBeTruthy();
    expect(screen.getByText(/nothing was written/i)).toBeTruthy();
  });

  it('shows an empty state instead of falling back to sample data', () => {
    setCrm({ companies: [] });
    render(<ProspectsPage />);
    expect(screen.getByText(/never falls back to sample data/i)).toBeTruthy();
  });

  it('carries one short caution on the surface and the fuller limitations under "How matching works"', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    expect(screen.getByText('Candidates only. Qualification and outreach approval pending.')).toBeTruthy();

    // The longer warnings are not deleted, they are one disclosure away.
    fireEvent.click(screen.getByText('How matching works'));
    expect(screen.getAllByText(/no suppression check exists in this app/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/no contact is verified/i).length).toBeGreaterThan(0);
  });

  it('shows the live candidate count and unreviewed count in the heading summary', async () => {
    setCrm({ companies: [candidate, bakery] });
    render(<ProspectsPage />);

    const summary = await screen.findByText(/candidates ·/);
    expect(summary.textContent).toContain('2 candidates');
    expect(summary.textContent).toContain('2 unreviewed');
  });

  it('defaults to the Unreviewed tab and keeps All reachable', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    const unreviewed = screen.getByRole('tab', { name: /^Unreviewed/ });
    const all = screen.getByRole('tab', { name: /^All/ });
    expect(unreviewed.getAttribute('aria-selected')).toBe('true');
    expect(all.getAttribute('aria-selected')).toBe('false');
    expect(unreviewed.getAttribute('tabindex')).toBe('0');
    expect(all.getAttribute('tabindex')).toBe('-1');
  });

  it('moves the selection with the tablist arrow keys', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    const unreviewed = screen.getByRole('tab', { name: /^Unreviewed/ });
    fireEvent.keyDown(unreviewed, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /^Shortlisted/ }).getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(screen.getByRole('tab', { name: /^All/ }), { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: /^Unreviewed/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('lists a matching company as a compact row: segment and contact state, no bare score', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    const row = screen.getByRole('button', { name: /Green Bowl/ });
    expect(row.textContent).toContain('Restaurant');
    expect(row.textContent).toContain('No route found');
    // the row must not carry the campaign archetype name or a naked match score
    expect(row.textContent).not.toMatch(/Plant-based|Modern trade, specialty|Bakery, patisserie/);
    expect(row.textContent).not.toMatch(/\d+\s*\/\s*100/);
  });

  it('expands a candidate to the full explanation, with the score labelled and explained', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Green Bowl/ }));

    // classification detail
    expect(screen.getByText(/Proposed role and how it was decided/i)).toBeTruthy();
    expect(screen.getByText(/why it matched/i)).toBeTruthy();
    // heuristic confidence is named as heuristic, not as a verified fact
    expect(screen.getByText(/heuristic confidence, not a verified business fact/i)).toBeTruthy();
    // the score is labelled "Match score" and carries its limits
    expect(screen.getByText(/Match score \d+/)).toBeTruthy();
    expect(screen.getByText(/not a qualification, not a delivery-coverage check, not an approval/i)).toBeTruthy();
    // the archetype it matched is retained here, off the row
    expect(screen.getByText(/Matched archetype/i)).toBeTruthy();
    // source attribution is present
    expect(screen.getAllByText(/^source:/i).length).toBeGreaterThan(2);
  });

  it('keeps serviceability, qualification and authorisation separate and un-assessed in the detail', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Green Bowl/ }));

    expect(screen.getByText('Serviceability')).toBeTruthy();
    expect(screen.getByText('Sales qualification')).toBeTruthy();
    expect(screen.getByText('Outreach authorisation')).toBeTruthy();
    expect(screen.getAllByText(/not assessed in this app/i).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/not authorised/i).length).toBeGreaterThan(0);
  });

  it('links to the existing company view with the company id', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);
    fireEvent.click(screen.getByRole('button', { name: /Green Bowl/ }));
    const link = screen.getByRole('link', { name: /Open the company record/i });
    expect(link.getAttribute('href')).toBe('/companies?company=c1');
  });

  it('filters the list and reports when nothing matches', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);
    fireEvent.change(screen.getByLabelText(/search candidates/i), { target: { value: 'zzzz' } });
    expect(screen.getByText(/No candidate matches the current search or filters/i)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/search candidates/i), { target: { value: 'green' } });
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
  });

  it('filters by segment, offering only the segments the candidate set actually contains', () => {
    setCrm({ companies: [candidate, bakery] });
    render(<ProspectsPage />);

    const select = screen.getByLabelText(/filter by segment/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values[0]).toBe('');
    expect(values).toContain('Restaurant');
    expect(values).toContain('Bakery');
    expect(values).not.toContain('Hotel');

    fireEvent.change(select, { target: { value: 'Bakery' } });
    expect(screen.getByRole('button', { name: /Second Rise Bakery/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Green Bowl/ })).toBeNull();

    fireEvent.change(select, { target: { value: 'Restaurant' } });
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Second Rise Bakery/ })).toBeNull();
  });

  it('filters by contact availability', () => {
    setCrm({ companies: [candidate, bakery] });
    render(<ProspectsPage />);

    const select = screen.getByLabelText(/filter by contact availability/i);
    fireEvent.change(select, { target: { value: 'named_contact' } });
    expect(screen.getByText(/No candidate matches the current search or filters/i)).toBeTruthy();

    fireEvent.change(select, { target: { value: 'route_only' } });
    expect(screen.getByText(/No candidate matches the current search or filters/i)).toBeTruthy();

    fireEvent.change(select, { target: { value: 'none' } });
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
  });

  // ── saved review state ──

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

  it('counts each review state live on its tab, and the counts partition the candidate set', async () => {
    reviewWriter.loadProspectReviews.mockResolvedValueOnce({ ok: true, rows: [savedReview] });
    setCrm({ companies: [candidate, bakery] });
    render(<ProspectsPage />);

    const shortlisted = await screen.findByRole('tab', { name: /^Shortlisted/ });
    expect(shortlisted.textContent).toContain('1');
    expect(screen.getByRole('tab', { name: /^Unreviewed/ }).textContent).toContain('1');
    expect(screen.getByRole('tab', { name: /^All/ }).textContent).toContain('2');
    // 1 shortlisted + 1 unreviewed = 2 candidates, and the heading summary agrees
    const summary = screen.getByText(/candidates ·/);
    expect(summary.textContent).toContain('2 candidates');
    expect(summary.textContent).toContain('1 unreviewed');
  });

  it('moves a reviewed account out of the Unreviewed queue and keeps it under its own tab', async () => {
    reviewWriter.loadProspectReviews.mockResolvedValueOnce({ ok: true, rows: [savedReview] });
    setCrm({ companies: [candidate, bakery] });
    render(<ProspectsPage />);

    // Green Bowl carries a saved decision, so only the bakery is left to review
    await screen.findByRole('tab', { name: /^Shortlisted/ });
    expect(await screen.findByRole('button', { name: /Second Rise Bakery/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Green Bowl/ })).toBeNull();

    fireEvent.click(screen.getByRole('tab', { name: /^Shortlisted/ }));
    const reviewed = screen.getByRole('button', { name: /Green Bowl/ });
    expect(reviewed.textContent).toContain('Shortlisted');

    fireEvent.click(screen.getByRole('tab', { name: /^All/ }));
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Second Rise Bakery/ })).toBeTruthy();
  });

  it('says the queue is clear, rather than showing a filtered-empty message, when nothing is left unreviewed', async () => {
    reviewWriter.loadProspectReviews.mockResolvedValueOnce({ ok: true, rows: [savedReview] });
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    expect(await screen.findByText(/This queue is clear/i)).toBeTruthy();
  });

  it('says saved reviews are unavailable, without hiding the candidate list, when the table is missing', async () => {
    reviewWriter.loadProspectReviews.mockResolvedValueOnce({
      ok: false,
      error: 'relation "public.prospect_reviews" does not exist',
      tableMissing: true,
    });
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    expect(await screen.findByText(/until the prospect_reviews migration is applied/i)).toBeTruthy();
    // the raw failure is kept as a diagnostic inside the help, not repeated on the surface
    expect(screen.getByText(/Saved reviews were unreadable in this session: relation "public.prospect_reviews" does not exist/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
  });

  it('keeps the evaluator accounting and the review reconciliation under "How matching works"', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    fireEvent.click(screen.getByText('How matching works'));
    expect(screen.getByText(/computed live by the shared evaluator/i)).toBeTruthy();
    // two separate reconciliations: the evaluator's own accounting, and the review counts
    expect(screen.getAllByText(/reconciliation OK/i).length).toBe(2);
    expect(screen.getByText(/Candidates per archetype/i)).toBeTruthy();
    expect(screen.getByText(/Review counts/i)).toBeTruthy();
    expect(screen.getByText(/highest match score first/i)).toBeTruthy();
  });
});
