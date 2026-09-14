import type { Company, Contact, Deal } from '@/types/crm';
import { entityInitials } from '@/utils/entity-avatar';
import { getWorkflowAction } from '@/utils/deal-workflow';

export type DealCardDueState = 'overdue' | 'today' | null;
export type DealCardTimingTone = 'overdue' | 'today' | 'scheduled' | 'none';

const PASSIVE_NEXT_ACTION = /^(awaiting|waiting|pending)\b/i;

/**
 * A next action the user can act on. A blank field and a passive state ("Awaiting their reply")
 * both mean the same thing to the card: there is nothing concrete to do, so offer to set one
 * instead of printing a dash.
 */
export function isConcreteNextAction(value?: string | null): boolean {
  const trimmed = value?.trim() || '';
  return !!trimmed && !PASSIVE_NEXT_ACTION.test(trimmed);
}

export type DealCardPrimaryActionId = 'log-outreach' | 'record-reply' | 'log-followup' | 'set-next-action';

export interface DealCardPrimaryAction {
  id: DealCardPrimaryActionId;
  label: string;
  hint: string;
  /** True when the action opens the log form. It never sends anything by itself. */
  opensLogForm: boolean;
}

export const NO_NEXT_ACTION_LABEL = 'Set next action';

/** One contextual primary action per card, derived from the lane. Never an automatic send. */
export function primaryCardAction(deal: Deal): DealCardPrimaryAction {
  const setAction: DealCardPrimaryAction = {
    id: 'set-next-action',
    label: NO_NEXT_ACTION_LABEL,
    hint: 'Opens the deal so you can set one concrete next action.',
    opensLogForm: false,
  };

  if (!isConcreteNextAction(deal.next_action)) return setAction;

  switch (getWorkflowAction(deal)) {
    case 'outreach':
      return {
        id: 'log-outreach',
        label: 'Log outreach',
        hint: 'Opens the log form — nothing is sent from this button.',
        opensLogForm: true,
      };
    case 'reply':
      return {
        id: 'record-reply',
        label: 'Record reply',
        hint: 'Opens the log form so you can record what they said.',
        opensLogForm: true,
      };
    case 'sample':
    case 'testing':
    case 'reschedule':
      return {
        id: 'log-followup',
        label: 'Log follow-up',
        hint: 'Opens the log form for the next follow-up.',
        opensLogForm: true,
      };
    default:
      return setAction;
  }
}

/** The nudge badge without its implementation code — the code stays in the tooltip. */
export function nudgeChipLabel(nudge: string | null): string | null {
  if (!nudge) return null;
  return nudge.replace(/\s*NG-\d{3}\s*/, ' ').replace(/\s+/g, ' ').trim();
}

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
          initials: entityInitials(contactName),
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
