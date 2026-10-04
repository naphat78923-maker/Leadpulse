// ─── To contact: Outreach deals with nothing logged yet ───
// Pure. A deal in the Outreach lane with no logged call, email, DM or meeting is a
// prospect on a list, not a conversation, so the Pipeline keeps it off the journey board
// and in its own queue. Logging the first touch moves it onto the board by itself; a deal
// Pat moved past Outreach stays on the board whether or not a touch was logged.

import type { Deal } from '@/types/crm';
import { getWorkflowAction, isOnJourneyBoard } from './deal-workflow';

const CONTACT_TYPES = new Set(['call', 'email', 'dm', 'meeting']);

export function splitToContact(
  deals: Deal[],
  meetings: ReadonlyArray<{ deal_id?: string | null; type: string }>,
): { toContact: Deal[]; inConversation: Deal[] } {
  const contacted = new Set<string>();
  for (const m of meetings) if (m.deal_id && CONTACT_TYPES.has(m.type)) contacted.add(m.deal_id);

  const toContact: Deal[] = [];
  const inConversation: Deal[] = [];
  for (const deal of deals) {
    if (!isOnJourneyBoard(deal)) continue;
    if (getWorkflowAction(deal) === 'outreach' && !contacted.has(deal.id)) toContact.push(deal);
    else inConversation.push(deal);
  }
  // Planned outreach first (oldest date first), then the undated ones by name.
  toContact.sort((a, b) =>
    (a.followup_date ? 0 : 1) - (b.followup_date ? 0 : 1)
    || (a.followup_date ?? '').localeCompare(b.followup_date ?? '')
    || (a.client ?? '').localeCompare(b.client ?? ''));
  return { toContact, inConversation };
}
