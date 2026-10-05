import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Company, Contact, Deal } from '@/types/crm';
import MessageDraft from './MessageDraft';

afterEach(() => cleanup());

const deal = { id: 'd1', client: 'Crumb House', product: 'Butter', company_id: 'c1', contact_ids: ['p1'], workflow_action: 'outreach', stage: 'research' } as unknown as Deal;
const company = { id: 'c1', name: 'Crumb House', status: 'prospect', industry: 'bakery chain', tags: ['bakery', 'chain'] } as unknown as Company;
const person = { id: 'p1', name: 'Nok Srisuk', company_id: 'c1', email: null, phone: null, identity_quality: 'named' } as unknown as Contact;
const route = { id: 'r1', name: 'Crumb House - public route', company_id: 'c1', email: 'hello@crumb.test', phone: '+66 2 000 0000', identity_quality: 'company_route' } as unknown as Contact;

const draftText = () => (screen.getByLabelText('Message draft') as HTMLTextAreaElement).value;

describe('MessageDraft', () => {
  it('drafts a first outreach for the account segment and greets the person, not the route', () => {
    render(<MessageDraft deal={deal} company={company} contacts={[route, person]} onLog={vi.fn()} />);

    expect(screen.getByTestId('message-draft').textContent).toMatch(/Bakery and patisserie:/);
    expect(draftText().startsWith('Hi Nok,')).toBe(true);
    expect(draftText()).toMatch(/laminates and tastes like dairy/);
    // The account's own channels back the Email and Call actions.
    expect(screen.getByRole('link', { name: 'Open an email to hello@crumb.test' }).getAttribute('href')).toMatch(/^mailto:hello@crumb\.test\?subject=/);
    expect(screen.getByRole('link', { name: /^Call/ }).getAttribute('href')).toBe('tel:+6620000000');
  });

  it('keeps an edit until the template or language changes', () => {
    render(<MessageDraft deal={deal} company={company} contacts={[person]} onLog={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Message draft'), { target: { value: 'My own words' } });
    expect(draftText()).toBe('My own words');
    fireEvent.click(screen.getByRole('radio', { name: 'ไทย' }));
    expect(draftText().startsWith('สวัสดีครับคุณNok')).toBe(true);
    fireEvent.click(screen.getByRole('radio', { name: 'Sample follow-up' }));
    expect(draftText()).toMatch(/ตัวอย่าง/);
  });

  it('logs as an email when there is an address, otherwise as a DM', () => {
    const onLog = vi.fn();
    const { unmount } = render(<MessageDraft deal={deal} company={company} contacts={[route, person]} onLog={onLog} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sent it, log' }));
    expect(onLog).toHaveBeenLastCalledWith('email', 'First outreach message sent');
    unmount();

    render(<MessageDraft deal={deal} company={company} contacts={[person]} onLog={onLog} />);
    expect(screen.queryByRole('link', { name: /email/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sent it, log' }));
    expect(onLog).toHaveBeenLastCalledWith('dm', 'First outreach message sent');
  });
});
