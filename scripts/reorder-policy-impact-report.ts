#!/usr/bin/env node
// LeadPulse — reorder POLICY impact report (read-only acceptance evidence).
//
// Reads the live corpus plus the interaction/order history the retention page uses,
// then computes each account's reorder interval, health tier, and next-touch due
// date under BOTH the active policy and the reviewed alternative. It writes nothing.
//
// The active policy in this commit is v0-legacy, so production timing is unchanged;
// this report exists so the proposed policy can be reviewed account by account
// before anything flips.
//
// Usage: node scripts/reorder-policy-impact-report.ts [--out f.json] [--md-out f.md]

import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  buildPolicyImpactReport,
  renderPolicyImpactMarkdown,
  type ImpactInputRow,
  type ImpactDeal,
  type ImpactEvent,
  type ImpactMeeting,
} from '../src/utils/reorderPolicyImpact.ts';
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
  const outPath = argValue('--out') ?? join(tmpdir(), `leadpulse-reorder-policy-impact-${stamp}.json`);
  const mdPath = argValue('--md-out') ?? join(tmpdir(), `leadpulse-reorder-policy-impact-${stamp}.md`);

  const [companiesRes, meetingsRes, dealsRes, eventsRes] = await Promise.all([
    supabase
      .from('companies')
      .select('id,name,status,industry,tags,created_at,last_contact_date,last_human_touch,next_touch_due')
      .is('deleted_at', null)
      .order('name'),
    supabase.from('meetings').select('company_id,date,outcome').is('deleted_at', null),
    supabase.from('deals').select('company_id,stage,last_outcome,value').is('deleted_at', null),
    supabase.from('account_events').select('company_id,event_date,amount,product_line,order_id'),
  ]);

  for (const [label, res] of [
    ['companies', companiesRes],
    ['meetings', meetingsRes],
    ['deals', dealsRes],
    ['account_events', eventsRes],
  ] as const) {
    if (res.error) {
      console.error(`LIVE READ FAILED (${label}): ${res.error.message}`);
      console.error('No impact figures were produced for the live corpus.');
      process.exit(2);
    }
  }

  const meetingsBy = new Map<string, ImpactMeeting[]>();
  for (const m of (meetingsRes.data ?? []) as { company_id: string | null; date: string; outcome: ImpactMeeting['outcome'] }[]) {
    if (!m.company_id) continue;
    const list = meetingsBy.get(m.company_id) ?? [];
    list.push({ date: m.date, outcome: m.outcome });
    meetingsBy.set(m.company_id, list);
  }
  const dealsBy = new Map<string, ImpactDeal[]>();
  for (const d of (dealsRes.data ?? []) as { company_id: string | null; stage: string; last_outcome: string | null; value: number | null }[]) {
    if (!d.company_id) continue;
    const list = dealsBy.get(d.company_id) ?? [];
    list.push({ stage: d.stage, last_outcome: d.last_outcome, value: d.value });
    dealsBy.set(d.company_id, list);
  }
  const eventsBy = new Map<string, ImpactEvent[]>();
  for (const e of (eventsRes.data ?? []) as { company_id: string | null; event_date: string; amount: number; product_line: string | null; order_id: string | null }[]) {
    if (!e.company_id) continue;
    const list = eventsBy.get(e.company_id) ?? [];
    list.push({ date: e.event_date, amount: e.amount, product_line: e.product_line, order_id: e.order_id });
    eventsBy.set(e.company_id, list);
  }

  type CompanyRow = {
    id: string; name: string; status: string; industry: string | null; tags: string[] | null;
    created_at: string | null; last_contact_date: string | null; last_human_touch: string | null; next_touch_due: string | null;
  };

  const rows: ImpactInputRow[] = ((companiesRes.data ?? []) as CompanyRow[]).map((c) => ({
    id: c.id,
    name: c.name,
    status: c.status,
    industry: c.industry,
    tags: c.tags,
    created_at: c.created_at,
    last_contact_date: c.last_contact_date,
    last_human_touch: c.last_human_touch,
    next_touch_due: c.next_touch_due,
    meetings: meetingsBy.get(c.id) ?? [],
    deals: dealsBy.get(c.id) ?? [],
    events: eventsBy.get(c.id) ?? [],
  }));

  const report = buildPolicyImpactReport(rows, {
    source: `live:companies+meetings+deals+account_events via ${new URL('https://mkyhikarlxuwvprjabbi.supabase.co').host}`,
    now,
  });

  writeFileSync(outPath, JSON.stringify(report, null, 2));
  writeFileSync(mdPath, renderPolicyImpactMarkdown(report));
  console.log(renderPolicyImpactMarkdown(report));
  console.log(`--- report json: ${outPath}`);
  console.log(`--- report md:   ${mdPath}`);
  console.log(
    `reconciliation: rows_in=${report.counts.rows_in} interval_changed=${report.counts.interval_changed} ` +
      `longer=${report.counts.longer} shorter=${report.counts.shorter} tier_changed=${report.counts.tier_changed} ` +
      `due_changed=${report.counts.due_changed} active_policy=${report.active_policy} ok=${report.reconciliation.ok}`
  );
  process.exit(report.reconciliation.ok ? 0 : 1);
}

main().catch((e) => {
  console.error(`impact report failed: ${(e as Error).message}`);
  process.exit(1);
});
