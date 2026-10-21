// ─── FlowAccount import: what a file would add, before anything is saved ───
// Pure. Combines the parsed file (utils/flowaccount.ts) with the database preview
// (lib/sales.ts previewInvoiceImport) into what the import panel shows.

import type { InvoiceRow } from './flowaccount.ts';
import { shortCustomerName } from './sales-rhythm.ts';

export interface PreviewRow {
  document_no: string;
  already_in: boolean;
  customer_id: string | null;
  /** English name on file for a known customer; FlowAccount often writes the Thai one */
  customer_name: string | null;
  crm_company_id: string | null;
}

/** A customer in the file not yet tied to a LeadPulse account. */
export interface CustomerToMatch {
  name: string;
  invoices: number;
  /** already in the invoice history (just never linked) rather than a first-time customer */
  known: boolean;
  suggestedCompanyId: string | null;
}

export interface ImportPlan {
  newRows: InvoiceRow[];
  alreadyIn: number;
  toMatch: CustomerToMatch[];
  total: number;
}

const key = (s: string) => shortCustomerName(s).toLowerCase().replace(/[^a-z0-9ก-๙]/g, '');

/** An account whose name appears in the FlowAccount name, or the other way round. */
export function suggestCompany(name: string, companies: { id: string; name: string }[]): string | null {
  const k = key(name);
  if (k.length < 3) return null;
  const hits = companies.filter((c) => {
    const ck = key(c.name);
    return ck.length >= 3 && (k.includes(ck) || ck.includes(k));
  });
  return hits.length === 1 ? hits[0].id : null;
}

export function planImport(rows: InvoiceRow[], preview: PreviewRow[], companies: { id: string; name: string }[]): ImportPlan {
  const byDoc = new Map(preview.map((p) => [p.document_no, p]));
  const newRows = rows.filter((r) => !byDoc.get(r.document_no)?.already_in);

  const toMatch = new Map<string, CustomerToMatch>();
  for (const r of newRows) {
    const p = byDoc.get(r.document_no);
    if (p?.crm_company_id) continue;
    const entry = toMatch.get(r.customer_name) ?? { name: r.customer_name, invoices: 0, known: Boolean(p?.customer_id), suggestedCompanyId: suggestCompany(r.customer_name, companies) ?? (p?.customer_name ? suggestCompany(p.customer_name, companies) : null) };
    entry.invoices++;
    toMatch.set(r.customer_name, entry);
  }

  return {
    newRows,
    alreadyIn: rows.length - newRows.length,
    toMatch: [...toMatch.values()].sort((a, b) => b.invoices - a.invoices || a.name.localeCompare(b.name)),
    total: newRows.filter((r) => !r.document_no.startsWith('CN')).reduce((sum, r) => sum + r.amount_original * r.fx_rate, 0),
  };
}

/** Rows to save: each first-time customer carries the account Pat picked (if any). */
export function rowsToSave(plan: ImportPlan, links: Record<string, string | null>) {
  return plan.newRows.map((r) => ({ ...r, crm_company_id: links[r.customer_name] ?? null }));
}
