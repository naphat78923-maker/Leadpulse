// ─── LeadPulse Intelligence — Prospect Review: shared, pure helpers ───
//
// This module is the ONLY place the Prospect Review screen derives its data.
// It deliberately mirrors scripts/prospect-fit-report.ts (the CLI) row-for-row, so
// the screen and the report cannot disagree about who is a candidate.
//
// Two rules this file exists to enforce:
//   1. Nothing here hardcodes a count, a name, or a pilot finding. Everything is
//      computed from live CRM rows handed in by the caller.
//   2. Dimensions that have NO approved structured source are reported as
//      "not assessed", never as a fact. The local markdown pilot produced richer
//      dimensions (route quality, serviceability, relationship history, blockers)
//      and those are NOT app data.

import { classifyCompanyRole, ROLE_TAXONOMY, type RoleClassification } from './companyRole.ts';
import { CAMPAIGN_ARCHETYPES_V1 } from './campaignArchetypes.ts';
import {
  buildProspectFitReport,
  type ProspectFit,
  type ProspectFitReport,
  type ProspectSourceRow,
} from './prospectFit.ts';

// ─── Minimal structural inputs (satisfied by the CRM types at the call site) ───

export interface ReviewCompany {
  id: string;
  name: string;
  status: string;
  industry: string | null;
  tags: string[] | null;
  website: string | null;
}

export interface ReviewDeal {
  company_id?: string | null;
  stage: string;
}

export interface ReviewMeeting {
  company_id?: string | null;
  outcome?: string | null;
  direction?: string | null;
}

export interface ReviewEvent {
  company_id?: string | null;
}

export interface ReviewContact {
  company_id?: string | null;
  identity_quality?: string | null;
  email?: string | null;
  phone?: string | null;
  line?: string | null;
  job_title?: string | null;
  name?: string | null;
}

export interface ProspectReviewInput {
  companies: ReviewCompany[];
  deals: ReviewDeal[];
  meetings: ReviewMeeting[];
  events: ReviewEvent[];
  contacts: ReviewContact[];
}

/**
 * Build the evaluator's input rows from live CRM data.
 * Semantics MUST stay identical to scripts/prospect-fit-report.ts:
 *   - buying evidence = a `closed_won` deal OR any account_events row
 *   - internal workflow rows (direction 'internal' or null) are never engagement
 *   - an inbound row alone is a response, but only counts as a positive outcome
 *     when the outcome is recorded as 'positive'
 *   - "named" reachability requires identity_quality === 'named'
 *   - any of email/phone/LINE counts as a route, nothing else does
 */
export function buildProspectSourceRows(input: ProspectReviewInput): ProspectSourceRow[] {
  const won = new Map<string, number>();
  for (const d of input.deals) {
    if (d.company_id && d.stage === 'closed_won') won.set(d.company_id, (won.get(d.company_id) ?? 0) + 1);
  }

  const events = new Map<string, number>();
  for (const e of input.events) {
    if (e.company_id) events.set(e.company_id, (events.get(e.company_id) ?? 0) + 1);
  }

  interface Agg {
    meetings: number;
    internal_activity: number;
    customer_facing_activity: number;
    inbound_responses: number;
    positive_contact_outcomes: number;
  }
  const agg = new Map<string, Agg>();
  for (const m of input.meetings) {
    if (!m.company_id) continue;
    const a =
      agg.get(m.company_id) ??
      { meetings: 0, internal_activity: 0, customer_facing_activity: 0, inbound_responses: 0, positive_contact_outcomes: 0 };
    a.meetings += 1;
    if (m.direction === 'internal' || m.direction == null) {
      a.internal_activity += 1;
    } else {
      a.customer_facing_activity += 1;
      if (m.direction === 'inbound') a.inbound_responses += 1;
      if (m.outcome === 'positive') a.positive_contact_outcomes += 1;
    }
    agg.set(m.company_id, a);
  }

  const contacts = new Map<string, { named: number; route: number }>();
  for (const c of input.contacts) {
    if (!c.company_id) continue;
    const cur = contacts.get(c.company_id) ?? { named: 0, route: 0 };
    if (c.identity_quality === 'named') cur.named += 1;
    if (c.email || c.phone || c.line) cur.route += 1;
    contacts.set(c.company_id, cur);
  }

  return input.companies.map((c) => {
    const a = agg.get(c.id);
    const ct = contacts.get(c.id);
    return {
      company_id: c.id,
      name: c.name,
      status: c.status,
      industry: c.industry,
      tags: c.tags,
      website: c.website,
      won_deals: won.get(c.id) ?? 0,
      order_events: events.get(c.id) ?? 0,
      meetings: a?.meetings ?? 0,
      internal_activity: a?.internal_activity ?? 0,
      customer_facing_activity: a?.customer_facing_activity ?? 0,
      inbound_responses: a?.inbound_responses ?? 0,
      positive_contact_outcomes: a?.positive_contact_outcomes ?? 0,
      contact_named: ct?.named ?? 0,
      contact_any_route: ct?.route ?? 0,
    };
  });
}

/** Run the shared evaluator over live CRM data. Read-only: creates nothing. */
export function buildProspectReview(input: ProspectReviewInput, opts?: { now?: Date }): ProspectFitReport {
  return buildProspectFitReport(buildProspectSourceRows(input), {
    source: 'live CRM via the app (companies, deals, meetings, account_events, contacts)',
    now: opts?.now,
  });
}

/** Human-readable label for a role, from the taxonomy itself (never a local copy). */
export function roleLabel(role: ProspectFit['role']): string {
  return ROLE_TAXONOMY[role]?.label ?? String(role);
}

/**
 * The short segment form of a role, taken from the same taxonomy entry as `roleLabel`.
 * This exists so a list row can say "Retail" without restating the whole role, and it
 * is deliberately derived rather than re-classified: one classifier, one taxonomy.
 */
export function segmentForRole(role: ProspectFit['role']): string {
  return ROLE_TAXONOMY[role]?.segment ?? String(role);
}

export interface SegmentOption {
  /** the human label; the taxonomy has no separate id vocabulary for segments */
  id: string;
  label: string;
  count: number;
}

/**
 * The segments actually present in a candidate set, in taxonomy order.
 *
 * A segment that no candidate carries is not offered, because an empty filter option
 * reads as "these exist and match nothing" when the truth is "none were found".
 */
export function segmentOptions(fits: ProspectFit[]): SegmentOption[] {
  const counts = new Map<string, number>();
  for (const f of fits) {
    const label = segmentForRole(f.role);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const ordered: SegmentOption[] = [];
  const seen = new Set<string>();
  for (const role of Object.keys(ROLE_TAXONOMY) as (keyof typeof ROLE_TAXONOMY)[]) {
    const label = ROLE_TAXONOMY[role].segment;
    if (seen.has(label) || !counts.has(label)) continue;
    seen.add(label);
    ordered.push({ id: label, label, count: counts.get(label) ?? 0 });
  }
  // A role outside the taxonomy would still be shown rather than silently hidden.
  for (const [label, count] of counts) {
    if (!seen.has(label)) ordered.push({ id: label, label, count });
  }
  return ordered;
}

/** Every published archetype, for the filter control. Sourced, never hardcoded. */
export function archetypeOptions(): { id: string; name: string }[] {
  return CAMPAIGN_ARCHETYPES_V1.map((a) => ({ id: a.id, name: a.name }));
}

/**
 * The classifier's full explanation for one candidate. Recomputed here rather than
 * copied into the fit record, so the expandable view shows the SAME deterministic
 * classification the candidate list was built from.
 */
export function classificationFor(fit: ProspectFit, rows: ProspectSourceRow[]): RoleClassification | null {
  const row = rows.find((r) => r.company_id === fit.company_id);
  if (!row) return null;
  return classifyCompanyRole({ name: row.name, industry: row.industry, tags: row.tags });
}

export interface ProspectFilters {
  query?: string;
  archetypeId?: string | null;
  reachability?: string | null;
  /** short segment label (see `segmentForRole`); null/absent means no constraint */
  segment?: string | null;
}

/** Filter candidates. Empty/absent filters mean "no constraint", not "none". */
export function filterProspects(fits: ProspectFit[], filters: ProspectFilters): ProspectFit[] {
  const q = (filters.query ?? '').trim().toLowerCase();
  return fits.filter((f) => {
    if (filters.archetypeId && f.archetype_id !== filters.archetypeId) return false;
    if (filters.reachability && f.reachability !== filters.reachability) return false;
    if (filters.segment && segmentForRole(f.role) !== filters.segment) return false;
    if (!q) return true;
    const haystack = `${f.name} ${f.role} ${f.archetype_name} ${f.signal_hits.join(' ')}`.toLowerCase();
    return haystack.includes(q);
  });
}

export interface ContactAvailability {
  named: number;
  routeOnly: number;
  none: number;
  total: number;
}

/** Contact availability per company, derived from the contacts table only. */
export function contactAvailability(contacts: ReviewContact[]): Map<string, ContactAvailability> {
  const map = new Map<string, ContactAvailability>();
  for (const c of contacts) {
    if (!c.company_id) continue;
    const cur = map.get(c.company_id) ?? { named: 0, routeOnly: 0, none: 0, total: 0 };
    cur.total += 1;
    const hasRoute = Boolean(c.email || c.phone || c.line);
    if (c.identity_quality === 'named') cur.named += 1;
    else if (hasRoute) cur.routeOnly += 1;
    else cur.none += 1;
    map.set(c.company_id, cur);
  }
  return map;
}

export type DimensionState = 'not_assessed' | 'not_started' | 'not_authorised';

export interface ReviewDimension {
  key: string;
  label: string;
  state: DimensionState;
  /** where the state comes from — shown to the reader so nothing looks like app data */
  source: string;
}

/**
 * The three readiness dimensions, kept VISIBLY SEPARATE and all reported as
 * un-assessed here. None of them has an approved structured source in this app, so
 * the screen must not imply otherwise. The local pilot assessed some of these in
 * markdown, which is deliberately NOT promoted into app data.
 */
export const READINESS_DIMENSIONS: ReviewDimension[] = [
  {
    key: 'serviceability',
    label: 'Serviceability',
    state: 'not_assessed',
    source: 'not assessed in this app: delivery coverage and terms are confirmed per account manually',
  },
  {
    key: 'sales_qualification',
    label: 'Sales qualification',
    state: 'not_started',
    source: 'not started: needs contact or CRM-internal knowledge, and is not a discovery gate',
  },
  {
    key: 'outreach_authorisation',
    label: 'Outreach authorisation',
    state: 'not_authorised',
    source: 'not authorised: each account needs explicit approval before any message',
  },
];
