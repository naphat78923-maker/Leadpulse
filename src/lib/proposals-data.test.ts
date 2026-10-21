// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn(), editTelegramMessage: vi.fn(), answerTelegramCallback: vi.fn() }));

const { decideFromApp, decideProposal, handleTelegramUpdate, sameBusiness, sendPendingProposals } = await import('./proposals-data');

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** Just enough of supabase-js's query builder for proposals-data, over in-memory tables. */
function fakeDb(tables: Record<string, Row[]>, opts: { failUpdatesOn?: string; failInsertsOn?: string } = {}) {
  const from = (table: string) => {
    const filters: Filter[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let payload: Row = {};
    let inserts: Row[] = [];
    let limit = Infinity;
    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      if (op === 'insert') {
        if (opts.failInsertsOn === table) return { data: null, error: { message: 'boom' } };
        const added = inserts.map((r, i) => ({ id: `new-${table}-${rows.length + i + 1}`, deleted_at: null, ...r }));
        rows.push(...added);
        return { data: added.map(r => ({ ...r })), error: null };
      }
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
      insert: (p: Row | Row[]) => { op = 'insert'; inserts = Array.isArray(p) ? p : [p]; return builder; },
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

describe('decideProposal: owner / decision maker', () => {
  const OWNER = '4a2b3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
  beforeEach(() => {
    tables.contacts = [{ id: 'k1', company_id: CO, name: 'Gateaux House - public route', deleted_at: null }];
    tables.enrichment_proposals.push(pending({
      id: OWNER, field: 'decision_maker', value: 'Nok Fixture', source_tier: 'press',
      source_url: 'https://news.example/interview', quote: 'founder Nok Fixture opened the first shop in 1998',
      details: { job_title: 'Founder', dbd_keyword: 'กาโตว์ เฮ้าส์' },
    }));
  });

  it('adds one new named, uncontacted contact and records where the name came from', async () => {
    const result = await decideProposal(fakeDb(tables), OWNER, 'save');
    expect(result.status).toBe('applied');
    const added = tables.contacts.find(c => c.name === 'Nok Fixture')!;
    expect(added).toMatchObject({ company_id: CO, job_title: 'Founder', identity_quality: 'named', status: 'uncontacted' });
    expect(tables.contacts).toHaveLength(2);
    expect(tables.companies[0]).not.toHaveProperty('decision_maker_contact_id');
    expect(tables.enrichment_evidence.map(e => [e.entity_type, e.entity_id, e.field, e.source_tier])).toEqual([
      ['contact', added.id, 'name', 'press'], ['contact', added.id, 'job_title', 'press'],
    ]);
    expect(tables.enrichment_proposals.find(p => p.id === OWNER)).toMatchObject({ status: 'applied', decision_note: `contact ${added.id}` });
  });

  it('never adds a person who is already a contact', async () => {
    tables.contacts.push({ id: 'k2', company_id: CO, name: 'nok fixture ', deleted_at: null });
    const result = await decideProposal(fakeDb(tables), OWNER, 'save');
    expect(result).toMatchObject({ status: 'stale', note: 'already a contact in LeadPulse' });
    expect(tables.contacts).toHaveLength(2);
  });

  it('keeps the proposal pending when the contact cannot be saved', async () => {
    const result = await decideProposal(fakeDb(tables, { failInsertsOn: 'contacts' }), OWNER, 'save');
    expect(result).toMatchObject({ status: 'pending', retry: true });
    expect(tables.contacts).toHaveLength(1);
  });

  it('refuses a person with no role', async () => {
    tables.enrichment_proposals.find(p => p.id === OWNER)!.details = {};
    expect((await decideProposal(fakeDb(tables), OWNER, 'save')).status).toBe('failed');
    expect(tables.contacts).toHaveLength(1);
  });
});

describe('decideProposal: profile fields', () => {
  const MAKE = '5b6c7d8e-9f00-4a1b-8c2d-3e4f5a6b7c8d';
  beforeEach(() => {
    tables.companies[0].what_they_make = null;
    tables.enrichment_proposals.push(pending({
      id: MAKE, field: 'what_they_make', value: 'mille-feuille, opera cake and croissants',
      quote: 'Our counter: mille-feuille, opera cake and croissants, baked daily.',
    }));
  });

  it('fills an empty "what they make" and records its source', async () => {
    expect((await decideProposal(fakeDb(tables), MAKE, 'save')).status).toBe('applied');
    expect(tables.companies[0].what_they_make).toBe('mille-feuille, opera cake and croissants');
    expect(tables.enrichment_evidence[0]).toMatchObject({ field: 'what_they_make', entity_id: CO, company_id: CO });
    expect(tables.companies[0].website).toBeNull();
  });

  it('never overwrites what Pat typed', async () => {
    tables.companies[0].what_they_make = 'butter croissants (Pat)';
    expect((await decideProposal(fakeDb(tables), MAKE, 'save')).status).toBe('stale');
    expect(tables.companies[0].what_they_make).toBe('butter croissants (Pat)');
  });
});

describe('decideProposal: new lead', () => {
  const LEAD = '6c7d8e9f-0a1b-4c2d-9e3f-4a5b6c7d8e9f';
  beforeEach(() => {
    tables.enrichment_proposals.push(pending({
      id: LEAD, field: 'new_company', value: 'Kind Kones Bakery', entity_id: null, company_id: null,
      source_url: 'https://guide.example/vegan-bakeries-bangkok', source_tier: 'press',
      quote: 'Kind Kones Bakery in Ari bakes vegan croissants every morning.',
      details: { industry: 'Bakery', tags: ['vegan', 'croissant'], area: 'Ari', archetype: 'bakery_patisserie_brands', fit_noul: 0.81 },
    }));
  });

  it('adds one prospect company, no deal or contact, and records where the name came from', async () => {
    const result = await decideProposal(fakeDb(tables), LEAD, 'save');
    expect(result.status).toBe('applied');
    const added = tables.companies.find(c => c.name === 'Kind Kones Bakery')!;
    expect(added).toMatchObject({ status: 'prospect', industry: 'Bakery', tags: ['vegan', 'croissant'], lead_source: 'Hermes discovery' });
    expect(added).not.toHaveProperty('what_they_make');
    expect(String(added.notes)).toContain('https://guide.example/vegan-bakeries-bangkok');
    expect(tables.contacts ?? []).toHaveLength(0);
    expect(tables.enrichment_evidence).toEqual([expect.objectContaining({ entity_id: added.id, company_id: added.id, field: 'name', source_tier: 'press' })]);
    expect(result.note).toBe(`company ${added.id}`);
  });

  it('never adds a business that is already in LeadPulse', async () => {
    tables.companies.push({ id: 'c2', name: 'Kind Kones Bakery Co., Ltd.', deleted_at: null });
    expect((await decideProposal(fakeDb(tables), LEAD, 'save')).status).toBe('stale');
    expect(tables.companies).toHaveLength(2);
  });

  it('matches businesses by name, not by legal suffix or punctuation', () => {
    expect(sameBusiness('Gateaux House Co., Ltd.', 'gateaux house')).toBe(true);
    expect(sameBusiness('Gateaux House', 'Gateaux Home')).toBe(false);
    expect(sameBusiness('', 'x')).toBe(false);
  });

  it('refuses a new lead whose subject is set', async () => {
    tables.enrichment_proposals.find(p => p.id === LEAD)!.company_id = CO;
    expect((await decideProposal(fakeDb(tables), LEAD, 'save')).status).toBe('failed');
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

describe('decideFromApp', () => {
  const ops = () => ({ send: vi.fn(async () => 1), edit: vi.fn(async () => undefined), answer: vi.fn(async () => undefined) });

  it('saves from LeadPulse and updates the Telegram message to match', async () => {
    tables.enrichment_proposals[0].telegram_message_id = 55;
    const tg = ops();
    expect(await decideFromApp(PID, 'save', fakeDb(tables), tg)).toEqual({ status: 'applied', note: null, retry: false });
    expect(tables.companies[0].website).toBe('https://www.gateauxhouse.co.th/');
    expect(tg.edit).toHaveBeenCalledWith(55, expect.stringContaining('Saved to LeadPulse</b> (in LeadPulse)'));
  });

  it('does not touch Telegram for a proposal that was never sent', async () => {
    const tg = ops();
    expect((await decideFromApp(PID, 'reject', fakeDb(tables), tg)).status).toBe('rejected');
    expect(tg.edit).not.toHaveBeenCalled();
  });

  it('reports a retry without editing anything', async () => {
    tables.enrichment_proposals[0].telegram_message_id = 55;
    const tg = ops();
    expect(await decideFromApp(PID, 'save', fakeDb(tables, { failUpdatesOn: 'companies' }), tg)).toMatchObject({ status: 'pending', retry: true });
    expect(tg.edit).not.toHaveBeenCalled();
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
