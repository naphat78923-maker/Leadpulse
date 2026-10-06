import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Company, Contact } from '@/types/crm';

const crm = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const query = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('@/components/CrmProvider', () => ({ useCrm: () => crm.value }));
vi.mock('next/navigation', () => ({ useSearchParams: () => query.params }));
const modal = vi.hoisted(() => ({ props: {} as Record<string, any> }));
vi.mock('@/components/CreateModal', () => ({ default: (props: Record<string, any>) => { modal.props = props; return null; } }));
vi.mock('@/components/CompanyLogo', () => ({ default: () => null }));
vi.mock('@/components/EntityAvatar', () => ({ default: () => null }));
vi.mock('@/components/LayaLeadTierBadge', () => ({ default: () => null }));
vi.mock('@/components/CompanyDetail', () => ({
  default: ({ company, companyContacts, onClose }: { company: Company; companyContacts: Contact[]; onClose: () => void }) => (
    <div data-testid="company-detail">
      {company.name} · {companyContacts.length} people
      <button onClick={onClose}>Close account</button>
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
});

const company = (id: string, name: string): Company =>
  ({ id, name, status: 'prospect', tags: [], industry: null, logo_url: null } as unknown as Company);
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
