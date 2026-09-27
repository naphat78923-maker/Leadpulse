import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { Company, Contact, Deal } from '@/types/crm';
import { addDaysToDateKey } from '@/utils/deal-workflow';
import { businessDateKey } from '@/utils/business-time';

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: ComponentProps<'a'>) => <a href={href} {...rest}>{children}</a>,
}));
vi.mock('@/components/blob', () => ({ Blob: () => null }));
vi.mock('@/components/CreateModal', () => ({ default: () => null }));
vi.mock('@/components/LogInteractionModal', () => ({
  default: ({ isOpen, selectedDealId, initialCompanyId, onSave }: {
    isOpen: boolean;
    selectedDealId?: string;
    initialCompanyId?: string;
    onSave: (meeting: { deal_id: string | null }) => Promise<void>;
  }) =>
    isOpen ? (
      <div data-testid="log-modal">
        Logging {selectedDealId ?? initialCompanyId ?? 'new interaction'}
        <button onClick={() => void onSave({ deal_id: null })}>Save log</button>
      </div>
    ) : null,
}));
const crmApi = vi.hoisted(() => ({ updateCompany: vi.fn(async () => ({})) }));
vi.mock('@/lib/crm', () => crmApi);
const reorder = vi.hoisted(() => ({ signals: [] as unknown[] }));
vi.mock('@/hooks/useReorderSignals', () => ({ useReorderSignals: () => ({ signals: reorder.signals }) }));

import TodayPage from './page';

afterEach(() => cleanup());

const today = () => businessDateKey();

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'synthetic-deal-1',
    title: 'Synthetic Bakery sample follow-up',
    stage: 'contacted',
    product: 'Butter',
    client: 'Synthetic Bakery',
    company_id: 'synthetic-company-1',
    contact_ids: [],
    value: null,
    priority: 'medium',
    next_action: 'Check sample feedback',
    followup_date: today(),
    last_outcome: null,
    nudge_count: 0,
    workflow_action: 'outreach',
    ...overrides,
  } as Deal;
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'synthetic-company-1',
    name: 'Synthetic Bakery',
    status: 'active_customer',
    created_at: '2024-01-01T00:00:00.000Z',
    last_human_touch: null,
    next_touch_due: addDaysToDateKey(today(), -3),
    ...overrides,
  } as Company;
}

function setCrm(values: Record<string, unknown> = {}) {
  crm.value = {
    deals: [],
    contacts: [],
    companies: [],
    meetings: [],
    accountEvents: [],
    accountEventsUnavailable: false,
    loading: false,
    error: null,
    createDeal: vi.fn(),
    addMeeting: vi.fn(),
    refresh: vi.fn(async () => {}),
    ...values,
  };
}

describe('This week page', () => {
  afterEach(() => { reorder.signals = []; });

  it('splits overdue deals from retention check-ins and links to the records', () => {
    setCrm({
      deals: [makeDeal({ followup_date: addDaysToDateKey(today(), -1) })],
      companies: [makeCompany()],
    });
    render(<TodayPage />);

    expect(screen.getByRole('heading', { name: 'This week' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Overdue' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Customers to check in with' })).toBeTruthy();
    expect(screen.getByText('Check sample feedback')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open deal:.*synthetic bakery/i }).getAttribute('href'))
      .toBe('/deals?deal=synthetic-deal-1');
    expect(screen.getByRole('link', { name: /open company:.*synthetic bakery/i }).getAttribute('href'))
      .toBe('/companies?company=synthetic-company-1');
  });

  it('keeps distinct deals for one company and honors parked/closed deal rules', () => {
    setCrm({
      deals: [
        makeDeal({ id: 'deal-a', title: 'Sample request', followup_date: today() }),
        makeDeal({ id: 'deal-b', title: 'Saved quote', followup_date: today() }),
        makeDeal({ id: 'deal-parked', title: 'Parked one', workflow_action: 'parked', followup_date: today() }),
        makeDeal({ id: 'deal-closed', title: 'Closed one', stage: 'closed_lost', followup_date: today() }),
      ],
    });
    render(<TodayPage />);

    expect(screen.getByText(/0 overdue · 2 due this week/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /open deal: sample request/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /open deal: saved quote/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /parked one|closed one/i })).toBeNull();
  });

  it('tucks undated deals into a collapsed group without inventing a date', () => {
    setCrm({ deals: [makeDeal({ followup_date: null })] });
    render(<TodayPage />);

    const summary = screen.getByText(/no follow-up date — set one or park them/i);
    expect(summary.closest('details')?.open).toBe(false);
    expect(screen.queryByRole('heading', { name: 'Overdue' })).toBeNull();
  });

  it('flags a known contact hold and offers no Log shortcut for it', () => {
    const contact = {
      id: 'synthetic-contact-1',
      company_id: 'synthetic-company-1',
      name: 'Synthetic Contact',
      status: 'not_interested',
    } as Contact;
    setCrm({
      deals: [makeDeal({ contact_ids: [contact.id], followup_date: today() })],
      contacts: [contact],
    });
    render(<TodayPage />);

    expect(screen.getByRole('heading', { name: 'Needs a decision' })).toBeTruthy();
    expect(screen.getByText(/on hold — check before contacting/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Log interaction for/i })).toBeNull();
  });

  it('opens the interaction modal for a saved deal', () => {
    setCrm({ deals: [makeDeal({ followup_date: today() })], companies: [makeCompany()] });
    render(<TodayPage />);

    fireEvent.click(screen.getByRole('button', { name: /Log interaction for synthetic bakery sample follow-up/i }));
    expect(screen.getByTestId('log-modal').textContent).toContain('synthetic-deal-1');
    expect(screen.queryByRole('button', { name: /send|contact now/i })).toBeNull();
  });

  it('logs against the company for a check-in row', () => {
    setCrm({ companies: [makeCompany()] });
    render(<TodayPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Log interaction for Synthetic Bakery' }));
    expect(screen.getByTestId('log-modal').textContent).toContain('synthetic-company-1');
  });

  it('moves the account\'s saved check-in date after logging a check-in', async () => {
    const refresh = vi.fn(async () => {});
    setCrm({ companies: [makeCompany()], refresh });
    render(<TodayPage />);

    fireEvent.click(screen.getByRole('button', { name: 'Log interaction for Synthetic Bakery' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save log' }));

    await waitFor(() => expect(crmApi.updateCompany).toHaveBeenCalledOnce());
    const [companyId, patch] = crmApi.updateCompany.mock.calls[0] as unknown as [string, { last_human_touch: string; next_touch_due: string }];
    expect(companyId).toBe('synthetic-company-1');
    expect(patch.last_human_touch).toBe(today());
    expect(patch.next_touch_due > today()).toBe(true);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('merges a CRM-linked reorder signal into the check-in list', () => {
    reorder.signals = [{
      customerId: 'hist-1',
      name: 'Historical Buyer',
      crmCompanyId: 'synthetic-company-2',
      inCrm: true,
      severityDays: 40,
      evidence: 'Usually reorders every ~30 days — 40 days past that cycle.',
    }];
    setCrm();
    render(<TodayPage />);

    expect(screen.getByRole('link', { name: 'Open company: Historical Buyer' })).toBeTruthy();
    expect(screen.getByText(/40 days past that cycle/)).toBeTruthy();
  });

  it('shows source failures without claiming an empty list and retries through the provider', () => {
    const refresh = vi.fn(async () => {});
    setCrm({ error: 'synthetic source failure', refresh });
    render(<TodayPage />);

    expect(screen.getByRole('alert').textContent).toMatch(/list may be incomplete/i);
    expect(screen.queryByText(/nothing due/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry loading/i }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText('synthetic source failure')).toBeNull();
  });

  it('labels missing sales history', () => {
    setCrm({ accountEventsUnavailable: true });
    render(<TodayPage />);

    expect(screen.getByText(/sales history didn’t load/i)).toBeTruthy();
  });

  it('renders loading separately from an empty result', () => {
    setCrm({ loading: true });
    render(<TodayPage />);

    expect(screen.getByRole('status').textContent).toMatch(/loading this week/i);
    expect(screen.queryByText(/nothing due/i)).toBeNull();
  });

  it('shows a plain empty state and no internal wording', () => {
    setCrm({ deals: [], companies: [] });
    render(<TodayPage />);

    expect(screen.getByText('Nothing due this week.')).toBeTruthy();
    expect(screen.queryByText(/advisory|not clearance|deals\.followup_date|not interpreted/i)).toBeNull();
  });
});
