'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { FileUp, Loader2 } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import CompanyLogo from '@/components/CompanyLogo';
import SalesImport from '@/components/SalesImport';
import { PageTransition } from '@/components/motion';
import * as sales from '@/lib/sales';
import { formatBaht } from '@/utils/format';
import { businessDaysBetween } from '@/utils/business-time';
import { useBusinessDateKey } from '@/utils/useBusinessDateKey';
import { monthLabel, shortCustomerName, shortDate, splitRegulars, usualMonth, type CustomerRhythm, type RhythmView } from '@/utils/sales-rhythm';

const MONTHS_SHOWN = 13;
const QUIET_SHOWN = 5;
/** Older than this, the page asks for a FlowAccount import. */
const STALE_AFTER_DAYS = 14;

function monthKeys(today: string): string[] {
  const [y, m] = today.split('-').map(Number);
  return Array.from({ length: MONTHS_SHOWN }, (_, i) => {
    const d = new Date(Date.UTC(y, m - 1 - (MONTHS_SHOWN - 1 - i), 1));
    return d.toISOString().slice(0, 10);
  });
}

const STATUS_CHIP: Record<RhythmView['status'], string> = {
  on_track: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  due: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
  late: 'bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300',
  quiet: 'bg-clay-surface text-clay-muted',
};
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

const STATUS_WORD: Record<RhythmView['status'], string> = { on_track: 'next', due: 'due', late: 'late', quiet: 'quiet' };

interface SalesData {
  months: sales.MonthTotal[];
  rhythms: CustomerRhythm[];
  latestInvoice: string | null;
}

export default function SalesPage() {
  const today = useBusinessDateKey();
  const { companies } = useCrm();
  const [data, setData] = useState<SalesData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [showAllQuiet, setShowAllQuiet] = useState(false);

  const keys = useMemo(() => monthKeys(today), [today]);
  // Bumped after an import to load the page again.
  const [loadCount, setLoadCount] = useState(0);
  useEffect(() => {
    let cancelled = false;
    Promise.all([sales.getSalesByMonth(keys[0]), sales.getCustomerRhythms(), sales.getLatestInvoiceDate()]).then(
      ([months, rhythms, latestInvoice]) => {
        if (cancelled) return;
        setData({ months, rhythms, latestInvoice });
        setError(null);
      },
      (err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'unknown error'); },
    );
    return () => { cancelled = true; };
  }, [keys, loadCount]);

  const companyById = useMemo(() => new Map(companies.map((c) => [c.id, c])), [companies]);
  const { regulars, quiet } = useMemo(() => splitRegulars(data?.rhythms ?? [], today), [data, today]);
  const byMonth = useMemo(() => new Map((data?.months ?? []).map((m) => [m.month, m])), [data]);
  const thisMonth = byMonth.get(keys[keys.length - 1]);
  const usual = usualMonth(data?.months ?? [], keys[keys.length - 1]);
  const peak = Math.max(1, ...(data?.months ?? []).map((m) => m.amount));
  const stale = data?.latestInvoice ? businessDaysBetween(data.latestInvoice, today) > STALE_AFTER_DAYS : Boolean(data);

  const row = (r: RhythmView) => {
    const company = r.crm_company_id ? companyById.get(r.crm_company_id) : undefined;
    const name = company?.name ?? shortCustomerName(r.name_en);
    const body = (
      <>
        <span className="flex min-w-0 items-center gap-2.5">
          <CompanyLogo src={company?.logo_url} name={name} id={company?.id ?? r.customer_id} size={28} />
          <span className="truncate font-medium text-clay-ink">{name}</span>
        </span>
        <span className="hidden text-clay-muted sm:block">{r.median_gap_days ? `~${plural(r.median_gap_days, 'day')}` : '—'}</span>
        <span className="text-clay-muted">{shortDate(r.last_order, r.status === 'quiet')}</span>
        <span className="hidden text-clay-ink sm:block">{formatBaht(r.median_value)}</span>
        <span className="text-right">
          {r.status === 'quiet' ? (
            <span className="text-xs text-clay-muted">{Math.round(r.daysSinceLast / 30)} mo ago</span>
          ) : (
            <span className={clsx('inline-block rounded-md px-2 py-0.5 text-xs font-medium', STATUS_CHIP[r.status])}>
              {STATUS_WORD[r.status]}{r.expected ? ` · ${shortDate(r.expected)}` : ''}
            </span>
          )}
        </span>
      </>
    );
    const cls = 'grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.7fr_1fr] items-center gap-3 border-t border-clay-hairline px-1 py-2.5 text-sm';
    return company ? (
      <Link key={r.customer_id} href={`/companies?company=${company.id}`} className={clsx(cls, 'active:bg-clay-surface')}>{body}</Link>
    ) : (
      <div key={r.customer_id} className={cls} title="Not linked to a LeadPulse account">{body}</div>
    );
  };

  return (
    <PageTransition className="p-4 md:p-6 max-w-4xl pb-20 lg:pb-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl md:text-2xl font-semibold text-clay-ink">Sales</h1>
        {!importing && (
          <button
            type="button"
            onClick={() => setImporting(true)}
            className="flex items-center gap-2 rounded-lg bg-clay-ink px-3 py-2 text-sm font-medium text-clay-canvas motion-press"
          >
            <FileUp className="h-4 w-4" /> <span>Import from FlowAccount</span>
          </button>
        )}
      </div>

      {importing && <SalesImport onClose={() => setImporting(false)} onSaved={() => { setImporting(false); setLoadCount((n) => n + 1); }} />}

      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">Sales didn’t load: {error}</p>}
      {!data && !error && <Loader2 className="h-5 w-5 animate-spin text-clay-muted" />}

      {data && (
        <>
          {stale && !importing && (
            <button
              type="button"
              onClick={() => setImporting(true)}
              className="mb-4 block w-full rounded-lg bg-amber-50 px-3 py-2.5 text-left text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            >
              {data.latestInvoice ? `Invoices are in up to ${shortDate(data.latestInvoice)}.` : 'No invoices yet.'} Import the latest FlowAccount export to bring every rhythm up to date.
            </button>
          )}

          <div className="mb-5 grid grid-cols-2 gap-2.5 md:grid-cols-4">
            <Stat label={new Date(`${keys[keys.length - 1]}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'long', timeZone: 'UTC' })} value={formatBaht(thisMonth?.amount ?? 0)} note={thisMonth ? `${plural(thisMonth.orders, 'order')} · ${plural(thisMonth.buyers, 'buyer')}` : 'no orders yet'} />
            <Stat label="Usual month" value={usual == null ? '—' : formatBaht(usual)} note="median of past months" />
            <Stat label="Regulars" value={String(regulars.length)} note="still ordering" />
            <Stat label="Gone quiet" value={String(quiet.length)} note="used to order regularly" />
          </div>

          <div className="mb-6" aria-label="Sales by month">
            <div className="flex h-24 items-end gap-1.5">
              {keys.map((k, i) => {
                const m = byMonth.get(k);
                const current = i === keys.length - 1;
                return (
                  <div
                    key={k}
                    title={`${monthLabel(k)}: ${formatBaht(m?.amount ?? 0)}`}
                    className={clsx('flex-1 rounded-t', m ? (current ? 'bg-clay-lavender/70' : 'bg-clay-lavender/30') : 'bg-clay-hairline')}
                    style={{ height: m ? `${Math.max(4, (m.amount / peak) * 100)}%` : '3px' }}
                  />
                );
              })}
            </div>
            <div className="mt-1 flex gap-1.5 text-[11px] text-clay-muted">
              {keys.map((k) => (
                <span key={k} className="flex-1 text-center">{monthLabel(k).charAt(0)}</span>
              ))}
            </div>
          </div>

          <h2 className="mb-1 text-sm font-semibold text-clay-ink">Regulars</h2>
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto] sm:grid-cols-[minmax(0,1.6fr)_0.8fr_0.8fr_0.7fr_1fr] gap-3 px-1 pb-1.5 text-xs text-clay-muted">
            <span>Customer</span><span className="hidden sm:block">Orders every</span><span>Last order</span><span className="hidden sm:block">Usual</span><span className="text-right">Next</span>
          </div>
          {regulars.length ? regulars.map(row) : <p className="border-t border-clay-hairline py-3 text-sm text-clay-muted">No regulars yet.</p>}

          {quiet.length > 0 && (
            <>
              <h2 className="mb-1 mt-7 text-sm font-semibold text-clay-ink">Gone quiet</h2>
              {(showAllQuiet ? quiet : quiet.slice(0, QUIET_SHOWN)).map(row)}
              {quiet.length > QUIET_SHOWN && (
                <button type="button" onClick={() => setShowAllQuiet((v) => !v)} className="w-full border-t border-clay-hairline px-1 py-2.5 text-left text-sm text-clay-muted">
                  {showAllQuiet ? 'Show fewer' : `${quiet.length - QUIET_SHOWN} more`}
                </button>
              )}
            </>
          )}
        </>
      )}
    </PageTransition>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="rounded-lg bg-clay-card p-3">
      <div className="text-xs text-clay-muted">{label}</div>
      <div className="text-xl font-semibold text-clay-ink">{value}</div>
      <div className="text-xs text-clay-muted">{note}</div>
    </div>
  );
}
