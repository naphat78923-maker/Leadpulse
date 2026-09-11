// LeadPulse Intelligence — Slice 1: read-only corpus report.
//
// Pure report builder: takes company rows, returns a reconciliation-checked
// classification report. No Supabase, no writes. The CLI wrapper lives in
// scripts/company-role-report.ts.
//
// Two things this file guarantees, because they are the acceptance evidence:
//   1. every input row is accounted for exactly once
//   2. the per-role counts sum back to the total, or the report says so

import {
  classifyCompanyRole,
  COMPANY_ROLES,
  ROLE_TAXONOMY,
  TAXONOMY_VERSION,
  type CompanyRole,
  type RoleCandidate,
  type RoleClassification,
  type RoleEvidence,
} from './companyRole.ts';

export interface ReportInputRow {
  id: string;
  name?: string | null;
  status?: string | null;
  industry?: string | null;
  tags?: string[] | null;
}

export interface ReportRow {
  id: string;
  name: string;
  status: string | null;
  role: CompanyRole;
  account_type: string;
  confidence: string;
  ambiguous: boolean;
  reason_code: string;
  reason: string;
  evidence: RoleEvidence[];
  candidates: RoleCandidate[];
}

export interface CompanyRoleReport {
  taxonomy_version: string;
  generated_at: string;
  corpus: { source: string; total_rows: number };
  counts: {
    by_role: Record<string, number>;
    unknown: number;
    ambiguous: number;
    uncontested_unknown: number;
    by_confidence: Record<string, number>;
    taxonomy_version: string;
  };
  reconciliation: {
    rows_in: number;
    rows_classified: number;
    by_role_sum: number;
    ok: boolean;
    problems: string[];
  };
  rows: ReportRow[];
}

export function toReportRow(row: ReportInputRow): ReportRow {
  const c: RoleClassification = classifyCompanyRole(row);
  return {
    id: row.id,
    name: row.name ?? '(unnamed)',
    status: row.status ?? null,
    role: c.role,
    account_type: c.account_type,
    confidence: c.confidence,
    ambiguous: c.ambiguous,
    reason_code: c.reason_code,
    reason: c.reason,
    evidence: c.evidence,
    candidates: c.candidates,
  };
}

export function buildCompanyRoleReport(
  input: ReportInputRow[],
  opts: { source: string; now?: Date }
): CompanyRoleReport {
  const rows = input.map(toReportRow);

  const by_role: Record<string, number> = {};
  for (const role of COMPANY_ROLES) by_role[role] = 0;
  const by_confidence: Record<string, number> = { high: 0, medium: 0, low: 0 };

  for (const r of rows) {
    by_role[r.role] = (by_role[r.role] ?? 0) + 1;
    by_confidence[r.confidence] = (by_confidence[r.confidence] ?? 0) + 1;
  }

  const by_role_sum = Object.values(by_role).reduce((a, b) => a + b, 0);
  const unknown = by_role.unknown ?? 0;
  const ambiguous = rows.filter((r) => r.ambiguous).length;
  const uncontested_unknown = rows.filter((r) => r.role === 'unknown' && !r.ambiguous).length;

  const problems: string[] = [];
  if (rows.length !== input.length) {
    problems.push(`row count changed during mapping: ${input.length} in, ${rows.length} out`);
  }
  if (by_role_sum !== rows.length) {
    problems.push(`per-role counts sum to ${by_role_sum} but ${rows.length} rows were classified`);
  }
  const ids = new Set<string>();
  const duplicateIds: string[] = [];
  for (const r of rows) {
    if (ids.has(r.id)) duplicateIds.push(r.id);
    ids.add(r.id);
  }
  if (duplicateIds.length > 0) {
    problems.push(`duplicate ids in corpus: ${[...new Set(duplicateIds)].join(', ')}`);
  }
  const unlabelled = rows.filter((r) => !r.role || !r.reason_code || !r.account_type);
  if (unlabelled.length > 0) {
    problems.push(`${unlabelled.length} rows carry no role, account_type, or reason_code`);
  }
  if (unknown !== uncontested_unknown + rows.filter((r) => r.role === 'unknown' && r.ambiguous).length) {
    problems.push('unknown accounting does not reconcile with the ambiguous flag');
  }

  return {
    taxonomy_version: TAXONOMY_VERSION,
    generated_at: (opts.now ?? new Date()).toISOString(),
    corpus: { source: opts.source, total_rows: input.length },
    counts: {
      by_role,
      unknown,
      ambiguous,
      uncontested_unknown,
      by_confidence,
      taxonomy_version: TAXONOMY_VERSION,
    },
    reconciliation: {
      rows_in: input.length,
      rows_classified: rows.length,
      by_role_sum,
      ok: problems.length === 0,
      problems,
    },
    rows,
  };
}

export function renderCompanyRoleReportMarkdown(report: CompanyRoleReport): string {
  const lines: string[] = [];
  const { counts, reconciliation, corpus } = report;

  lines.push(`# Company role report — taxonomy ${report.taxonomy_version}`);
  lines.push('');
  lines.push(`- Generated: ${report.generated_at}`);
  lines.push(`- Corpus: ${corpus.source}`);
  lines.push(`- Rows in: ${reconciliation.rows_in}`);
  lines.push(`- Rows classified: ${reconciliation.rows_classified}`);
  lines.push(`- Per-role sum: ${reconciliation.by_role_sum}`);
  lines.push(`- Reconciliation: ${reconciliation.ok ? 'OK' : 'FAILED'}`);
  for (const p of reconciliation.problems) lines.push(`  - problem: ${p}`);
  lines.push('');
  lines.push('## Counts');
  lines.push('');
  lines.push(`- unknown: ${counts.unknown} (${pct(counts.unknown, corpus.total_rows)} of corpus)`);
  lines.push(`- ambiguous (two or more roles matched): ${counts.ambiguous} (${pct(counts.ambiguous, corpus.total_rows)})`);
  lines.push(`- unknown with no competing role: ${counts.uncontested_unknown}`);
  lines.push('');
  lines.push('### By role');
  lines.push('');
  for (const role of COMPANY_ROLES) {
    const n = counts.by_role[role] ?? 0;
    lines.push(`- ${ROLE_TAXONOMY[role].label} (${role}): ${n} (${pct(n, corpus.total_rows)})`);
  }
  lines.push('');
  lines.push('### By confidence');
  lines.push('');
  for (const c of ['high', 'medium', 'low']) {
    lines.push(`- ${c}: ${counts.by_confidence[c] ?? 0}`);
  }

  const unknownRows = report.rows.filter((r) => r.role === 'unknown');
  lines.push('');
  lines.push(`## Unknown rows (${unknownRows.length}) — each needs a taxonomy decision`);
  lines.push('');
  if (unknownRows.length === 0) {
    lines.push('None.');
  } else {
    for (const r of unknownRows) {
      lines.push(`- ${r.name} [${r.id}] status=${r.status ?? '?'} account_type=${r.account_type} confidence=${r.confidence}`);
      lines.push(`  - reason (${r.reason_code}): ${r.reason}`);
      if (r.evidence.length > 0) {
        lines.push(`  - evidence: ${r.evidence.map((e) => `${e.field}="${e.matched_text}" via ${e.rule}`).join('; ')}`);
      }
      if (r.candidates.length > 0) {
        lines.push(`  - candidate roles: ${r.candidates.map((c) => `${c.role} (via ${c.rule}${c.evidence[0] ? `, ${c.evidence[0].field}="${c.evidence[0].matched_text}"` : ''})`).join('; ')}`);
      }
    }
  }

  const ambiguousRows = report.rows.filter((r) => r.ambiguous && r.role !== 'unknown');
  lines.push('');
  lines.push(`## Ambiguous rows (${ambiguousRows.length}) — role chosen, competitor roles listed`);
  lines.push('');
  if (ambiguousRows.length === 0) {
    lines.push('None.');
  } else {
    for (const r of ambiguousRows) {
      lines.push(`- ${r.name} [${r.id}] → ${r.role} (${r.confidence})`);
      lines.push(`  - reason (${r.reason_code}): ${r.reason}`);
      lines.push(`  - evidence: ${r.evidence.map((e) => `${e.field}="${e.matched_text}" via ${e.rule}`).join('; ')}`);
      lines.push(`  - candidates: ${r.candidates.map((c) => `${c.role} (via ${c.rule})`).join('; ')}`);
    }
  }

  lines.push('');
  lines.push('## Every row');
  lines.push('');
  for (const r of report.rows) {
    const flags = [r.ambiguous ? 'ambiguous' : '', r.confidence].filter(Boolean).join('/');
    lines.push(`- [${r.id}] ${r.name} — ${r.role} (${flags}) status=${r.status ?? '?'}`);
  }
  lines.push('');
  return lines.join('\n');
}

function pct(n: number, total: number): string {
  if (total === 0) return '0%';
  return `${((100 * n) / total).toFixed(1)}%`;
}
