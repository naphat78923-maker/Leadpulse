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

export interface ArchetypeEvidenceRow {
  company_id: string;
  name: string;
  status: string;
  role: CompanyRole;
  won_deals: number;
  won_value: number;
  positive_outcomes: number;
  negative_outcomes: number;
  no_response_outcomes: number;
  order_events: number;
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
    positive_outcomes: number;
    negative_outcomes: number;
    no_response_outcomes: number;
    order_events: number;
  };
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

  const counts = {
    matched_accounts: matched.length,
    buying_accounts: buyers.length,
    won_accounts: won.length,
    order_event_only_accounts: buyers.length - won.length,
    won_value: won.reduce((s, r) => s + (r.won_value || 0), 0),
    positive_outcomes: matched.reduce((s, r) => s + r.positive_outcomes, 0),
    negative_outcomes: matched.reduce((s, r) => s + r.negative_outcomes, 0),
    no_response_outcomes: matched.reduce((s, r) => s + r.no_response_outcomes, 0),
    order_events: matched.reduce((s, r) => s + r.order_events, 0),
  };

  const problems: string[] = [];
  if (counts.buying_accounts < req.min_buying_accounts) {
    problems.push(
      `needs ${req.min_buying_accounts} proven buying accounts, found ${counts.buying_accounts}`
    );
  }
  const notes: string[] = [];
  if (counts.won_accounts === 0 && counts.buying_accounts > 0) {
    notes.push(
      `buying evidence rests on order history only (${counts.order_event_only_accounts} accounts) with no closed_won deal recorded: a CRM record gap, not a demand gap`
    );
  }
  if (counts.positive_outcomes < req.min_positive_outcomes) {
    problems.push(
      `needs ${req.min_positive_outcomes} positive logged outcomes, found ${counts.positive_outcomes}`
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
    met: counts.buying_accounts >= req.min_buying_accounts && counts.positive_outcomes >= req.min_positive_outcomes,
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
  };
}

export function renderArchetypeEvidenceMarkdown(report: ArchetypeEvidenceReport): string {
  const L: string[] = [];
  L.push('# Campaign archetype evidence report (read-only)');
  L.push('');
  L.push(`- Generated: ${report.generated_at}`);
  L.push(`- Corpus: ${report.source}`);
  L.push(`- Accounts evaluated: ${report.corpus.accounts} (with a won deal: ${report.corpus.won_accounts_total})`);
  L.push(`- Archetypes: ${report.reconciliation.published} (unsupported: ${report.reconciliation.unsupported})`);
  L.push(`- Reconciliation: ${report.reconciliation.ok ? 'OK' : 'FAILED'}`);
  for (const p of report.reconciliation.problems) L.push(`  - problem: ${p}`);
  L.push('');
  L.push('This report contains live customer names and is gitignored by design. The committed archetype definitions carry no account names.');
  L.push('');

  for (const a of report.archetypes) {
    L.push(`## ${a.name}`);
    L.push('');
    L.push(`- id: \`${a.archetype_id}\`  ·  taxonomy: ${a.taxonomy_version}  ·  default role: ${a.vertical_role}`);
    L.push(`- supported: **${a.met ? 'yes' : 'NO'}**  ·  evidence strength: ${a.strength} (expected ${a.requirement.strength_expectation})`);
    L.push(
      `- matched accounts: ${a.counts.matched_accounts}  ·  proven buyers: ${a.counts.buying_accounts} (won deal: ${a.counts.won_accounts}, order history only: ${a.counts.order_event_only_accounts})  ·  recorded won value: ${a.counts.won_value}`
    );
    L.push(`- logged outcomes: ${a.counts.positive_outcomes} positive / ${a.counts.negative_outcomes} negative / ${a.counts.no_response_outcomes} no response`);
    L.push(`- order events: ${a.counts.order_events}`);
    L.push(`- requirement: >=${a.requirement.min_buying_accounts} proven buyers and >=${a.requirement.min_positive_outcomes} positive outcomes — ${a.requirement.basis}`);
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
  }
  L.push('');
  L.push('## Role coverage across the corpus (why some archetypes are NOT published)');
  L.push('');
  L.push('A role with accounts but no proven buyer cannot support a pain statement yet.');
  L.push('');
  for (const rc of [...report.role_coverage].sort((a, b) => b.accounts - a.accounts)) {
    const flag = rc.buying_accounts === 0 ? '  <-- no proven buyer: no archetype published' : '';
    L.push(
      `- ${rc.role}: ${rc.accounts} accounts, ${rc.buying_accounts} proven buyers (${rc.won_accounts} with a won deal)${flag}`
    );
  }
  L.push('');
  return L.join('\n');
}
