// ─── LeadPulse Intelligence — Slice 2: read-only prospect fit ───
//
// Ranks companies that fit a PUBLISHED archetype and are not already buying.
// It creates nothing: no prospect record, no deal, no contact, no send. Its output
// is a reviewable list with reasons a human can check.
//
// What the signals are, and are not:
//   - they are keyword proxies over free-text industry/tags, declared on the
//     archetype itself so the two cannot drift
//   - a hit means "worth a look", never "confirmed qualified"
//   - no suppression list exists yet (slice 5) and no contact is verified here,
//     so this list is a candidate set, not an outbound queue

import { classifyCompanyRole, type CompanyRole } from './companyRole.ts';
import { CAMPAIGN_ARCHETYPES_V1, type CampaignArchetype } from './campaignArchetypes.ts';

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

export interface ProspectFit {
  company_id: string;
  name: string;
  status: string;
  role: CompanyRole;
  archetype_id: string;
  archetype_name: string;
  vertical_role: CompanyRole;
  fit_score: number;
  fit_reasons: string[];
  signal_hits: string[];
  gaps: string[];
  reachability: Reachability;
  already_touched: boolean;
}

export interface ProspectFitReport {
  generated_at: string;
  source: string;
  taxonomy_version: string;
  published_archetypes: string[];
  corpus: {
    accounts: number;
    candidates: number;
    excluded_already_buying: number;
    excluded_not_a_prospect: number;
    excluded_no_archetype: number;
  };
  fits: ProspectFit[];
  by_archetype: { archetype_id: string; name: string; candidates: number; with_named_contact: number; untouched: number }[];
  /** accounts excluded from candidate status, with the reason, so nothing vanishes */
  excluded: { company_id: string; name: string; reason: string }[];
  reconciliation: { ok: boolean; problems: string[] };
}

function text(row: ProspectSourceRow): string {
  return `${row.name} ${row.industry ?? ''} ${(row.tags ?? []).join(' ')}`.toLowerCase();
}

function reachabilityOf(row: ProspectSourceRow): Reachability {
  if (row.contact_named > 0) return 'named_contact';
  if (row.contact_any_route > 0) return 'route_only';
  return 'none';
}

/**
 * Score is deliberately simple and explainable, and every component is reported as a
 * reason. Weights: role match 40, role certainty up to +20, criteria signals +10 each
 * (three max), reachability 0/8/15, and +5 for not having been worked yet.
 */
export function scoreFit(row: ProspectSourceRow, archetype: CampaignArchetype, roleConfidence: string): { score: number; reasons: string[]; hits: string[]; gaps: string[] } {
  const reasons: string[] = [];
  const hits: string[] = [];
  const gaps: string[] = [];
  let score = 40;
  reasons.push(`role "${archetype.vertical_role}" is covered by this archetype (+40)`);

  if (roleConfidence === 'high') { score += 20; reasons.push('role classification is high-confidence (+20)'); }
  else if (roleConfidence === 'medium') { score += 10; reasons.push('role classification is medium-confidence (+10)'); }
  else gaps.push('role classification is low-confidence: confirm the business type before using this');

  const haystack = text(row);
  for (const signal of archetype.qualification_signals) {
    const re = new RegExp(signal.pattern, 'i');
    if (re.test(haystack)) {
      hits.push(signal.label);
      score += 10;
      reasons.push(`criterion signal: ${signal.label} (+10)`);
    }
  }
  if (hits.length === 0) gaps.push('no archetype criterion signal matched: qualifying this account needs manual research');

  const reach = reachabilityOf(row);
  if (reach === 'named_contact') { score += 15; reasons.push('a named contact exists (+15)'); }
  else if (reach === 'route_only') { score += 8; reasons.push('a contact route exists, but no named person (+8)'); }
  else gaps.push('no contact route at all: this needs contact research before it is actionable');

  if (row.meetings === 0) { score += 5; reasons.push('not worked yet, no logged interaction (+5)'); }
  if (!row.website) gaps.push('no website on the record: personalisation context would be thin');

  return { score: Math.min(100, score), reasons, hits, gaps };
}

export function buildProspectFitReport(rows: ProspectSourceRow[], opts: { source: string; now?: Date; archetypes?: CampaignArchetype[] }): ProspectFitReport {
  const archetypes = opts.archetypes ?? CAMPAIGN_ARCHETYPES_V1;
  const fits: ProspectFit[] = [];
  const excluded: { company_id: string; name: string; reason: string }[] = [];
  let alreadyBuying = 0;
  let notAProspect = 0;
  let noArchetype = 0;

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
    const cls = classifyCompanyRole(row);
    const archetype = archetypes.find((a) => a.evidence_requirement.roles_covered.includes(cls.role));
    if (!archetype) {
      noArchetype += 1;
      excluded.push({ company_id: row.company_id, name: row.name, reason: `no published archetype covers role "${cls.role}"` });
      continue;
    }
    const { score, reasons, hits, gaps } = scoreFit(row, archetype, cls.confidence);
    fits.push({
      company_id: row.company_id,
      name: row.name,
      status: row.status,
      role: cls.role,
      archetype_id: archetype.id,
      archetype_name: archetype.name,
      vertical_role: archetype.vertical_role,
      fit_score: score,
      fit_reasons: reasons,
      signal_hits: hits,
      gaps,
      reachability: reachabilityOf(row),
      already_touched: row.meetings > 0,
    });
  }

  fits.sort((a, b) => b.fit_score - a.fit_score || a.name.localeCompare(b.name));

  const byArchetype = archetypes.map((a) => {
    const mine = fits.filter((f) => f.archetype_id === a.id);
    return {
      archetype_id: a.id,
      name: a.name,
      candidates: mine.length,
      with_named_contact: mine.filter((f) => f.reachability === 'named_contact').length,
      untouched: mine.filter((f) => !f.already_touched).length,
    };
  });

  const problems: string[] = [];
  if (alreadyBuying + notAProspect + noArchetype + fits.length !== rows.length) {
    problems.push(
      `accounting does not reconcile: ${alreadyBuying}+${notAProspect}+${noArchetype}+${fits.length} vs ${rows.length} rows`
    );
  }
  if (new Set(fits.map((f) => f.company_id)).size !== fits.length) {
    problems.push('a company appears more than once in the candidate list');
  }
  const uncovered = rows.filter((r) => !excluded.some((e) => e.company_id === r.company_id) && !fits.some((f) => f.company_id === r.company_id));
  if (uncovered.length > 0) problems.push(`${uncovered.length} accounts are neither candidates nor explained exclusions`);

  return {
    generated_at: (opts.now ?? new Date()).toISOString(),
    source: opts.source,
    taxonomy_version: archetypes[0]?.taxonomy_version ?? 'unknown',
    published_archetypes: archetypes.map((a) => a.id),
    corpus: {
      accounts: rows.length,
      candidates: fits.length,
      excluded_already_buying: alreadyBuying,
      excluded_not_a_prospect: notAProspect,
      excluded_no_archetype: noArchetype,
    },
    fits,
    by_archetype: byArchetype,
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
    `- Excluded: ${report.corpus.excluded_already_buying} already buying, ${report.corpus.excluded_not_a_prospect} not a prospect, ${report.corpus.excluded_no_archetype} outside every published archetype`
  );
  L.push(`- Reconciliation: ${report.reconciliation.ok ? 'OK' : 'FAILED'}`);
  for (const p of report.reconciliation.problems) L.push(`  - problem: ${p}`);
  L.push('');
  L.push('**Read this as a candidate set, not an outbound queue.** Signals are keyword proxies over free-text fields, no contact is verified, and no suppression list exists yet. No prospect, deal, contact, or message was created by this report.');
  L.push('');
  L.push('## Candidates per archetype');
  L.push('');
  for (const a of report.by_archetype) {
    L.push(`- ${a.name}: ${a.candidates} candidates (${a.with_named_contact} with a named contact, ${a.untouched} never worked)`);
  }
  L.push('');

  for (const a of report.by_archetype) {
    const mine = report.fits.filter((f) => f.archetype_id === a.archetype_id);
    L.push(`## ${a.name} (${mine.length})`);
    L.push('');
    if (mine.length === 0) {
      L.push('No candidates.');
      L.push('');
      continue;
    }
    L.push(`Top ${Math.min(topN, mine.length)} by transparent score:`);
    L.push('');
    let i = 0;
    for (const f of mine.slice(0, topN)) {
      i += 1;
      L.push(`${i}. **${f.name}** [${f.company_id}] — score ${f.fit_score}/100`);
      L.push(`   - role: ${f.role} · reachability: ${f.reachability} · worked before: ${f.already_touched ? 'yes' : 'no'}`);
      L.push(`   - why: ${f.fit_reasons.join('; ')}`);
      if (f.signal_hits.length > 0) L.push(`   - criteria hits (textual, unverified): ${f.signal_hits.join(', ')}`);
      for (const g of f.gaps) L.push(`   - gap: ${g}`);
    }
    if (mine.length > topN) {
      L.push('');
      L.push(`(${mine.length - topN} more candidates below the cut, present in the JSON output.)`);
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
