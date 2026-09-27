// LeadPulse — Historical Sales Signals (Phase 1)
// Pure-ish helpers + a thin Supabase read against the `reorder_signals` view.
// No writes here. Suppression + capping happen app-side so the SQL stays a
// simple, read-only signal source.

import { supabase } from '@/lib/supabase';
import type { Meeting, Deal } from '@/types/crm';

export interface ReorderSignalRow {
  customer_id: string;
  name_en: string;
  is_intercompany: boolean;
  order_count: number;
  first_order: string;
  last_order: string;
  span_days: number;
  median_gap_days: number;
  median_value: number;
  days_since_last: number;
  threshold_days: number;
  severity_days: number;
  is_overdue: boolean;
  crm_company_id: string | null;
  match_confidence: string | null;
}

export interface ReorderSignal {
  customerId: string;
  name: string;
  medianGapDays: number;
  daysSinceLast: number;
  thresholdDays: number;
  /** Days past their usual cycle (0 when still inside it). */
  severityDays: number;
  isOverdue: boolean;
  orderCount: number;
  matchConfidence: string | null;
  typicalValue: number;
  crmCompanyId: string | null;
  inCrm: boolean;
  evidence: string;
  suggestedAction: string;
}

const fmtBaht = (n: number) => '฿' + Math.round(n).toLocaleString('en-US');

/** Read the ranked overdue list from the DB view. */
export async function fetchReorderSignalRows(): Promise<ReorderSignalRow[]> {
  const { data, error } = await supabase.from('reorder_signals').select('*');
  if (error) throw error;
  return (data as ReorderSignalRow[]) || [];
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

/** Suppress if recently contacted or already has an open deal for this company. */
function isSuppressed(
  row: ReorderSignalRow,
  meetings: Meeting[],
  deals: Deal[],
): boolean {
  if (!row.crm_company_id) return false;
  const win = Math.max(30, Math.round(row.median_gap_days));
  const recentlyContacted = meetings.some(
    (m) => m.company_id === row.crm_company_id && daysBetween(m.date, todayISO()) <= win,
  );
  const hasOpenDeal = deals.some(
    (d) =>
      d.company_id === row.crm_company_id &&
      d.stage !== 'closed_won' &&
      d.stage !== 'closed_lost',
  );
  return recentlyContacted || hasOpenDeal;
}

/**
 * Filter + map the raw view rows into display-ready signals, UNCAPPED.
 * @param dismissed map of customerId -> epoch ms until which it's hidden
 *                  (Number.MAX_SAFE_INTEGER = permanent dismiss).
 * @param options.includeUnlinked — Home keeps the CRM-link gate (its comment
 *                  below explains why); /signals passes true so historical
 *                  buyers not yet in the CRM are visible somewhere.
 */
export function rankSignals(
  rows: ReorderSignalRow[],
  meetings: Meeting[],
  deals: Deal[],
  dismissed: Record<string, number>,
  options: { includeUnlinked?: boolean } = {},
): ReorderSignal[] {
  const now = Date.now();
  return rows
    // Gate: on Home, only buyers with a confirmed CRM link may appear.
    // Unlinked historical customers stay off the daily surface — no
    // "add as a company" prompts competing with today's work. /signals opts
    // out so those rows are reachable at all (and suggestedAction below is
    // written for exactly that case).
    .filter((r) => options.includeUnlinked || !!r.crm_company_id)
    .filter((r) => {
      // dismissed maps customerId -> epoch ms UNTIL WHICH the signal is hidden,
      // so the row stays hidden while `until` is in the future.
      const until = dismissed[r.customer_id];
      return !until || until <= now;
    })
    .filter((r) => !isSuppressed(r, meetings, deals))
    // Deterministic commercial-weight ranking (severity × typical value),
    // independent of whatever order PostgREST returns the view rows in.
    .sort(
      (a, b) =>
        b.severity_days * b.median_value - a.severity_days * a.median_value,
    )
    .map((r) => {
      const gap = Math.round(r.median_gap_days);
      const threshold = Math.round(r.threshold_days || r.median_gap_days);
      const severity = Math.max(0, r.days_since_last - threshold);
      return {
        customerId: r.customer_id,
        name: r.name_en,
        medianGapDays: gap,
        daysSinceLast: r.days_since_last,
        thresholdDays: threshold,
        severityDays: severity,
        isOverdue: r.is_overdue,
        orderCount: r.order_count,
        matchConfidence: r.match_confidence,
        typicalValue: Math.round(r.median_value),
        crmCompanyId: r.crm_company_id,
        inCrm: !!r.crm_company_id,
        evidence:
          gap === 0
            ? `Orders arrive in bursts — no clear cycle. Last order was ${r.days_since_last} days ago. Typical order ${fmtBaht(r.median_value)}.`
            : severity > 0
              ? `Usually reorders every ~${gap} days — ${severity} days past that cycle. Last order ${r.days_since_last} days ago. Typical order ${fmtBaht(r.median_value)}.`
              : `Usually reorders every ~${gap} days. Last order was ${r.days_since_last} days ago — still inside the cycle. Typical order ${fmtBaht(r.median_value)}.`,
        suggestedAction: r.crm_company_id
          ? 'Check current stock and ask about the next delivery.'
          : 'Not yet in CRM — add as a company to track.',
      };
    });
}
