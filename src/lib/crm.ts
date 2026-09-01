// LeadPulse CRM — Supabase Data Layer

import { supabase } from './supabase';
import { Company, Contact, Deal, Meeting } from '@/types/crm';

// Soft-delete (archive) helpers — recoverable, never a hard DELETE.
export async function softDelete(entity: 'companies' | 'contacts' | 'deals' | 'meetings', id: string) {
  const { error } = await supabase
    .from(entity)
    .update({ deleted_at: new Date().toISOString() } as any)
    .eq('id', id);
  if (error) throw error;
}

export async function restoreEntity(entity: 'companies' | 'contacts' | 'deals' | 'meetings', id: string) {
  const { error } = await supabase
    .from(entity)
    .update({ deleted_at: null } as any)
    .eq('id', id);
  if (error) throw error;
}

// ─── Companies ───
export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function createCompany(company: Omit<Company, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase.from('companies').insert(company).select().single();
  if (error) throw error;
  return data;
}

export async function updateCompany(id: string, updates: Partial<Company>) {
  const payload: any = { ...updates, updated_at: new Date().toISOString() };
  if (payload.last_contact_date === '') payload.last_contact_date = null;
  const { data, error } = await supabase.from('companies').update(payload).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

// ─── Company logo storage (bucket: company-logos, folder: logos/<id>) ───
export const COMPANY_LOGO_BUCKET = 'company-logos';

export async function uploadCompanyLogo(companyId: string, file: File): Promise<string> {
  const path = `logos/${companyId}.webp`;
  const { error } = await supabase.storage
    .from(COMPANY_LOGO_BUCKET)
    .upload(path, file, { upsert: true, contentType: 'image/webp', cacheControl: '3600' });
  if (error) throw error;
  const { data } = supabase.storage.from(COMPANY_LOGO_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteCompanyLogo(companyId: string): Promise<void> {
  const path = `logos/${companyId}.webp`;
  const { error } = await supabase.storage.from(COMPANY_LOGO_BUCKET).remove([path]);
  if (error) throw error;
}

// ─── Contacts ───
export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .is('deleted_at', null)
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function createContact(contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>) {
  const payload: any = { ...contact };
  // Blank UUID/date fields must be null, never empty strings (22P02 otherwise).
  if (payload.company_id === '') payload.company_id = null;
  const { data, error } = await supabase.from('contacts').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateContact(id: string, updates: Partial<Contact>) {
  const payload: any = { ...updates, updated_at: new Date().toISOString() };
  // Convert empty strings to null for UUID fields
  if (payload.company_id === '') payload.company_id = null;
  const { data, error } = await supabase
    .from('contacts')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Deals ───
export async function getDeals(): Promise<Deal[]> {
  const { data, error } = await supabase
    .from('deals')
    .select('*')
    .is('deleted_at', null)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

// The value column is NUMERIC — empty or non-numeric strings must become null, never ''.
function normalizeDealValue(value: unknown): number | null {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

export async function createDeal(deal: Omit<Deal, 'id' | 'created_at' | 'updated_at'>) {
  const payload: any = { ...deal };
  if (payload.company_id === '') payload.company_id = null;
  if (payload.followup_date === '') payload.followup_date = null;
  if (payload.nudge_stage === '') payload.nudge_stage = null;
  if (payload.sample_status === '') payload.sample_status = null;
  if (typeof payload.draft_primary_ask === 'string' && !payload.draft_primary_ask.trim()) payload.draft_primary_ask = null;
  payload.value = normalizeDealValue(payload.value);
  const { data, error } = await supabase.from('deals').insert(payload).select().single();
  if (error) throw error;
  return data;
}

export async function updateDealStage(id: string, stage: Deal['stage']) {
  const { data, error } = await supabase.from('deals').update({ stage, updated_at: new Date() }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}

function normalizeDealUpdate(updates: Partial<Deal>) {
  const payload: any = { ...updates, updated_at: new Date().toISOString() };
  // Convert empty date and workflow option strings to null
  if (payload.followup_date === '') payload.followup_date = null;
  if (payload.nudge_stage === '') payload.nudge_stage = null;
  if (payload.sample_status === '') payload.sample_status = null;
  if (typeof payload.draft_primary_ask === 'string' && !payload.draft_primary_ask.trim()) payload.draft_primary_ask = null;
  // Only touch value when the caller sent it — undo snapshots may omit the key.
  if ('value' in payload) payload.value = normalizeDealValue(payload.value);
  return payload;
}

export async function updateDeal(id: string, updates: Partial<Deal>) {
  const payload = normalizeDealUpdate(updates);
  const { data, error } = await supabase
    .from('deals')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

/**
 * Applies an interaction-driven transition only if the deal is still the row
 * the user reviewed. A lost response is safe to retry: if the requested fields
 * already match, the current row is returned instead of writing again.
 */
export async function updateDealIfUnchanged(id: string, expectedUpdatedAt: string, updates: Partial<Deal>) {
  const payload = normalizeDealUpdate(updates);
  const { data, error } = await supabase
    .from('deals')
    .update(payload)
    .eq('id', id)
    .eq('updated_at', expectedUpdatedAt)
    .select()
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  const { data: current, error: currentError } = await supabase
    .from('deals')
    .select('*')
    .eq('id', id)
    .single();
  if (currentError) throw currentError;

  const requestedEntries = Object.entries(payload).filter(([key]) => key !== 'updated_at');
  const currentRecord = current as Record<string, unknown>;
  const alreadyApplied = requestedEntries.every(([key, value]) => Object.is(currentRecord[key], value));
  if (alreadyApplied) return current;

  throw new Error('This deal changed while the interaction was saving. Review its current lane before trying again.');
}

// ─── Meetings ───
export async function getMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .is('deleted_at', null)
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMeeting(meeting: Omit<Meeting, 'id' | 'created_at'>) {
  const payload: any = { ...meeting };
  // Blank UUID/date fields must be null, never empty strings.
  if (payload.company_id === '') payload.company_id = null;
  if (payload.deal_id === '') payload.deal_id = null;
  if (payload.followup_date === '') payload.followup_date = null;
  const { data, error } = await supabase.from('meetings').insert(payload).select().single();
  if (error) throw error;
  return data;
}

// ─── Stats ───
export async function getStats() {
  const [contacts, companies, deals, meetings] = await Promise.all([
    getContacts(),
    getCompanies(),
    getDeals(),
    getMeetings(),
  ]);

  return {
    totalContacts: contacts.length,
    totalCompanies: companies.length,
    totalDeals: deals.length,
    totalMeetings: meetings.length,
    activeDeals: deals.filter(d => !['closed_won', 'closed_lost'].includes(d.stage)).length,
    wonDeals: deals.filter(d => d.stage === 'closed_won').length,
    lostDeals: deals.filter(d => d.stage === 'closed_lost').length,
  };
}

// ─── Activity Events (durable audit trail) ───
export interface ActivityEvent {
  id: string;
  type: string;
  entity: string;
  entity_id: string | null;
  label: string;
  description: string | null;
  undo_payload: Record<string, any> | null;
  applied: boolean;
  timestamp: string;
  created_at: string;
}

export async function getActivityEvents(): Promise<ActivityEvent[]> {
  const { data, error } = await supabase
    .from('activity_events')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(500);
  if (error) throw error;
  return data || [];
}

export async function createActivityEvent(event: {
  type: string;
  entity: string;
  entity_id?: string | null;
  label: string;
  description?: string | null;
  undo_payload?: Record<string, any> | null;
}) {
  const { data, error } = await supabase
    .from('activity_events')
    .insert({
      ...event,
      applied: true,
      timestamp: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateActivityEvent(id: string, patch: Partial<ActivityEvent>) {
  const { data, error } = await supabase
    .from('activity_events')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Account Events (per-company sales history → retention scoring) ───
// Feeds the Monetary (M) sub-score, reorder cadence (F) and true last-order
// recency (R). Read-only in the app: rows arrive via CSV/backfill imports.
export interface AccountEvent {
  company_id: string;
  event_date: string; // 'YYYY-MM-DD'
  amount: number;
  product_line: string | null;
  order_id: string | null;
}

export async function getAccountEvents(): Promise<AccountEvent[]> {
  const { data, error } = await supabase
    .from('account_events')
    .select('company_id,event_date,amount,product_line,order_id')
    .order('event_date', { ascending: true });
  if (error) throw error;
  return (data || []) as AccountEvent[];
}

// App-recorded order. Two origins: 'app_closed_won' (Success lane move) and
// 'app_manual' ("Log sale" on a company). Both feed unified_sales →
// reorder_signals so every sale typed advances that buyer's cycle instantly.
// source='backfill-from-sales%' rows are import copies — excluded from the
// unified view, so there is no double-count path.
export async function createAccountEvent(event: AccountEvent, source: string = 'app_closed_won') {
  const payload: any = {
    ...event,
    amount: event.amount > 0 ? event.amount : 0, // zero = flagged, excluded from cycle math
    source,
  };
  if (payload.company_id === '' || payload.company_id == null) return null; // no company link → nothing to attribute
  const { data, error } = await supabase
    .from('account_events')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return data;
}
