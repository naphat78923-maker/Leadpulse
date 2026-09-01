import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
});
