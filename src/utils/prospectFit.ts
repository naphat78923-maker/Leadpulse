// ─── LeadPulse Intelligence — Slice 2: read-only prospect candidates ───
//
// Produces the CANDIDATE SET for the review queue: accounts that pass the
// deterministic pre-gates and are therefore eligible for a Laya fit judgment.
// It creates nothing: no prospect record, no deal, no contact, no send.
//
// What is decided in code, and what is deliberately left to the model:
//   - CODE (here): membership. An account is a candidate when it has no buying
//     evidence, has prospect status, and does not head an institutional
//     identity (isInstitutionalIndustry). A school is excluded BEFORE any
//     inference pass, so it can never waste a model call or have to be talked
//     out of a bakery archetype.
//   - MODEL (in the app, on explicit press): archetype fit itself, via the
//     frozen archetype_select + role_support questions. Judgment results enter
//     through judgmentFromAnswers and are ordered by orderCandidates. Nothing
//     in this file scores anything — the legacy recipe (role regex → keyword
//     signals → arithmetic score) is retired, not reimplemented.
//
// Two invariants survive the migration:
//   1. every input row is accounted for exactly once — a candidate or an
//      explained exclusion, never silently dropped
//   2. no suppression list exists yet (slice 5) and no contact is verified here,
//      so this list is a candidate set, not an outbound queue

import { isInstitutionalIndustry } from './companyRole.ts';
import { CAMPAIGN_ARCHETYPES_V1, type CampaignArchetype } from './campaignArchetypes.ts';
import type { LayaArchetypeChoice, LayaFitAnswers } from './laya-buyer-response.ts';

export type Reachability = 'named_contact' | 'route_only' | 'none';

export interface ProspectSourceRow {
  company_id: string;
  name: string;
  status: string;
  industry: string | null;
  tags: string[] | null;
  website: string | null;
  won_deals: number;
  order_events: number;
  internal_activity: number;
  customer_facing_activity: number;
  inbound_responses: number;
  positive_contact_outcomes: number;
  meetings: number;
  /** contacts whose identity_quality is 'named' */
  contact_named: number;
  /** contacts carrying at least one usable route (email, phone, or LINE) */
  contact_any_route: number;
}

/**
 * One account that passed every deterministic pre-gate: a candidate awaiting a
 * Laya fit judgment (or already judged this session). Carries only row facts —
 * no score, no role, no archetype: those come from the model on explicit press.
 */
export interface ProspectCandidate {
  company_id: string;
  name: string;
  industry: string | null;
  tags: string[] | null;
  website: string | null;
  reachability: Reachability;
  already_touched: boolean;
  /** deterministic gaps from row facts alone (route, website) — never a score */
  gaps: string[];
}

/**
 * One validated Laya fit judgment for this session. Session-only: nothing here
 * is persisted, so a reload returns every candidate to "not judged" until
 * judged again. Advisory like every other Laya surface — never a qualification.
 */
export interface ProspectJudgment {
  company_id: string;
  /** the model's archetype_select choice, including 'no_fit' */
  archetype_id: LayaArchetypeChoice;
  /** display name of the archetype; null when the choice is no_fit */
  archetype_name: string | null;
  archetype_confidence: number;
  /** full distribution over the frozen criteria, keyed by archetype id */
  probabilities: Record<LayaArchetypeChoice, number>;
  /** role_support noul: near 0 = identity supports the assignment, near 1 = invented */
  role_support: number;
  role_support_confidence: number;
  judged_at: string;
}

export interface ProspectCandidateReport {
  generated_at: string;
  source: string;
  taxonomy_version: string;
  published_archetypes: string[];
  corpus: {
    accounts: number;
    candidates: number;
    excluded_already_buying: number;
    excluded_not_a_prospect: number;
    excluded_institutional: number;
  };
  candidates: ProspectCandidate[];
  /** accounts excluded from candidate status, with the reason, so nothing vanishes */
  excluded: { company_id: string; name: string; reason: string }[];
  reconciliation: { ok: boolean; problems: string[] };
}

/** @deprecated old name — the report now holds candidates awaiting judgment. */
export type ProspectFitReport = ProspectCandidateReport;
/** @deprecated old row type name — a candidate carries no fit score. */
export type ProspectFit = ProspectCandidate;

function reachabilityOf(row: ProspectSourceRow): Reachability {
  if (row.contact_named > 0) return 'named_contact';
  if (row.contact_any_route > 0) return 'route_only';
  return 'none';
}

/**
 * Deterministic gaps from ROW FACTS ONLY — no role, no signal, no arithmetic.
 * The two honest unknowns a reader needs before acting on an unjudged candidate.
 */
function rowGaps(row: ProspectSourceRow): string[] {
  const gaps: string[] = [];
  if (reachabilityOf(row) === 'none') gaps.push('no contact route at all: this needs contact research before it is actionable');
  if (!row.website) gaps.push('no website on the record: personalisation context would be thin');
  return gaps;
}

/**
 * Turn one validated Laya fit run into a session judgment. The archetype name
 * comes from the published archetype list (the same source as the frozen
 * question's criteria); no_fit carries a null name so renderers must handle
 * "no fit" explicitly instead of inventing a label.
 */
export function judgmentFromAnswers(
  company_id: string,
  answers: LayaFitAnswers,
  now: Date = new Date()
): ProspectJudgment {
  const archetype_id = answers.archetype_select.choice;
  const archetype = CAMPAIGN_ARCHETYPES_V1.find((a) => a.id === archetype_id);
  return {
    company_id,
    archetype_id,
    archetype_name: archetype?.name ?? null,
    archetype_confidence: answers.archetype_select.confidence,
    probabilities: answers.archetype_select.probabilities,
    role_support: answers.role_support.noul,
    role_support_confidence: answers.role_support.confidence,
    judged_at: now.toISOString(),
  };
}

/**
 * The queue order once judgments exist: judged candidates first, ranked by
 * archetype confidence (name breaks ties), then unjudged candidates by name.
 * A candidate judged no_fit DROPS OUT of the queue with a stated reason —
 * callers get the dropped list back so the page can say what happened rather
 * than silently shrinking. The model is the only ranker; keyword order is gone.
 */
export function orderCandidates(
  candidates: ProspectCandidate[],
  judgments: Record<string, ProspectJudgment | undefined>
): { queue: ProspectCandidate[]; droppedNoFit: ProspectCandidate[] } {
  const judged: ProspectCandidate[] = [];
  const unjudged: ProspectCandidate[] = [];
  const droppedNoFit: ProspectCandidate[] = [];
  for (const c of candidates) {
    const j = judgments[c.company_id];
    if (!j) unjudged.push(c);
    else if (j.archetype_id === 'no_fit') droppedNoFit.push(c);
    else judged.push(c);
  }
  const byName = (a: ProspectCandidate, b: ProspectCandidate) => a.name.localeCompare(b.name);
  judged.sort(
    (a, b) =>
      (judgments[b.company_id]!.archetype_confidence - judgments[a.company_id]!.archetype_confidence) ||
      byName(a, b)
  );
  unjudged.sort(byName);
  droppedNoFit.sort(byName);
  return { queue: [...judged, ...unjudged], droppedNoFit };
}

/**
 * Membership only. Three deterministic pre-gates, in order:
 *   1. buying evidence (an existing customer is not a prospect)
 *   2. status must be 'prospect'
 *   3. institutional identity — a school is not a commercial account, excluded
 *      HERE so no inference pass is ever spent on it
 * Everything that passes is a candidate, name-ordered, awaiting judgment.
 * The report never scores, never classifies a role, never assigns an archetype;
 * those answers arrive per-session via judgmentFromAnswers/orderCandidates.
 */
export function buildProspectFitReport(rows: ProspectSourceRow[], opts: { source: string; now?: Date; archetypes?: CampaignArchetype[] }): ProspectCandidateReport {
  const archetypes = opts.archetypes ?? CAMPAIGN_ARCHETYPES_V1;
  const candidates: ProspectCandidate[] = [];
  const excluded: { company_id: string; name: string; reason: string }[] = [];
  let alreadyBuying = 0;
  let notAProspect = 0;
  let institutional = 0;

  for (const row of rows) {
    if (row.won_deals > 0 || row.order_events > 0) {
      alreadyBuying += 1;
      excluded.push({ company_id: row.company_id, name: row.name, reason: 'already has buying evidence: an existing customer, not a prospect' });
      continue;
    }
    if (row.status !== 'prospect') {
      notAProspect += 1;
      excluded.push({ company_id: row.company_id, name: row.name, reason: `status is "${row.status}", not a prospect` });
      continue;
    }
    if (isInstitutionalIndustry({ name: row.name, industry: row.industry, tags: row.tags })) {
      institutional += 1;
      excluded.push({
        company_id: row.company_id,
        name: row.name,
        reason: 'institutional identity: the stated industry is a school, college or similar — not a commercial account, never judged',
      });
      continue;
    }
    candidates.push({
      company_id: row.company_id,
      name: row.name,
      industry: row.industry,
      tags: row.tags,
      website: row.website,
      reachability: reachabilityOf(row),
      already_touched: row.meetings > 0,
      gaps: rowGaps(row),
    });
  }

  candidates.sort((a, b) => a.name.localeCompare(b.name));

  const problems: string[] = [];
  if (alreadyBuying + notAProspect + institutional + candidates.length !== rows.length) {
    problems.push(
      `accounting does not reconcile: ${alreadyBuying}+${notAProspect}+${institutional}+${candidates.length} vs ${rows.length} rows`
    );
  }
  if (new Set(candidates.map((c) => c.company_id)).size !== candidates.length) {
    problems.push('a company appears more than once in the candidate list');
  }
  const uncovered = rows.filter((r) => !excluded.some((e) => e.company_id === r.company_id) && !candidates.some((c) => c.company_id === r.company_id));
  if (uncovered.length > 0) problems.push(`${uncovered.length} accounts are neither candidates nor explained exclusions`);

  return {
    generated_at: (opts.now ?? new Date()).toISOString(),
    source: opts.source,
    taxonomy_version: archetypes[0]?.taxonomy_version ?? 'unknown',
    published_archetypes: archetypes.map((a) => a.id),
    corpus: {
      accounts: rows.length,
      candidates: candidates.length,
      excluded_already_buying: alreadyBuying,
      excluded_not_a_prospect: notAProspect,
      excluded_institutional: institutional,
    },
    candidates,
    excluded,
    reconciliation: { ok: problems.length === 0, problems },
  };
}

export function renderProspectFitMarkdown(report: ProspectFitReport, topN = 20): string {
  const L: string[] = [];
  L.push('# Prospect fit report (READ-ONLY — nothing was created)');
  L.push('');
  L.push(`- Generated: ${report.generated_at}`);
  L.push(`- Corpus: ${report.source}`);
  L.push(`- Taxonomy: ${report.taxonomy_version} · published archetypes: ${report.published_archetypes.join(', ')}`);
  L.push(`- Accounts reviewed: ${report.corpus.accounts}`);
  L.push(`- Candidates: **${report.corpus.candidates}**`);
  L.push(
    `- Excluded: ${report.corpus.excluded_already_buying} already buying, ${report.corpus.excluded_not_a_prospect} not a prospect, ${report.corpus.excluded_institutional} institutional identities`
  );
  L.push(`- Reconciliation: ${report.reconciliation.ok ? 'OK' : 'FAILED'}`);
  for (const p of report.reconciliation.problems) L.push(`  - problem: ${p}`);
  L.push('');
  L.push('**Read this as a candidate set, not an outbound queue.** Membership here is deterministic (pre-gates only); archetype fit is a Laya judgment made on demand in the app, not by this report. No contact is verified, and no suppression list exists yet. No prospect, deal, contact, or message was created by this report.');
  L.push('');
  L.push('## Candidates (name order, unjudged)');
  L.push('');
  if (report.candidates.length === 0) {
    L.push('No candidates.');
    L.push('');
  } else {
    L.push(`First ${Math.min(topN, report.candidates.length)} of ${report.candidates.length} — judge them in the app for archetype and role support:`);
    L.push('');
    let i = 0;
    for (const c of report.candidates.slice(0, topN)) {
      i += 1;
      L.push(`${i}. **${c.name}** [${c.company_id}]`);
      L.push(`   - reachability: ${c.reachability} · worked before: ${c.already_touched ? 'yes' : 'no'}`);
      for (const g of c.gaps) L.push(`   - gap: ${g}`);
    }
    if (report.candidates.length > topN) {
      L.push('');
      L.push(`(${report.candidates.length - topN} more candidates below the cut, present in the JSON output.)`);
    }
    L.push('');
  }

  L.push('## Everything excluded, and why');
  L.push('');
  L.push(`Total excluded: ${report.excluded.length}`);
  L.push('');
  const byReason = new Map<string, number>();
  for (const e of report.excluded) byReason.set(e.reason, (byReason.get(e.reason) ?? 0) + 1);
  for (const [reason, n] of [...byReason.entries()].sort((a, b) => b[1] - a[1])) {
    L.push(`- ${n} × ${reason}`);
  }
  L.push('');
  return L.join('\n');
}
