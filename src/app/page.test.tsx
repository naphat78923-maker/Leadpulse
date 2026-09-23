// Component tests for the Today page (daily-cadence home).
//
// These lock the leanness contract: the hero carries exactly one next move with its
// actions, due-today deals live in the queue (no duplicate card), the only forward
// horizon is "This week", and the trimmed chrome (tagline, pulse strips, vanity
// counters) stays off the page.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';

// This repo's vitest setup does not auto-clean between tests (existing component
// tests call cleanup explicitly), so repeated renders stack in the DOM otherwise.
afterEach(() => cleanup());

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const router = vi.hoisted(() => ({ push: vi.fn() }));
const toast = vi.hoisted(() => ({ addToast: vi.fn() }));
const crmLib = vi.hoisted(() => ({ updateDeal: vi.fn(async () => ({})) }));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...rest }: any) => (
    <a href={href} {...rest}>{children}</a>
  ),
}));
vi.mock('@/components/ToastProvider', () => ({ useToast: () => toast }));
vi.mock('@/components/motion', () => ({
  PageTransition: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  StaggerList: ({ children, stagger, ...rest }: any) => <div {...rest}>{children}</div>,
  StaggerItem: ({ children, ...rest }: any) => <div {...rest}>{children}</div>,
}));
vi.mock('@/components/blob', () => ({ Blob: () => null }));
vi.mock('@/lib/crm', () => crmLib);
// Heavy modals are out of scope here — this suite covers the page surface.
vi.mock('@/components/CreateModal', () => ({ default: () => null }));
vi.mock('@/components/LogInteractionModal', () => ({ default: () => null }));
vi.mock('@/components/TaskActionSheet', () => ({ default: () => null }));

import TodayPage from './page';
import type { Deal } from '@/types/crm';
import { bangkokDateKey } from '@/utils/format';
import { addDaysToDateKey } from '@/utils/deal-workflow';

function setCrm(v: Record<string, unknown> = {}) {
  crm.value = {
    deals: [],
    contacts: [],
    companies: [],
    meetings: [],
    loading: false,
    createDeal: vi.fn(),
    addMeeting: vi.fn(),
    refresh: vi.fn(async () => {}),
    logActivity: vi.fn(),
    ...v,
  };
}

const makeDeal = (over: Partial<Deal>): Deal =>
  ({
    id: 'd1',
    title: 'Butter · Acme',
    stage: 'contacted',
    product: 'Butter',
    client: 'Acme',
    company_id: null,
    contact_ids: [],
    value: null,
    priority: 'medium',
    next_action: null,
    followup_date: null,
    last_outcome: null,
    nudge_count: 0,
    workflow_action: 'outreach',
    ...over,
  }) as Deal;

const todayKey = () => bangkokDateKey();


describe('Today page', () => {
  it('puts the single next move in the hero with its actions', () => {
    setCrm({
      deals: [makeDeal({ id: 'd1', client: 'Acme', followup_date: addDaysToDateKey(todayKey(), -2) })],
    });
    render(<TodayPage />);

    expect(screen.getByRole('heading', { name: 'Acme' })).toBeTruthy();
    expect(screen.getByText(/2 days? overdue/)).toBeTruthy();
    expect(screen.getByRole('button', { name: /Log touch/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Open deal/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Snooze to tomorrow/ })).toBeTruthy();
  });

  it('keeps the whisper counters to what drives today — no review/won vanity counts', () => {
    setCrm({
      deals: [makeDeal({ id: 'd1', followup_date: addDaysToDateKey(todayKey(), -1) })],
    });
    render(<TodayPage />);

    const counters = screen.getByLabelText('Today counters');
    expect(counters.textContent).toContain('1 overdue');
    expect(counters.textContent).toContain('0 due today');
    expect(counters.textContent).not.toMatch(/needs review/i);
    expect(counters.textContent).not.toMatch(/\bwon\b/i);
  });

  it('keeps trimmed chrome off the page', () => {
    setCrm({
      deals: [makeDeal({ id: 'd1', followup_date: addDaysToDateKey(todayKey(), -1) })],
    });
    render(<TodayPage />);

    expect(screen.queryByText(/one next move, then the queue/i)).toBeNull();
    expect(screen.queryByText("Today's pulse")).toBeNull();
    expect(screen.queryByText(/Pulse · last 7d/i)).toBeNull();
    expect(screen.queryByText(/waiting after you finish/i)).toBeNull();
  });

  it('shows a due-today deal in the hero/queue only — no duplicate Due today card', () => {
    setCrm({
      deals: [
        makeDeal({ id: 'd1', client: 'Acme', followup_date: todayKey() }),
        makeDeal({ id: 'd2', client: 'Beko', followup_date: todayKey() }),
      ],
    });
    render(<TodayPage />);

    expect(screen.queryByRole('heading', { name: 'Due today' })).toBeNull();
    // One deal is the hero, the other waits in Up next
    expect(screen.getByRole('heading', { name: 'Acme' })).toBeTruthy();
    expect(screen.getByText('Beko')).toBeTruthy();
  });

  it('keeps the This week horizon for upcoming follow-ups', () => {
    setCrm({
      deals: [makeDeal({ id: 'd1', client: 'Cora', followup_date: addDaysToDateKey(todayKey(), 3) })],
    });
    render(<TodayPage />);

    expect(screen.getByRole('heading', { name: 'This week' })).toBeTruthy();
    expect(screen.getByText('in 3d')).toBeTruthy();
    expect(screen.getByText('Cora')).toBeTruthy();
  });

  it('points to prospecting when nothing is due', () => {
    setCrm({ deals: [] });
    render(<TodayPage />);

    expect(screen.getByRole('heading', { name: 'All clear' })).toBeTruthy();
    expect(screen.getByText(/go find the next prospect/i)).toBeTruthy();
    expect(screen.queryByText(/Good (morning|afternoon|evening), Pat/)).toBeNull();
    expect(screen.getByRole('button', { name: /Go prospecting/ })).toBeTruthy();
    expect(screen.getByText(/No active deals yet/i)).toBeTruthy();
  });

  it('snoozes the hero deal to tomorrow and logs the activity', async () => {
    const logActivity = vi.fn();
    const refresh = vi.fn(async () => {});
    const deal = makeDeal({ id: 'd1', client: 'Acme', followup_date: todayKey() });
    setCrm({ deals: [deal], logActivity, refresh });
    render(<TodayPage />);

    fireEvent.click(screen.getByRole('button', { name: /Snooze to tomorrow/ }));

    const tomorrow = addDaysToDateKey(todayKey(), 1);
    await vi.waitFor(() => {
      expect(crmLib.updateDeal).toHaveBeenCalledWith('d1', { followup_date: tomorrow, nudge_stage: null });
    });
    expect(logActivity).toHaveBeenCalledWith(
      expect.objectContaining({ entity: 'deal', entityId: 'd1', label: 'Snoozed to tomorrow' })
    );
    expect(toast.addToast).toHaveBeenCalledWith(`Snoozed to ${tomorrow}`);
  });
});
