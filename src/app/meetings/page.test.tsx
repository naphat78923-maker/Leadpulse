import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { Deal, Meeting } from '@/types/crm';
import MeetingsPage from './page';

const hotDeal: Deal = {
  id: 'deal-hot',
  title: 'Butter supply',
  stage: 'negotiation',
  product: 'Butter',
  client: 'Client',
  company_id: 'company-1',
  contact_ids: [],
  value: 300000,
  priority: 'high',
  next_action: null,
  followup_date: null,
  last_outcome: null,
  buyer_reply: null,
  nudge_count: 0,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

function makeMeeting(overrides: Partial<Meeting>): Meeting {
  return {
    id: 'meeting-1',
    description: 'Tasting follow-up',
    type: 'meeting',
    date: '2026-09-10',
    company_id: null,
    contact_ids: [],
    deal_id: null,
    product: null,
    summary: null,
    outcome: null,
    direction: 'outbound',
    created_at: '2026-09-10T00:00:00Z',
    ...overrides,
  } as Meeting;
}

const meetings: Meeting[] = [
  makeMeeting({ id: 'm-linked', description: 'Linked to hot deal', deal_id: 'deal-hot' }),
  makeMeeting({ id: 'm-account', description: 'Account only', company_id: 'company-1' }),
  makeMeeting({ id: 'm-plain', description: 'No signal here' }),
];

vi.mock('@/components/CrmProvider', () => ({
  useCrm: () => ({
    meetings,
    contacts: [],
    deals: [hotDeal],
    loading: false,
    addMeeting: vi.fn(),
  }),
}));

vi.mock('@/components/LogInteractionModal', () => ({ default: () => null }));

describe('MeetingsPage — Laya lead-tier context', () => {
  afterEach(cleanup);

  it('shows the deterministic Laya tier chip on interactions linked to a hot open deal', () => {
    render(<MeetingsPage />);
    const linked = screen.getByText('Linked to hot deal').closest('div[class*="rounded-lg"]');
    expect(linked?.textContent).toContain('🟠 Warm');
  });

  it('falls back to the account’s hottest open deal when no deal is linked', () => {
    render(<MeetingsPage />);
    const accountRow = screen.getByText('Account only').closest('div[class*="rounded-lg"]');
    expect(accountRow?.textContent).toContain('🟠 Warm');
  });

  it('renders no chip for interactions with no deal signal', () => {
    render(<MeetingsPage />);
    const plain = screen.getByText('No signal here').closest('div[class*="rounded-lg"]');
    expect(plain?.textContent).not.toMatch(/Hot Lead|Warm|Warming Up|Cooling|Cold/);
  });
});
