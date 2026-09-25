import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import SignalsPage from './page';
import type { ReorderSignalRow } from '@/lib/historical';

const rows: ReorderSignalRow[] = [
  {
    customer_id: 'cust-linked',
    name_en: 'Linked Bakery',
    is_intercompany: false,
    order_count: 6,
    first_order: '2025-01-01',
    last_order: '2026-06-01',
    span_days: 480,
    median_gap_days: 30,
    median_value: 4000,
    days_since_last: 62,
    threshold_days: 30,
    severity_days: 32,
    is_overdue: true,
    crm_company_id: 'company-1',
    match_confidence: 'high',
  },
  {
    customer_id: 'cust-unlinked',
    name_en: 'Unlinked Deli',
    is_intercompany: false,
    order_count: 4,
    first_order: '2025-03-01',
    last_order: '2026-05-01',
    span_days: 400,
    median_gap_days: 21,
    median_value: 8000,
    days_since_last: 40,
    threshold_days: 21,
    severity_days: 19,
    is_overdue: true,
    crm_company_id: null,
    match_confidence: null,
  },
];

vi.mock('@/components/CrmProvider', () => ({
  useCrm: () => ({ companies: [], contacts: [], meetings: [], deals: [] }),
}));

vi.mock('@/components/CompanyDetail', () => ({ default: () => null }));

// Module-level Supabase client would need Node 22's WebSocket — stub it out;
// every call this test exercises is mocked below anyway.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

const dismissalMocks = vi.hoisted(() => ({
  saveSignalDismissal: vi.fn(async () => true),
  restoreSignalDismissal: vi.fn(async () => true),
}));

// Only the network call is mocked — rankSignals stays real so this test
// exercises the actual gating/ranking path.
vi.mock('@/lib/historical', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/historical')>()),
  fetchReorderSignalRows: vi.fn(async () => rows),
}));

vi.mock('@/lib/signal-dismissals', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/signal-dismissals')>()),
  fetchSignalDismissals: vi.fn(async () => ({})),
  saveSignalDismissal: dismissalMocks.saveSignalDismissal,
  restoreSignalDismissal: dismissalMocks.restoreSignalDismissal,
}));

const { saveSignalDismissal, restoreSignalDismissal } = dismissalMocks;

describe('SignalsPage', () => {
  beforeEach(() => {
    saveSignalDismissal.mockClear();
    restoreSignalDismissal.mockClear();
  });
  afterEach(cleanup);

  it('surfaces historical buyers that are not in the CRM yet', async () => {
    render(<SignalsPage />);
    expect(await screen.findByText('Unlinked Deli')).toBeTruthy();
    expect(screen.getByText('Not in CRM')).toBeTruthy();
    expect(screen.getByText('Not yet in CRM — add as a company to track.')).toBeTruthy();
  });

  it('shows how far past the usual cycle each account is', async () => {
    render(<SignalsPage />);
    await screen.findByText('Linked Bakery');
    expect(screen.getByText('32d past cycle')).toBeTruthy();
    expect(screen.getByText('19d past cycle')).toBeTruthy();
  });

  it('KPIs describe the visible list: count + median order value', async () => {
    render(<SignalsPage />);
    await screen.findByText('Linked Bakery');
    expect(screen.getByText('Waiting on you').parentElement?.parentElement?.textContent).toContain('2');
    // median of 4000 and 8000
    expect(screen.getByText('Median order value').parentElement?.parentElement?.textContent).toContain('฿6,000');
  });

  it('dismiss hides the signal and Undo actually restores it', async () => {
    render(<SignalsPage />);
    await screen.findByText('Linked Bakery');

    fireEvent.click(screen.getByLabelText('Dismiss Linked Bakery'));

    expect(saveSignalDismissal).toHaveBeenCalledWith('cust-linked', expect.any(Number));
    await waitFor(() => expect(screen.queryByText('Linked Bakery')).toBeNull());
    expect(screen.getByText(/Dismissed · Linked Bakery/)).toBeTruthy();

    fireEvent.click(screen.getByText('Undo'));

    // The undo must clear the dismissal (prev was undefined → delete the row).
    // The old buggy handler re-dismissed instead, restoring PERMANENT_DISMISS.
    await waitFor(() =>
      expect(restoreSignalDismissal).toHaveBeenCalledWith('cust-linked', undefined),
    );
    expect(restoreSignalDismissal).not.toHaveBeenCalledWith('cust-linked', Number.MAX_SAFE_INTEGER);
    expect(await screen.findByText('Linked Bakery')).toBeTruthy();
  });

  it('snooze uses a future hide window and is likewise reversible', async () => {
    render(<SignalsPage />);
    await screen.findByText('Linked Bakery');

    fireEvent.click(screen.getByLabelText('Snooze Linked Bakery for 30 days'));
    expect(screen.getByText(/Snoozed 30 days · Linked Bakery/)).toBeTruthy();
    await waitFor(() => expect(screen.queryByText('Linked Bakery')).toBeNull());

    fireEvent.click(screen.getByText('Undo'));
    await waitFor(() =>
      expect(restoreSignalDismissal).toHaveBeenCalledWith('cust-linked', undefined),
    );
    expect(await screen.findByText('Linked Bakery')).toBeTruthy();
  });
});
