// Turns what a page said about a business (page-extract.ts) into account fields:
// a prefilled new-account form, or the details an existing account still lacks.

import type { Company, Contact } from '@/types/crm';
import type { PageLead } from './page-extract';

/** A general inbox, front-desk phone or company LINE: a way to reach the account, not a person. */
export interface LeadRoute {
  email: string | null;
  phone: string | null;
  line: string | null;
}

export function leadRoute(lead: PageLead): LeadRoute | null {
  const route = { email: lead.email, phone: lead.phone, line: lead.line };
  return route.email || route.phone || route.line ? route : null;
}

function socialLines(lead: PageLead): string[] {
  return [lead.instagram && `Instagram: @${lead.instagram}`, lead.facebook && `Facebook: ${lead.facebook}`].filter((line): line is string => Boolean(line));
}

/** Notes text for a new account: the page's own description, then its social handles. */
export function leadNotes(lead: PageLead): string {
  return [lead.description, ...socialLines(lead)].filter(Boolean).join('\n');
}

/** How many separate facts a lead carries, for "Found 7 details". */
export function leadDetailCount(lead: PageLead): number {
  return [lead.name, lead.description, lead.address, lead.email, lead.phone, lead.line, lead.instagram, lead.facebook, lead.logoUrl].filter(Boolean).length;
}

export type MissingKey = 'address' | 'logo' | 'email' | 'phone' | 'line' | 'instagram' | 'facebook';

export interface MissingDetail {
  key: MissingKey;
  /** What the row shows, e.g. the address itself, or "Logo". */
  label: string;
}

const digits = (value: string | null | undefined) => (value ?? '').replace(/\D/g, '').replace(/^66/, '0');
const same = (a: string | null | undefined, b: string) => (a ?? '').trim().toLowerCase().replace(/^@/, '') === b.trim().toLowerCase().replace(/^@/, '');

/** Details the page states that the account and its contacts do not hold yet. */
export function missingDetails(
  company: Pick<Company, 'address' | 'logo_url' | 'notes'>,
  contacts: readonly Pick<Contact, 'email' | 'phone' | 'phone_second' | 'line'>[],
  lead: PageLead,
): MissingDetail[] {
  const found: MissingDetail[] = [];
  const notes = (company.notes ?? '').toLowerCase();
  if (lead.address && !company.address?.trim()) found.push({ key: 'address', label: lead.address });
  if (lead.email && !contacts.some(c => same(c.email, lead.email!))) found.push({ key: 'email', label: lead.email });
  if (lead.phone && !contacts.some(c => [c.phone, c.phone_second].some(p => p && digits(p) === digits(lead.phone)))) found.push({ key: 'phone', label: lead.phone });
  if (lead.line && !contacts.some(c => same(c.line, lead.line!))) found.push({ key: 'line', label: `LINE ${lead.line}` });
  if (lead.instagram && !notes.includes(lead.instagram.toLowerCase())) found.push({ key: 'instagram', label: `Instagram @${lead.instagram}` });
  if (lead.facebook && !notes.includes(lead.facebook.toLowerCase())) found.push({ key: 'facebook', label: `Facebook ${lead.facebook}` });
  if (lead.logoUrl && !company.logo_url) found.push({ key: 'logo', label: 'Logo' });
  return found;
}

/** The company patch and the new contact route that adding `missing` amounts to. */
export function applyMissing(
  company: Pick<Company, 'notes'>,
  lead: PageLead,
  missing: readonly MissingDetail[],
): { companyPatch: Partial<Pick<Company, 'address' | 'logo_url' | 'notes'>>; route: LeadRoute | null } {
  const has = (key: MissingKey) => missing.some(detail => detail.key === key);
  const companyPatch: Partial<Pick<Company, 'address' | 'logo_url' | 'notes'>> = {};
  if (has('address')) companyPatch.address = lead.address;
  if (has('logo')) companyPatch.logo_url = lead.logoUrl;
  const socials = socialLines({ ...lead, instagram: has('instagram') ? lead.instagram : null, facebook: has('facebook') ? lead.facebook : null });
  if (socials.length > 0) companyPatch.notes = [company.notes?.trim(), ...socials].filter(Boolean).join('\n');
  const route = { email: has('email') ? lead.email : null, phone: has('phone') ? lead.phone : null, line: has('line') ? lead.line : null };
  return { companyPatch, route: route.email || route.phone || route.line ? route : null };
}

/** The contact row that stores a route against an account. */
export function routeContact(companyId: string, companyName: string, route: LeadRoute): Omit<Contact, 'id' | 'created_at' | 'updated_at'> {
  return {
    name: `${companyName} general contact`,
    identity_quality: 'company_route',
    outreach_language: 'autodetect',
    outreach_language_basis: 'autodetect',
    email: route.email,
    phone: route.phone,
    phone_second: null,
    line: route.line,
    job_title: null,
    company_id: companyId,
    status: 'active',
    last_contacted_date: null,
    notes: 'From their website',
  };
}

const hostOf = (website: string | null | undefined) => {
  const value = (website ?? '').trim();
  if (!value) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    const host = url.hostname.replace(/^www\./, '').toLowerCase();
    // A social profile is told apart by its path, a company site by its domain alone.
    return /(^|\.)(instagram|facebook|fb|line)\.(com|me)$/.test(host) ? `${host}${url.pathname.replace(/\/$/, '').toLowerCase()}` : host;
  } catch {
    return null;
  }
};

/** An existing account with the same name or the same website, so a capture does not duplicate it. */
export function existingAccount<T extends Pick<Company, 'name' | 'website'>>(companies: readonly T[], name: string, website: string): T | null {
  const wantedName = name.trim().toLowerCase();
  const wantedHost = hostOf(website);
  if (!wantedName && !wantedHost) return null;
  return companies.find(company =>
    (wantedName !== '' && company.name.trim().toLowerCase() === wantedName) ||
    (wantedHost !== null && hostOf(company.website) === wantedHost),
  ) ?? null;
}

/** The first web link in shared text ("Look at this https://… "), or the text itself if it looks like a domain. */
export function linkInText(text: string | null | undefined): string | null {
  const value = (text ?? '').trim();
  if (!value) return null;
  const url = /https?:\/\/[^\s<>"']+/i.exec(value)?.[0];
  if (url) return url.replace(/[.,;)]+$/, '');
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value) ? value : null;
}
