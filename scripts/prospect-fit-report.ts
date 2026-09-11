#!/usr/bin/env node
// LeadPulse Intelligence — Slice 2: read-only prospect fit report.
//
// Creates NOTHING: no prospect record, no deal, no contact, no send. It reads the CRM
// and ranks companies that fit a published archetype and are not already buying.
//
// Usage: node scripts/prospect-fit-report.ts [--out f.json] [--md-out f.md] [--top 20]

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildProspectFitReport,
  renderProspectFitMarkdown,
  type ProspectSourceRow,
} from '../src/utils/prospectFit.ts';
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
  const outPath = argValue('--out') ?? join(tmpdir(), `leadpulse-prospect-fit-${stamp}.json`);
  const mdPath = argValue('--md-out') ?? join(tmpdir(), `leadpulse-prospect-fit-${stamp}.md`);
  const topN = Number(argValue('--top') ?? 20);

  const [cRes, dRes, mRes, eRes, ctRes] = await Promise.all([
    supabase.from('companies').select('id,name,status,industry,tags,website').is('deleted_at', null).order('name'),
    supabase.from('deals').select('company_id,stage').is('deleted_at', null),
    supabase.from('meetings').select('company_id,outcome,direction').is('deleted_at', null),
    supabase.from('account_events').select('company_id'),
    supabase.from('contacts').select('company_id,identity_quality,email,phone,line').is('deleted_at', null),
  ]);
  for (const [label, res] of [
    ['companies', cRes], ['deals', dRes], ['meetings', mRes], ['account_events', eRes], ['contacts', ctRes],
  ] as const) {
    if (res.error) {
      console.error(`LIVE READ FAILED (${label}): ${res.error.message}`);
      process.exit(2);
    }
  }

  const won = new Map<string, number>();
  for (const d of (dRes.data ?? []) as { company_id: string | null; stage: string }[]) {
    if (d.company_id && d.stage === 'closed_won') won.set(d.company_id, (won.get(d.company_id) ?? 0) + 1);
  }
  const ev = new Map<string, number>();
  for (const e of (eRes.data ?? []) as { company_id: string | null }[]) {
    if (e.company_id) ev.set(e.company_id, (ev.get(e.company_id) ?? 0) + 1);
  }
  type Agg = { meetings: number; internal_activity: number; customer_facing_activity: number; inbound_responses: number; positive_contact_outcomes: number };
  const agg = new Map<string, Agg>();
  for (const m of (mRes.data ?? []) as { company_id: string | null; outcome: string | null; direction: string | null }[]) {
    if (!m.company_id) continue;
    const a = agg.get(m.company_id) ?? { meetings: 0, internal_activity: 0, customer_facing_activity: 0, inbound_responses: 0, positive_contact_outcomes: 0 };
    a.meetings += 1;
    if (m.direction === 'internal' || m.direction == null) a.internal_activity += 1;
    else {
      a.customer_facing_activity += 1;
      if (m.direction === 'inbound') a.inbound_responses += 1;
      if (m.outcome === 'positive') a.positive_contact_outcomes += 1;
    }
    agg.set(m.company_id, a);
  }
  const contacts = new Map<string, { named: number; route: number }>();
  for (const c of (ctRes.data ?? []) as { company_id: string | null; identity_quality: string | null; email: string | null; phone: string | null; line: string | null }[]) {
    if (!c.company_id) continue;
    const cur = contacts.get(c.company_id) ?? { named: 0, route: 0 };
    if (c.identity_quality === 'named') cur.named += 1;
    if (c.email || c.phone || c.line) cur.route += 1;
    contacts.set(c.company_id, cur);
  }

  type CompanyRow = { id: string; name: string; status: string; industry: string | null; tags: string[] | null; website: string | null };
  const rows: ProspectSourceRow[] = ((cRes.data ?? []) as CompanyRow[]).map((c) => {
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
      order_events: ev.get(c.id) ?? 0,
      meetings: a?.meetings ?? 0,
      internal_activity: a?.internal_activity ?? 0,
      customer_facing_activity: a?.customer_facing_activity ?? 0,
      inbound_responses: a?.inbound_responses ?? 0,
      positive_contact_outcomes: a?.positive_contact_outcomes ?? 0,
      contact_named: ct?.named ?? 0,
      contact_any_route: ct?.route ?? 0,
    };
  });

  const report = buildProspectFitReport(rows, {
    source: `live:companies+deals+meetings+account_events+contacts via ${new URL('https://mkyhikarlxuwvprjabbi.supabase.co').host}`,
    now,
  });
  const md = renderProspectFitMarkdown(report, topN);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, md);
  console.log(md);
  console.log(`--- report json: ${outPath}`);
  console.log(`--- report md:   ${mdPath}`);
  console.log(
    `reconciliation: accounts=${report.corpus.accounts} candidates=${report.corpus.candidates} ` +
      `excluded=${report.excluded.length} ok=${report.reconciliation.ok} (READ-ONLY: nothing created)`
  );
  process.exit(report.reconciliation.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`prospect fit report failed: ${(e as Error).message}`);
  process.exit(1);
});
