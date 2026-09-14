// Slice 6 — end-to-end journey, run against an IN-MEMORY persistence layer.
//
// Why not the browser: LeadPulse has no isolated environment. Its only backend is the live
// Supabase project, so driving this journey through a browser would create and mutate real CRM
// records (and the assigned brief forbids mutating the live TEST deal). This harness drives the
// REAL components and the REAL provider against a fake `@/lib/crm`, so the state machine, the
// save/reload contract and the guard rails are all exercised without touching production data.
//
// The store below is the "database": assertions read it directly, which is what "reload and
// compare the authoritative persisted state" means here.
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Company, Contact, Deal, Meeting } from '@/types/crm';

interface StoreState {
  companies: Company[];
  contacts: Contact[];
  deals: Deal[];
  meetings: Meeting[];
  accountEvents: Array<{ company_id: string; event_date: string; amount: number; product_line: string | null; order_id: string | null }>;
  activities: unknown[];
  failNextDealWrite: Error | null;
  nextId: number;
}

const store = vi.hoisted(() => {
  const state = {
    companies: [] as any[],
    contacts: [] as any[],
    deals: [] as any[],
    meetings: [] as any[],
    accountEvents: [] as any[],
    activities: [] as any[],
    failNextDealWrite: null as Error | null,
    nextId: 1,
  };
  const id = (prefix: string) => `${prefix}-${state.nextId++}`;
  const now = () => new Date('2026-09-14T04:00:00.000Z').toISOString();

  const api = {
    getCompanies: async () => state.companies,
    getContacts: async () => state.contacts,
    getDeals: async () => state.deals,
    getMeetings: async () => state.meetings,
    getActivityEvents: async () => state.activities,
    getAccountEvents: async () => state.accountEvents,
    createActivityEvent: async (event: any) => {
      const row = { id: id('activity'), timestamp: now(), applied: true, ...event };
      state.activities.unshift(row);
      return row;
    },
    updateActivityEvent: async (rowId: string, patch: any) => {
      const row = state.activities.find((a: any) => a.id === rowId);
      if (row) Object.assign(row, patch);
      return row;
    },
    createMeeting: async (meeting: any) => {
      const row = { id: id('meeting'), created_at: now(), ...meeting };
      state.meetings.unshift(row);
      return row;
    },
    createContact: async (contact: any) => {
      const row = { id: id('contact'), created_at: now(), updated_at: now(), ...contact };
      state.contacts.push(row);
      return row;
    },
    createCompany: async (company: any) => {
      const row = { id: id('company'), created_at: now(), updated_at: now(), ...company };
      state.companies.push(row);
      return row;
    },
    createDeal: async (deal: any) => {
      const row = { id: id('deal'), created_at: now(), updated_at: now(), ...deal };
      state.deals.push(row);
      return row;
    },
    updateContact: async (contactId: string, patch: any) => {
      const row = state.contacts.find((c: any) => c.id === contactId);
      if (row) Object.assign(row, patch, { updated_at: now() });
      return row;
    },
    updateCompany: async (companyId: string, patch: any) => {
      const row = state.companies.find((c: any) => c.id === companyId);
      if (row) Object.assign(row, patch, { updated_at: now() });
      return row;
    },
    updateDeal: async (dealId: string, updates: any) => {
      const row = state.deals.find((d: any) => d.id === dealId);
      if (!row) throw new Error('deal not found');
      Object.assign(row, updates, { updated_at: now() });
      return row;
    },
    // Mirrors the real contract: a version-checked write, safe to retry when it already applied.
    updateDealIfUnchanged: async (dealId: string, expectedUpdatedAt: string, updates: any) => {
      if (state.failNextDealWrite) {
        const err = state.failNextDealWrite;
        state.failNextDealWrite = null;
        throw err;
      }
      const row = state.deals.find((d: any) => d.id === dealId);
      if (!row) throw new Error('deal not found');
      if (row.updated_at !== expectedUpdatedAt) {
        const alreadyApplied = Object.entries(updates).every(([key, value]) => Object.is((row as any)[key], value));
        if (alreadyApplied) return row;
        throw new Error('This deal changed while the interaction was saving. Review its current lane before trying again.');
      }
      Object.assign(row, updates, { updated_at: now() });
      return row;
    },
    softDelete: async (table: string, rowId: string) => {
      const list = (state as any)[table];
      const row = list?.find((r: any) => r.id === rowId);
      if (row) row.deleted_at = now();
    },
    restoreEntity: async (table: string, rowId: string) => {
      const list = (state as any)[table];
      const row = list?.find((r: any) => r.id === rowId);
      if (row) row.deleted_at = null;
    },
    createAccountEvent: async (event: any) => {
      state.accountEvents.push(event);
      return event;
    },
    uploadCompanyLogo: async () => 'https://example.test/logo.webp',
    deleteCompanyLogo: async () => undefined,
  };
  return { state, api, id, now };
});

const addToast = vi.hoisted(() => vi.fn());

vi.mock('@/lib/crm', () => store.api);
vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ addToast }) }));

import { CrmProvider, useCrm } from '@/components/CrmProvider';
import DealDetail from '@/components/DealDetail';

const company: Company = {
  id: 'company-1',
  name: 'Synthetic Bakery',
  status: 'prospect',
  lead_source: 'Outbound',
  account_owner: 'Pat',
  last_contact_date: null,
  tags: [],
  industry: 'Bakery',
  size: null,
  address: null,
  website: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const contact: Contact = {
  id: 'contact-1',
  name: 'Synthetic Buyer',
  email: 'buyer@example-bakery.test',
  phone: null,
  phone_second: null,
  line: null,
  job_title: 'Head Baker',
  company_id: 'company-1',
  status: 'active',
  identity_quality: 'named',
  outreach_language: 'autodetect',
  outreach_language_basis: 'autodetect',
  last_contacted_date: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
};

const freshDeal = (overrides: Partial<Deal> = {}): Deal => ({
  id: 'deal-1',
  title: 'Butter · Synthetic Bakery',
  stage: 'research',
  product: 'Butter',
  client: 'Synthetic Bakery',
  company_id: 'company-1',
  contact_ids: ['contact-1'],
  value: null,
  priority: 'medium',
  next_action: 'Send the intro email',
  followup_date: null,
  last_outcome: null,
  nudge_count: 0,
  workflow_action: 'outreach',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...overrides,
});

/** Mirrors how the board wires the detail: the selected deal comes from provider state. */
function Harness() {
  const { deals, loading } = useCrm();
  const [closed, setClosed] = useState(false);
  if (loading) return <p>loading</p>;
  const deal = deals[0];
  if (!deal || closed) return <p>no deal selected</p>;
  return <DealDetail deal={deal} onClose={() => setClosed(true)} onSaved={() => {}} />;
}

const persist = (state: { deals: Deal[] }) => state.deals.find(d => d.id === 'deal-1')!;
const meetingRows = () => store.state.meetings;

describe('end-to-end journey on synthetic fixtures', () => {
  beforeEach(() => {
    store.state.companies = [{ ...company }];
    store.state.contacts = [{ ...contact }];
    store.state.deals = [freshDeal()];
    store.state.meetings = [];
    store.state.accountEvents = [];
    store.state.activities = [];
    store.state.failNextDealWrite = null;
    store.state.nextId = 1;
    addToast.mockReset();
  });

  afterEach(cleanup);

  it('outreach → waiting → reply → direct follow-up → won, with the store as the authority', async () => {
    render(
      <CrmProvider>
        <Harness />
      </CrmProvider>
    );
    await screen.findByText('ACTION LANE');

    // 1 ── log the outreach and wait for a reply: no reply is recorded, no outcome invented.
    fireEvent.click(screen.getByRole('button', { name: /Log touch/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Sent the intro email' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));
    await waitFor(() => expect(meetingRows()).toHaveLength(1));

    expect(meetingRows()[0]).toMatchObject({ type: 'call', direction: 'outbound', deal_id: 'deal-1' });
    expect(persist(store.state as any)).toMatchObject({ workflow_action: 'reply', stage: 'contacted' });
    expect(persist(store.state as any).last_outcome).toMatch(/waiting on reply/);
    // The interaction carries the deal's history, and the deal's schedule is untouched.
    expect(persist(store.state as any).followup_date).toBeNull();

    // 2 ── the client replies, and the user chooses a direct follow-up with a new date.
    fireEvent.click(screen.getByRole('button', { name: /Log touch/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Follow-up call/i), {
      target: { value: 'Buyer called back asking for pricing' },
    });
    fireEvent.click(screen.getByRole('radio', { name: /Client replied/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Positive' }));
    fireEvent.click(screen.getByRole('radio', { name: /Record reply and schedule the follow-up/i }));
    fireEvent.change(screen.getByLabelText(/Next follow-up date/i), { target: { value: '2026-09-25' } });
    // The lane move needs a date, so it OWNS the deal schedule for this save — the
    // preserve/replace/clear choice is not offered on top of it.
    expect(screen.queryByRole('radio', { name: /Replace the deal schedule/i })).toBeNull();
    expect(screen.getByText(/This move sets the deal's follow-up to the date above/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    await waitFor(() => expect(meetingRows()).toHaveLength(2));
    expect(meetingRows()[0]).toMatchObject({ direction: 'inbound', outcome: 'positive', deal_id: 'deal-1' });
    const afterReply = persist(store.state as any);
    expect(afterReply).toMatchObject({ workflow_action: 'reschedule', followup_date: '2026-09-25' });
    expect(afterReply.last_outcome).toMatch(/Customer reply \(positive\): Buyer called back asking for pricing/);
    // History is not rewritten: the first interaction keeps its own row.
    expect(meetingRows()[1]).toMatchObject({ direction: 'outbound', description: 'Sent the intro email' });

    // 3 ── close it as won, resolving the action and leaving the value unknown.
    fireEvent.click(screen.getByRole('button', { name: /Won/i }));
    await screen.findByText(/This deal's current action/i);
    fireEvent.click(screen.getByRole('button', { name: /^Mark won$/ }));

    await waitFor(() => expect(persist(store.state as any).stage).toBe('closed_won'));
    const closed = persist(store.state as any);
    expect(closed).toMatchObject({ workflow_action: 'success', next_action: null, followup_date: null });
    expect(closed.value).toBeNull();
    expect(closed.last_outcome).toMatch(/Marked won/);
    expect(closed.last_outcome).toMatch(/Previous action marked done/);
    // No order was invented: a blank value records no sale signal.
    expect(store.state.accountEvents).toHaveLength(0);
    expect(meetingRows()).toHaveLength(2);
  });

  it('records a sale signal only when an explicit order value was given', async () => {
    render(
      <CrmProvider>
        <Harness />
      </CrmProvider>
    );
    await screen.findByText('ACTION LANE');

    fireEvent.click(screen.getByRole('button', { name: /Won/i }));
    await screen.findByText(/This deal's current action/i);
    fireEvent.change(screen.getByPlaceholderText('e.g. 50000'), { target: { value: '42000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Mark won$/ }));

    await waitFor(() => expect(store.state.accountEvents).toHaveLength(1));
    expect(store.state.accountEvents[0]).toMatchObject({ company_id: 'company-1', amount: 42000 });
    expect(persist(store.state as any).value).toBe(42000);
  });

  it('keeps the current action when the user chooses to, and never drops it silently', async () => {
    render(
      <CrmProvider>
        <Harness />
      </CrmProvider>
    );
    await screen.findByText('ACTION LANE');

    fireEvent.click(screen.getByRole('button', { name: /Won/i }));
    await screen.findByText(/This deal's current action/i);
    fireEvent.click(screen.getByRole('radio', { name: /Keep it as it is/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Mark won$/ }));

    await waitFor(() => expect(persist(store.state as any).stage).toBe('closed_won'));
    expect(persist(store.state as any).next_action).toBe('Send the intro email');
    expect(persist(store.state as any).last_outcome).toMatch(/kept on purpose/);
  });

  it('an internal note moves nothing and counts nothing', async () => {
    render(
      <CrmProvider>
        <Harness />
      </CrmProvider>
    );
    await screen.findByText('ACTION LANE');

    fireEvent.click(screen.getByRole('button', { name: /Log touch/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^Note/ }));
    fireEvent.change(screen.getByPlaceholderText(/Follow-up call/i), { target: { value: 'Reminder to self' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    await waitFor(() => expect(meetingRows()).toHaveLength(1));
    expect(meetingRows()[0]).toMatchObject({ type: 'note', direction: 'internal' });
    expect(persist(store.state as any)).toMatchObject({ workflow_action: 'outreach', followup_date: null, last_outcome: null });
  });

  it('a failed deal update is visible, and the retry does not duplicate the interaction', async () => {
    render(
      <CrmProvider>
        <Harness />
      </CrmProvider>
    );
    await screen.findByText('ACTION LANE');

    store.state.failNextDealWrite = new Error('network down');
    fireEvent.click(screen.getByRole('button', { name: /Log touch/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Follow-up call/i), { target: { value: 'Sent the intro email' } });
    fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/deal update was not confirmed/i);
    expect(meetingRows()).toHaveLength(1);
    expect(persist(store.state as any).workflow_action).toBe('outreach');

    fireEvent.click(screen.getByRole('button', { name: /Retry deal update/i }));

    await waitFor(() => expect(persist(store.state as any).workflow_action).toBe('reply'));
    // The interaction was written once; only the deal update was retried.
    expect(meetingRows()).toHaveLength(1);
    expect(store.state.meetings.filter(m => m.description === 'Sent the intro email')).toHaveLength(1);
  });

  it('a stale write is rejected rather than overwriting a newer record', async () => {
    render(
      <CrmProvider>
        <Harness />
      </CrmProvider>
    );
    await screen.findByText('ACTION LANE');

    // Another surface moved the deal after this editor read it.
    store.state.deals[0] = { ...store.state.deals[0], workflow_action: 'sample', stage: 'proposal', updated_at: '2026-09-14T05:00:00.000Z' };

    fireEvent.click(screen.getByRole('button', { name: /Log touch/i }));
    fireEvent.change(await screen.findByPlaceholderText(/Follow-up call/i), { target: { value: 'Sent the intro email' } });
    fireEvent.click(screen.getByRole('radio', { name: /Log outreach and wait for reply/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Save Interaction' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/changed while the interaction was saving/i);
    expect(persist(store.state as any).workflow_action).toBe('sample');
  });
});
