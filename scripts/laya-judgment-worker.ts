#!/usr/bin/env node
// Laya judgment worker — fills public.laya_judgments from deals' verbatim buyer replies.
//
// Runs on the Mac next to the local Laya server. One pass:
//   1. read open deals with a buyer_reply (public anon client — reads only)
//   2. skip by code: closed/parked, no verbatim reply, Thai reply, already judged for
//      this exact input and model package
//   3. POST /score to the local server, one deal at a time
//   4. save the validated answers, or an explicit not_scored refusal (service-role key)
// Logs counts only — never reply text or keys. Design: docs/laya-judgments-store.md.
//
// Usage:
//   node scripts/laya-judgment-worker.ts                 one pass, writes rows
//   node scripts/laya-judgment-worker.ts --watch 300     a pass every 300 s
//   node scripts/laya-judgment-worker.ts --dry-run       score but write nothing (no key needed)
//   node scripts/laya-judgment-worker.ts --fixture f.json  score labelled test replies; implies --dry-run
//   --endpoint http://127.0.0.1:8765  (default)
//
// The service-role key is read from LAYA_WORKER_SUPABASE_SECRET or from
// ~/.config/leadpulse/supabase-secret-key, which must be readable by its owner only.
// It never belongs in .env.local, NEXT_PUBLIC_*, or the repo.

import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { supabase as anon } from '../src/lib/supabase.ts';
import {
  DEAL_QUESTION_SET,
  buildScoreRequest,
  judgmentRowFromResponse,
  skipReason,
  type ModelIdentity,
  type WorkerDeal,
} from '../src/utils/laya-worker.ts';

const SUPABASE_URL = 'https://mkyhikarlxuwvprjabbi.supabase.co';
const KEY_FILE = join(homedir(), '.config/leadpulse/supabase-secret-key');
const ORIGIN = 'http://localhost:3000';

function arg(flag: string): string | null {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const v = process.argv[i + 1];
  return v && !v.startsWith('--') ? v : '';
}

function loadSecretKey(): string {
  const fromEnv = process.env.LAYA_WORKER_SUPABASE_SECRET?.trim();
  if (fromEnv) return fromEnv;
  let mode: number;
  try {
    mode = statSync(KEY_FILE).mode & 0o777;
  } catch {
    throw new Error(`No service-role key: set LAYA_WORKER_SUPABASE_SECRET or create ${KEY_FILE} (chmod 600).`);
  }
  if (mode & 0o077) throw new Error(`${KEY_FILE} is readable by others (mode ${mode.toString(8)}); run chmod 600 on it.`);
  const key = readFileSync(KEY_FILE, 'utf8').trim();
  if (!key) throw new Error(`${KEY_FILE} is empty.`);
  return key;
}

async function health(endpoint: string): Promise<ModelIdentity> {
  const response = await fetch(`${endpoint}/health`, { signal: AbortSignal.timeout(5000) });
  const body = await response.json() as { status?: string; model?: ModelIdentity };
  if (!response.ok || body.status !== 'ready' || !body.model) throw new Error('Local Laya server is not ready.');
  return body.model;
}

async function score(endpoint: string, body: string): Promise<{ status: number; payload: unknown }> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const response = await fetch(`${endpoint}/score`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: ORIGIN },
      body,
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await response.json().catch(() => null);
    if (response.status !== 503 || attempt === 1) return { status: response.status, payload };
    await new Promise(resolve => setTimeout(resolve, 2000)); // busy: one short retry
  }
  throw new Error('unreachable');
}

async function readDeals(fixture: string | null): Promise<WorkerDeal[]> {
  if (fixture) {
    const cases = JSON.parse(readFileSync(fixture, 'utf8')).cases as Array<{ id: string; reply: string }>;
    return cases.map(c => ({
      id: c.id, product: 'Butter', buyer_reply: c.reply, last_outcome: null, stage: 'proposal', workflow_action: 'sample',
    }));
  }
  const { data, error } = await anon
    .from('deals')
    .select('id, product, buyer_reply, last_outcome, stage, workflow_action')
    .is('deleted_at', null)
    .not('buyer_reply', 'is', null);
  if (error) throw new Error(`Could not read deals: ${error.message}`);
  return (data ?? []) as WorkerDeal[];
}

async function alreadyJudged(client: SupabaseClient, dealIds: string[], packageSha: string): Promise<Set<string>> {
  if (dealIds.length === 0) return new Set();
  const { data, error } = await client
    .from('laya_judgments')
    .select('deal_id, input_sha256')
    .eq('question_set', DEAL_QUESTION_SET)
    .eq('model_package_sha256', packageSha)
    .in('deal_id', dealIds);
  if (error) throw new Error(`Could not read laya_judgments: ${error.message}`);
  return new Set((data ?? []).map(row => `${row.deal_id}:${row.input_sha256}`));
}

async function pass(opts: { endpoint: string; dryRun: boolean; fixture: string | null; writer: SupabaseClient | null }) {
  const counts: Record<string, number> = {};
  const bump = (key: string) => { counts[key] = (counts[key] ?? 0) + 1; };

  const model = await health(opts.endpoint);
  const deals = await readDeals(opts.fixture);
  const requests = [];
  for (const deal of deals) {
    const reason = skipReason(deal);
    if (reason) { bump(`skipped_${reason}`); continue; }
    const request = buildScoreRequest(deal);
    if (request) requests.push(request); else bump('skipped_not_verbatim');
  }
  const judged = opts.fixture ? new Set<string>() : await alreadyJudged(anon, requests.map(r => r.dealId), model.package_sha256);

  for (const request of requests) {
    if (judged.has(`${request.dealId}:${request.inputSha256}`)) { bump('skipped_already_judged'); continue; }
    let response;
    try {
      response = await score(opts.endpoint, request.body);
    } catch {
      bump('failed_transport');
      continue;
    }
    const row = judgmentRowFromResponse(request, response, model);
    if (!row) { bump(`failed_http_${response.status}`); continue; }
    bump(row.status === 'scored' ? 'scored' : `not_scored_${row.not_scored_code}`);
    if (opts.dryRun || !opts.writer) continue;
    const { error } = await opts.writer.from('laya_judgments').insert(row);
    if (!error) bump('saved');
    else if (error.code === '23505') bump('skipped_duplicate'); // a concurrent pass saved it first
    else bump('failed_save');
  }
  return { deals: deals.length, model: model.package_sha256.slice(0, 8), ...counts };
}

async function main(): Promise<void> {
  const endpoint = (arg('--endpoint') || 'http://127.0.0.1:8765').replace(/\/$/, '');
  const fixture = arg('--fixture') || null;
  const dryRun = arg('--dry-run') !== null || fixture !== null;
  const watch = Number(arg('--watch') || 0);
  let writer: SupabaseClient | null = null;
  if (!dryRun) {
    try {
      writer = createClient(SUPABASE_URL, loadSecretKey(), { auth: { persistSession: false } });
    } catch (error) {
      console.error(error instanceof Error ? error.message : 'No service-role key.');
      process.exitCode = 1;
      return;
    }
  }

  do {
    const started = new Date().toISOString();
    try {
      const summary = await pass({ endpoint, dryRun, fixture, writer });
      console.log(JSON.stringify({ at: started, dry_run: dryRun, ...summary }));
    } catch (error) {
      // Messages are our own (no reply text); keep the worker alive in watch mode.
      console.error(JSON.stringify({ at: started, error: error instanceof Error ? error.message : 'pass failed' }));
      if (!watch) process.exitCode = 1;
    }
    if (watch > 0) await new Promise(resolve => setTimeout(resolve, watch * 1000));
  } while (watch > 0);
}

await main();
