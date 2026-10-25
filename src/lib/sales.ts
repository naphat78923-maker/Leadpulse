// ─── Sales page data: month totals, customer rhythms, FlowAccount import ───
// The invoice tables are closed to the app's key; these database functions are the only way
// in (supabase/migrations/20261021120000_sales_page.sql).

import { supabase } from '@/lib/supabase';
import type { InvoiceRow } from '@/utils/flowaccount';
import type { CustomerRhythm } from '@/utils/sales-rhythm';

export interface MonthTotal {
  month: string; // first of the month, 'YYYY-MM-DD'
  amount: number;
  orders: number;
  buyers: number;
}

export async function getSalesByMonth(since: string): Promise<MonthTotal[]> {
  const { data, error } = await supabase.rpc('sales_by_month', { since });
  if (error) throw error;
  return ((data ?? []) as MonthTotal[]).map((m) => ({ ...m, amount: Number(m.amount) }));
}

/** Invoiced sales per account since a date (Accounts: "Sales, last 90 days"), keyed by company id. */
export async function getSalesByCompany(since: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.rpc('sales_by_company', { since });
  if (error) throw error;
  return new Map(((data ?? []) as { crm_company_id: string; amount: number | string }[]).map((r) => [r.crm_company_id, Number(r.amount)]));
}

export async function getLatestInvoiceDate(): Promise<string | null> {
  const { data, error } = await supabase.rpc('latest_invoice_date');
  if (error) throw error;
  return (data as string | null) ?? null;
}

export async function getCustomerRhythms(): Promise<CustomerRhythm[]> {
  const { data, error } = await supabase.rpc('customer_rhythms');
  if (error) throw error;
  return ((data ?? []) as CustomerRhythm[]).map((r) => ({ ...r, median_value: Number(r.median_value) }));
}

export interface ImportPreviewRow {
  document_no: string;
  already_in: boolean;
  customer_id: string | null;
  customer_name: string | null;
  crm_company_id: string | null;
}

export async function previewInvoiceImport(rows: InvoiceRow[]): Promise<ImportPreviewRow[]> {
  const { data, error } = await supabase.rpc('preview_invoice_import', { rows });
  if (error) throw error;
  return (data ?? []) as ImportPreviewRow[];
}

export interface ImportResult {
  added: number;
  already_in: number;
  new_customers: number;
}

/** rows may carry crm_company_id to link a customer seen for the first time. */
export async function importInvoices(rows: (InvoiceRow & { crm_company_id?: string | null })[]): Promise<ImportResult> {
  const { data, error } = await supabase.rpc('import_invoices', { rows });
  if (error) throw error;
  return data as ImportResult;
}
