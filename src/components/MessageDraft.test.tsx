import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { Company, Contact, Deal } from '@/types/crm';
import MessageDraft from './MessageDraft';

vi.mock('@/components/ToastProvider', () => ({ useToast: () => ({ addToast: vi.fn() }) }));

afterEach(() => cleanup());

const deal = { id: 'd1', client: 'Crumb House', product: 'Butter', company_id: 'c1', contact_ids: ['p1'], workflow_action: 'outreach', stage: 'research' } as unknown as Deal;
const company = { id: 'c1', name: 'Crumb House', status: 'prospect', industry: 'bakery chain', tags: ['bakery', 'chain'], address: 'Singapore' } as unknown as Company;
const person = { id: 'p1', name: 'Nok Srisuk', company_id: 'c1', email: null, phone: null, identity_quality: 'named' } as unknown as Contact;
const route = { id: 'r1', name: 'Crumb House - public route', company_id: 'c1', email: 'hello@crumb.test', phone: '+65 6000 0000', identity_quality: 'company_route' } as unknown as Contact;

const draftText = () => (screen.getByLabelText('Message draft') as HTMLTextAreaElement).value;
const situation = () => screen.getByLabelText('Situation') as HTMLSelectElement;

describe('MessageDraft', () => {
  it('drafts a first approach to the person, and warns while a blank is left', () => {
    render(<MessageDraft deal={deal} company={company} contacts={[route, person]} onLog={vi.fn()} />);

    expect(screen.getByTestId('message-draft').textContent).toMatch(/Bakery and patisserie:/);
    expect(situation().value).toBe('first_approach');
    expect(draftText().startsWith('Hi Nok, Pat from VG Saveur here.')).toBe(true);
    expect(screen.getByTestId('draft-blanks').textContent).toMatch(/Fill in the \[blanks\]/);

    fireEvent.change(screen.getByLabelText('Their menu item or recipe'), { target: { value: 'croissants' } });
    expect(draftText()).toContain('I saw croissants on your menu.');
    expect(screen.queryByTestId('draft-blanks')).toBeNull();
    // The account's own channels back the Email and Call actions.
    expect(screen.getByRole('link', { name: 'Open an email to hello@crumb.test' }).getAttribute('href')).toMatch(/^mailto:hello@crumb\.test\?subject=/);
    expect(screen.getByRole('link', { name: /^Call/ }).getAttribute('href')).toBe('tel:+6560000000');
  });

  it('starts on the right nudge once messages have gone unanswered', () => {
    const onLog = vi.fn();
    render(<MessageDraft deal={deal} company={company} contacts={[person]} sendCount={3} onLog={onLog} />);

    expect(situation().value).toBe('nudge');
    expect(draftText()).toMatch(/is the team still interested/);
    fireEvent.click(screen.getByRole('button', { name: 'Sent it, log' }));
    expect(onLog).toHaveBeenLastCalledWith('dm', 'Nudge 3 of 4 sent');
  });

  it('starts in Thai for a Thai account', () => {
    render(<MessageDraft deal={deal} company={{ ...company, address: 'Sukhumvit, Bangkok' }} contacts={[person]} onLog={vi.fn()} />);
    expect(screen.getByRole('radio', { name: 'ไทย' }).getAttribute('aria-checked')).toBe('true');
    expect(draftText().startsWith('สวัสดีครับคุณNok')).toBe(true);
  });

  it('keeps an edit until the situation or language changes', () => {
    render(<MessageDraft deal={deal} company={company} contacts={[person]} onLog={vi.fn()} />);

    fireEvent.change(screen.getByLabelText('Message draft'), { target: { value: 'My own words' } });
    expect(draftText()).toBe('My own words');
    fireEvent.click(screen.getByRole('radio', { name: 'ไทย' }));
    expect(draftText().startsWith('สวัสดีครับคุณNok')).toBe(true);
    fireEvent.change(situation(), { target: { value: 'paid_trial' } });
    expect(draftText()).toMatch(/ออเดอร์ทดลอง \[ขนาด\] ราคา \[ราคา\]/);
    expect(screen.queryByLabelText('Their menu item or recipe')).toBeNull();
  });

  it('logs as an email when there is an address, otherwise as a DM', () => {
    const onLog = vi.fn();
    const { unmount } = render(<MessageDraft deal={deal} company={company} contacts={[route, person]} onLog={onLog} />);
    fireEvent.click(screen.getByRole('button', { name: 'Sent it, log' }));
    expect(onLog).toHaveBeenLastCalledWith('email', 'First approach message sent');
    unmount();

    render(<MessageDraft deal={deal} company={company} contacts={[person]} onLog={onLog} />);
    expect(screen.queryByRole('link', { name: /email/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Sent it, log' }));
    expect(onLog).toHaveBeenLastCalledWith('dm', 'First approach message sent');
  });
});
