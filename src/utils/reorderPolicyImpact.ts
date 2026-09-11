// ─── LeadPulse — reorder POLICY impact (read-only, pure) ───
//
// Answers the question the classification work raised: if the timing policy were
// switched, which accounts move, in which direction, and does the move actually
// reach a due date or a retention tier? Produces evidence only; nothing is written.

import { accountHealthScore, type AccountType } from './accountHealth.ts';
import { cadenceInterval, nextTouchDue, type ISODate } from './retentionCadence.ts';
import { classifyCompanyRole, type CompanyRole, type RoleReasonCode } from './companyRole.ts';
import {
  accountTypeForPolicy,
  intervalBasisForPolicy,
  intervalDaysForPolicy,
  ACTIVE_REORDER_POLICY,
  REVIEWED_ALTERNATIVE_POLICY,
  LEGACY_ACCOUNT_INTERVAL_DAYS,
  type IntervalBasis,
  type ReorderPolicyVersion,
} from './reorderPolicy.ts';

export interface ImpactEvent { date: string; amount: number; product_line?: string | null; order_id?: string | null }
export interface ImpactDeal { stage: string; last_outcome: string | null; value: number | null }
export interface ImpactMeeting { date: string; outcome: 'positive' | 'neutral' | 'negative' | 'no_response' | null }

export interface ImpactInputRow {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  tags: string[] | null;
  created_at: string | null;
  last_contact_date: string | null;
  last_human_touch: string | null;
  next_touch_due: string | null;
  meetings: ImpactMeeting[];
  deals: ImpactDeal[];
  events: ImpactEvent[];
}

export interface PolicySnapshot {
  policy: ReorderPolicyVersion;
  account_type: AccountType;
  /** the policy's stated reorder interval for this account */
  interval_days: number;
  /** min(tier interval, policy interval) — what the cadence actually uses */
  effective_interval_days: number;
  basis: IntervalBasis | 'legacy';
  tier: string;
  score: number;
  due: ISODate;
  days_until: number;
  due_source: 'persisted' | 'derived';
}

export interface PolicyImpactRow {
  id: string;
  name: string;
  status: string;
  role: CompanyRole;
  role_reason_code: RoleReasonCode;
  legacy: PolicySnapshot;
  proposed: PolicySnapshot;
  interval_delta_days: number;
  interval_direction: 'longer' | 'shorter' | 'same';
  tier_changed: boolean;
  due_changed: boolean;
  due_delta_days: number;
  /** false when a persisted next_touch_due pins the date regardless of policy */
  due_date_reachable: boolean;
}

export interface PolicyImpactReport {
  generated_at: string;
  source: string;
  active_policy: ReorderPolicyVersion;
  proposed_policy: ReorderPolicyVersion;
  counts: {
    rows_in: number;
    interval_changed: number;
    longer: number;
    shorter: number;
    same: number;
    explicit_new: number;
    named_fallback: number;
    legacy_equivalent: number;
    tier_changed: number;
    due_changed: number;
    due_pinned_by_persisted_value: number;
    proposed_longer_but_due_unreachable: number;
  };
  reconciliation: { ok: boolean; problems: string[] };
  rows: PolicyImpactRow[];
}

function iso(d: string | null | undefined): ISODate | null {
  return d ? d.slice(0, 10) : null;
}

function snapshot(row: ImpactInputRow, version: ReorderPolicyVersion, today: ISODate): PolicySnapshot {
  const accountType = accountTypeForPolicy(row, version);
  const createdAt = iso(row.created_at) ?? today;
  const dates = [...row.meetings.map((m) => m.date), ...(row.last_human_touch ? [row.last_human_touch.slice(0, 10)] : [])].sort();
  const lastTouch = dates.length ? dates[dates.length - 1] : null;
  const eventDates = row.events.map((e) => e.date).sort();
  const lastOrderDate = eventDates.length ? eventDates[eventDates.length - 1] : null;

  const res = accountHealthScore({
    companyId: row.id,
    companyName: row.name,
    createdAt,
    meetings: row.meetings.map((m) => ({ date: m.date, outcome: m.outcome })),
    deals: row.deals.map((d) => ({ stage: d.stage, last_outcome: d.last_outcome, value: d.value })),
    events: row.events.map((e) => ({
      date: e.date,
      amount: e.amount,
      product_line: e.product_line ?? undefined,
      order_id: e.order_id ?? undefined,
    })),
    lastOrderDate,
    accountType,
    today,
  });

  const touch = nextTouchDue({
    tier: res.tier,
    accountType,
    lastTouch,
    lastContactDate: iso(row.last_contact_date),
    createdAt,
    persistedNextDue: iso(row.next_touch_due),
    today,
  });

  return {
    policy: version,
    account_type: accountType,
    interval_days: intervalDaysForPolicy(row, version),
    effective_interval_days: cadenceInterval(res.tier, accountType),
    basis: intervalBasisForPolicy(row, version),
    tier: res.tier,
    score: res.score,
    due: touch.due,
    days_until: touch.daysUntil,
    due_source: touch.persisted ? 'persisted' : 'derived',
  };
}

export function companyPolicyImpact(row: ImpactInputRow, today: ISODate): PolicyImpactRow {
  const legacy = snapshot(row, ACTIVE_REORDER_POLICY, today);
  const proposed = snapshot(row, REVIEWED_ALTERNATIVE_POLICY, today);
  const cls = classifyCompanyRole(row);
  const delta = proposed.interval_days - legacy.interval_days;
  const dueDeltaMs =
    new Date(proposed.due + 'T00:00:00').getTime() - new Date(legacy.due + 'T00:00:00').getTime();

  return {
    id: row.id,
    name: row.name,
    status: row.status,
    role: cls.role,
    role_reason_code: cls.reason_code,
    legacy,
    proposed,
    interval_delta_days: delta,
    interval_direction: delta > 0 ? 'longer' : delta < 0 ? 'shorter' : 'same',
    tier_changed: proposed.tier !== legacy.tier,
    due_changed: proposed.due !== legacy.due,
    due_delta_days: Math.round(dueDeltaMs / 86400000),
    due_date_reachable: legacy.due_source === 'derived',
  };
}

export function buildPolicyImpactReport(rows: ImpactInputRow[], opts: { source: string; now?: Date }): PolicyImpactReport {
  const now = opts.now ?? new Date();
  const today = now.toISOString().slice(0, 10);
  const impacts = rows.map((r) => companyPolicyImpact(r, today));

  const intervalChanged = impacts.filter((r) => r.interval_direction !== 'same');
  const longer = impacts.filter((r) => r.interval_direction === 'longer').length;
  const shorter = impacts.filter((r) => r.interval_direction === 'shorter').length;
  const same = impacts.filter((r) => r.interval_direction === 'same').length;

  const explicit_new = impacts.filter((r) => r.proposed.basis === 'explicit_new').length;
  const named_fallback = impacts.filter((r) => r.proposed.basis === 'named_fallback').length;
  const legacy_equivalent = impacts.filter((r) => r.proposed.basis === 'legacy_equivalent').length;

  const problems: string[] = [];
  if (longer + shorter + same !== impacts.length) {
    problems.push(`direction counts (${longer}+${shorter}+${same}) do not sum to ${impacts.length} rows`);
  }
  if (intervalChanged.length !== impacts.filter((r) => r.legacy.interval_days !== r.proposed.interval_days).length) {
    problems.push('interval direction disagrees with the interval delta');
  }
  const inconsistent = impacts.filter(
    (r) => r.proposed.interval_days !== LEGACY_ACCOUNT_INTERVAL_DAYS[r.proposed.account_type]
  );
  if (inconsistent.length > 0) {
    problems.push(
      `${inconsistent.length} rows where the v1 policy interval disagrees with its own account-type interval`
    );
  }
  const unaccounted = impacts.filter((r) => !r.role || !r.legacy.policy || !r.proposed.policy);
  if (unaccounted.length > 0) problems.push(`${unaccounted.length} rows missing a role or a policy snapshot`);
  const duplicateIds = [...new Set(impacts.map((r) => r.id))].length !== impacts.length;
  if (duplicateIds) problems.push('duplicate company ids in corpus');

  return {
    generated_at: now.toISOString(),
    source: opts.source,
    active_policy: ACTIVE_REORDER_POLICY,
    proposed_policy: REVIEWED_ALTERNATIVE_POLICY,
    counts: {
      rows_in: rows.length,
      interval_changed: intervalChanged.length,
      longer,
      shorter,
      same,
      explicit_new,
      named_fallback,
      legacy_equivalent,
      tier_changed: impacts.filter((r) => r.tier_changed).length,
      due_changed: impacts.filter((r) => r.due_changed).length,
      due_pinned_by_persisted_value: impacts.filter((r) => r.legacy.due_source === 'persisted').length,
      proposed_longer_but_due_unreachable: impacts.filter(
        (r) => r.interval_direction === 'longer' && !r.due_date_reachable
      ).length,
    },
    reconciliation: { ok: problems.length === 0, problems },
    rows: impacts,
  };
}

const BASIS_LABEL: Record<string, string> = {
  legacy_equivalent: 'explicit (matches legacy timing)',
  explicit_new: 'explicit (newly stated)',
  named_fallback: 'NAMED FALLBACK (no evidence)',
  legacy: 'legacy policy',
};

export function renderPolicyImpactMarkdown(report: PolicyImpactReport): string {
  const { counts, reconciliation } = report;
  const L: string[] = [];
  L.push('# Reorder policy impact report (read-only)');
  L.push('');
  L.push(`- Generated: ${report.generated_at}`);
  L.push(`- Corpus: ${report.source}`);
  L.push(`- ACTIVE policy: **${report.active_policy}** (production timing unchanged)`);
  L.push(`- REVIEWED alternative: **${report.proposed_policy}** (not active)`);
  L.push(`- Rows in: ${counts.rows_in}`);
  L.push(`- Reconciliation: ${reconciliation.ok ? 'OK' : 'FAILED'}`);
  for (const p of reconciliation.problems) L.push(`  - problem: ${p}`);
  L.push('');
  L.push('## Headline');
  L.push('');
  L.push(`- Accounts whose stated reorder interval would change: **${counts.interval_changed}**`);
  L.push(`- Of those, LONGER interval: **${counts.longer}**, shorter: ${counts.shorter}`);
  L.push(`- Tier (retention status) changes: **${counts.tier_changed}**`);
  L.push(`- Due-date changes: **${counts.due_changed}**`);
  L.push(`- Accounts whose due date is pinned by a persisted next_touch_due, so a policy change cannot move it: ${counts.due_pinned_by_persisted_value}`);
  L.push(`- Among the LONGER rows, ${counts.proposed_longer_but_due_unreachable} have a pinned due date, so the longer interval does not reach a due date today`);
  L.push('');
  L.push('## Where the proposed intervals come from');
  L.push('');
  L.push(`- explicit, matches legacy timing: ${counts.legacy_equivalent}`);
  L.push(`- explicit, newly stated (was 60 days only via the generic fallback): ${counts.explicit_new}`);
  L.push(`- NAMED FALLBACK, no timing evidence: ${counts.named_fallback}`);
  L.push('');

  const affected = report.rows.filter((r) => r.interval_direction !== 'same');
  L.push(`## All ${affected.length} affected accounts`);
  L.push('');
  const ordered = [...affected].sort((a, b) => Math.abs(b.interval_delta_days) - Math.abs(a.interval_delta_days) || a.name.localeCompare(b.name));
  let n = 0;
  for (const r of ordered) {
    n += 1;
    const dir = r.interval_direction === 'longer' ? 'LONGER' : 'SHORTER';
    L.push(`${n}. **${r.name}** [${r.id}] — ${dir} by ${Math.abs(r.interval_delta_days)}d`);
    L.push(`   - role: ${r.role} (${r.role_reason_code}) · status: ${r.status}`);
    L.push(`   - interval: ${r.legacy.interval_days}d (${r.legacy.account_type}, ${BASIS_LABEL[r.legacy.basis]}) → ${r.proposed.interval_days}d (${r.proposed.account_type}, ${BASIS_LABEL[r.proposed.basis]})`);
    L.push(`   - effective cadence: ${r.legacy.effective_interval_days}d → ${r.proposed.effective_interval_days}d (tier cap applies)`);
    L.push(`   - tier: ${r.legacy.tier} (${r.legacy.score}) → ${r.proposed.tier} (${r.proposed.score})${r.tier_changed ? ' **STATUS CHANGES**' : ''}`);
    L.push(`   - due: ${r.legacy.due} → ${r.proposed.due} (${r.due_changed ? `${r.due_delta_days > 0 ? '+' : ''}${r.due_delta_days}d CHANGE` : 'no change'})${r.legacy.due_source === 'persisted' ? ' · pinned by persisted next_touch_due' : ''}`);
    if (r.proposed.basis === 'named_fallback') {
      L.push('   - NOTE: this account has no role evidence, so its 60 days is a named fallback rather than a computed cadence.');
    }
  }

  const tierChanged = report.rows.filter((r) => r.tier_changed);
  L.push('');
  L.push(`## Retention status changes (${tierChanged.length})`);
  L.push('');
  if (tierChanged.length === 0) {
    L.push('None. No account moves between healthy/watch/at-risk/dormant under the proposed policy.');
  } else {
    for (const r of tierChanged) {
      L.push(`- ${r.name} [${r.id}] ${r.legacy.tier} (${r.legacy.score}) → ${r.proposed.tier} (${r.proposed.score})`);
    }
  }

  const unchanged = report.rows.filter((r) => r.interval_direction === 'same');
  L.push('');
  L.push(`## Unaffected accounts (${unchanged.length})`);
  L.push('');
  L.push('Interval, tier, and due date are identical under both policies. Not listed individually.');
  L.push('');
  return L.join('\n');
}
