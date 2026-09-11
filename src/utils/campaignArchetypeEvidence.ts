// ─── LeadPulse Intelligence — Slice 1: archetype evidence evaluation (pure) ───
//
// Archetypes are only publishable while real accounts still support them. This
// evaluates each archetype against the live corpus and refuses to call one
// supported unless its own declared requirement is met.

import { COMPANY_ROLES, type CompanyRole } from './companyRole.ts';
import {
  CAMPAIGN_ARCHETYPES_V1,
  CONSIDERED_NOT_PUBLISHED_V1,
  type CampaignArchetype,
  type ArchetypeEvidenceRequirement,
} from './campaignArchetypes.ts';

export type EvidenceStrength = 'well_evidenced' | 'emerging' | 'single_account' | 'unsupported';

/**
 * Evidence tiers are kept apart because they prove different things:
 *   - internal workflow rows prove nothing about the customer (nudges, system rewards)
 *   - outbound contacts prove we reached out, not that anyone answered
 *   - inbound contact is the only strictly verifiable response record
 *   - a recorded outcome on a customer-facing contact is the operator's judgement of it
 * Blending them is how "nudge sent" ended up counted as engagement.
 */
export interface ArchetypeEvidenceRow {
  company_id: string;
  name: string;
  status: string;
  role: CompanyRole;
  won_deals: number;
  won_value: number;
  order_events: number;
  /** internal workflow rows (nudges, system reward draws) */
  internal_activity: number;
  /** outbound contacts sent to the customer: activity, not a response */
  customer_facing_activity: number;
  /** customer-initiated contact: the only strictly verifiable response */
  inbound_responses: number;
  /** customer-facing contacts the operator recorded as a positive outcome */
  positive_contact_outcomes: number;
  neutral_contact_outcomes: number;
  negative_contact_outcomes: number;
  /** 'no_response' recorded against customer-facing contacts (a real silence signal) */
  customer_facing_no_response: number;
  /** 'no_response' recorded against internal rows (system state, not customer silence) */
  internal_no_response: number;
}

export interface ArchetypeEvidenceResult {
  archetype_id: string;
  name: string;
  taxonomy_version: string;
  vertical_role: CompanyRole;
  met: boolean;
  /** computed from the evidence, not asserted by the archetype author */
  strength: EvidenceStrength;
  counts: {
    matched_accounts: number;
    /** accounts with a won deal OR recorded order history */
    buying_accounts: number;
    /** of the buyers, how many have a closed_won deal on record */
    won_accounts: number;
    /** buyers whose proof is order history only (no won deal recorded) */
    order_event_only_accounts: number;
    won_value: number;
    /** internal workflow rows, excluded from engagement evidence */
    internal_activity: number;
    /** outbound contacts sent */
    customer_facing_activity: number;
    /** customer-initiated contact */
    inbound_responses: number;
    /** the figure the evidence bar is measured against */
    positive_contact_outcomes: number;
    neutral_contact_outcomes: number;
    negative_contact_outcomes: number;
    customer_facing_no_response: number;
    /** silence labels that were never about the customer */
    internal_no_response: number;
    order_events: number;
  };
  /** true when this archetype is publishable on the current corpus */
  meets_bar: boolean;
  requirement: ArchetypeEvidenceRequirement;
  /** advisory caveats: worth reading, not grounds for failing the archetype */
  notes: string[];
  /** named accounts, returned for the report only (never committed) */
  supporting_accounts: { company_id: string; name: string; status: string; won_deals: number; won_value: number; order_events: number }[];
  problems: string[];
}

export interface RoleCoverage {
  role: CompanyRole;
  accounts: number;
  buying_accounts: number;
  won_accounts: number;
}

export interface ArchetypeEvidenceReport {
  generated_at: string;
  source: string;
  corpus: { accounts: number; won_accounts_total: number };
  /** per-role account and won-account counts, so unpublishable roles are visible */
  role_coverage: RoleCoverage[];
  archetypes: ArchetypeEvidenceResult[];
  reconciliation: { ok: boolean; problems: string[]; published: number; unsupported: number };
  /** archetypes that fail their own bar and must not be used as published guidance */
  withheld: { archetype_id: string; name: string; reason: string }[];
}

function strengthFrom(wonAccounts: number, requirement: ArchetypeEvidenceRequirement): EvidenceStrength {
  if (wonAccounts === 0) return 'unsupported';
  if (wonAccounts >= 3) return 'well_evidenced';
  if (wonAccounts === 2) return 'emerging';
  return 'single_account';
}

export function evaluateArchetype(archetype: CampaignArchetype, rows: ArchetypeEvidenceRow[]): ArchetypeEvidenceResult {
  const req = archetype.evidence_requirement;
  const matched = rows.filter((r) => req.roles_covered.includes(r.role));
  const buyers = matched.filter((r) => r.won_deals > 0 || r.order_events > 0);
  const won = buyers.filter((r) => r.won_deals > 0);

  const sum = (pick: (r: ArchetypeEvidenceRow) => number) => matched.reduce((s, r) => s + (pick(r) || 0), 0);
  const counts = {
    matched_accounts: matched.length,
    buying_accounts: buyers.length,
    won_accounts: won.length,
    order_event_only_accounts: buyers.length - won.length,
    won_value: won.reduce((s, r) => s + (r.won_value || 0), 0),
    internal_activity: sum((r) => r.internal_activity),
    customer_facing_activity: sum((r) => r.customer_facing_activity),
    inbound_responses: sum((r) => r.inbound_responses),
    positive_contact_outcomes: sum((r) => r.positive_contact_outcomes),
    neutral_contact_outcomes: sum((r) => r.neutral_contact_outcomes),
    negative_contact_outcomes: sum((r) => r.negative_contact_outcomes),
    customer_facing_no_response: sum((r) => r.customer_facing_no_response),
    internal_no_response: sum((r) => r.internal_no_response),
    order_events: sum((r) => r.order_events),
  };

  const problems: string[] = [];
  if (counts.buying_accounts < req.min_buying_accounts) {
    problems.push(
      `needs ${req.min_buying_accounts} accounts with buying evidence, found ${counts.buying_accounts}`
    );
  }
  const notes: string[] = [];
  if (counts.internal_activity > 0) {
    notes.push(
      `${counts.internal_activity} internal workflow row(s) excluded from engagement evidence; ${counts.internal_no_response} of them carried a "no_response" label that was never about the customer`
    );
  }
  if (counts.inbound_responses === 0 && counts.customer_facing_activity > 0) {
    notes.push(
      `no customer-initiated response is recorded for this role, so the positive figure counts operator-recorded contact outcomes rather than confirmed replies`
    );
  } else if (counts.inbound_responses > 0) {
    notes.push(`${counts.inbound_responses} customer-initiated response(s) recorded`);
  }
  if (counts.won_accounts === 0 && counts.buying_accounts > 0) {
    notes.push(
      `buying evidence rests on order history only (${counts.order_event_only_accounts} accounts) with no closed_won deal recorded: a CRM record gap, not a demand gap`
    );
  }
  if (counts.positive_contact_outcomes < req.min_positive_contact_outcomes) {
    problems.push(
      `needs ${req.min_positive_contact_outcomes} customer-facing contacts with a recorded positive outcome, found ${counts.positive_contact_outcomes}` +
        (counts.internal_activity > 0 ? ` (${counts.internal_activity} internal workflow rows were counted in the previous version and are now excluded)` : '')
    );
  }
  if (!archetype.taxonomy_version) problems.push('archetype carries no taxonomy_version');

  const strength = strengthFrom(counts.buying_accounts, req);
  if (req.strength_expectation === 'single_account' && counts.buying_accounts > 1) {
    problems.push(
      `archetype expects single-account evidence but the corpus now shows ${counts.buying_accounts} buying accounts; revisit the pain statement and raise the requirement`
    );
  }
  if (
    req.strength_expectation === 'well_evidenced' &&
    (strength === 'single_account' || strength === 'unsupported')
  ) {
    problems.push(`archetype expects well-evidenced support but the corpus shows only ${counts.buying_accounts} buying account(s)`);
  }

  return {
    archetype_id: archetype.id,
    name: archetype.name,
    taxonomy_version: archetype.taxonomy_version,
    vertical_role: archetype.vertical_role,
    met: counts.buying_accounts >= req.min_buying_accounts && counts.positive_contact_outcomes >= req.min_positive_contact_outcomes,
    meets_bar:
      counts.buying_accounts >= req.min_buying_accounts &&
      counts.positive_contact_outcomes >= req.min_positive_contact_outcomes,
    strength,
    counts,
    requirement: req,
    notes,
    supporting_accounts: buyers
      .map((r) => ({
        company_id: r.company_id,
        name: r.name,
        status: r.status,
        won_deals: r.won_deals,
        won_value: r.won_value,
        order_events: r.order_events,
      }))
      .sort((a, b) => b.won_value - a.won_value || b.order_events - a.order_events),
    problems,
  };
}

export function buildArchetypeEvidenceReport(
  rows: ArchetypeEvidenceRow[],
  opts: { source: string; now?: Date; archetypes?: CampaignArchetype[] }
): ArchetypeEvidenceReport {
  const archetypes = opts.archetypes ?? CAMPAIGN_ARCHETYPES_V1;
  const results = archetypes.map((a) => evaluateArchetype(a, rows));

  const problems: string[] = [];
  const unsupported = results.filter((r) => !r.met);
  if (unsupported.length > 0) {
    for (const r of unsupported) {
      problems.push(`archetype "${r.archetype_id}" is not supported by the current corpus: ${r.problems.join('; ')}`);
    }
  }
  const duplicateIds = new Set(results.map((r) => r.archetype_id)).size !== results.length;
  if (duplicateIds) problems.push('duplicate archetype ids');
  const missingVersion = results.filter((r) => !r.taxonomy_version);
  if (missingVersion.length > 0) problems.push(`${missingVersion.length} archetypes carry no taxonomy_version`);
  const extraProblems = results.flatMap((r) => r.problems.filter((p) => !p.startsWith('needs ')));
  problems.push(...extraProblems);

  const roleCoverage: RoleCoverage[] = COMPANY_ROLES.map((role) => {
    const inRole = rows.filter((r) => r.role === role);
    return {
      role,
      accounts: inRole.length,
      buying_accounts: inRole.filter((r) => r.won_deals > 0 || r.order_events > 0).length,
      won_accounts: inRole.filter((r) => r.won_deals > 0).length,
    };
  }).filter((r) => r.accounts > 0);

  return {
    generated_at: (opts.now ?? new Date()).toISOString(),
    source: opts.source,
    corpus: { accounts: rows.length, won_accounts_total: rows.filter((r) => r.won_deals > 0).length },
    role_coverage: roleCoverage,
    archetypes: results,
    reconciliation: {
      ok: problems.length === 0,
      problems,
      published: results.length,
      unsupported: unsupported.length,
    },
    withheld: unsupported.map((r) => ({
      archetype_id: r.archetype_id,
      name: r.name,
      reason: r.problems.join('; ') || 'below its declared evidence bar',
    })),
  };
}

export function renderArchetypeEvidenceMarkdown(report: ArchetypeEvidenceReport): string {
  const L: string[] = [];
  L.push('# Campaign archetype evidence report (read-only)');
  L.push('');
  L.push(`- Generated: ${report.generated_at}`);
  L.push(`- Corpus: ${report.source}`);
  L.push(`- Accounts evaluated: ${report.corpus.accounts} (with a won deal: ${report.corpus.won_accounts_total})`);
  L.push(`- Archetypes published: ${report.reconciliation.published}`);
  L.push(
    `- Archetypes MEETING their evidence bar: ${report.reconciliation.published - report.reconciliation.unsupported} of ${report.reconciliation.published}`
  );
  if (report.withheld.length === 0) {
    L.push('- Must be withheld: none');
  } else {
    for (const w of report.withheld) L.push(`- MUST BE WITHHELD: ${w.archetype_id} — ${w.reason}`);
  }
  L.push(`- Reconciliation: ${report.reconciliation.ok ? 'OK' : 'FAILED (see problems below)'}`);
  for (const p of report.reconciliation.problems) L.push(`  - problem: ${p}`);
  L.push('');
  L.push('This report contains live customer names and is gitignored by design. The committed archetype definitions carry no account names.');
  L.push('');

  for (const a of report.archetypes) {
    L.push(`## ${a.name}`);
    L.push('');
    L.push(`- id: \`${a.archetype_id}\`  ·  taxonomy: ${a.taxonomy_version}  ·  default role: ${a.vertical_role}`);
    L.push(`- meets its evidence bar: **${a.meets_bar ? 'yes' : 'NO'}**  ·  evidence strength: ${a.strength} (expected ${a.requirement.strength_expectation})`);
    L.push(
      `- matched accounts: ${a.counts.matched_accounts}  ·  accounts with buying evidence: ${a.counts.buying_accounts} (won deal: ${a.counts.won_accounts}, order history only: ${a.counts.order_event_only_accounts})  ·  recorded won value: ${a.counts.won_value}`
    );
    L.push('- evidence tiers, deliberately NOT blended:');
    L.push(`  - customer-facing activity (outbound contacts sent): ${a.counts.customer_facing_activity}`);
    L.push(
      `  - recorded customer-facing outcomes: ${a.counts.positive_contact_outcomes} positive / ${a.counts.neutral_contact_outcomes} neutral / ${a.counts.negative_contact_outcomes} negative`
    );
    L.push(`  - customer-initiated responses (strict): ${a.counts.inbound_responses}`);
    L.push(
      `  - internal workflow activity (excluded from evidence): ${a.counts.internal_activity}, of which ${a.counts.internal_no_response} carried a "no_response" label`
    );
    L.push(`  - customer-facing no-response labels: ${a.counts.customer_facing_no_response}`);
    L.push(`- order events (revenue evidence): ${a.counts.order_events}`);
    L.push(
      `- requirement: >=${a.requirement.min_buying_accounts} accounts with buying evidence and >=${a.requirement.min_positive_contact_outcomes} positive customer-facing outcomes — ${a.requirement.basis}`
    );
    if (a.supporting_accounts.length === 0) {
      L.push('- supported by: NOTHING. This archetype has no account evidence and must not be published.');
    } else {
      L.push('- supported by:');
      for (const s of a.supporting_accounts) {
        L.push(`  - ${s.name} [${s.company_id}] status=${s.status} won_deals=${s.won_deals} won_value=${s.won_value} order_events=${s.order_events}`);
      }
    }
    for (const p of a.problems) L.push(`- PROBLEM: ${p}`);
    for (const n of a.notes) L.push(`- note: ${n}`);
    L.push('');
  }

  L.push('## Considered and deliberately NOT published');
  L.push('');
  L.push('These were assessed against the same bar as the published archetypes and rejected on evidence.');
  L.push('');
  for (const c of CONSIDERED_NOT_PUBLISHED_V1) {
    L.push(`- **${c.name}** (roles: ${c.roles.join(', ')})`);
    L.push(`  - ${c.reason}`);
    if (c.unmet_requirement) L.push(`  - ${c.unmet_requirement}`);
    if (c.untested_hypothesis) {
      L.push(`  - untested hypothesis, preserved: "${c.untested_hypothesis.pain}"`);
      L.push(`  - offer angle if ever supported: ${c.untested_hypothesis.offer_angle}`);
      L.push(`  - criteria: ${c.untested_hypothesis.criteria.join('; ')}`);
    }
  }
  L.push('');
  L.push('## Role coverage across the corpus (why some archetypes are NOT published)');
  L.push('');
  L.push('A role with accounts but no buying evidence cannot support a pain statement yet.');
  L.push('');
  for (const rc of [...report.role_coverage].sort((a, b) => b.accounts - a.accounts)) {
    const flag = rc.buying_accounts === 0 ? '  <-- no buying evidence: no archetype published' : '';
    const inferred = rc.buying_accounts - rc.won_accounts;
    L.push(
      `- ${rc.role}: ${rc.accounts} accounts, ${rc.buying_accounts} with buying evidence ` +
        `(${rc.won_accounts} confirmed by a won deal, ${inferred} inferred from order history)${flag}`
    );
  }
  L.push('');
  return L.join('\n');
}
