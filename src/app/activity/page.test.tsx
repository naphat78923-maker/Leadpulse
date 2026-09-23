// Component tests for the Activity page.
//
// These lock the leanness contract: the header leads with counts (not a repeated
// title), the pulse keeps outcomes + the 7-day bars but drops the per-type tile
// grid and the percentage meta, and radar hints stay short.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

// This repo's vitest setup does not auto-clean between tests (existing component
// tests call cleanup explicitly), so repeated renders stack in the DOM otherwise.
afterEach(() => cleanup());

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const router = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/image', () => ({
  default: ({ src, alt, ...rest }: any) => <img src={src} alt={alt} />,
}));
// Detail panels and the log modal are out of scope — this suite covers the page surface.
vi.mock('@/components/LogInteractionModal', () => ({ default: () => null }));
vi.mock('@/components/CompanyDetail', () => ({ default: () => null }));
vi.mock('@/components/ContactDetail', () => ({ default: () => null }));

import ActivityPage from './page';
import type { Meeting } from '@/types/crm';
import { businessDateKey } from '@/utils/business-time';

function setCrm(v: Record<string, unknown> = {}) {
  crm.value = {
    meetings: [],
    contacts: [],
    companies: [],
    deals: [],
    activities: [],
    loading: false,
    addMeeting: vi.fn(),
    undoActivity: vi.fn(async () => true),
    refresh: vi.fn(async () => {}),
    ...v,
  };
}

const makeMeeting = (over: Partial<Meeting>): Meeting =>
  ({
    id: 'm1',
    type: 'call',
    date: businessDateKey(new Date()),
    created_at: new Date().toISOString(),
    description: 'Called Acme',
    summary: null,
    contact_ids: [],
    company_id: null,
    deal_id: null,
    outcome: 'positive',
    followup_date: null,
    ...over,
  }) as Meeting;

describe('Activity page', () => {
  it('leads the header with counts, not a repeated title', () => {
    setCrm({ meetings: [makeMeeting({})] });
    render(<ActivityPage />);

    expect(screen.getByRole('heading', { name: 'Activity' })).toBeTruthy();
    const eyebrow = screen.getByText(/events/);
    expect(eyebrow.textContent).toMatch(/^1 events/);
    expect(eyebrow.textContent).not.toMatch(/^Activity ·/);
  });

  it('keeps outcome counts and the 7-day bars, without per-type tiles or percentages', () => {
    setCrm({ meetings: [makeMeeting({})] });
    render(<ActivityPage />);

    // 'Calls' survives only as the filter option — the tile grid is gone
    expect(screen.getAllByText('Calls')).toHaveLength(1);
    expect(screen.getByText(/touchpoints/)).toBeTruthy();
    // Outcome chip keeps the count, loses the parenthetical percentage
    expect(screen.getByText(/Positive/)).toBeTruthy();
    expect(screen.queryByText(/\(\d+%\)/)).toBeNull();
  });

  it('trims the cold-accounts radar hint to a short label', () => {
    setCrm({});
    render(<ActivityPage />);

    fireEvent.click(screen.getByRole('button', { name: /^Radar/ }));
    expect(screen.getByText('Quiet 14+ days')).toBeTruthy();
    expect(screen.queryByText(/amber =/)).toBeNull();
  });

  it('renders logged interactions in the timeline', () => {
    setCrm({ meetings: [makeMeeting({})] });
    render(<ActivityPage />);

    expect(screen.getByText('Called Acme')).toBeTruthy();
  });
});
