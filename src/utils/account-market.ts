// ─── Local or Export: is an account in Thailand? ───
// Pure. Pat's own choice (companies.market) always wins. Without one, rules read what the
// account already says about where it is: its name, industry, tags, address, website, and its
// contacts' phones and emails. Anything the rules can't place is "Not sure" for Pat to set with
// one tap; the app never guesses a location.
//
// Laya is not asked. Tested 2026-10-26 on the 103 accounts these rules place (place words
// hidden), "Is this business located in Thailand?" scored no better than chance (AUC 0.41):
// a name and a business type say nothing about the country.

import type { Company, Contact } from '@/types/crm';

export type Market = 'local' | 'export';
export type MarketFilter = 'all' | Market | 'unsure';

export interface MarketCall {
  /** null = Not sure */
  market: Market | null;
  /** 'pat' = Pat's choice; 'rule' = read from the account's own details */
  source: 'pat' | 'rule' | null;
  /** the country an export account is in, when the rules found it */
  country: string | null;
}

export const MARKET_LABELS: Record<Market, string> = { local: 'Local', export: 'Export' };

export type MarketCompany = Pick<Company, 'name' | 'industry' | 'tags' | 'address' | 'website' | 'what_they_make' | 'market'>;
export type MarketContact = Pick<Contact, 'phone' | 'phone_second' | 'email'>;

interface Country {
  name: string;
  words: RegExp;
  tlds: string[];
  /** calling codes, without the + */
  codes: string[];
}

const COUNTRIES: Country[] = [
  { name: 'Vietnam', words: /\b(vietnam|viet nam|ho chi minh|saigon|hanoi)\b/i, tlds: ['vn'], codes: ['84'] },
  { name: 'Philippines', words: /\b(philippines|manila|cebu)\b/i, tlds: ['ph'], codes: ['63'] },
  { name: 'Singapore', words: /\bsingapore\b/i, tlds: ['sg'], codes: ['65'] },
  { name: 'Malaysia', words: /\b(malaysia|kuala lumpur)\b/i, tlds: ['my'], codes: ['60'] },
  { name: 'Hong Kong', words: /\bhong kong\b|\(hk\)/i, tlds: ['hk'], codes: ['852'] },
  { name: 'Indonesia', words: /\b(indonesia|jakarta|bali)\b/i, tlds: ['id'], codes: ['62'] },
  { name: 'Cambodia', words: /\b(cambodia|phnom penh)\b/i, tlds: ['kh'], codes: ['855'] },
  { name: 'Laos', words: /\b(laos|vientiane)\b/i, tlds: ['la'], codes: ['856'] },
  { name: 'Myanmar', words: /\b(myanmar|yangon)\b/i, tlds: ['mm'], codes: ['95'] },
  { name: 'Japan', words: /\b(japan|tokyo|osaka)\b/i, tlds: ['jp'], codes: ['81'] },
  { name: 'South Korea', words: /\b(korea|seoul)\b/i, tlds: ['kr'], codes: ['82'] },
  { name: 'Taiwan', words: /\b(taiwan|taipei)\b/i, tlds: ['tw'], codes: ['886'] },
  { name: 'China', words: /\b(china|shanghai|beijing|shenzhen)\b/i, tlds: ['cn'], codes: ['86'] },
  { name: 'India', words: /\b(india|mumbai|delhi)\b/i, tlds: ['in'], codes: ['91'] },
  { name: 'Australia', words: /\b(australia|sydney|melbourne)\b/i, tlds: ['au'], codes: ['61'] },
  { name: 'UAE', words: /\b(uae|dubai|abu dhabi)\b/i, tlds: ['ae'], codes: ['971'] },
];

const THAI_WORDS =
  /\b(thailand|thai|bangkok|bkk|siam|chiang ?mai|chiang ?rai|phuket|pattaya|hua ?hin|krabi|samui|khon ?kaen|nonthaburi|sukhumvit|silom|thong ?lo|thonglor|ekk?amai)\b/i;
const THAI_SCRIPT = /[฀-๿]/;

/** The host's last label ("shop.example.co.th" → "th"), or null. */
function tld(urlOrDomain: string | null | undefined): string | null {
  const host = /^(?:[a-z]+:\/\/)?([^/?#\s]+)/i.exec((urlOrDomain ?? '').trim())?.[1]?.toLowerCase();
  if (!host || !host.includes('.')) return null;
  return host.split('.').pop() ?? null;
}

/** "+84 90 123 4567", "0084-90…" → "84901234567"; a local number keeps its leading 0. */
function phoneDigits(phone: string): string {
  const compact = phone.replace(/[\s\-().]/g, '');
  if (compact.startsWith('+')) return compact.slice(1);
  if (compact.startsWith('00')) return compact.slice(2);
  return compact;
}

function phoneCountry(phone: string): 'thai' | 'thai_local' | Country | null {
  const raw = phone.trim();
  const international = raw.startsWith('+') || raw.replace(/\s/g, '').startsWith('00');
  const digits = phoneDigits(raw);
  if (!/^\d{8,15}$/.test(digits)) return null;
  if (international) {
    if (digits.startsWith('66')) return 'thai';
    // Longest code first, so +855 is Cambodia and not a stray +85.
    const byLength = COUNTRIES.flatMap((c) => c.codes.map((code) => ({ c, code }))).sort((a, b) => b.code.length - a.code.length);
    return byLength.find(({ code }) => digits.startsWith(code))?.c ?? null;
  }
  // 02-123-4567, 081-234-5678: Thai shape, but Vietnam's local numbers look alike, so this is
  // weak evidence used only when nothing else places the account.
  return /^0\d{8,9}$/.test(digits) ? 'thai_local' : null;
}

/** Where the rules place an account, from its own details only. */
export function marketFromRules(company: MarketCompany, contacts: readonly MarketContact[] = []): MarketCall {
  // An address that names its country settles it: "Jalan Siam, Penang, Malaysia" is abroad
  // even though "Siam" reads Thai.
  const address = company.address ?? '';
  if (!/\bthailand\b/i.test(address) && !THAI_SCRIPT.test(address)) {
    const named = COUNTRIES.filter((c) => !/[^a-z ]/i.test(c.name) && new RegExp(`\\b${c.name}\\b`, 'i').test(address));
    if (named.length === 1) return { market: 'export', source: 'rule', country: named[0].name };
  }

  const tags = company.tags ?? [];
  const text = [company.name, company.industry, company.what_they_make, company.address, company.website, ...tags]
    .filter(Boolean)
    .join(' · ');

  let thai = THAI_SCRIPT.test(text) || THAI_WORDS.test(text);
  let thaiLocalPhone = false;
  const abroad = new Set<string>();

  for (const country of COUNTRIES) if (country.words.test(text)) abroad.add(country.name);
  if (tags.some((tag) => tag.trim().toLowerCase() === 'export')) abroad.add('');

  const siteTld = tld(company.website);
  if (siteTld === 'th') thai = true;
  const siteCountry = COUNTRIES.find((c) => siteTld && c.tlds.includes(siteTld));
  if (siteCountry) abroad.add(siteCountry.name);

  for (const contact of contacts) {
    for (const phone of [contact.phone, contact.phone_second]) {
      if (!phone) continue;
      const found = phoneCountry(phone);
      if (found === 'thai') thai = true;
      else if (found === 'thai_local') thaiLocalPhone = true;
      else if (found) abroad.add(found.name);
    }
    const emailTld = tld(contact.email?.split('@')[1]);
    if (emailTld === 'th') thai = true;
    const emailCountry = COUNTRIES.find((c) => emailTld && c.tlds.includes(emailTld));
    if (emailCountry) abroad.add(emailCountry.name);
  }

  // Evidence both ways (a Thai importer tagged "export", a Bangkok office of a Hong Kong group)
  // is Pat's call, not the rules'.
  if (thai && abroad.size > 0) return { market: null, source: null, country: null };
  if (thai) return { market: 'local', source: 'rule', country: null };
  if (abroad.size > 0) {
    const named = [...abroad].filter(Boolean);
    return { market: 'export', source: 'rule', country: named.length === 1 ? named[0] : null };
  }
  if (thaiLocalPhone) return { market: 'local', source: 'rule', country: null };
  return { market: null, source: null, country: null };
}

/** Pat's choice when there is one, otherwise the rules. */
export function accountMarket(company: MarketCompany, contacts: readonly MarketContact[] = []): MarketCall {
  if (company.market === 'local' || company.market === 'export') {
    const rules = company.market === 'export' ? marketFromRules(company, contacts) : null;
    return { market: company.market, source: 'pat', country: rules?.market === 'export' ? rules.country : null };
  }
  return marketFromRules(company, contacts);
}

export function matchesMarket(call: MarketCall, filter: MarketFilter): boolean {
  if (filter === 'all') return true;
  if (filter === 'unsure') return call.market === null;
  return call.market === filter;
}

/** "Local", "Export · Vietnam", "Export", "Not sure". */
export function marketLabel(call: MarketCall): string {
  if (!call.market) return 'Not sure';
  if (call.market === 'export' && call.country) return `Export · ${call.country}`;
  return MARKET_LABELS[call.market];
}
