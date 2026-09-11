#!/usr/bin/env node
// LeadPulse Intelligence — Slice 1 Deliverable B acceptance evidence.
//
// Read-only. Evaluates each committed campaign archetype against the live CRM and
// prints the NAMED accounts supporting it. Exits non-zero if any archetype claims
// support it no longer has, so an archetype cannot outlive its evidence.
//
// The output contains live customer names and is deliberately gitignored.
//
// Usage: node scripts/archetype-evidence-report.ts [--out f.json] [--md-out f.md]

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildArchetypeEvidenceReport,
  renderArchetypeEvidenceMarkdown,
  type ArchetypeEvidenceRow,
} from '../src/utils/campaignArchetypeEvidence.ts';
import { classifyCompanyRole } from '../src/utils/companyRole.ts';
import { supabase } from '../src/lib/supabase.ts';

function argValue(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : null;
}

async function main(): Promise<void> {
  const now = new Date();
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const outPath = argValue('--out') ?? join(tmpdir(), `leadpulse-archetype-evidence-${stamp}.json`);
  const mdPath = argValue('--md-out') ?? join(tmpdir(), `leadpulse-archetype-evidence-${stamp}.md`);

  const [companiesRes, dealsRes, meetingsRes, eventsRes] = await Promise.all([
    supabase.from('companies').select('id,name,status,industry,tags').is('deleted_at', null).order('name'),
    supabase.from('deals').select('company_id,stage,value').is('deleted_at', null),
    // direction is REQUIRED here: without it, internal nudges and reward draws were
    // being counted as customer engagement (the bug this pass corrects)
    supabase.from('meetings').select('company_id,type,outcome,direction').is('deleted_at', null),
    supabase.from('account_events').select('company_id'),
  ]);

  for (const [label, res] of [
    ['companies', companiesRes],
    ['deals', dealsRes],
    ['meetings', meetingsRes],
    ['account_events', eventsRes],
  ] as const) {
    if (res.error) {
      console.error(`LIVE READ FAILED (${label}): ${res.error.message}`);
      console.error('No archetype evidence was produced. This is not a fixture result.');
      process.exit(2);
    }
  }

  type CompanyRow = { id: string; name: string; status: string; industry: string | null; tags: string[] | null };

  const wonByCompany = new Map<string, { deals: number; value: number }>();
  for (const d of (dealsRes.data ?? []) as { company_id: string | null; stage: string; value: number | null }[]) {
    if (!d.company_id || d.stage !== 'closed_won') continue;
    const cur = wonByCompany.get(d.company_id) ?? { deals: 0, value: 0 };
    cur.deals += 1;
    cur.value += d.value ?? 0;
    wonByCompany.set(d.company_id, cur);
  }

  type MeetingAgg = {
    internal_activity: number; customer_facing_activity: number; inbound_responses: number;
    positive_contact_outcomes: number; neutral_contact_outcomes: number; negative_contact_outcomes: number;
    customer_facing_no_response: number; internal_no_response: number;
  };
  const emptyAgg = (): MeetingAgg => ({
    internal_activity: 0, customer_facing_activity: 0, inbound_responses: 0,
    positive_contact_outcomes: 0, neutral_contact_outcomes: 0, negative_contact_outcomes: 0,
    customer_facing_no_response: 0, internal_no_response: 0,
  });
  const meetingsByCompany = new Map<string, MeetingAgg>();
  for (const m of (meetingsRes.data ?? []) as { company_id: string | null; outcome: string | null; direction: string | null }[]) {
    if (!m.company_id) continue;
    const agg = meetingsByCompany.get(m.company_id) ?? emptyAgg();
    const internal = m.direction === 'internal' || m.direction == null;
    if (internal) {
      agg.internal_activity += 1;
      if (m.outcome === 'no_response') agg.internal_no_response += 1;
    } else {
      // a customer-facing contact: activity whether or not anything came back
      agg.customer_facing_activity += 1;
      if (m.direction === 'inbound') agg.inbound_responses += 1;
      if (m.outcome === 'positive') agg.positive_contact_outcomes += 1;
      else if (m.outcome === 'neutral') agg.neutral_contact_outcomes += 1;
      else if (m.outcome === 'negative') agg.negative_contact_outcomes += 1;
      else if (m.outcome === 'no_response') agg.customer_facing_no_response += 1;
    }
    meetingsByCompany.set(m.company_id, agg);
  }

  const eventsByCompany = new Map<string, number>();
  for (const e of (eventsRes.data ?? []) as { company_id: string | null }[]) {
    if (!e.company_id) continue;
    eventsByCompany.set(e.company_id, (eventsByCompany.get(e.company_id) ?? 0) + 1);
  }

  const rows: ArchetypeEvidenceRow[] = ((companiesRes.data ?? []) as CompanyRow[]).map((c) => {
    const won = wonByCompany.get(c.id) ?? { deals: 0, value: 0 };
    const agg = meetingsByCompany.get(c.id) ?? emptyAgg();
    return {
      company_id: c.id,
      name: c.name,
      status: c.status,
      role: classifyCompanyRole(c).role,
      won_deals: won.deals,
      won_value: won.value,
      order_events: eventsByCompany.get(c.id) ?? 0,
      ...agg,
    };
  });

  const report = buildArchetypeEvidenceReport(rows, {
    source: `live:companies+deals+meetings+account_events via ${new URL('https://mkyhikarlxuwvprjabbi.supabase.co').host}`,
    now,
  });

  const md = renderArchetypeEvidenceMarkdown(report);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, md);
  console.log(md);
  console.log(`--- report json: ${outPath}`);
  console.log(`--- report md:   ${mdPath}`);
  console.log(
    `reconciliation: accounts=${report.corpus.accounts} won_accounts=${report.corpus.won_accounts_total} ` +
      `archetypes=${report.reconciliation.published} meeting_their_bar=${report.reconciliation.published - report.reconciliation.unsupported} ` +
      `must_be_withheld=${report.reconciliation.unsupported} ok=${report.reconciliation.ok}`
  );
  process.exit(report.reconciliation.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`archetype evidence report failed: ${(e as Error).message}`);
  process.exit(1);
});
