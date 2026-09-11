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

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
vi.mock('@/components/motion', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import ProspectReviewPage from './page';

function setCrm(v: Record<string, unknown>) {
  crm.value = { deals: [], meetings: [], accountEvents: [], contacts: [], loading: false, ...v };
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
});
