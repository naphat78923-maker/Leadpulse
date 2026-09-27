import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Meeting, Contact } from '@/types/crm';
import InteractionThread from './InteractionThread';

const contact: Contact = {
  id: 'c1',
  name: 'Head Chef',
  email: null,
  phone: '020000000',
  phone_second: null,
  line: null,
  job_title: 'Head Chef',
  company_id: null,
  status: 'active',
  identity_quality: 'unknown',
  last_contacted_date: null,
  notes: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-25T10:00:00Z',
};

const meeting: Meeting = {
  id: 'm1',
  description: 'Followed up about test results',
  type: 'call',
  date: '2026-08-20T10:00:00Z',
  company_id: null,
  contact_ids: ['c1'],
  deal_id: null,
  product: 'Butter',
  summary: 'Chef wants a larger sample',
  outcome: 'positive',
  followup_date: null,
  created_at: '2026-08-20T10:00:00Z',
};

describe('InteractionThread', () => {
  it('shows an empty state when there are no meetings', () => {
    render(<InteractionThread meetings={[]} allContacts={[contact]} deals={[]} companies={[]} />);
    expect(screen.getByText('No interactions yet')).toBeTruthy();
  });

  it('renders a meeting row with type, counterparty, and outcome', () => {
    render(<InteractionThread meetings={[meeting]} allContacts={[contact]} deals={[]} companies={[]} />);
    expect(screen.getByText(/Call/)).toBeTruthy();
    expect(screen.getByText(/Head Chef/)).toBeTruthy();
    expect(screen.getByText('Positive')).toBeTruthy();
    expect(screen.getByText('Chef wants a larger sample')).toBeTruthy();
  });
});
