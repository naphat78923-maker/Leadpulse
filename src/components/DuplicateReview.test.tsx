import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { Company, Contact } from '@/types/crm';

const crmState = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const toasts = vi.hoisted(() => ({ list: [] as Array<{ message: string; type?: string; action?: { label: string; onClick: () => void } }> }));
const api = vi.hoisted(() => ({
  getDuplicateDismissals: vi.fn(),
  dismissDuplicate: vi.fn(),
  undismissDuplicate: vi.fn(),
  mergeCompanies: vi.fn(),
  updateCompany: vi.fn(),
}));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crmState.value }));
vi.mock('@/components/ToastProvider', () => ({
  useToast: () => ({ addToast: (message: string, type?: string, action?: { label: string; onClick: () => void }) => toasts.list.push({ message, type, action }) }),
}));
vi.mock('@/components/CompanyLogo', () => ({ default: () => null }));
vi.mock('@/lib/crm', () => api);

import DuplicateReview from './DuplicateReview';

const company = (id: string, name: string, extra: Partial<Company> = {}): Company =>
  ({ id, name, status: 'prospect', tags: [], website: null, logo_url: null, created_at: '2026-09-01', ...extra } as unknown as Company);
const person = (id: string, companyId: string): Contact =>
  ({ id, name: id, company_id: companyId, phone: null, phone_second: null, line: null, identity_quality: 'named' } as unknown as Contact);

const veganerie = company('v1', 'Veganerie', { status: 'active_customer' });
const veganerieCo = company('v2', 'Veganerie Corporation Co., Ltd.');
const broccoli = company('b1', 'Broccoli Revolution', { status: 'active_customer' });
const broccoliSukhumvit = company('b2', 'Broccoli Revolution - Sukhumvit Rd');

let logActivity: ReturnType<typeof vi.fn<() => string>>;
let undoActivity: ReturnType<typeof vi.fn<(id: string) => Promise<boolean>>>;
let refresh: ReturnType<typeof vi.fn<() => Promise<void>>>;
let onOpenCompany: ReturnType<typeof vi.fn<(id: string) => void>>;

beforeEach(() => {
  Object.values(api).forEach((mock) => mock.mockReset());
  api.getDuplicateDismissals.mockResolvedValue(new Set());
  api.dismissDuplicate.mockResolvedValue(undefined);
  api.undismissDuplicate.mockResolvedValue(undefined);
  api.mergeCompanies.mockResolvedValue({ merge_id: 'm1', moved: {}, filled: [] });
  api.updateCompany.mockResolvedValue({});
  toasts.list = [];
  logActivity = vi.fn(() => 'activity-1');
  undoActivity = vi.fn<(id: string) => Promise<boolean>>(async () => true);
  refresh = vi.fn(async () => {});
  onOpenCompany = vi.fn<(id: string) => void>();
  crmState.value = {
    deals: [{ company_id: 'v1' }],
    meetings: [],
    accountEvents: Array.from({ length: 35 }, () => ({ company_id: 'v2' })),
    refresh,
    logActivity,
    undoActivity,
  };
});
afterEach(cleanup);

function renderReview(companies = [veganerie, veganerieCo, broccoli, broccoliSukhumvit], contacts: Contact[] = [person('p1', 'v1')]) {
  return render(<DuplicateReview companies={companies} contacts={contacts} onOpenCompany={onOpenCompany} />);
}

describe('DuplicateReview', () => {
  it('lists each possible pair with why it was found, and opens an account', async () => {
    renderReview();
    expect(await screen.findByText('Possible duplicates')).toBeTruthy();
    expect(screen.getAllByText('Same name')).toHaveLength(2);
    expect(screen.getByText('Looks like a branch')).toBeTruthy();
    expect(screen.getByText('Customer · 1 person · 1 deal')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Open Veganerie Corporation Co., Ltd.' }));
    expect(onOpenCompany).toHaveBeenCalledWith('v2');
  });

  it('stays hidden until its table exists, and when there is nothing to review', async () => {
    api.getDuplicateDismissals.mockRejectedValueOnce({ message: 'relation does not exist' });
    const { container } = renderReview();
    await waitFor(() => expect(api.getDuplicateDismissals).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
    cleanup();

    const empty = renderReview([veganerie, broccoli]);
    await waitFor(() => expect(api.getDuplicateDismissals).toHaveBeenCalledTimes(2));
    expect(empty.container.innerHTML).toBe('');
  });

  it('merges into the account Pat keeps, logs it, and offers Undo', async () => {
    renderReview();
    const pair = (await screen.findByRole('button', { name: 'Open Veganerie' })).parentElement!;
    fireEvent.click(within(pair).getByRole('button', { name: 'Merge' }));

    // The customer is kept by default; Pat can pick the other one.
    const keep = screen.getByRole('radiogroup', { name: 'Account to keep' });
    expect(within(keep).getByRole('radio', { name: /^Veganerie Customer/ }).getAttribute('aria-checked')).toBe('true');
    expect(screen.getByText(/Moves to Veganerie: 35 orders\. Veganerie Corporation Co\., Ltd\. is archived/)).toBeTruthy();

    fireEvent.click(within(pair).getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(api.mergeCompanies).toHaveBeenCalledWith('v1', 'v2'));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      type: 'merge', entity: 'company', entityId: 'v1', undoPayload: { merge_id: 'm1' },
    }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const toast = toasts.list.find((t) => t.message === 'Merged into Veganerie')!;
    toast.action!.onClick();
    await waitFor(() => expect(undoActivity).toHaveBeenCalledWith('activity-1'));
  });

  it('keeps the other account when Pat picks it', async () => {
    renderReview();
    const pair = (await screen.findByRole('button', { name: 'Open Veganerie' })).parentElement!;
    fireEvent.click(within(pair).getByRole('button', { name: 'Merge' }));
    fireEvent.click(within(pair).getByRole('radio', { name: /^Veganerie Corporation/ }));
    fireEvent.click(within(pair).getByRole('button', { name: 'Merge' }));
    await waitFor(() => expect(api.mergeCompanies).toHaveBeenCalledWith('v2', 'v1'));
  });

  it('shows why a merge failed and stays open', async () => {
    api.mergeCompanies.mockRejectedValueOnce({ message: 'The account to merge is archived or gone' });
    renderReview();
    const pair = (await screen.findByRole('button', { name: 'Open Veganerie' })).parentElement!;
    fireEvent.click(within(pair).getByRole('button', { name: 'Merge' }));
    fireEvent.click(within(pair).getByRole('button', { name: 'Merge' }));
    expect(await screen.findByText('The account to merge is archived or gone')).toBeTruthy();
    expect(logActivity).not.toHaveBeenCalled();
  });

  it('saves a branch under its main account, with a swap', async () => {
    renderReview();
    const pair = (await screen.findByRole('button', { name: 'Open Broccoli Revolution' })).parentElement!;
    fireEvent.click(within(pair).getByRole('button', { name: 'Branch of' }));
    expect(screen.getByText('is a branch of', { exact: false }).textContent).toBe('Broccoli Revolution - Sukhumvit Rd is a branch of Broccoli Revolution');

    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));
    expect(screen.getByText('is a branch of', { exact: false }).textContent).toBe('Broccoli Revolution is a branch of Broccoli Revolution - Sukhumvit Rd');
    fireEvent.click(screen.getByRole('button', { name: 'Swap' }));

    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(api.updateCompany).toHaveBeenCalledWith('b2', { parent_company_id: 'b1' }));
    expect(logActivity).toHaveBeenCalledWith(expect.objectContaining({
      type: 'edit', entity: 'company', entityId: 'b2', undoPayload: { parent_company_id: null },
    }));
  });

  it('remembers Not a duplicate, and Undo brings the pair back', async () => {
    renderReview();
    const pair = (await screen.findByRole('button', { name: 'Open Veganerie' })).parentElement!;
    fireEvent.click(within(pair).getByRole('button', { name: 'Not a duplicate' }));
    await waitFor(() => expect(api.dismissDuplicate).toHaveBeenCalledWith('v1', 'v2'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Open Veganerie' })).toBeNull());
    expect(screen.getByText('· 1')).toBeTruthy();

    toasts.list.find((t) => t.message === 'This pair won’t be suggested again')!.action!.onClick();
    await waitFor(() => expect(api.undismissDuplicate).toHaveBeenCalledWith('v1', 'v2'));
    expect(await screen.findByRole('button', { name: 'Open Veganerie' })).toBeTruthy();
  });
});
