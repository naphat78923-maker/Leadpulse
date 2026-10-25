// Saving a website enquiry (POST /api/leads) and telling Pat on Telegram. Server only.
// A known business is linked, never duplicated, and its recorded source is never overwritten.
// A new one becomes a prospect tagged with where it came from, plus the person who wrote
// and a Research deal due today.

import type { SupabaseClient } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { sendTelegramMessage, telegramConfigured } from '@/lib/telegram';
import { businessDateKey } from '@/utils/business-time';
import {
  enquiryNote,
  matchWebsiteLead,
  newWebsiteCompany,
  sameContact,
  websiteAcquisition,
  websiteContact,
  websiteDeal,
  websiteLeadMessage,
  type CompanyAlias,
  type LeadOutcome,
  type WebsiteLead,
} from '@/utils/website-lead';

export interface SavedLead extends LeadOutcome {
  companyId: string;
  contactId: string | null;
  dealId: string | null;
  alerted: boolean;
}

type CompanyRow = { id: string; name: string; website: string | null; notes: string | null; acquisition_source: string | null };
type ContactRow = { id: string; company_id: string | null; email: string | null; phone: string | null; phone_second: string | null; line: string | null };

const CLOSED = ['closed_won', 'closed_lost'];

/** The moment the enquiry arrived; tests pin it. */
let now = () => new Date();
export function setClockForTests(clock: () => Date) { now = clock; }

async function known(db: SupabaseClient) {
  const [companies, aliases, contacts] = await Promise.all([
    db.from('companies').select('id, name, website, notes, acquisition_source').is('deleted_at', null),
    db.from('company_aliases').select('company_id, kind, value'),
    db.from('contacts').select('id, company_id, email, phone, phone_second, line').is('deleted_at', null),
  ]);
  if (companies.error || contacts.error) throw new Error('Could not read accounts');
  return {
    companies: (companies.data ?? []) as CompanyRow[],
    // Aliases only add matches; without them the name and contact checks still run.
    aliases: (aliases.error ? [] : aliases.data ?? []) as CompanyAlias[],
    contacts: (contacts.data ?? []) as ContactRow[],
  };
}

async function insertOne(db: SupabaseClient, table: string, row: Record<string, unknown>): Promise<string | null> {
  const { data, error } = await db.from(table).insert(row).select('id');
  return error ? null : (data as Array<{ id: string }> | null)?.[0]?.id ?? null;
}

/** Links or creates the account, its contact and deal. Throws only when nothing was saved. */
export async function saveWebsiteLead(lead: WebsiteLead, db: SupabaseClient = supabase): Promise<Omit<SavedLead, 'alerted'>> {
  const today = businessDateKey(now());
  const book = await known(db);
  const match = matchWebsiteLead(lead, book);

  let companyId: string;
  let companyName: string;
  if (match) {
    companyId = match.company.id;
    companyName = match.company.name;
    // Keep the enquiry on the account. Tag the source only if none was recorded: an account
    // Pat found by outreach stays outbound even when its owner later clicks an ad.
    const patch: Record<string, unknown> = {
      notes: [match.company.notes?.trim(), enquiryNote(lead, today)].filter(Boolean).join('\n'),
    };
    if (!match.company.acquisition_source) Object.assign(patch, websiteAcquisition(lead));
    await db.from('companies').update(patch).eq('id', companyId);
  } else {
    const company = newWebsiteCompany(lead, today);
    const id = await insertOne(db, 'companies', company);
    if (!id) throw new Error('Could not save the account');
    companyId = id;
    companyName = company.name;
  }

  const theirs = book.contacts.filter(c => c.company_id === companyId);
  const contactId = sameContact(theirs, lead)?.id ?? await insertOne(db, 'contacts', websiteContact(companyId, lead));

  // One open deal per account: a known business that is already in the pipeline keeps its deal.
  let deal: LeadOutcome['deal'] = null;
  let dealId: string | null = null;
  const { data: open } = match
    ? await db.from('deals').select('id, title, stage').eq('company_id', companyId).is('deleted_at', null)
    : { data: [] };
  const live = (open as Array<{ id: string; title: string; stage: string }> | null)?.find(d => !CLOSED.includes(d.stage));
  if (live) {
    deal = { created: false, title: live.title };
    dealId = live.id;
  } else {
    const row = websiteDeal(companyId, companyName, contactId, today);
    dealId = await insertOne(db, 'deals', row);
    if (dealId) deal = { created: true, title: row.title };
  }

  return { companyId, companyName, contactId, dealId, matched: match?.by ?? null, deal };
}

/** Saves the enquiry, then alerts Pat. A Telegram failure never loses the lead. */
export async function captureWebsiteLead(
  lead: WebsiteLead,
  db: SupabaseClient = supabase,
  send: ((html: string) => Promise<number>) | null = telegramConfigured() ? sendTelegramMessage : null,
): Promise<SavedLead> {
  const saved = await saveWebsiteLead(lead, db);
  const alerted = send ? await send(websiteLeadMessage(lead, saved)).then(() => true, () => false) : false;
  return { ...saved, alerted };
}
