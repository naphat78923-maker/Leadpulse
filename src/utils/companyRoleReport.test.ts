// LeadPulse Intelligence — Slice 1 tests: read-only corpus report.

import { describe, it, expect } from 'vitest';
import { buildCompanyRoleReport, renderCompanyRoleReportMarkdown, type ReportInputRow } from './companyRoleReport';
import { TAXONOMY_VERSION } from './companyRole';

const NOW = new Date('2026-09-11T00:00:00.000Z');

function rows(): ReportInputRow[] {
  return [
    { id: 'co_1', name: 'Example Bakery', status: 'prospect', industry: 'Artisan bakery', tags: ['bakery'] },
    { id: 'co_2', name: 'Example Hotel', status: 'active_customer', industry: 'Luxury hotel / dining', tags: ['hotel'] },
    { id: 'co_3', name: 'Example Cafe', status: 'prospect', industry: 'Food & Beverage', tags: ['cafe', 'vegan'] },
    { id: 'co_4', name: 'Example School', status: 'prospect', industry: 'Pastry school', tags: [] },
    { id: 'co_5', name: 'Unlabelled Co', status: 'prospect', industry: null, tags: [] },
    { id: 'co_6', name: 'Example Foods', status: 'prospect', industry: 'Bakery / cake manufacturer / OEM', tags: [] },
  ];
}

describe('buildCompanyRoleReport', () => {
  it('accounts for every input row and reconciles the totals', () => {
    const input = rows();
    const report = buildCompanyRoleReport(input, { source: 'test', now: NOW });

    expect(report.reconciliation.rows_in).toBe(input.length);
    expect(report.reconciliation.rows_classified).toBe(input.length);
    expect(report.reconciliation.by_role_sum).toBe(input.length);
    expect(report.reconciliation.ok).toBe(true);
    expect(report.reconciliation.problems).toEqual([]);
    expect(report.rows).toHaveLength(input.length);
    expect(report.taxonomy_version).toBe(TAXONOMY_VERSION);
    expect(report.generated_at).toBe(NOW.toISOString());
  });

  it('counts unknown and ambiguous rows without hiding either', () => {
    const report = buildCompanyRoleReport(rows(), { source: 'test', now: NOW });
    expect(report.counts.unknown).toBe(2); // the school gap and the unlabelled row
    expect(report.counts.uncontested_unknown).toBe(1);
    expect(report.counts.ambiguous).toBeGreaterThan(0);
    const flagged = report.rows.filter((r) => r.ambiguous).length;
    expect(report.counts.ambiguous).toBe(flagged);
    for (const c of ['high', 'medium', 'low']) {
      expect(report.counts.by_confidence[c]).toBe(report.rows.filter((r) => r.confidence === c).length);
    }
  });

  it('gives unknown and ambiguous rows source references and reasons', () => {
    const report = buildCompanyRoleReport(rows(), { source: 'test', now: NOW });

    const school = report.rows.find((r) => r.id === 'co_4')!;
    expect(school.role).toBe('unknown');
    expect(school.reason_code).toBe('taxonomy_gap');
    expect(school.reason.length).toBeGreaterThan(0);
    // name and industry are both identity fields; name is examined first, so the
    // assertion pins the matched text and accepts either identity source.
    const schoolEvidence = school.evidence.find((e) => e.matched_text === 'school')!;
    expect(schoolEvidence).toBeDefined();
    expect(['name', 'industry']).toContain(schoolEvidence.field);
    expect(school.evidence.every((e) => !!e.rule)).toBe(true);

    const unlabelled = report.rows.find((r) => r.id === 'co_5')!;
    expect(unlabelled.reason_code).toBe('no_role_match');

    const manufacturer = report.rows.find((r) => r.id === 'co_6')!;
    expect(manufacturer.role).toBe('manufacturer');
    expect(manufacturer.ambiguous).toBe(true);
    expect(manufacturer.candidates.length).toBeGreaterThan(0);
  });

  it('fails reconciliation on duplicate ids instead of quietly double counting', () => {
    const input = rows();
    input.push({ ...input[0] });
    const report = buildCompanyRoleReport(input, { source: 'test', now: NOW });
    expect(report.reconciliation.ok).toBe(false);
    expect(report.reconciliation.problems.join(' ')).toContain('duplicate ids');
  });
});

describe('renderCompanyRoleReportMarkdown', () => {
  it('prints the totals, the unknown count, and per-row evidence', () => {
    const md = renderCompanyRoleReportMarkdown(buildCompanyRoleReport(rows(), { source: 'test', now: NOW }));
    expect(md).toContain('# Company role report — taxonomy v1');
    expect(md).toContain('Rows in: 6');
    expect(md).toContain('Reconciliation: OK');
    expect(md).toContain('unknown: 2');
    expect(md).toContain('## Unknown rows (2)');
    expect(md).toContain('Example School');
    expect(md).toContain('candidate roles:');
    expect(md).toContain('## Every row');
    expect(md).toContain('Example Bakery');
  });
});
