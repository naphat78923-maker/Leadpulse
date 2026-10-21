// ─── FlowAccount sales report → invoice rows for the Sales page import ───
// Pure. Reads the CSV exactly as FlowAccount exports it (รายงานยอดขาย): a few title lines,
// then a header row (ลำดับที่, เลขที่เอกสาร, วัน/เดือน/ปี, ชื่อลูกค้า, สกุลเงินในเอกสาร,
// อัตราแลกเปลี่ยน, ยอดรวมสุทธิ), then one row per document and a totals line. English
// headers are accepted too. Saving is lib/sales.ts → import_invoices.

export interface InvoiceRow {
  document_no: string;
  /** 'YYYY-MM-DD' */
  date: string;
  customer_name: string;
  currency: string;
  fx_rate: number;
  amount_original: number;
}

export type ParseResult =
  | { ok: true; rows: InvoiceRow[]; skipped: number }
  | { ok: false; error: string };

const DOC_NO = /^(INV|CA|CN)\d{6,}$/;

const COLUMNS = {
  doc: /เลขที่เอกสาร|document\s*(no|number)/i,
  date: /วัน\/เดือน\/ปี|^date$|document\s*date/i,
  customer: /ชื่อลูกค้า|customer/i,
  currency: /สกุลเงินในเอกสาร|^currency$/i,
  fx: /อัตราแลกเปลี่ยน|exchange\s*rate|fx/i,
  amount: /ยอดรวมสุทธิ|grand\s*total|net\s*amount|^total$/i,
};

/** RFC 4180-style CSV: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  const src = text.replace(/^﻿/, '');
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** 22/08/2026 (or a Buddhist-era 22/08/2569) → 2026-08-22; null when not a real date. */
export function flowDate(value: string): string | null {
  const m = value.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  let year = Number(m[3]);
  if (year > 2400) year -= 543;
  const key = `${year}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  const parsed = new Date(`${key}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === key ? key : null;
}

function amount(value: string): number | null {
  const cleaned = value.replace(/[,\s฿]/g, '').replace(/^\((.*)\)$/, '-$1');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  return Number(cleaned);
}

export function parseFlowAccountSales(text: string): ParseResult {
  const table = parseCsv(text);
  const headerAt = table.findIndex((r) => {
    const cells = r.map((c) => c.trim());
    return cells.some((c) => COLUMNS.doc.test(c)) && cells.some((c) => COLUMNS.date.test(c)) && cells.some((c) => COLUMNS.customer.test(c));
  });
  if (headerAt < 0) {
    return { ok: false, error: 'This isn’t a FlowAccount sales report. Export the sales report (รายงานยอดขาย) as CSV and try again.' };
  }
  const header = table[headerAt].map((c) => c.trim());
  const col = (re: RegExp) => header.findIndex((c) => re.test(c));
  const at = { doc: col(COLUMNS.doc), date: col(COLUMNS.date), customer: col(COLUMNS.customer), currency: col(COLUMNS.currency), fx: col(COLUMNS.fx), amount: col(COLUMNS.amount) };
  if (at.amount < 0) return { ok: false, error: 'The report has no total column (ยอดรวมสุทธิ).' };

  const rows: InvoiceRow[] = [];
  const seen = new Set<string>();
  let skipped = 0;
  for (const r of table.slice(headerAt + 1)) {
    const doc = (r[at.doc] ?? '').trim().toUpperCase();
    if (!doc && r.every((c) => !c.trim())) continue; // blank line
    const date = flowDate(r[at.date] ?? '');
    const customer = (r[at.customer] ?? '').trim().replace(/\s+/g, ' ');
    const total = amount(r[at.amount] ?? '');
    const fx = at.fx >= 0 ? amount(r[at.fx] ?? '') ?? 1 : 1;
    if (!DOC_NO.test(doc) || !date || !customer || total == null || fx <= 0 || seen.has(doc)) {
      skipped++; // the totals line, a voided row, or a repeat
      continue;
    }
    seen.add(doc);
    rows.push({
      document_no: doc,
      date,
      customer_name: customer,
      currency: (at.currency >= 0 ? r[at.currency]?.trim().toUpperCase() : '') || 'THB',
      fx_rate: fx,
      amount_original: total,
    });
  }
  if (!rows.length) return { ok: false, error: 'No invoices found in this file.' };
  return { ok: true, rows, skipped };
}
