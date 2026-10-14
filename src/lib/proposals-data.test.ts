// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn(), editTelegramMessage: vi.fn(), answerTelegramCallback: vi.fn() }));

const { decideProposal, handleTelegramUpdate, sendPendingProposals } = await import('./proposals-data');

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** Just enough of supabase-js's query builder for proposals-data, over in-memory tables. */
function fakeDb(tables: Record<string, Row[]>, opts: { failUpdatesOn?: string } = {}) {
  const from = (table: string) => {
    const filters: Filter[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let payload: Row = {};
    let limit = Infinity;
    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      if (op === 'insert') { rows.push({ ...payload }); return { data: [payload], error: null }; }
      const hit = rows.filter(r => filters.every(f => f(r))).slice(0, limit);
      if (op === 'update') {
        if (opts.failUpdatesOn === table) return { data: null, error: { message: 'boom' } };
        hit.forEach(r => Object.assign(r, payload));
      }
      return { data: hit.map(r => ({ ...r })), error: null };
    };
    const builder = {
      select: () => builder,
      update: (p: Row) => { op = 'update'; payload = p; return builder; },
      insert: (p: Row) => { op = 'insert'; payload = p; return Promise.resolve(run()); },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return builder; },
      is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return builder; },
      or: (expr: string) => {
        const parts = expr.split(',').map(p => p.split('.'));
        filters.push(r => parts.some(([c, o, v]) => (o === 'is' ? (r[c] ?? null) === null : r[c] === (v ?? ''))));
        return builder;
      },
      order: () => builder,
      limit: (n: number) => { limit = n; return builder; },
      maybeSingle: () => Promise.resolve({ data: run().data?.[0] ?? null, error: null }),
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

const CO = 'c0ffee00-0000-4000-8000-000000000001';
const PID = '3f1c2b4a-5d6e-4f70-8a9b-0c1d2e3f4a5b';
const pending = (over: Row = {}): Row => ({
  id: PID, entity_type: 'company', entity_id: CO, company_id: CO, field: 'website',
  value: 'https://www.gateauxhouse.co.th/', current_value: null, source_url: 'https://www.gateauxhouse.co.th/',
  source_tier: 'own_site', quote: 'Gateaux House — Bakery & Café', quote_check: 'passed', reason: null,
  status: 'pending', decision_note: null, run_ref: 'website-finder test', proposed_at: '2026-10-14T13:00:00Z',
  telegram_message_id: null, sent_at: null, decided_at: null, ...over,
});

let tables: Record<string, Row[]>;
beforeEach(() => {
  tables = {
    companies: [{ id: CO, name: 'Gateaux House', website: null }],
    enrichment_proposals: [pending()],
    enrichment_evidence: [],
  };
});

describe('decideProposal', () => {
  it('saves an approved website, reads it back and records its source', async () => {
    const result = await decideProposal(fakeDb(tables), PID, 'save');
    expect(result.status).toBe('applied');
    expect(tables.companies[0].website).toBe('https://www.gateauxhouse.co.th/');
    expect(tables.enrichment_proposals[0]).toMatchObject({ status: 'applied' });
    expect(tables.enrichment_evidence).toHaveLength(1);
    expect(tables.enrichment_evidence[0]).toMatchObject({
      entity_type: 'company', entity_id: CO, field: 'website', outcome: 'applied', quote_check: 'passed', source_tier: 'own_site',
    });
  });

  it('never overwrites a website Pat typed after the proposal was made', async () => {
    tables.companies[0].website = 'https://typed-by-pat.example';
    const result = await decideProposal(fakeDb(tables), PID, 'save');
    expect(result.status).toBe('stale');
    expect(tables.companies[0].website).toBe('https://typed-by-pat.example');
    expect(tables.enrichment_evidence).toHaveLength(0);
  });

  it('records a rejection and writes nothing else', async () => {
    const result = await decideProposal(fakeDb(tables), PID, 'reject');
    expect(result.status).toBe('rejected');
    expect(tables.companies[0].website).toBeNull();
    expect(tables.enrichment_proposals[0].decided_at).toBeTruthy();
  });

  it('a second tap does nothing new', async () => {
    await decideProposal(fakeDb(tables), PID, 'reject');
    const again = await decideProposal(fakeDb(tables), PID, 'save');
    expect(again.status).toBe('rejected');
    expect(tables.companies[0].website).toBeNull();
  });

  it('leaves the proposal pending when the save itself fails, so the tap can be retried', async () => {
    const result = await decideProposal(fakeDb(tables, { failUpdatesOn: 'companies' }), PID, 'save');
    expect(result).toMatchObject({ status: 'pending', retry: true });
    expect(tables.enrichment_proposals[0].status).toBe('pending');
  });

  it('refuses a field outside the allowlist', async () => {
    tables.enrichment_proposals[0].field = 'name';
    const result = await decideProposal(fakeDb(tables), PID, 'save');
    expect(result.status).toBe('failed');
    expect(tables.companies[0]).not.toHaveProperty('name', 'https://www.gateauxhouse.co.th/');
  });
});

describe('handleTelegramUpdate', () => {
  const tg = () => ({ send: vi.fn(async () => 777), edit: vi.fn(async () => undefined), answer: vi.fn(async () => undefined) });
  const press = (data: string, chat = 8800) => ({ callback_query: { id: 'cb1', data, message: { message_id: 55, chat: { id: chat } } } });

  it('acts only on a button press from the configured chat', async () => {
    const ops = tg();
    expect(await handleTelegramUpdate({}, '8800', fakeDb(tables), ops)).toBe('ignored: not a button press');
    expect(await handleTelegramUpdate(press(`p:${PID}:s`, 1234), '8800', fakeDb(tables), ops)).toBe('ignored: another chat');
    expect(tables.companies[0].website).toBeNull();
    expect(ops.answer).not.toHaveBeenCalled();
  });

  it('saves on ✅, answers the tap and edits the message to say so', async () => {
    const ops = tg();
    expect(await handleTelegramUpdate(press(`p:${PID}:s`), '8800', fakeDb(tables), ops)).toBe('save: applied');
    expect(ops.answer).toHaveBeenCalledWith('cb1', 'Saved');
    expect(ops.edit).toHaveBeenCalledWith(55, expect.stringContaining('Saved to LeadPulse'));
  });
});

describe('sendPendingProposals', () => {
  it('sends each unsent proposal once with buttons and records the message id', async () => {
    const ops = { send: vi.fn(async () => 777), edit: vi.fn(), answer: vi.fn() };
    expect(await sendPendingProposals(fakeDb(tables), ops)).toEqual({ sent: 1, failed: 0 });
    expect(ops.send).toHaveBeenCalledWith(expect.stringContaining('Website for Gateaux House?'), expect.any(Array));
    expect(tables.enrichment_proposals[0]).toMatchObject({ telegram_message_id: 777 });
    expect(await sendPendingProposals(fakeDb(tables), ops)).toEqual({ sent: 0, failed: 0 });
  });
});
