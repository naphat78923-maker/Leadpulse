import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Company, Contact } from '@/types/crm';

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const query = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
const profile = vi.hoisted(() => ({ waiting: [] as Array<{ company_id: string | null }>, logos: new Map<string, string>() }));
vi.mock('@/lib/crm', () => ({
  getPendingProposals: async () => profile.waiting,
  getLogoProposals: async () => profile.logos,
  getDuplicateDismissals: async () => new Set<string>(),
}));
vi.mock('@/utils/useBusinessDateKey', () => ({ useBusinessDateKey: () => '2026-10-25' }));
vi.mock('next/navigation', () => ({ useSearchParams: () => query.params }));
const modal = vi.hoisted(() => ({ props: {} as Record<string, any> }));
vi.mock('@/components/CreateModal', () => ({ default: (props: Record<string, any>) => { modal.props = props; return null; } }));
vi.mock('@/components/CompanyLogo', () => ({ default: () => null }));
vi.mock('@/components/EntityAvatar', () => ({ default: () => null }));
vi.mock('@/components/CompanyDetail', () => ({
  default: ({ company, companyContacts, onClose, onOpenCompany }: { company: Company; companyContacts: Contact[]; onClose: () => void; onOpenCompany: (id: string) => void }) => (
    <div data-testid="company-detail">
      {company.name} · {companyContacts.length} people
      <button onClick={onClose}>Close account</button>
      <button onClick={() => onOpenCompany('c1')}>Open main account</button>
    </div>
  ),
}));
vi.mock('@/components/ContactDetail', () => ({
  default: ({ contact }: { contact: Contact }) => <div data-testid="contact-detail">{contact.name}</div>,
}));

import AccountsPage from './page';

afterEach(() => {
  cleanup();
  query.params = new URLSearchParams();
  profile.waiting = [];
  profile.logos = new Map();
  window.localStorage.clear();
});

const company = (id: string, name: string, extra: Partial<Company> = {}): Company =>
  ({ id, name, status: 'prospect', tags: [], industry: null, logo_url: null, last_contact_date: null, ...extra } as unknown as Company);
const rowNames = () => screen.getAllByRole('button').map((b) => b.textContent ?? '').filter((t) => /Sunshine|Haoma|Gallo/.test(t));
const contact = (id: string, name: string, companyId: string | null, extra: Partial<Contact> = {}): Contact =>
  ({ id, name, company_id: companyId, email: null, job_title: null, ...extra } as unknown as Contact);

function setCrm() {
  crm.value = {
    companies: [company('c1', 'Sunshine Market'), company('c2', 'Haoma')],
    contacts: [
      contact('p1', 'Nink', 'c1', { job_title: 'Pastry chef' }),
      contact('p2', 'Oil', 'c2'),
      contact('p3', 'Loose Lead', null, { email: 'loose@example.test' }),
    ],
    deals: [],
    loading: false,
    refresh: vi.fn(),
    createCompany: vi.fn(async () => ({ id: 'new-1' })),
    createContact: vi.fn(),
  };
}

describe('Accounts page', () => {
  it('shows how many proposals wait for review', async () => {
    profile.waiting = [{ company_id: 'c1' }, { company_id: 'c1' }, { company_id: null }];
    setCrm();
    render(<AccountsPage />);

    await waitFor(() => expect(screen.getByText('2 to review')).toBeTruthy());
  });

  it('flags a logo found on their site, alone or with other proposals', async () => {
    profile.logos = new Map([['c1', 'https://storage.test/p/c1.webp'], ['c2', 'https://storage.test/p/c2.webp']]);
    profile.waiting = [{ company_id: 'c2' }];
    setCrm();
    render(<AccountsPage />);

    await waitFor(() => expect(screen.getByText('Logo to review')).toBeTruthy());
    expect(screen.getByText('2 to review')).toBeTruthy();
  });

  it('shows what each account makes, its next follow-up or last touch, and its status', () => {
    setCrm();
    crm.value.companies = [
      company('c1', 'Sunshine Market', { industry: 'Supermarket', what_they_make: 'Croissants' }),
      company('c2', 'Haoma', { industry: 'Restaurant', status: 'active_customer', last_contact_date: '2026-10-13' }),
    ];
    crm.value.deals = [{ id: 'd1', title: 'Butter', stage: 'contacted', company_id: 'c1', followup_date: '2026-10-27' }];
    render(<AccountsPage />);

    expect(screen.getByText('Croissants')).toBeTruthy();
    expect(screen.queryByText('Supermarket')).toBeNull();
    expect(screen.getByText('Restaurant')).toBeTruthy();
    expect(screen.getAllByText('Follow up Tue').length).toBeGreaterThan(0);
    expect(screen.getByText('Last touch 12d ago')).toBeTruthy();
    expect(screen.getByText('Customer')).toBeTruthy();
    expect(screen.getByText('Prospect')).toBeTruthy();
  });

  it('keeps tags off the row', () => {
    setCrm();
    crm.value.companies = [company('c1', 'Sunshine Market', { tags: ['CSV-audit-2026-09-14', 'VG Saveur'] })];
    render(<AccountsPage />);
    expect(screen.queryByText(/CSV-audit/)).toBeNull();
  });

  it('sorts by follow-up or last touch and remembers the choice', () => {
    setCrm();
    crm.value.companies = [
      company('c1', 'Sunshine Market', { last_contact_date: '2026-10-01' }),
      company('c2', 'Haoma', { last_contact_date: '2026-10-20' }),
      company('c3', 'Gallo'),
    ];
    crm.value.deals = [{ id: 'd1', title: 'Butter', stage: 'contacted', company_id: 'c3', followup_date: '2026-10-26' }];
    render(<AccountsPage />);
    expect(rowNames().map((t) => t.match(/Sunshine|Haoma|Gallo/)![0])).toEqual(['Gallo', 'Haoma', 'Sunshine']);

    fireEvent.click(screen.getByRole('button', { name: /sort by name/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Follow up' }));
    expect(rowNames().map((t) => t.match(/Sunshine|Haoma|Gallo/)![0])).toEqual(['Gallo', 'Haoma', 'Sunshine']);

    fireEvent.click(screen.getByRole('button', { name: /sort by follow up/i }));
    fireEvent.click(screen.getByRole('menuitemradio', { name: 'Last touch' }));
    expect(rowNames().map((t) => t.match(/Sunshine|Haoma|Gallo/)![0])).toEqual(['Haoma', 'Sunshine', 'Gallo']);
    expect(window.localStorage.getItem('leadpulse.accounts.sort')).toBe('last_touch');
  });

  it('shows possible duplicates above the list, opens one, and steps aside while searching', async () => {
    setCrm();
    crm.value = { ...(crm.value as object), companies: [company('c1', 'Veganerie'), company('c2', 'Veganerie Corporation Co., Ltd.')] };
    render(<AccountsPage />);

    expect(await screen.findByText('Possible duplicates')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Open Veganerie Corporation Co., Ltd.' }));
    expect(screen.getByTestId('company-detail').textContent).toContain('Veganerie Corporation Co., Ltd.');
    // A branch's panel opens its main account in the same place.
    fireEvent.click(screen.getByRole('button', { name: 'Open main account' }));
    expect(screen.getByTestId('company-detail').textContent).toContain('Veganerie · ');

    fireEvent.change(screen.getByPlaceholderText(/search accounts or people/i), { target: { value: 'vegan' } });
    expect(screen.queryByText('Possible duplicates')).toBeNull();
  });

  it('finds an account by one of its people and names the match', () => {
    setCrm();
    render(<AccountsPage />);

    fireEvent.change(screen.getByPlaceholderText(/search accounts or people/i), { target: { value: 'pastry' } });
    expect(screen.getByText('Sunshine Market')).toBeTruthy();
    expect(screen.getByText('Nink')).toBeTruthy();
    expect(screen.queryByText('Haoma')).toBeNull();
  });

  it('keeps people without an account reachable and opens them', () => {
    setCrm();
    render(<AccountsPage />);

    fireEvent.click(screen.getByText('Loose Lead'));
    expect(screen.getByTestId('contact-detail').textContent).toBe('Loose Lead');
  });

  it('opens the account named in ?company= and lets it close', () => {
    query.params = new URLSearchParams('company=c1');
    setCrm();
    render(<AccountsPage />);

    expect(screen.getByTestId('company-detail').textContent).toContain('Sunshine Market · 1 people');
    fireEvent.click(screen.getByText('Close account'));
    expect(screen.queryByTestId('company-detail')).toBeNull();
  });

  it('opens New account with a link shared from the phone', () => {
    query.params = new URLSearchParams({ text: 'Look at this https://www.instagram.com/veganerie/' });
    setCrm();
    render(<AccountsPage />);

    expect(modal.props.isOpen).toBe(true);
    expect(modal.props.initialLink).toBe('https://www.instagram.com/veganerie/');
  });

  it('saves contact details read from a link as a company route, not on the company row', async () => {
    setCrm();
    render(<AccountsPage />);
    expect(modal.props.isOpen).toBe(false);

    await modal.props.onSave({ name: 'Maison Verte', website: 'https://maisonverte.co.th', contact_route: { email: 'hello@maisonverte.co.th', phone: null, line: '@maisonverte' } });

    expect(crm.value.createCompany).toHaveBeenCalledWith({ name: 'Maison Verte', website: 'https://maisonverte.co.th' });
    expect(crm.value.createContact).toHaveBeenCalledWith(expect.objectContaining({
      company_id: 'new-1',
      identity_quality: 'company_route',
      email: 'hello@maisonverte.co.th',
      line: '@maisonverte',
    }));
  });

  it('creates no contact when the link gave no way to reach them', async () => {
    setCrm();
    render(<AccountsPage />);
    await modal.props.onSave({ name: 'Plain Co', contact_route: null });
    expect(crm.value.createContact).not.toHaveBeenCalled();
  });
});
