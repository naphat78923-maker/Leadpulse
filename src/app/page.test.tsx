import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { ComponentProps } from 'react';
import type { Company, Contact, Deal, Meeting } from '@/types/crm';
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
  default: ({ isOpen, selectedDealId }: { isOpen: boolean; selectedDealId?: string }) =>
    isOpen ? <div data-testid="log-modal">Logging {selectedDealId ?? 'new interaction'}</div> : null,
}));

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

describe('Today follow-up queue', () => {
  it('combines an authoritative saved deal date with an existing retention due signal', () => {
    setCrm({
      deals: [makeDeal({ followup_date: addDaysToDateKey(today(), -1) })],
      companies: [makeCompany()],
    });
    render(<TodayPage />);

    expect(screen.getByRole('heading', { name: 'Today’s work' })).toBeTruthy();
    expect(screen.getByText('Saved commitments · 1')).toBeTruthy();
    expect(screen.getByText('Retention due · 1')).toBeTruthy();
    expect(screen.getByText(/Check sample feedback/)).toBeTruthy();
    expect(screen.getByRole('link', { name: /open deal:.*synthetic bakery/i }).getAttribute('href'))
      .toBe('/deals?deal=synthetic-deal-1');
    expect(screen.getByRole('link', { name: /open company:.*synthetic bakery/i }).getAttribute('href'))
      .toBe('/companies?company=synthetic-company-1');
    expect(screen.getByText('deals.followup_date')).toBeTruthy();
    expect(screen.getByText('companies.next_touch_due')).toBeTruthy();
  });

  it('keeps distinct obligations for one company and honors parked/closed deal rules', () => {
    setCrm({
      deals: [
        makeDeal({ id: 'deal-a', title: 'Sample request', followup_date: today() }),
        makeDeal({ id: 'deal-b', title: 'Saved quote', followup_date: today() }),
        makeDeal({ id: 'deal-parked', workflow_action: 'parked', followup_date: today() }),
        makeDeal({ id: 'deal-closed', stage: 'closed_lost', followup_date: today() }),
      ],
    });
    render(<TodayPage />);

    expect(screen.getByText('2 items · all shown')).toBeTruthy();
    expect(screen.getByRole('link', { name: /open deal: sample request/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: /open deal: saved quote/i })).toBeTruthy();
    expect(screen.queryByRole('link', { name: /deal-parked/i })).toBeNull();
    expect(screen.queryByRole('link', { name: /deal-closed/i })).toBeNull();
  });

  it('shows an unscheduled date-or-park decision without inventing a date', () => {
    setCrm({ deals: [makeDeal({ followup_date: null })] });
    render(<TodayPage />);

    expect(screen.getByText('Date or park · 1')).toBeTruthy();
    expect(screen.getByText('No saved date')).toBeTruthy();
    expect(screen.getByText(/No saved follow-up date\. Review the existing next action/i)).toBeTruthy();
  });

  it('surfaces a known contact hold as internal review, never as contact clearance', () => {
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

    expect(screen.getByText('Needs review / contact holds · 1')).toBeTruthy();
    expect(screen.getByText(/Contact hold · internal review only/)).toBeTruthy();
    expect(screen.getByText(/unknown contact permission is not clearance/i)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Log interaction for/i })).toBeNull();
    expect(screen.queryByText(/safe to contact/i)).toBeNull();
  });

  it('uses the existing interaction modal for a saved deal without adding a send path', () => {
    setCrm({ deals: [makeDeal({ followup_date: today() })] });
    render(<TodayPage />);

    fireEvent.click(screen.getByRole('button', { name: /Log interaction for synthetic bakery sample follow-up/i }));
    expect(screen.getByTestId('log-modal').textContent).toContain('synthetic-deal-1');
    expect(screen.queryByRole('button', { name: /send|contact now/i })).toBeNull();
  });

  it('opens exact buyer text only on request and keeps meeting paraphrases excluded', () => {
    const buyerText = 'Please send the current specification for the next batch.';
    setCrm({
      deals: [makeDeal({ buyer_reply: buyerText, updated_at: '2026-09-26T00:00:00.000Z' })],
      meetings: [{
        id: 'synthetic-meeting-1',
        company_id: 'synthetic-company-1',
        deal_id: 'synthetic-deal-1',
        date: '2026-09-20',
        direction: 'inbound',
        summary: 'Synthetic operator paraphrase.',
      } as Meeting],
    });
    render(<TodayPage />);

    expect(screen.queryByText(buyerText)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /inspect customer evidence/i }));
    expect(screen.getByText(buyerText)).toBeTruthy();
    expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent?.includes('Observed time: unknown') === true)).toBeTruthy();
    expect(screen.getByText(/Undated buyer evidence requires manual timing review/i)).toBeTruthy();
    expect(screen.getByText('Synthetic operator paraphrase.')).toBeTruthy();
    expect(screen.getByText(/Excluded from customer judgments/i)).toBeTruthy();
    expect(screen.queryByText('2026-09-26T00:00:00.000Z')).toBeNull();
  });

  it('shows source failures without claiming an empty queue and retries through the provider', () => {
    const refresh = vi.fn(async () => {});
    setCrm({ error: 'synthetic source failure', refresh });
    render(<TodayPage />);

    expect(screen.getByRole('alert').textContent).toMatch(/queue may be incomplete/i);
    expect(screen.queryByText(/nothing due/i)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /retry loading/i }));
    expect(refresh).toHaveBeenCalledOnce();
    expect(screen.queryByText('synthetic source failure')).toBeNull();
  });

  it('labels missing sales-event history and keeps worker judgments visibly disabled', () => {
    setCrm({ accountEventsUnavailable: true });
    render(<TodayPage />);

    expect(screen.getByText(/sales history is unavailable/i)).toBeTruthy();
    expect(screen.getByText(/local customer-message judgments are not enabled/i)).toBeTruthy();
  });

  it('renders loading separately from an empty result', () => {
    setCrm({ loading: true });
    render(<TodayPage />);

    expect(screen.getByRole('status').textContent).toMatch(/loading schedules and retention signals/i);
    expect(screen.queryByText(/nothing due/i)).toBeNull();
  });

  it('provides an honest empty state when all available sources have no queue items', () => {
    setCrm({ deals: [], companies: [] });
    render(<TodayPage />);

    expect(screen.getByText('0 items · all shown')).toBeTruthy();
    expect(screen.getByText(/nothing due, overdue, or unscheduled for review today/i)).toBeTruthy();
  });
});
