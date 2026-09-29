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
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

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

  it('shows the live candidate count, not-judged count and unreviewed count in the heading summary', async () => {
    setCrm({ companies: [candidate, bakery] });
    render(<ProspectsPage />);

    const summary = await screen.findByText(/candidates ·/);
    expect(summary.textContent).toContain('2 candidates');
    expect(summary.textContent).toContain('2 not judged');
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

  it('lists a candidate as a compact row: judgment state and contact state, no bare score', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    const row = screen.getByRole('button', { name: /Green Bowl/ });
    expect(row.textContent).toContain('not judged');
    expect(row.textContent).toContain('No route found');
    // the row must not carry the campaign archetype name or any model number
    expect(row.textContent).not.toMatch(/Plant-based|Modern trade, specialty|Bakery, patisserie/);
    expect(row.textContent).not.toMatch(/\d+\s*\/\s*100/);
  });

  it('expands a candidate to the model judgment panel, with the input shown and nothing scored', () => {
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    fireEvent.click(screen.getByRole('button', { name: /Green Bowl/ }));

    // the judgment panel replaces the old score + classification panels
    expect(screen.getByText(/Laya fit judgment/i)).toBeTruthy();
    expect(screen.getByText(/Not judged yet\. One press sends this account's name, industry and tags to the local Laya worker/i)).toBeTruthy();
    // the exact state sentence that a judge press would send is shown upfront
    expect(screen.getByText(/What Laya is asked/i)).toBeTruthy();
    expect(screen.getByText(/Candidate account: name "Green Bowl"/i)).toBeTruthy();
    // nothing about a match score or a regex classification may remain
    expect(screen.queryByText(/Match score/i)).toBeNull();
    expect(screen.queryByText(/Proposed role/i)).toBeNull();
    // the judgment is advisory only — the old honest caption survives in new words
    expect(screen.getByText(/advisory, not a qualification/i)).toBeTruthy();
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

  it('filters by judgment state, offering only the states the queue is actually in', () => {
    setCrm({ companies: [candidate, bakery] });
    render(<ProspectsPage />);

    const select = screen.getByLabelText(/filter by judgment/i) as HTMLSelectElement;
    const values = Array.from(select.options).map((o) => o.value);
    expect(values[0]).toBe('');
    expect(values).toContain('unjudged');
    expect(values).not.toContain('judged');

    fireEvent.change(select, { target: { value: 'unjudged' } });
    expect(screen.getByRole('button', { name: /Second Rise Bakery/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Green Bowl/ })).toBeTruthy();
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
    expect(screen.getByText(/Judgments this session/i)).toBeTruthy();
    expect(screen.getByText(/Review counts/i)).toBeTruthy();
    // the ordering sentence describes the Laya queue, not the old arithmetic
    expect(screen.getByText(/judged candidates first/i)).toBeTruthy();
    expect(screen.getByText(/Institutional identity:\s*0/i)).toBeTruthy();
  });

  it('judges a candidate only on explicit press, then drops a no_fit out of the queue with a stated reason', async () => {
    const fetchSpy = vi.fn(async (url: unknown, init: { body?: string }) => {
      expect(String(url)).toContain('/score');
      const body = JSON.parse(String(init.body));
      expect(Object.keys(body)).toEqual(['state', 'questions']);
      expect(Object.keys(body.questions)).toEqual(['archetype_select', 'role_support']);
      expect(body.state).toContain('Green Bowl');
      expect(body.state).toContain('Vegan restaurant');
      return {
        ok: true,
        status: 200,
        json: async () => ({
          answers: {
            archetype_select: {
              choice: 'no_fit',
              confidence: 0.85,
              probabilities: {
                plant_based_restaurant_cafe: 0.05,
                modern_trade_specialty_retail: 0.05,
                bakery_patisserie_brands: 0.05,
                no_fit: 0.85,
              },
            },
            role_support: { noul: 0.9, confidence: 0.9 },
          },
          trace: {
            scored_input: JSON.parse(String(init.body)),
            model: { repository: 'laya-local', source_revision: 'rev1', package_sha256: 'sha256', engine: 'cpu_gpu' },
            scored_at: '2026-09-24T00:00:00Z',
          },
        }),
      };
    });
    vi.stubGlobal('fetch', fetchSpy);
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    // nothing is scored by rendering or by expanding — only the judge press scores
    expect(fetchSpy).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole('button', { name: /Green Bowl/ }));
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(await screen.findByRole('button', { name: /Judge fit with Laya/i }));
    // a no_fit judgment drops the row out of the queue with a stated reason
    await screen.findByText(/judged no_fit this session, dropped from the queue/i);
    expect(screen.queryByRole('button', { name: /Green Bowl/ })).toBeNull();
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('renders a judged archetype with its distribution and the support check', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: unknown, init: { body?: string }) => ({
        ok: true,
        status: 200,
        json: async () => ({
          answers: {
            archetype_select: {
              choice: 'plant_based_restaurant_cafe',
              confidence: 0.75,
              probabilities: {
                plant_based_restaurant_cafe: 0.75,
                modern_trade_specialty_retail: 0.1,
                bakery_patisserie_brands: 0.1,
                no_fit: 0.05,
              },
            },
            role_support: { noul: 0.2, confidence: 0.8 },
          },
          trace: {
            scored_input: JSON.parse(String(init.body)),
            model: { repository: 'laya-local', source_revision: 'rev1', package_sha256: 'sha256', engine: 'cpu_gpu' },
            scored_at: '2026-09-24T00:00:00Z',
          },
        }),
      }))
    );
    setCrm({ companies: [candidate] });
    render(<ProspectsPage />);

    fireEvent.click(await screen.findByRole('button', { name: /Green Bowl/ }));
    fireEvent.click(await screen.findByRole('button', { name: /Judge fit with Laya/i }));

    expect(await screen.findByText(/Plant-based restaurant and cafe kitchens/i)).toBeTruthy();
    expect(screen.getByText(/archetype confidence 0.75/i)).toBeTruthy();
    expect(screen.getByText(/identity supports this/i)).toBeTruthy();
    expect(screen.getByText('judged', { exact: true })).toBeTruthy();
  });

  it('opens the Laya terminal from a candidate row, prefills it, and never scores automatically', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    setCrm({
      companies: [candidate],
      deals: [
        {
          id: 'deal-1',
          title: 'Butter · Bakery',
          stage: 'contacted',
          product: 'Butter',
          client: 'Green Bowl',
          company_id: 'c1',
          contact_ids: [],
          value: null,
          priority: 'medium',
          next_action: null,
          draft_primary_ask: null,
          followup_date: null,
          last_outcome: null,
          buyer_reply: 'Please send us a quotation for 20 kg.',
          nudge_count: 0,
          workflow_action: null,
          nudge_stage: null,
          sample_status: null,
          created_at: '2026-09-01T00:00:00Z',
          updated_at: '2026-09-01T00:00:00Z',
        },
      ],
    });
    render(<ProspectsPage />);

    // Expand the candidate, then hand its buyer text to the terminal.
    fireEvent.click(await screen.findByRole('button', { name: /Green Bowl/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Open in terminal' }));

    // The terminal expands at the top of the page with the builder's own state
    // sentence in the box, focused — and no worker call has been made. This
    // deal has no recorded value, so no deal-value sentence is added.
    const textarea = (await screen.findByLabelText('State input')) as HTMLTextAreaElement;
    expect(textarea.value).toContain('We supply Butter');
    expect(textarea.value).toContain('Please send us a quotation for 20 kg.');
    expect(textarea.value).not.toContain('Deal value on record');
    expect(document.activeElement).toBe(textarea);
    expect(screen.getByRole('button', { name: 'Laya terminal' }).getAttribute('aria-expanded')).toBe('true');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
