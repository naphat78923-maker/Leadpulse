import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Company } from '@/types/crm';

const crmMocks = vi.hoisted(() => ({
  updateCompany: vi.fn(async (_id: string, payload: Record<string, unknown>) => ({ ...payload })),
  getCompanyFit: vi.fn(async () => null),
  getCompanyEvidence: vi.fn(async () => []),
  getPendingProposals: vi.fn(async () => []),
}));
vi.mock('@/lib/crm', () => crmMocks);
vi.mock('@/components/CrmProvider', () => ({
  useCrm: () => ({
    createContact: vi.fn(), refresh: vi.fn(), deleteEntity: vi.fn(async () => undefined), addMeeting: vi.fn(),
    meetings: [], deals: [], companies: [], accountEvents: [], accountEventsUnavailable: false,
  }),
}));
vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));
vi.mock('@/components/WebsiteFill', () => ({ default: () => null }));
vi.mock('@/components/StakeholderMiniMap', () => ({ default: () => null }));
vi.mock('@/components/LayaBuyerSignalsSection', () => ({ default: () => null }));
vi.mock('@/components/ContactDetail', () => ({ default: () => null }));
vi.mock('@/components/InteractionThread', () => ({ default: () => null }));
vi.mock('@/components/LogInteractionModal', () => ({ default: () => null }));
vi.mock('@/components/CompanyLogo', () => ({ default: () => <span data-testid="logo" /> }));

import CompanyDetail from './CompanyDetail';

afterEach(() => {
  cleanup();
  crmMocks.updateCompany.mockClear();
});

const company = (over: Partial<Company> = {}): Company => ({
  id: 'c1', name: 'Gateaux House', status: 'prospect', lead_source: '', account_owner: 'Pat', last_contact_date: null,
  tags: ['bakery'], industry: 'Bakery', size: null, address: null, website: null, what_they_make: null, notes: null,
  created_at: '2026-01-01', updated_at: '2026-01-01', ...over,
} as Company);

const panel = (c: Company) => <CompanyDetail company={c} onClose={vi.fn()} onSaved={vi.fn()} contacts={[]} companyContacts={[]} />;

describe('CompanyDetail', () => {
  it('edits the account as it is now, so a value saved after opening is not wiped', async () => {
    const view = render(panel(company()));
    // A proposal's Save (or Fill from website) lands while the panel is open.
    view.rerender(panel(company({ website: 'https://www.gateauxhouse.co.th/', address: '51/2 Soi Wat Sai' })));
    fireEvent.click(screen.getByRole('button', { name: 'Edit company' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save company' }));
    await waitFor(() => expect(crmMocks.updateCompany).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateCompany.mock.calls[0][1]).toMatchObject({ website: 'https://www.gateauxhouse.co.th/', address: '51/2 Soi Wat Sai' });
  });

  it('asks to confirm archiving right under the header, not at the bottom', () => {
    render(panel(company()));
    fireEvent.click(screen.getByRole('button', { name: 'Archive company' }));
    const confirm = screen.getByText('Archive this company?');
    const logo = screen.getByTestId('logo');
    expect(confirm.compareDocumentPosition(logo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('discards edits only on an explicit Cancel', () => {
    render(panel(company()));
    fireEvent.click(screen.getByRole('button', { name: 'Edit company' }));
    const name = screen.getByDisplayValue('Gateaux House');
    fireEvent.change(name, { target: { value: 'Gateaux Hoose' } });
    expect(screen.queryByRole('button', { name: 'Edit company' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(crmMocks.updateCompany).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Edit company' }));
    expect(screen.getByDisplayValue('Gateaux House')).toBeTruthy();
  });
});
