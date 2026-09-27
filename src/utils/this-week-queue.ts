import type { HealthTier } from './accountHealth';
import { businessDaysBetween } from './business-time';
import { buildDailyFollowupQueue } from './daily-followup-queue';
import type { AttentionCandidate, RetentionDueSignal } from './followup-policy';
import type { ReorderSignal } from '../lib/historical';

/** One account to check in with: retention cadence, reorder cycle, or both. */
export interface CheckInRow {
  companyId: string;
  companyName: string;
  /** Retention check-in date; null when only a reorder signal applies. */
  dueDate: string | null;
  tier: HealthTier | null;
  reorder: Pick<ReorderSignal, 'evidence' | 'severityDays'> | null;
}

export interface ThisWeekQueue {
  /** Contact holds, invalid dates, customer replies — decide before anything else. */
  needsReview: AttentionCandidate[];
  overdue: AttentionCandidate[];
  dueThisWeek: AttentionCandidate[];
  checkIns: CheckInRow[];
  needsDate: AttentionCandidate[];
}

/**
 * Re-buckets the daily follow-up queue by *when*, not by source, and merges
 * retention-due accounts with CRM-linked reorder signals into one row per account.
 */
export function buildThisWeekQueue(input: {
  candidates: readonly AttentionCandidate[];
  retentionDue: readonly RetentionDueSignal[];
  signals: readonly ReorderSignal[];
  today: string;
}): ThisWeekQueue {
  const queue = buildDailyFollowupQueue(input.candidates, input.today);
  const section = (id: AttentionCandidate['section']) =>
    queue.sections.find((s) => s.id === id)?.items ?? [];

  const saved = section('saved');
  const isOverdue = (c: AttentionCandidate) =>
    c.dueDate !== null && businessDaysBetween(input.today, c.dueDate) < 0;

  const tierByCompany = new Map(input.retentionDue.map((s) => [s.companyId, s.tier]));
  const checkIns = new Map<string, CheckInRow>();
  for (const c of section('retention')) {
    if (!c.companyId) continue;
    checkIns.set(c.companyId, {
      companyId: c.companyId,
      companyName: c.companyName ?? 'Account',
      dueDate: c.dueDate,
      tier: tierByCompany.get(c.companyId) ?? null,
      reorder: null,
    });
  }
  for (const s of input.signals) {
    if (!s.crmCompanyId) continue;
    const reorder = { evidence: s.evidence, severityDays: s.severityDays };
    const existing = checkIns.get(s.crmCompanyId);
    if (existing) {
      if (!existing.reorder || s.severityDays > existing.reorder.severityDays) existing.reorder = reorder;
    } else {
      checkIns.set(s.crmCompanyId, {
        companyId: s.crmCompanyId,
        companyName: s.name,
        dueDate: null,
        tier: null,
        reorder,
      });
    }
  }

  return {
    needsReview: [...section('review'), ...section('customer_response')],
    overdue: saved.filter(isOverdue),
    dueThisWeek: saved.filter((c) => !isOverdue(c)),
    checkIns: [...checkIns.values()].sort(compareCheckIns),
    needsDate: section('unscheduled'),
  };
}

// Dated retention check-ins first (oldest due first), then reorder-only rows by how far past cycle.
function compareCheckIns(a: CheckInRow, b: CheckInRow): number {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  const severity = (b.reorder?.severityDays ?? 0) - (a.reorder?.severityDays ?? 0);
  if (severity !== 0) return severity;
  return a.companyName.localeCompare(b.companyName);
}
