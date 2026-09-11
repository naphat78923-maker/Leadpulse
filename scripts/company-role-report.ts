#!/usr/bin/env node
// LeadPulse Intelligence — Slice 1 acceptance evidence.
//
// Classifies the live company corpus into taxonomy v1 (read-only) and writes a
// report with reconciliation checks. It never writes to Supabase.
//
// Usage:
//   node scripts/company-role-report.ts                     # live corpus by default
//   node scripts/company-role-report.ts --in rows.json      # offline corpus
//   node scripts/company-role-report.ts --out /tmp/r.json   # override report path
//
// Customer data stays OUT of git: the default output path is a temp file, and
// .gitignore blocks accidental commits of report artefacts.
//
// Exit codes: 0 = reconciliation OK, 1 = corpus/reconciliation failure,
//             2 = live read failed (blocked credentials or network).

import { writeFileSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildCompanyRoleReport,
  renderCompanyRoleReportMarkdown,
  type ReportInputRow,
} from '../src/utils/companyRoleReport.ts';
import { supabase } from '../src/lib/supabase.ts';

interface CompanyRow {
  id: string;
  name: string | null;
  status: string | null;
  industry: string | null;
  tags: string[] | null;
}

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

function defaultOutPath(now: Date): string {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  return join(tmpdir(), `leadpulse-company-role-report-${stamp}.json`);
}

async function loadLiveCorpus(): Promise<ReportInputRow[]> {
  const { data, error } = await supabase
    .from('companies')
    .select('id, name, status, industry, tags')
    .is('deleted_at', null)
    .order('name');
  if (error) throw new Error(`live read failed: ${error.message}`);
  return ((data ?? []) as CompanyRow[]).map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    industry: r.industry,
    tags: r.tags,
  }));
}

function loadFileCorpus(path: string): ReportInputRow[] {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as unknown;
  const rows = Array.isArray(raw) ? raw : (raw as { rows?: unknown[] }).rows;
  if (!Array.isArray(rows)) throw new Error(`${path} is not a JSON array of company rows`);
  return rows as ReportInputRow[];
}

async function main(): Promise<void> {
  const now = new Date();
  const inPath = argValue('--in');
  const outPath = argValue('--out') ?? defaultOutPath(now);
  const mdPath = argValue('--md-out');

  let corpus: ReportInputRow[];
  let source: string;
  if (inPath) {
    corpus = loadFileCorpus(inPath);
    source = `file:${inPath}`;
  } else {
    try {
      corpus = await loadLiveCorpus();
      source = `live:companies (deleted_at is null) via ${new URL(process.env.SUPABASE_URL ?? 'https://mkyhikarlxuwvprjabbi.supabase.co').host}`;
    } catch (e) {
      console.error(`LIVE READ FAILED: ${(e as Error).message}`);
      console.error('This is not a fixture result. No classification was produced for the live corpus.');
      process.exit(2);
    }
  }

  const report = buildCompanyRoleReport(corpus, { source, now });
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  if (mdPath) writeFileSync(mdPath, renderCompanyRoleReportMarkdown(report));

  console.log(renderCompanyRoleReportMarkdown(report));
  console.log(`--- report json: ${outPath}`);
  console.log(
    `reconciliation: rows_in=${report.reconciliation.rows_in} classified=${report.reconciliation.rows_classified} ` +
      `by_role_sum=${report.reconciliation.by_role_sum} unknown=${report.counts.unknown} ambiguous=${report.counts.ambiguous} ` +
      `ok=${report.reconciliation.ok}`
  );

  process.exit(report.reconciliation.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`report failed: ${(e as Error).message}`);
  process.exit(1);
});
