// ─── What an Accounts row says about timing, and how the list sorts ───
// Pure. The next follow-up is the soonest dated follow-up on an open deal (the same date the
// account panel calls the next step). The last touch is the latest logged contact with the
// account or any of its people; internal notes are not contact.

import type { Company, Contact, Deal, Meeting } from '@/types/crm';
import { openDeals } from './account-profile';

export type AccountSort = 'name' | 'follow_up' | 'last_touch';

export const ACCOUNT_SORT_LABELS: Record<AccountSort, string> = {
  name: 'Name',
  follow_up: 'Follow up',
  last_touch: 'Last touch',
};

export const isAccountSort = (value: unknown): value is AccountSort =>
  value === 'name' || value === 'follow_up' || value === 'last_touch';

const DATE_KEY = /^\d{4}-\d{2}-\d{2}/;
const dateKey = (value: string | null | undefined) => DATE_KEY.exec(value ?? '')?.[0] ?? null;
const later = (a: string | null, b: string | null) => (!a ? b : !b ? a : a > b ? a : b);
const dayNumber = (key: string) => Date.parse(`${key}T00:00:00Z`) / 86_400_000;

/** companyId → soonest follow-up date on an open (not closed, not parked) deal. */
export function nextFollowUps(deals: readonly Deal[]): Map<string, string> {
  const byCompany = new Map<string, Deal[]>();
  for (const deal of deals) {
    if (!deal.company_id) continue;
    byCompany.set(deal.company_id, [...(byCompany.get(deal.company_id) ?? []), deal]);
  }
  const result = new Map<string, string>();
  for (const [companyId, companyDeals] of byCompany) {
    const soonest = openDeals(companyDeals).map((d) => dateKey(d.followup_date)).find(Boolean);
    if (soonest) result.set(companyId, soonest);
  }
  return result;
}

/** companyId → latest contact: a logged touch (not an internal note) with the account or one of
 *  its people, or the contact date saved on the account, whichever is later. */
export function lastTouches(
  companies: readonly Pick<Company, 'id' | 'last_contact_date' | 'last_human_touch'>[],
  contacts: readonly Pick<Contact, 'id' | 'company_id'>[],
  meetings: readonly Pick<Meeting, 'date' | 'type' | 'direction' | 'company_id' | 'contact_ids'>[],
): Map<string, string> {
  const companyOfContact = new Map<string, string>();
  for (const contact of contacts) if (contact.company_id) companyOfContact.set(contact.id, contact.company_id);

  const result = new Map<string, string>();
  const note = (companyId: string, date: string | null) => {
    const latest = later(result.get(companyId) ?? null, date);
    if (latest) result.set(companyId, latest);
  };
  for (const company of companies) note(company.id, later(dateKey(company.last_contact_date), dateKey(company.last_human_touch)));
  for (const meeting of meetings) {
    if (meeting.direction === 'internal' || meeting.type === 'note') continue;
    const date = dateKey(meeting.date);
    if (!date) continue;
    const companyIds = new Set<string>();
    if (meeting.company_id) companyIds.add(meeting.company_id);
    for (const id of meeting.contact_ids ?? []) {
      const companyId = companyOfContact.get(id);
      if (companyId) companyIds.add(companyId);
    }
    for (const companyId of companyIds) note(companyId, date);
  }
  return result;
}

export type WhenTone = 'late' | 'today' | 'ahead' | 'past';

export interface WhenLabel {
  /** desktop: "Follow up Tue", "Overdue 46d", "Last touch 3mo ago" */
  text: string;
  /** phone, where the column is narrow: "Today", "3mo ago" */
  short: string;
  tone: WhenTone;
  /** the full date, for a tooltip */
  date: string;
}

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function dayMonth(key: string, today: string): string {
  const [year, month, day] = key.split('-').map(Number);
  const text = `${day} ${MONTH[month - 1]}`;
  return key.slice(0, 4) === today.slice(0, 4) ? text : `${text} ${year}`;
}

/** "12d", "2mo", "1y" — how long ago or how late, kept short for a row. */
function span(days: number): string {
  if (days < 60) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

/** "Follow up today", "Follow up tomorrow", "Follow up Tue" (within a week), "Follow up 31 Oct",
 *  or "Overdue 46d" once the date has passed. */
export function followUpLabel(date: string, today: string): WhenLabel {
  const days = Math.round(dayNumber(date) - dayNumber(today));
  if (days < 0) {
    const text = `Overdue ${span(-days)}`;
    return { text, short: text, tone: 'late', date };
  }
  if (days === 0) return { text: 'Follow up today', short: 'Today', tone: 'today', date };
  if (days === 1) return { text: 'Follow up tomorrow', short: 'Tomorrow', tone: 'ahead', date };
  const when = days < 7 ? WEEKDAY[new Date(`${date}T00:00:00Z`).getUTCDay()] : dayMonth(date, today);
  const text = `Follow up ${when}`;
  return { text, short: text, tone: 'ahead', date };
}

/** "Last touch today", "Last touch 12d ago", "Last touch 3mo ago". */
export function lastTouchLabel(date: string, today: string): WhenLabel {
  const days = Math.max(0, Math.round(dayNumber(today) - dayNumber(date)));
  if (days === 0) return { text: 'Last touch today', short: 'Touched today', tone: 'past', date };
  const ago = `${span(days)} ago`;
  return { text: `Last touch ${ago}`, short: ago, tone: 'past', date };
}

/** The one date a row shows: last touch when sorting by it, otherwise the next follow-up and,
 *  without one, the last touch. Null when the account has neither. */
export function rowWhen(
  sort: AccountSort,
  followUp: string | undefined,
  lastTouch: string | undefined,
  today: string,
): WhenLabel | null {
  if (sort !== 'last_touch' && followUp) return followUpLabel(followUp, today);
  return lastTouch ? lastTouchLabel(lastTouch, today) : null;
}

const byName = (a: Pick<Company, 'name'>, b: Pick<Company, 'name'>) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Name A–Z; soonest follow-up first (overdue on top); or most recent touch first. Accounts
 *  without the date go last, A–Z. */
export function sortAccounts<T extends Pick<Company, 'id' | 'name'>>(
  companies: readonly T[],
  sort: AccountSort,
  followUps: ReadonlyMap<string, string>,
  touches: ReadonlyMap<string, string>,
): T[] {
  const list = companies.slice();
  if (sort === 'name') return list.sort(byName);
  const dates = sort === 'follow_up' ? followUps : touches;
  const direction = sort === 'follow_up' ? 1 : -1;
  return list.sort((a, b) => {
    const da = dates.get(a.id);
    const db = dates.get(b.id);
    if (da && db && da !== db) return da < db ? -direction : direction;
    if (da && !db) return -1;
    if (!da && db) return 1;
    return byName(a, b);
  });
}
