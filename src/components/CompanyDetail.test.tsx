import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Company } from '@/types/crm';

const provider = vi.hoisted(() => ({ deals: [] as unknown[], meetings: [] as unknown[], companies: [] as unknown[] }));
const crmMocks = vi.hoisted(() => ({
  updateCompany: vi.fn(async (_id: string, payload: Record<string, unknown>) => ({ ...payload })),
  getCompanyFit: vi.fn(async () => null),
  getCompanyEvidence: vi.fn(async () => []),
  getPendingProposals: vi.fn(async () => []),
  getLogoProposals: vi.fn(async () => new Map<string, string>()),
  findLogoOnSite: vi.fn(async (): Promise<string | null> => 'https://storage.test/logos/proposed/c1.webp'),
  acceptLogoProposal: vi.fn(async () => 'https://storage.test/logos/c1.webp?v=1'),
  rejectLogoProposal: vi.fn(async () => undefined),
  uploadCompanyLogo: vi.fn(async () => 'https://storage.test/logos/c1.webp?v=2'),
}));
vi.mock('@/lib/image', () => ({
  validateLogoFile: (file: File) => (file.type.startsWith('image/') ? null : 'Please choose an image file.'),
  resizeImageToSquare: async (file: File) => file,
}));
vi.mock('@/lib/crm', () => crmMocks);
vi.mock('@/components/CrmProvider', () => ({
  useCrm: () => ({
    createContact: vi.fn(), refresh: vi.fn(), deleteEntity: vi.fn(async () => undefined), addMeeting: vi.fn(),
    meetings: provider.meetings, deals: provider.deals, companies: provider.companies, accountEvents: [], accountEventsUnavailable: false,
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
  crmMocks.getLogoProposals.mockResolvedValue(new Map());
  crmMocks.acceptLogoProposal.mockClear();
  crmMocks.rejectLogoProposal.mockClear();
  crmMocks.uploadCompanyLogo.mockClear();
  crmMocks.findLogoOnSite.mockClear();
  provider.deals = [];
  provider.meetings = [];
  provider.companies = [];
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

  it('shows the main account of a branch, and the branches of a main account, each opening in place', () => {
    const main = company({ id: 'b1', name: 'Broccoli Revolution' });
    const branch = company({ id: 'b2', name: 'Broccoli Revolution - Sukhumvit Rd', parent_company_id: 'b1' });
    provider.companies = [main, branch];
    const onOpenCompany = vi.fn();
    const view = render(<CompanyDetail company={branch} onClose={vi.fn()} onSaved={vi.fn()} contacts={[]} companyContacts={[]} onOpenCompany={onOpenCompany} />);
    fireEvent.click(screen.getByRole('button', { name: 'Branch of Broccoli Revolution' }));
    expect(onOpenCompany).toHaveBeenCalledWith('b1');

    view.rerender(<CompanyDetail company={main} onClose={vi.fn()} onSaved={vi.fn()} contacts={[]} companyContacts={[]} onOpenCompany={onOpenCompany} />);
    expect(screen.getByText('1 branch:')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sukhumvit Rd' }));
    expect(onOpenCompany).toHaveBeenCalledWith('b2');
    expect(screen.queryByText(/Branch of/)).toBeNull();
  });

  it('archives from the ⋯ menu and confirms right under the header, not at the bottom', () => {
    render(panel(company()));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Archive company' }));
    const confirm = screen.getByText('Archive this company?');
    const details = screen.getByRole('button', { name: 'Details' });
    expect(confirm.compareDocumentPosition(details) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('leads with the next follow-up and lists open deals with a link to each', () => {
    provider.deals = [
      { id: 'd1', company_id: 'c1', title: 'Butter', stage: 'contacted', followup_date: '2026-10-23', next_action: 'Send price list', contact_ids: [] },
      { id: 'd2', company_id: 'c1', title: 'Old order', stage: 'closed_won', followup_date: null, next_action: null, contact_ids: [] },
      { id: 'd3', company_id: 'other', title: 'Not this account', stage: 'contacted', followup_date: '2026-10-22', next_action: null, contact_ids: [] },
    ];
    render(panel(company()));
    expect(screen.getByText('Butter · Send price list')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Butter/ });
    expect(link.getAttribute('href')).toBe('/deals?deal=d1');
    expect(screen.getByText('1 open · 1 closed or parked')).toBeTruthy();
    expect(screen.queryByText('Not this account')).toBeNull();
  });

  it('folds details, leaves empty fields out and hides the route-update lines in notes', () => {
    render(panel(company({ website: 'https://www.gateauxhouse.co.th/', notes: 'Likes the 500g pack.\n\n[ROUTE UPDATE 2026-10-15]\nOfficial website links the LINE OA.' })));
    expect(screen.queryByText('Likes the 500g pack.')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Details' }));
    expect(screen.getByText('Likes the 500g pack.')).toBeTruthy();
    expect(screen.queryByText(/ROUTE UPDATE/)).toBeNull();
    expect(screen.queryByText('What they make')).toBeNull();
    expect(screen.queryByText('—')).toBeNull();
  });

  it('shows roles on people, suggests the founder as the one who decides, and saves a role', async () => {
    const people = [
      { id: 'k1', name: 'Janista', company_id: 'c1', identity_quality: 'named', job_title: 'Founder' },
      { id: 'k2', name: 'Ploy', company_id: 'c1', identity_quality: 'named', job_title: 'Pastry chef' },
    ] as never[];
    render(<CompanyDetail company={company({ champion_contact_id: 'k2' })} onClose={vi.fn()} onSaved={vi.fn()} contacts={[]} companyContacts={people} />);
    expect(screen.getByText('Champion')).toBeTruthy();
    expect(screen.queryByText(/Who must say yes/)).toBeNull();
    expect(screen.getByText('Janista is the Founder. Set as the one who decides?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));
    await waitFor(() => expect(crmMocks.updateCompany).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateCompany.mock.calls[0][1]).toMatchObject({ decision_maker_contact_id: 'k1', map_status: 'complete' });
  });

  it('sets a role from the ⋯ on a person', async () => {
    const people = [{ id: 'k2', name: 'Ploy', company_id: 'c1', identity_quality: 'named', job_title: 'Pastry chef' }] as never[];
    render(<CompanyDetail company={company()} onClose={vi.fn()} onSaved={vi.fn()} contacts={[]} companyContacts={people} />);
    fireEvent.click(screen.getByRole('button', { name: 'Set role for Ploy' }));
    fireEvent.click(screen.getByRole('button', { name: 'Blocker' }));
    await waitFor(() => expect(crmMocks.updateCompany).toHaveBeenCalledTimes(1));
    expect(crmMocks.updateCompany.mock.calls[0][1]).toMatchObject({ blocker_contact_id: 'k2', blocker_label: null });
  });

  it('shows sales and rewards for customers only', () => {
    render(panel(company()));
    expect(screen.queryByText('Sales')).toBeNull();
    cleanup();
    render(panel(company({ status: 'active_customer' })));
    expect(screen.getByText('Sales')).toBeTruthy();
    expect(screen.queryByText(/Rewards given/)).toBeNull();
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

  it('offers a logo found on their site and uses it on Use logo', async () => {
    crmMocks.getLogoProposals.mockResolvedValue(new Map([['c1', 'https://storage.test/logos/proposed/c1.webp?v=1']]));
    render(panel(company({ website: 'https://www.alicebakery.co.th/' })));
    await waitFor(() => expect(screen.getByText('alicebakery.co.th · their own site')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Use logo' }));
    await waitFor(() => expect(crmMocks.acceptLogoProposal).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Use logo' })).toBeNull());
  });

  it('puts a found logo aside on Not theirs', async () => {
    crmMocks.getLogoProposals.mockResolvedValue(new Map([['c1', 'https://storage.test/logos/proposed/c1.webp?v=1']]));
    render(panel(company({ website: 'alicebakery.co.th' })));
    fireEvent.click(await screen.findByRole('button', { name: 'Not theirs' }));
    await waitFor(() => expect(crmMocks.rejectLogoProposal).toHaveBeenCalledWith('c1'));
    expect(crmMocks.acceptLogoProposal).not.toHaveBeenCalled();
  });

  it('hides a found logo once the account has a logo', async () => {
    crmMocks.getLogoProposals.mockResolvedValue(new Map([['c1', 'https://storage.test/logos/proposed/c1.webp?v=1']]));
    render(panel(company({ website: 'alicebakery.co.th', logo_url: 'https://storage.test/logos/c1.webp' })));
    await waitFor(() => expect(crmMocks.getLogoProposals).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Use logo' })).toBeNull();
  });

  it('looks for a logo on their site from the ⋯ menu, only when there is a website and no logo', async () => {
    const view = render(panel(company()));
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.queryByRole('menuitem', { name: /find logo/i })).toBeNull();

    view.rerender(panel(company({ website: 'https://alicebakery.co.th' })));
    await waitFor(() => expect(crmMocks.getLogoProposals).toHaveBeenCalled());
    await act(async () => {});
    fireEvent.click(screen.getByRole('menuitem', { name: /find logo on their site/i }));
    await waitFor(() => expect(crmMocks.findLogoOnSite).toHaveBeenCalledWith('c1'));
    expect(await screen.findByRole('button', { name: 'Use logo' })).toBeTruthy();
  });

  it('saves an image pasted while the panel is open, but not one pasted into a field', async () => {
    render(panel(company()));
    const image = new File(['x'], 'logo.png', { type: 'image/png' });
    const paste = (target: EventTarget) => {
      const event = new Event('paste', { bubbles: true, cancelable: true }) as Event & { clipboardData: unknown };
      event.clipboardData = { files: [image] };
      target.dispatchEvent(event);
    };
    fireEvent.click(screen.getByRole('button', { name: 'Edit company' }));
    paste(screen.getByLabelText('Account name'));
    expect(crmMocks.uploadCompanyLogo).not.toHaveBeenCalled();

    paste(document.body);
    await waitFor(() => expect(crmMocks.uploadCompanyLogo).toHaveBeenCalledWith('c1', image));
    expect(crmMocks.updateCompany).toHaveBeenCalledWith('c1', { logo_url: 'https://storage.test/logos/c1.webp?v=2' });
  });

  it('saves an image dropped on the panel and outlines the logo while dragging', async () => {
    render(panel(company()));
    const image = new File(['x'], 'logo.png', { type: 'image/png' });
    const header = screen.getByText('Gateaux House');
    fireEvent.dragEnter(header, { dataTransfer: { types: ['Files'], files: [image] } });
    expect(screen.getByText(/^Drop\s*logo$/)).toBeTruthy();
    fireEvent.drop(header, { dataTransfer: { types: ['Files'], files: [image] } });
    await waitFor(() => expect(crmMocks.uploadCompanyLogo).toHaveBeenCalledWith('c1', image));
  });
});
