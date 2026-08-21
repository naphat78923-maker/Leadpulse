// ─── LeadPulse — Deal display labels (Slice: remove redundant title/client inputs) ───
// `title` and `client` are no longer user-entered. They are auto-derived from
// Product + Company (fallback: Contact). Use these helpers for display so the
// UI always reflects the linked company, not a stale free-text field.

import { Company, Contact, Deal } from '@/types/crm';

export function dealClientName(
  deal: Deal,
  companies: Company[] = [],
  contacts: Contact[] = []
): string {
  if (deal.company_id) {
    const c = companies.find((x) => x.id === deal.company_id);
    if (c?.name) return c.name;
  }
  if (deal.contact_ids?.length) {
    const c = contacts.find((x) => x.id === deal.contact_ids![0]);
    if (c?.name) return c.name;
  }
  return deal.client || 'Unnamed';
}

export function dealLabel(
  deal: Deal,
  companies: Company[] = [],
  contacts: Contact[] = []
): string {
  const who = dealClientName(deal, companies, contacts);
  const product = deal.product?.trim();
  if (product && who) return `${product} · ${who}`;
  return product || who || 'Untitled deal';
}

/** Build the auto-derived title + client for save/create payloads. */
export function deriveDealIdentity(
  product: string,
  companyName: string,
  contactName: string
): { title: string; client: string } {
  const who = companyName || contactName || '';
  const title = `${product || ''} · ${who}`.replace(/^ · /, '').trim();
  return { title, client: who };
}
