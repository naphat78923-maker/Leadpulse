// LeadPulse CRM — Supabase Data Layer

import { supabase } from './supabase';
import { Company, Contact, Deal, Meeting } from '@/types/crm';

// ─── Companies ───
export async function getCompanies(): Promise<Company[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
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

// ─── Contacts ───
export async function getContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function createContact(contact: Omit<Contact, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase.from('contacts').insert(contact).select().single();
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

export async function updateDeal(id: string, updates: Partial<Deal>) {
  const payload: any = { ...updates, updated_at: new Date().toISOString() };
  // Convert empty date and workflow option strings to null
  if (payload.followup_date === '') payload.followup_date = null;
  if (payload.nudge_stage === '') payload.nudge_stage = null;
  if (payload.sample_status === '') payload.sample_status = null;
  // Only touch value when the caller sent it — undo snapshots may omit the key.
  if ('value' in payload) payload.value = normalizeDealValue(payload.value);
  const { data, error } = await supabase
    .from('deals')
    .update(payload)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ─── Meetings ───
export async function getMeetings(): Promise<Meeting[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select('*')
    .order('date', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function createMeeting(meeting: Omit<Meeting, 'id' | 'created_at'>) {
  const { data, error } = await supabase.from('meetings').insert(meeting).select().single();
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
