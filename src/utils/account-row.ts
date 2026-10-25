// ─── What an Accounts row says about timing, and how the list sorts ───
// Pure. The next follow-up is the soonest dated follow-up on an open deal (the same date the
// account panel calls the next step). The last touch is the latest logged contact with the
// account or any of its people; internal notes are not contact.

import type { Company, Contact, Deal, Meeting } from '@/types/crm';
import { openDeals } from './account-profile';

export type AccountSort =
  | 'follow_up'
  | 'last_touch'
  | 'gone_quiet'
  | 'sales_90d'
  | 'laya_fit'
  | 'stage'
  | 'newest'
  | 'name'
  | 'status';

/** The sort menu, in its groups. 'last_touch' keeps its saved key; it reads "Recently touched". */
export const ACCOUNT_SORT_GROUPS: { label: string; sorts: AccountSort[] }[] = [
  { label: 'Timing', sorts: ['follow_up', 'last_touch', 'gone_quiet'] },
  { label: 'Worth', sorts: ['sales_90d', 'laya_fit', 'stage'] },
  { label: 'Other', sorts: ['newest', 'name', 'status'] },
];

export const ACCOUNT_SORT_LABELS: Record<AccountSort, string> = {
  follow_up: 'Follow up soonest',
  last_touch: 'Recently touched',
  gone_quiet: 'Gone quiet',
  sales_90d: 'Sales, last 90 days',
  laya_fit: 'Best Laya fit',
  stage: 'Deal stage, furthest',
  newest: 'Newest added',
  name: 'Name A to Z',
  status: 'By status',
};

const SORTS = new Set<string>(Object.keys(ACCOUNT_SORT_LABELS));
export const isAccountSort = (value: unknown): value is AccountSort => typeof value === 'string' && SORTS.has(value);

/** How far an open deal has got, for "Deal stage, furthest". Outreach is the start. */
export const LANE_RANK: Record<string, number> = { outreach: 1, reschedule: 2, reply: 3, sample: 4, testing: 5 };

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

/** The one date a row shows: last touch when sorting by it (or by gone quiet), otherwise the
 *  next follow-up and, without one, the last touch. Null when the account has neither. */
export function rowWhen(
  sort: AccountSort,
  followUp: string | undefined,
  lastTouch: string | undefined,
  today: string,
): WhenLabel | null {
  if (sort !== 'last_touch' && sort !== 'gone_quiet' && followUp) return followUpLabel(followUp, today);
  return lastTouch ? lastTouchLabel(lastTouch, today) : null;
}

/** companyId → the furthest lane among its open deals (LANE_RANK); accounts with none are absent. */
export function furthestStages(deals: readonly Pick<Deal, 'company_id' | 'stage' | 'workflow_action'>[]): Map<string, number> {
  const result = new Map<string, number>();
  for (const deal of deals) {
    if (!deal.company_id || deal.stage === 'closed_won' || deal.stage === 'closed_lost') continue;
    const rank = LANE_RANK[deal.workflow_action ?? ''] ?? 0;
    if (rank > (result.get(deal.company_id) ?? 0)) result.set(deal.company_id, rank);
  }
  return result;
}

/** Number-valued sorts: companyId → value, higher first. */
export interface AccountSortValues {
  /** invoiced sales in the last 90 days, baht */
  sales?: ReadonlyMap<string, number>;
  /** Laya's best fit Noul for accounts it judged a fit */
  fits?: ReadonlyMap<string, number>;
  /** furthestStages() */
  stages?: ReadonlyMap<string, number>;
}

const byName = (a: Pick<Company, 'name'>, b: Pick<Company, 'name'>) =>
  a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });

/** Order by a date or a number; accounts without one go last, A–Z. */
function byValue<T extends Pick<Company, 'id' | 'name'>, V extends string | number>(
  list: T[],
  values: ReadonlyMap<string, V> | undefined,
  direction: 1 | -1,
): T[] {
  return list.sort((a, b) => {
    const va = values?.get(a.id);
    const vb = values?.get(b.id);
    if (va !== undefined && vb !== undefined && va !== vb) return va < vb ? -direction : direction;
    if (va !== undefined && vb === undefined) return -1;
    if (va === undefined && vb !== undefined) return 1;
    return byName(a, b);
  });
}

/** Sort the Accounts list. Follow up: soonest first, overdue on top. Recently touched: newest
 *  touch first; gone quiet: oldest touch first. Sales, fit and stage: highest first. Newest:
 *  latest added first. By status is A–Z here; the page groups it. Accounts without the value go
 *  last, A–Z. */
export function sortAccounts<T extends Pick<Company, 'id' | 'name'> & Partial<Pick<Company, 'created_at'>>>(
  companies: readonly T[],
  sort: AccountSort,
  followUps: ReadonlyMap<string, string>,
  touches: ReadonlyMap<string, string>,
  values: AccountSortValues = {},
): T[] {
  const list = companies.slice();
  switch (sort) {
    case 'follow_up': return byValue(list, followUps, 1);
    case 'last_touch': return byValue(list, touches, -1);
    case 'gone_quiet': return byValue(list, touches, 1);
    case 'sales_90d': return byValue(list, values.sales, -1);
    case 'laya_fit': return byValue(list, values.fits, -1);
    case 'stage': return byValue(list, values.stages, -1);
    case 'newest': {
      const added = new Map(list.filter((c) => c.created_at).map((c) => [c.id, c.created_at as string]));
      return byValue(list, added, -1);
    }
    default: return list.sort(byName);
  }
}
