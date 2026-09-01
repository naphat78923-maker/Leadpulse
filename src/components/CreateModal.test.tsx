import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

import CreateModal from './CreateModal';

describe('CreateModal explicit outbound fields', () => {
  afterEach(cleanup);

  it('saves a primary client ask separately from the CRM next action', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateModal
        isOpen
        type="deal"
        onClose={vi.fn()}
        onSave={onSave}
        companies={[{
          id: 'company-1',
          name: 'GALLOTHAI',
          status: 'prospect',
          lead_source: 'Referral',
          account_owner: 'Pat',
          last_contact_date: null,
          tags: [],
          industry: null,
          size: null,
          address: null,
          website: null,
          notes: null,
          created_at: '2026-08-01T00:00:00Z',
          updated_at: '2026-08-01T00:00:00Z',
        }]}
      />
    );

    expect(document.querySelectorAll('select[name="priority"]')).toHaveLength(1);
    fireEvent.change(document.querySelector('select[name="company_id"]') as HTMLSelectElement, {
      target: { value: 'company-1' },
    });
    fireEvent.change(document.querySelector('input[name="next_action"]') as HTMLInputElement, {
      target: { value: 'Capture feedback and send application notes' },
    });
    fireEvent.change(document.querySelector('input[name="draft_primary_ask"]') as HTMLInputElement, {
      target: { value: "Ask for the team's first feedback from Hin's trial" },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      next_action: 'Capture feedback and send application notes',
      draft_primary_ask: "Ask for the team's first feedback from Hin's trial",
    }));
  });

  it('groups the client ask in an Ebimaru brief and hides a blank brief outside messaging lanes', () => {
    render(<CreateModal isOpen type="deal" onClose={vi.fn()} onSave={vi.fn()} />);

    expect(screen.getByText('EBIMARU DRAFTING BRIEF')).toBeTruthy();
    expect(document.querySelector('input[name="draft_primary_ask"]')).toBeTruthy();

    fireEvent.change(document.querySelector('select[name="workflow_action"]') as HTMLSelectElement, {
      target: { value: 'testing' },
    });

    expect(screen.queryByText('EBIMARU DRAFTING BRIEF')).toBeNull();
    expect(document.querySelector('input[name="draft_primary_ask"]')).toBeNull();
  });

  it('keeps a newly entered client ask accessible after changing to a non-messaging lane', () => {
    render(<CreateModal isOpen type="deal" onClose={vi.fn()} onSave={vi.fn()} />);

    fireEvent.change(document.querySelector('input[name="draft_primary_ask"]') as HTMLInputElement, {
      target: { value: 'Ask for a test date' },
    });
    fireEvent.change(document.querySelector('select[name="workflow_action"]') as HTMLSelectElement, {
      target: { value: 'testing' },
    });

    expect(screen.getByText('EBIMARU DRAFTING BRIEF')).toBeTruthy();
    expect((document.querySelector('input[name="draft_primary_ask"]') as HTMLInputElement).value).toBe('Ask for a test date');
  });

  it('saves explicit contact quality instead of inferring it from the name', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);

    render(
      <CreateModal
        isOpen
        type="contact"
        onClose={vi.fn()}
        onSave={onSave}
      />
    );

    fireEvent.change(document.querySelector('input[name="name"]') as HTMLInputElement, {
      target: { value: 'Head Chef' },
    });
    fireEvent.change(document.querySelector('select[name="identity_quality"]') as HTMLSelectElement, {
      target: { value: 'role_only' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Head Chef',
      identity_quality: 'role_only',
    }));
  });

  it('adapts the contact-name field to the selected identity quality', () => {
    render(<CreateModal isOpen type="contact" onClose={vi.fn()} onSave={vi.fn()} />);

    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    expect(nameInput.parentElement?.querySelector('label')?.textContent).toBe('Name or contact label *');
    expect(nameInput.placeholder).toBe('e.g., John, Head Chef, or company LINE');

    fireEvent.change(document.querySelector('select[name="identity_quality"]') as HTMLSelectElement, {
      target: { value: 'role_only' },
    });

    expect(nameInput.parentElement?.querySelector('label')?.textContent).toBe('Role or contact label *');
    expect(nameInput.placeholder).toBe('e.g., Head Chef, name unknown');
  });

  it('labels the second number as an alternate phone', () => {
    render(<CreateModal isOpen type="contact" onClose={vi.fn()} onSave={vi.fn()} />);

    const alternatePhone = document.querySelector('input[name="phone_second"]') as HTMLInputElement;
    expect(alternatePhone.parentElement?.querySelector('label')?.textContent).toBe('Alternate phone');
  });
});
