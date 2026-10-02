// ─── When each deal was last in contact ───
// Pure. "Contact" is any logged touch with the buyer in either direction — an internal
// note is not contact. Backs the board's "Quietest" sort and the card's quiet note.

import type { DatedChaseCountableMeeting } from './interaction-event';
import { daysBetween } from './retentionCadence';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}/;

/** dealId -> date key of its latest non-internal interaction; a deal no contact logged is absent. */
export function lastContactDates(meetings: DatedChaseCountableMeeting[]): Map<string, string> {
  const latest = new Map<string, string>();
  for (const meeting of meetings) {
    if (!meeting.deal_id || meeting.direction === 'internal') continue;
    const date = DATE_KEY.exec(meeting.date ?? '')?.[0];
    if (!date) continue;
    const known = latest.get(meeting.deal_id);
    if (!known || date > known) latest.set(meeting.deal_id, date);
  }
  return latest;
}

/** "no contact logged", "contacted today", "quiet 1 day", "quiet 12 days". */
export function quietLabel(lastContact: string | undefined, today: string): string {
  if (!lastContact) return 'no contact logged';
  const days = Math.max(0, daysBetween(lastContact, today));
  return days === 0 ? 'contacted today' : `quiet ${days} day${days === 1 ? '' : 's'}`;
}
