import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Meeting } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({
  getCompanies: vi.fn(),
  getContacts: vi.fn(),
  getDeals: vi.fn(),
  getMeetings: vi.fn(),
  getActivityEvents: vi.fn(),
  getAccountEvents: vi.fn(),
  createMeeting: vi.fn(),
  updateContact: vi.fn(),
  updateCompany: vi.fn(),
  createActivityEvent: vi.fn(),
  updateActivityEvent: vi.fn(),
  unmergeCompanies: vi.fn(),
}));

vi.mock('@/lib/crm', () => crmMocks);

import { CrmProvider, useCrm } from './CrmProvider';

const meeting: Omit<Meeting, 'id' | 'created_at'> = {
  description: 'Sent follow-up email',
  type: 'email',
  date: '2026-08-25',
  company_id: null,
  contact_ids: [],
  deal_id: null,
  product: 'Butter',
  summary: null,
  outcome: 'no_response',
  followup_date: null,
};

function RefreshProbe() {
  const { loading, addMeeting } = useCrm();
  if (loading) return <p>Blocking load</p>;
  return <button onClick={() => void addMeeting(meeting)}>Save interaction</button>;
}

function OutboundFieldProbe() {
  const { contacts, deals, loading } = useCrm();
  if (loading) return <p>Loading data</p>;
  return (
    <>
      <p>Contact quality: {String(contacts[0]?.identity_quality)}</p>
      <p>Primary ask: {String(deals[0]?.draft_primary_ask)}</p>
    </>
  );
}

function BuyerEvidenceProbe() {
  const { deals, loading } = useCrm();
  if (loading) return <p>Loading data</p>;
  return <p>Buyer evidence: {String(deals[0]?.buyer_reply)}</p>;
}

function WhatTheyMakeProbe() {
  const { companies, loading } = useCrm();
  if (loading) return <p>Loading data</p>;
  return <p>What they make: {String(companies[0]?.what_they_make)}</p>;
}

function AccountEventAvailabilityProbe() {
  const { accountEventsUnavailable, loading } = useCrm();
  if (loading) return <p>Loading data</p>;
  return <p>Account-event source unavailable: {String(accountEventsUnavailable)}</p>;
}

// A merge logged from the Possible duplicates review, undone later through the id logActivity gave.
function MergeUndoProbe() {
  const { loading, logActivity, undoActivity } = useCrm();
  const [id, setId] = useState('');
  const [undone, setUndone] = useState('');
  if (loading) return <p>Loading data</p>;
  return (
    <>
      <button onClick={() => setId(logActivity({ type: 'merge', entity: 'company', entityId: 'c1', label: 'Merged account', undoPayload: { merge_id: 'm1' } }))}>Log merge</button>
      <button onClick={() => void undoActivity(id).then((ok) => setUndone(String(ok)))}>Undo merge</button>
      <p>Undone: {undone}</p>
    </>
  );
}

describe('CrmProvider refresh lifecycle', () => {
  beforeEach(() => {
    Object.values(crmMocks).forEach(mock => mock.mockReset());
    crmMocks.getCompanies.mockResolvedValue([]);
    crmMocks.getContacts.mockResolvedValue([]);
    crmMocks.getDeals.mockResolvedValue([]);
    crmMocks.getMeetings.mockResolvedValue([]);
    crmMocks.getActivityEvents.mockResolvedValue([]);
    crmMocks.getAccountEvents.mockResolvedValue([]);
    crmMocks.createMeeting.mockResolvedValue({});
    crmMocks.updateContact.mockResolvedValue({});
    crmMocks.updateCompany.mockResolvedValue({});
  });

  afterEach(cleanup);

  it('keeps children mounted while a post-save refresh is in flight', async () => {
    render(<CrmProvider><RefreshProbe /></CrmProvider>);
    const saveButton = await screen.findByRole('button', { name: 'Save interaction' });

    let finishRefresh!: (value: unknown[]) => void;
    crmMocks.getCompanies.mockImplementationOnce(() => new Promise(resolve => {
      finishRefresh = resolve;
    }));

    fireEvent.click(saveButton);

    await waitFor(() => expect(crmMocks.getCompanies).toHaveBeenCalledTimes(2));
    expect(screen.queryByText('Blocking load')).toBeNull();
    expect(screen.getByRole('button', { name: 'Save interaction' })).toBeTruthy();

    finishRefresh([]);
    await waitFor(() => expect(crmMocks.getMeetings).toHaveBeenCalledTimes(2));
  });

  it('maps legacy rows to safe explicit outbound defaults', async () => {
    crmMocks.getContacts.mockResolvedValueOnce([{
      id: 'contact-1',
      name: 'Head Chef',
      status: 'active',
    }]);
    crmMocks.getDeals.mockResolvedValueOnce([{
      id: 'deal-1',
      title: 'Butter · Bakery',
      client: 'Bakery',
      product: 'Butter',
      stage: 'research',
      priority: 'medium',
    }]);

    render(<CrmProvider><OutboundFieldProbe /></CrmProvider>);

    expect(await screen.findByText('Contact quality: unknown')).toBeTruthy();
    expect(screen.getByText('Primary ask: null')).toBeTruthy();
  });

  it('keeps the attributed buyer reply in provider state for explicit evidence review', async () => {
    crmMocks.getDeals.mockResolvedValueOnce([{
      id: 'synthetic-deal-1',
      title: 'Butter · Synthetic Bakery',
      client: 'Synthetic Bakery',
      product: 'Butter',
      stage: 'research',
      priority: 'medium',
      buyer_reply: 'Please send a sample quote.',
    }]);

    render(<CrmProvider><BuyerEvidenceProbe /></CrmProvider>);

    expect(await screen.findByText('Buyer evidence: Please send a sample quote.')).toBeTruthy();
  });

  it('keeps what an account makes, which drafts and the account panel read', async () => {
    crmMocks.getCompanies.mockResolvedValueOnce([{ id: 'c1', name: 'Synthetic Bakery', status: 'prospect', what_they_make: 'red velvet cake' }]);
    render(<CrmProvider><WhatTheyMakeProbe /></CrmProvider>);
    expect(await screen.findByText('What they make: red velvet cake')).toBeTruthy();
  });

  it('undoes a merge by the id logActivity returned, after the entry is saved', async () => {
    const savedId = '0f0f0f0f-1111-2222-3333-444444444444';
    crmMocks.createActivityEvent.mockResolvedValue({ id: savedId });
    crmMocks.updateActivityEvent.mockResolvedValue({});
    crmMocks.unmergeCompanies.mockResolvedValue(undefined);
    render(<CrmProvider><MergeUndoProbe /></CrmProvider>);

    fireEvent.click(await screen.findByRole('button', { name: 'Log merge' }));
    await waitFor(() => expect(crmMocks.createActivityEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'merge', undo_payload: { merge_id: 'm1' } })));
    fireEvent.click(screen.getByRole('button', { name: 'Undo merge' }));

    expect(await screen.findByText('Undone: true')).toBeTruthy();
    expect(crmMocks.unmergeCompanies).toHaveBeenCalledExactlyOnceWith('m1');
    expect(crmMocks.updateActivityEvent).toHaveBeenCalledWith(savedId, { applied: false });
  });

  it('surfaces an account-event read failure separately from an empty event history', async () => {
    crmMocks.getAccountEvents.mockRejectedValueOnce(new Error('synthetic read failure'));

    render(<CrmProvider><AccountEventAvailabilityProbe /></CrmProvider>);

    expect(await screen.findByText('Account-event source unavailable: true')).toBeTruthy();
  });
});
