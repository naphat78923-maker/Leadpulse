import type { Company, Contact, Deal } from '@/types/crm';

export type DealCardDueState = 'overdue' | 'today' | null;
export type DealCardTimingTone = 'overdue' | 'today' | 'scheduled' | 'none';

export interface DealCardPresentation {
  contact: {
    name: string;
    role: string | null;
    initials: string;
    additionalCount: number;
    missing: boolean;
  };
  companyName: string;
  companyLogoUrl: string | null;
  product: string;
  nextAction: string;
  timing: {
    label: string;
    date: string | null;
    tone: DealCardTimingTone;
  };
}

function compactDate(date?: string | null): string | null {
  if (!date) return null;
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
  });
}

function contactInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .map(part => part.replace(/[^\p{L}\p{N}]/gu, ''))
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return Array.from(parts[0]).slice(0, 2).join('').toUpperCase();
  return `${Array.from(parts[0])[0]}${Array.from(parts.at(-1)!)[0]}`.toUpperCase();
}

function timingFor(deal: Deal, due: DealCardDueState): DealCardPresentation['timing'] {
  const date = compactDate(deal.followup_date);
  if (due === 'overdue') return { label: 'Overdue', date, tone: 'overdue' };
  if (due === 'today') return { label: 'Due today', date, tone: 'today' };
  if (date) return { label: 'Scheduled', date, tone: 'scheduled' };
  return { label: 'No date', date: null, tone: 'none' };
}

export function buildDealCardPresentation(
  deal: Deal,
  contacts: Contact[],
  companies: Company[],
  due: DealCardDueState
): DealCardPresentation {
  const linkedContacts = (deal.contact_ids || [])
    .map(contactId => contacts.find(contact => contact.id === contactId))
    .filter((contact): contact is Contact => Boolean(contact));
  const primaryContact = linkedContacts[0] ?? null;
  const company =
    (deal.company_id ? companies.find(item => item.id === deal.company_id) : null) ??
    (primaryContact?.company_id ? companies.find(item => item.id === primaryContact.company_id) : null);

  const contactName = primaryContact?.name.trim() || 'Contact not identified';

  return {
    contact: primaryContact
      ? {
          name: contactName,
          role: primaryContact.job_title?.trim() || 'Role unknown',
          initials: contactInitials(contactName),
          additionalCount: Math.max(0, linkedContacts.length - 1),
          missing: false,
        }
      : {
          name: 'Contact not identified',
          role: null,
          initials: '?',
          additionalCount: 0,
          missing: true,
        },
    companyName: company?.name.trim() || deal.client.trim() || 'Customer not identified',
    companyLogoUrl: company?.logo_url?.trim() || null,
    product: deal.product?.trim() || 'Product not set',
    nextAction: deal.next_action?.trim() || 'No next action set',
    timing: timingFor(deal, due),
  };
}
