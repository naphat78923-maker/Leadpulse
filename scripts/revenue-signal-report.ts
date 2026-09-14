#!/usr/bin/env node
// LeadPulse — ACCOUNT-LEVEL revenue signal report (READ-ONLY acceptance evidence).
//
// Surfaces revenue already in the CRM that is not being worked, using the
// account-level reason set that lives beside the deal-attention system in
// src/utils/deal-board.ts (spec rev 2, 2026-09-14).
//
// THIS SCRIPT PERFORMS NO WRITES. Every call is `.select()`; there is no
// insert/update/upsert/delete/rpc anywhere on this path. Report artefacts go to
// the gitignored `.hermes/reports/` path — live customer names and amounts must
// never reach a commit.
//
// Usage:
//   node scripts/revenue-signal-report.ts                          # live corpus
//   node scripts/revenue-signal-report.ts --in fixture.json        # offline
//   node scripts/revenue-signal-report.ts --out /tmp/r.json        # override
//   node scripts/revenue-signal-report.ts --print-json             # skip markdown
//   node scripts/revenue-signal-report.ts --allow-partial-read     # see BLOCKED below
//
// BLOCKED SOURCES: `sales`, `customers` and `customer_link` are RLS-protected
// for `authenticated` only, and this app has no auth layer, so the anon client
// reads zero rows with no error. The run FAILS (exit 2) rather than reporting
// those zeroes as "no signals"; --allow-partial-read emits a partial report with
// the caveat stamped into it.
//
// Exit codes: 0 = reconciliation OK, 1 = reconciliation failure,
//             2 = live read failed (blocked credentials or network).

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildAccountSignalReport,
  renderAccountSignalReport,
  type AccountInputRow,
} from '../src/utils/deal-board.ts';
import { supabase } from '../src/lib/supabase.ts';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_OUT_DIR = join(REPO_ROOT, '.hermes', 'reports');

// ── source row shapes (only the columns this report reads) ──
interface SaleRow {
  customer_id: string;
  document_no: string | null;
  document_type: string;
  date: string;
  amount_thb: number;
  is_zero_value: boolean;
}
interface AccountEventRow {
  company_id: string | null;
  order_id: string | null;
  event_date: string;
  amount: number;
  source: string;
}
interface LinkRow {
  historical_customer_id: string;
  crm_company_id: string | null;
}
interface CustomerRow {
  customer_id: string;
  is_intercompany: boolean;
}
interface CompanyRow {
  id: string;
  name: string;
  status: string | null;
  deleted_at: string | null;
}
interface DealRow {
  company_id: string | null;
  stage: string;
  value: number | null;
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

/**
 * Sources without which the account-level signals cannot be evaluated at all.
 *
 * These are RLS-protected for `authenticated` only (`sales`, `customers`) or
 * carry no anon policy whatsoever (`customer_link`). LeadPulse has no auth
 * layer, so the client connects as `anon` and PostgREST returns ZERO ROWS WITH
 * NO ERROR. That is indistinguishable from "this account never ordered" unless
 * it is checked explicitly — and reporting `reorder-gap=0` for a table nobody
 * could read is a false negative that reads as a finding.
 */
const REQUIRED_LIVE_SOURCES = ['sales', 'customers', 'customer_link'] as const;

function blockedLiveSources(corpus: Record<string, number>): string[] {
  return REQUIRED_LIVE_SOURCES.filter(key => (corpus[key] ?? 0) === 0);
}

/**
 * Paged read. Supabase caps a response at ~1000 rows, and a silently truncated
 * array returns a perfectly plausible wrong aggregate — so page explicitly and
 * record the count in the artefact.
 */
async function fetchPaged<T>(table: string, columns: string, orderBy: string): Promise<T[]> {
  const PAGE = 1000;
  const all: T[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .order(orderBy, { ascending: true })
      .range(offset, offset + PAGE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    const batch = (data ?? []) as T[];
    all.push(...batch);
    if (batch.length < PAGE) return all;
  }
}

/** One row per ORDER, not per line item: `order_id` dedupes multiple lines. */
function groupOrders(rows: { key: string; date: string; amount: number }[]) {
  const map = new Map<string, { key: string; date: string; amount: number }>();
  for (const row of rows) {
    const existing = map.get(row.key);
    if (!existing) {
      map.set(row.key, { ...row });
      continue;
    }
    existing.amount += row.amount;
    if (row.date < existing.date) existing.date = row.date;
  }
  return [...map.values()];
}

interface LoadedCorpus {
  accounts: AccountInputRow[];
  corpus: Record<string, number>;
  source: string;
}

async function loadLiveCorpus(): Promise<LoadedCorpus> {
  const [companies, deals, sales, events, links, customers] = await Promise.all([
    fetchPaged<CompanyRow>('companies', 'id,name,status,deleted_at', 'id'),
    fetchPaged<DealRow>('deals', 'company_id,stage,value', 'id'),
    fetchPaged<SaleRow>('sales', 'customer_id,document_no,document_type,date,amount_thb,is_zero_value', 'created_at'),
    fetchPaged<AccountEventRow>('account_events', 'company_id,order_id,event_date,amount,source', 'created_at'),
    fetchPaged<LinkRow>('customer_link', 'historical_customer_id,crm_company_id', 'historical_customer_id'),
    fetchPaged<CustomerRow>('customers', 'customer_id,is_intercompany', 'customer_id'),
  ]);

  // Soft-deleted companies are excluded, matching every other read in the app.
  const softDeleted = new Set(
    companies.filter(company => company.deleted_at !== null).map(company => company.id),
  );

  const intercompany = new Set(
    customers.filter(c => c.is_intercompany).map(c => c.customer_id),
  );
  const linkByHistorical = new Map<string, string | null>();
  for (const link of links) linkByHistorical.set(link.historical_customer_id, link.crm_company_id);

  // Historical branch — mirrors the `unified_sales` view's sales arm:
  // document_type='Invoice', zero-value excluded, intercompany excluded.
  const historicalRows: { key: string; date: string; amount: number }[] = [];
  for (const sale of sales) {
    if (sale.document_type !== 'Invoice') continue;
    if (sale.is_zero_value) continue;
    if (intercompany.has(sale.customer_id)) continue;
    const companyId = linkByHistorical.get(sale.customer_id);
    if (!companyId) continue;
    historicalRows.push({
      key: `${companyId}:${sale.document_no ?? `${sale.date}#unkeyed`}`,
      date: sale.date,
      amount: Number(sale.amount_thb) || 0,
    });
  }
  const historicalOrders = groupOrders(historicalRows);
  const historicalOrdersByCompany = new Map<string, { key: string; date: string; amount: number }[]>();
  for (const order of historicalOrders) {
    const companyId = order.key.slice(0, order.key.indexOf(':'));
    const list = historicalOrdersByCompany.get(companyId) ?? [];
    list.push(order);
    historicalOrdersByCompany.set(companyId, list);
  }

  // App-recorded branch — mirrors the view's event arm's exclusion of the
  // 369-row sales-copy backfill (which would double-count every buyer).
  const appRows: { key: string; date: string; amount: number; companyId: string }[] = [];
  for (const event of events) {
    if (!event.company_id) continue;
    if (event.source.startsWith('backfill-from-sales')) continue;
    if (!(Number(event.amount) > 0)) continue;
    appRows.push({
      key: `${event.company_id}:${event.order_id ?? `${event.event_date}#unkeyed`}`,
      date: event.event_date,
      amount: Number(event.amount) || 0,
      companyId: event.company_id,
    });
  }
  const appOrders = groupOrders(appRows);
  const appByCompany = new Map<string, { key: string; date: string; amount: number }[]>();
  for (const order of appOrders) {
    const companyId = order.key.slice(0, order.key.indexOf(':'));
    const list = appByCompany.get(companyId) ?? [];
    list.push(order);
    appByCompany.set(companyId, list);
  }

  const dealsByCompany = new Map<string, { stage: string; value: number | null }[]>();
  for (const deal of deals) {
    if (!deal.company_id) continue;
    const list = dealsByCompany.get(deal.company_id) ?? [];
    list.push({ stage: deal.stage, value: deal.value === null ? null : Number(deal.value) });
    dealsByCompany.set(deal.company_id, list);
  }

  const accounts: AccountInputRow[] = companies
    .filter(company => !softDeleted.has(company.id))
    .map(company => {
      const merged = [
        ...(historicalOrdersByCompany.get(company.id) ?? []),
        ...(appByCompany.get(company.id) ?? []),
      ].map(order => ({ date: order.date, amount: order.amount }));
      return {
        id: company.id,
        name: company.name,
        status: company.status,
        orders: merged,
        deals: dealsByCompany.get(company.id) ?? [],
      };
    });

  const accountsWithOrders = accounts.filter(a => a.orders.length > 0).length;

  return {
    accounts,
    corpus: {
      companies: companies.length,
      deals: deals.length,
      sales_rows: sales.length,
      account_events_rows: events.length,
      customer_link_rows: links.length,
      customers_rows: customers.length,
      distinct_orders_historical: historicalOrders.length,
      distinct_orders_app: appOrders.length,
      accounts_with_orders: accountsWithOrders,
    },
    source: `live:companies+deals+sales+account_events+customer_link+customers via ${new URL(
      'https://mkyhikarlxuwvprjabbi.supabase.co',
    ).host}`,
  };
}

function loadFileCorpus(path: string): LoadedCorpus {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const rows = Array.isArray(raw) ? raw : (raw as { accounts?: unknown[] }).accounts;
  if (!Array.isArray(rows)) {
    throw new Error(`${path} is not a JSON array of accounts (or {accounts: [...]})`);
  }
  return {
    accounts: rows as AccountInputRow[],
    corpus: { accounts_file: rows.length },
    // Do NOT claim the file is synthetic: an operator-supplied corpus may be a
    // real extract. State only what this process actually did.
    source: `file:${path} (offline — no live read performed by this process)`,
  };
}

async function main(): Promise<void> {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const inPath = argValue('--in');
  const outPath = argValue('--out') ?? join(DEFAULT_OUT_DIR, `revenue-signal-${stamp}.json`);

  let loaded: LoadedCorpus;
  if (inPath) {
    loaded = loadFileCorpus(inPath);
  } else {
    try {
      loaded = await loadLiveCorpus();
    } catch (e) {
      console.error(`LIVE READ FAILED: ${(e as Error).message}`);
      console.error('This is not a fixture result. No signals were produced for the live corpus.');
      process.exit(2);
    }
  }

  // A blocked read and a genuine "nothing found" are different answers. Never
  // let the first be reported as the second.
  let warnings: string[] = [];
  if (!inPath) {
    const blocked = blockedLiveSources(loaded.corpus);
    if (blocked.length > 0) {
      const reason =
        `order-history sources returned 0 rows: ${blocked.join(', ')}. ` +
        'These tables are RLS-protected for role `authenticated` only (sales, customers) or have no anon policy at all (customer_link), and LeadPulse has no auth layer — so the anon client is denied silently, with no error.';
      const consequence =
        'Account-level signals CANNOT be evaluated on the historical order corpus through this read path. Any reorder-gap or customer-no-won-deal count of 0 in this run is an unread source, NOT evidence that no account qualifies.';
      if (!process.argv.includes('--allow-partial-read')) {
        console.error(`BLOCKED LIVE SOURCE: ${reason}`);
        console.error(consequence);
        console.error('Refusing to emit a report. Re-run with --allow-partial-read to emit a partial');
        console.error('(app-recorded orders only) report with the caveat stamped into the artefact.');
        process.exit(2);
      }
      warnings = [reason, consequence];
    }
  }

  const report = buildAccountSignalReport(loaded.accounts, {
    source: loaded.source,
    now,
    corpus: loaded.corpus,
    warnings,
  });

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  if (process.argv.includes('--print-json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderAccountSignalReport(report));
  }
  console.log(`--- report json: ${outPath}`);
  console.log(
    `reconciliation: accounts_in=${report.reconciliation.accounts_in} ` +
      `signalled=${report.reconciliation.signalled} ` +
      `insufficient=${report.reconciliation.insufficient} ` +
      `clear=${report.reconciliation.clear} ` +
      `sum=${report.reconciliation.sum} ok=${report.reconciliation.ok}`,
  );
  console.log(
    `signals: total=${report.counts.signals_total} ` +
      Object.entries(report.counts.by_reason)
        .map(([reason, count]) => `${reason}=${count}`)
        .join(' '),
  );

  process.exit(report.reconciliation.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`report failed: ${(e as Error).message}`);
  process.exit(1);
});
