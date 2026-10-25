// ─── Possible duplicate accounts: pairs that look like one business entered twice ───
// Pure. The review lives on the Accounts page (components/DuplicateReview.tsx); merging,
// "Branch of" and "Not a duplicate" are saved through lib/crm.ts.
//
// A pair is suggested when two accounts share a name once legal suffixes, text in
// parentheses, " / " aliases and " - branch" endings are set aside, when one name is the
// other plus a few words ("Kemkon" / "Kem-Kon Pahurat"), or when they share a website
// domain, a phone number or a LINE id on any of their contacts.

import type { Company, Contact } from '@/types/crm';
import { hostOf } from './lead-apply';

export type DuplicateReason =
  /** the same name once suffixes and aliases are set aside */
  | { kind: 'name' }
  /** one name is the other plus more words */
  | { kind: 'name_start' }
  | { kind: 'domain'; value: string }
  | { kind: 'phone'; value: string }
  | { kind: 'line'; value: string };

export interface DuplicatePair<C extends DuplicateCompany = DuplicateCompany> {
  /** `${smaller id}:${larger id}`, the same whichever way round the pair is found */
  key: string;
  a: C;
  b: C;
  reasons: DuplicateReason[];
  /** When the pair reads as a branch and its main account, which one is the main account. */
  likelyParentId: string | null;
}

export type DuplicateCompany = Pick<Company, 'id' | 'name' | 'website'> & { parent_company_id?: string | null };
type ChannelContact = Pick<Contact, 'company_id' | 'phone' | 'phone_second' | 'line'>;

export const pairKey = (x: string, y: string) => (x < y ? `${x}:${y}` : `${y}:${x}`);

// Words that only say what kind of legal entity it is. Dropped from either end of a name.
const LEGAL_WORDS = new Set([
  'co', 'company', 'ltd', 'limited', 'corporation', 'corp', 'inc', 'incorporated', 'llc', 'plc', 'pcl',
  'pte', 'sdn', 'bhd', 'gmbh', 'jsc', 'public', 'pt', 'บริษัท', 'จำกัด', 'มหาชน', 'หจก', 'ห้างหุ้นส่วนจำกัด',
]);
// A one-word name this generic is not enough to say another account is its branch.
const GENERIC_WORDS = new Set([
  'vegan', 'thai', 'cafe', 'bakery', 'organic', 'healthy', 'green', 'market', 'gourmet', 'food', 'foods',
  'kitchen', 'restaurant', 'hotel', 'bangkok', 'grocery', 'shop', 'store', 'group',
]);

function words(text: string): string[] {
  const cleaned = text
    // a word broken by a hyphen or apostrophe is still one word: Kem-Kon, April's
    .replace(/(?<=[\p{L}\p{N}])['’\-](?=[\p{L}\p{N}])/gu, '')
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, ' ')
    .trim();
  const list = cleaned ? cleaned.split(' ') : [];
  while (list.length > 1 && LEGAL_WORDS.has(list[list.length - 1])) list.pop();
  while (list.length > 1 && (LEGAL_WORDS.has(list[0]) || list[0] === 'the')) list.shift();
  return list;
}

export interface NameParts {
  /** each name the account goes by ("Annam Gourmet / An Nam Group" has two), normalised */
  names: string[];
  /** the text after " - " on any of them ("Sukhumvit Rd"), when there is one */
  branch: string | null;
}

/** The names an account goes by, normalised for comparison. */
export function nameParts(name: string): NameParts {
  const text = name
    .normalize('NFKC')
    .toLowerCase()
    .replace(/ํา/g, 'ำ')
    .replace(/\([^)]*\)?|\[[^\]]*\]?/g, ' ');
  let branch: string | null = null;
  const names: string[] = [];
  for (const alias of text.split(/\s+\/\s*|\s*\/\s+/)) {
    const [base, ...rest] = alias.split(/\s+[-–—]\s+/);
    if (rest.length && !branch) branch = rest.join(' - ').trim() || null;
    const key = words(base).join(' ');
    if (key.replace(/\s/g, '').length >= 3 && !names.includes(key)) names.push(key);
  }
  return { names, branch };
}

/** The website's domain ("shop.annam-gourmet.com" → "annam-gourmet.com"); a social page keeps its path. */
export function websiteDomain(website: string | null | undefined): string | null {
  const host = hostOf(website);
  if (!host) return null;
  if (host.includes('/')) return host;
  const labels = host.split('.');
  // co.th, com.sg, go.id …: the registered name is one label further in.
  const keep = labels.length >= 3 && /^(co|com|net|org|ac|go|or|in|gov|edu)$/.test(labels[labels.length - 2]) && labels[labels.length - 1].length === 2 ? 3 : 2;
  return labels.slice(-keep).join('.');
}

/** Every phone number in a field ("+66 80 135 0032 / +66 2 658 0932"), as local digits. */
export function phoneNumbers(value: string | null | undefined): string[] {
  const found: string[] = [];
  for (const match of (value ?? '').matchAll(/\+?\d[\d\s().-]{6,}\d/g)) {
    let digits = match[0].replace(/\D/g, '');
    // 66 is Thailand: +66 2 658 0932 (landline) and +66 98 918 8244 (mobile) are 02… and 098…
    if (digits.startsWith('66') && digits.length >= 10) digits = `0${digits.slice(2)}`;
    digits = digits.replace(/^00/, '0');
    if (digits.length >= 9 && !found.includes(digits)) found.push(digits);
  }
  return found;
}

const OTHER_APPS = /\b(instagram|ig|facebook|fb|whatsapp|viber|zalo|wechat|messenger|tiktok)\b/i;

/** LINE ids in a LINE field ("Line OA @baankerd.bkk", "https://lin.ee/JdI3EvO"); other apps' handles are left out. */
export function lineIds(value: string | null | undefined): string[] {
  const found: string[] = [];
  const add = (id: string) => { if (!found.includes(id)) found.push(id); };
  for (const segment of (value ?? '').split(/[;,]|\s+\/\s+/)) {
    const link = /(?:lin\.ee|line\.me)\/([^\s)]+)/i.exec(segment);
    if (link) {
      add(link[1].replace(/^(?:R\/)?(?:ti\/p\/)?/i, '').replace(/\/$/, '').toLowerCase());
      continue;
    }
    if (OTHER_APPS.test(segment)) continue;
    const handle = /@([a-z0-9][a-z0-9._-]{2,})/i.exec(segment);
    if (handle) {
      add(`@${handle[1].toLowerCase()}`);
      continue;
    }
    const bare = segment.trim().replace(/^line(\s+oa)?\s+/i, '');
    if (/^[a-z0-9][a-z0-9._-]{3,}$/i.test(bare) && !/^line@?$/i.test(bare)) add(`@${bare.toLowerCase()}`);
  }
  return found;
}

/** "0989188244" → "098 918 8244", "025752222" → "02 575 2222", "622183788000" → "+622183788000". */
export function formatPhone(digits: string): string {
  if (/^0[689]\d{8}$/.test(digits)) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
  if (/^02\d{7}$/.test(digits)) return `${digits.slice(0, 2)} ${digits.slice(2, 5)} ${digits.slice(5)}`;
  return digits.startsWith('0') ? digits : `+${digits}`;
}

const REASON_ORDER: Record<DuplicateReason['kind'], number> = { name: 0, domain: 1, phone: 2, line: 3, name_start: 4 };

function startsWithWords(longer: string, shorter: string): boolean {
  if (!longer.startsWith(`${shorter} `)) return false;
  if (shorter.replace(/\s/g, '').length < 5) return false;
  return shorter.includes(' ') || !GENERIC_WORDS.has(shorter);
}

/**
 * Pairs of accounts that may be the same business, strongest evidence first. Pairs Pat
 * marked "Not a duplicate", and a branch with its main account or a sibling branch, are
 * left out.
 */
export function findDuplicatePairs<C extends DuplicateCompany>(
  companies: readonly C[],
  contacts: readonly ChannelContact[],
  dismissed: ReadonlySet<string> = new Set(),
): DuplicatePair<C>[] {
  const pairs = new Map<string, DuplicatePair<C>>();
  const byId = new Map(companies.map((c) => [c.id, c]));
  const add = (x: C, y: C, reason: DuplicateReason) => {
    if (x.id === y.id) return;
    const key = pairKey(x.id, y.id);
    if (dismissed.has(key)) return;
    if (x.parent_company_id === y.id || y.parent_company_id === x.id) return;
    if (x.parent_company_id && x.parent_company_id === y.parent_company_id) return;
    const [a, b] = x.id < y.id ? [x, y] : [y, x];
    const pair = pairs.get(key) ?? { key, a, b, reasons: [], likelyParentId: null };
    if (!pair.reasons.some((r) => r.kind === reason.kind && ('value' in r ? r.value : '') === ('value' in reason ? reason.value : ''))) {
      pair.reasons.push(reason);
    }
    pairs.set(key, pair);
  };
  // Accounts grouped by a shared value; every two in one group are a pair.
  const groupPairs = (groups: Map<string, C[]>, reason: (value: string) => DuplicateReason) => {
    for (const [value, list] of groups) {
      for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) add(list[i], list[j], reason(value));
    }
  };
  const push = (groups: Map<string, C[]>, value: string, company: C) => {
    const list = groups.get(value) ?? [];
    if (!list.includes(company)) list.push(company);
    groups.set(value, list);
  };

  const parts = new Map(companies.map((c) => [c.id, nameParts(c.name)]));
  const byName = new Map<string, C[]>();
  const byDomain = new Map<string, C[]>();
  for (const company of companies) {
    for (const name of parts.get(company.id)!.names) push(byName, name, company);
    const domain = websiteDomain(company.website);
    if (domain) push(byDomain, domain, company);
  }
  groupPairs(byName, () => ({ kind: 'name' }));
  groupPairs(byDomain, (value) => ({ kind: 'domain', value }));

  // One name is the other plus words: compare every name against the shorter names it starts with.
  const names = [...byName.keys()].sort();
  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length && names[j].startsWith(names[i]); j++) {
      if (!startsWithWords(names[j], names[i])) continue;
      for (const x of byName.get(names[i])!) for (const y of byName.get(names[j])!) add(x, y, { kind: 'name_start' });
    }
  }

  const byPhone = new Map<string, C[]>();
  const byLine = new Map<string, C[]>();
  for (const contact of contacts) {
    const company = contact.company_id ? byId.get(contact.company_id) : undefined;
    if (!company) continue;
    for (const phone of [...phoneNumbers(contact.phone), ...phoneNumbers(contact.phone_second)]) push(byPhone, phone, company);
    for (const id of lineIds(contact.line)) push(byLine, id, company);
  }
  groupPairs(byPhone, (value) => ({ kind: 'phone', value }));
  groupPairs(byLine, (value) => ({ kind: 'line', value }));

  for (const pair of pairs.values()) {
    if (pair.reasons.some((r) => r.kind === 'name')) pair.reasons = pair.reasons.filter((r) => r.kind !== 'name_start');
    pair.reasons.sort((x, y) => REASON_ORDER[x.kind] - REASON_ORDER[y.kind]);
    pair.likelyParentId = likelyParent(pair, parts.get(pair.a.id)!, parts.get(pair.b.id)!);
  }
  const strength = (pair: DuplicatePair<C>) =>
    pair.reasons.length * 10 - REASON_ORDER[pair.reasons[0].kind] - (pair.likelyParentId ? 5 : 0);
  return [...pairs.values()].sort((x, y) => strength(y) - strength(x) || x.a.name.localeCompare(y.a.name));
}

// "Broccoli Revolution" and "Broccoli Revolution - Sukhumvit Rd": the one without the
// branch ending is the main account. "Kemkon" and "Kemkon Pahurat": the shorter name is.
function likelyParent(pair: DuplicatePair, a: NameParts, b: NameParts): string | null {
  const nameMatch = pair.reasons.some((r) => r.kind === 'name');
  if (nameMatch && Boolean(a.branch) !== Boolean(b.branch)) return a.branch ? pair.b.id : pair.a.id;
  if (!nameMatch && pair.reasons.some((r) => r.kind === 'name_start')) {
    const shortest = (p: NameParts) => Math.min(...p.names.map((n) => n.length));
    return shortest(a) < shortest(b) ? pair.a.id : pair.b.id;
  }
  return null;
}

/** "Name", "Website annam-group.com", "Phone 098 918 8244", "LINE @x": why the pair is shown. */
export function reasonLabel(reason: DuplicateReason): string {
  switch (reason.kind) {
    case 'name': return 'Same name';
    case 'name_start': return 'Similar name';
    case 'domain': return `Website ${reason.value}`;
    case 'phone': return `Phone ${formatPhone(reason.value)}`;
    case 'line': return `LINE ${reason.value}`;
  }
}

// ─── What each account in a pair holds, and what a merge would do ───

export interface AccountHistory {
  people: number;
  /** company routes: a general LINE, info@, front desk */
  channels: number;
  deals: number;
  orders: number;
  /** logged interactions */
  logged: number;
}

const EMPTY_HISTORY: AccountHistory = { people: 0, channels: 0, deals: 0, orders: 0, logged: 0 };

/** Counts per account of what hangs off it. */
export function historyByCompany(
  contacts: readonly Pick<Contact, 'company_id' | 'identity_quality'>[],
  deals: readonly { company_id: string | null }[],
  meetings: readonly { company_id: string | null }[],
  orders: readonly { company_id: string | null }[],
): Map<string, AccountHistory> {
  const map = new Map<string, AccountHistory>();
  const bump = (id: string | null, key: keyof AccountHistory) => {
    if (!id) return;
    const history = map.get(id) ?? { ...EMPTY_HISTORY };
    history[key] += 1;
    map.set(id, history);
  };
  for (const c of contacts) bump(c.company_id, c.identity_quality === 'company_route' ? 'channels' : 'people');
  for (const d of deals) bump(d.company_id, 'deals');
  for (const m of meetings) bump(m.company_id, 'logged');
  for (const o of orders) bump(o.company_id, 'orders');
  return map;
}

export const historyOf = (map: ReadonlyMap<string, AccountHistory>, id: string) => map.get(id) ?? EMPTY_HISTORY;

const count = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "1 person", "1 deal", "8 orders", "6 logged": the parts an account has, people before channels. */
export function historyLabels(h: AccountHistory): string[] {
  return [
    h.people ? count(h.people, 'person', 'people') : h.channels ? count(h.channels, 'channel') : null,
    h.deals ? count(h.deals, 'deal') : null,
    h.orders ? count(h.orders, 'order') : null,
    h.logged ? `${h.logged} logged` : null,
  ].filter((label): label is string => Boolean(label));
}

const historySize = (h: AccountHistory) => h.people + h.channels + h.deals + h.orders + h.logged;
const isCustomer = (c: Pick<Company, 'status'>) => c.status === 'active_customer' || c.status === 'inactive';

/** Which of the pair to keep by default: a customer, then the one with more history, then the older one. */
export function suggestedKeep<C extends Pick<Company, 'id' | 'status' | 'created_at'>>(
  a: C,
  b: C,
  history: ReadonlyMap<string, AccountHistory>,
): C {
  if (isCustomer(a) !== isCustomer(b)) return isCustomer(a) ? a : b;
  const diff = historySize(historyOf(history, a.id)) - historySize(historyOf(history, b.id));
  if (diff !== 0) return diff > 0 ? a : b;
  return a.created_at <= b.created_at ? a : b;
}

const FILLABLE: [keyof Company, string][] = [
  ['website', 'website'], ['address', 'address'], ['industry', 'industry'], ['what_they_make', 'what they make'], ['logo_url', 'logo'],
];
const blank = (value: unknown) => value == null || (typeof value === 'string' && value.trim() === '');

/** One line on what merging `other` into `keep` does, for the Merge step. */
export function mergeSummary(keep: Company, other: Company, otherHistory: AccountHistory): string {
  const moves = historyLabels(otherHistory);
  const fills = FILLABLE.filter(([key]) => blank(keep[key]) && !blank(other[key])).map(([, label]) => label);
  return [
    moves.length ? `Moves to ${keep.name}: ${moves.join(', ')}.` : `Nothing else to move to ${keep.name}.`,
    fills.length ? `Fills ${fills.join(', ')}.` : null,
    `${other.name} is archived and its name kept as an alias.`,
  ].filter(Boolean).join(' ');
}

/** A branch's name as shown on its main account: "Sukhumvit Rd" for "Broccoli Revolution - Sukhumvit Rd". */
export function branchLabel(parent: Pick<Company, 'name'>, branch: Pick<Company, 'name'>): string {
  const main = parent.name.trim().toLowerCase();
  const name = branch.name.trim();
  if (!name.toLowerCase().startsWith(main)) return name;
  const rest = name.slice(main.length).replace(/^[\s,–—-]+/, '').trim();
  return rest || name;
}
