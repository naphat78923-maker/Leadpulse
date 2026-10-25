// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { WebsiteLead } from '@/utils/website-lead';

vi.mock('@/lib/supabase', () => ({ supabase: {} }));
vi.mock('@/lib/telegram', () => ({ sendTelegramMessage: vi.fn(), telegramConfigured: () => false }));

const { captureWebsiteLead, setClockForTests } = await import('./website-lead-data');
// Thursday 22 Oct 2026, 10:00 in Bangkok.
setClockForTests(() => new Date('2026-10-22T03:00:00Z'));

type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;

/** Just enough of supabase-js's query builder for website-lead-data, over in-memory tables. */
function fakeDb(tables: Record<string, Row[]>, opts: { failInsertsOn?: string } = {}) {
  const from = (table: string) => {
    const filters: Filter[] = [];
    let op: 'select' | 'update' | 'insert' = 'select';
    let payload: Row = {};
    let inserts: Row[] = [];
    const run = () => {
      const rows = tables[table] ?? (tables[table] = []);
      if (op === 'insert') {
        if (opts.failInsertsOn === table) return { data: null, error: { message: 'boom' } };
        const added = inserts.map((r, i) => ({ id: `new-${table}-${rows.length + i + 1}`, deleted_at: null, ...r }));
        rows.push(...added);
        return { data: added.map(r => ({ ...r })), error: null };
      }
      const hit = rows.filter(r => filters.every(f => f(r)));
      if (op === 'update') hit.forEach(r => Object.assign(r, payload));
      return { data: hit.map(r => ({ ...r })), error: null };
    };
    const builder = {
      select: () => builder,
      update: (p: Row) => { op = 'update'; payload = p; return builder; },
      insert: (p: Row | Row[]) => { op = 'insert'; inserts = Array.isArray(p) ? p : [p]; return builder; },
      eq: (c: string, v: unknown) => { filters.push(r => r[c] === v); return builder; },
      is: (c: string, v: unknown) => { filters.push(r => (r[c] ?? null) === v); return builder; },
      then: (resolve: (v: unknown) => void) => resolve(run()),
    };
    return builder;
  };
  return { from } as unknown as SupabaseClient;
}

const lead = (over: Partial<WebsiteLead> = {}): WebsiteLead => ({
  business_name: 'Baan Khanom', contact_name: 'Khun Nok', phone: '081-234-5678', line_id: null, email: null,
  message: 'Do you sell 5 kg butter?', utm_source: 'facebook', utm_medium: 'paid', utm_campaign: 'Croissant Oct',
  utm_content: null, fbclid: 'IwAR0abc', ...over,
});

let tables: Record<string, Row[]>;
beforeEach(() => {
  tables = {
    companies: [
      { id: 'c1', name: 'Sweet Corner Co., Ltd.', website: null, notes: 'Met at THAIFEX', acquisition_source: 'outbound', deleted_at: null },
      { id: 'c2', name: 'Old Bakery', website: null, notes: null, acquisition_source: null, deleted_at: '2026-09-01T00:00:00Z' },
    ],
    company_aliases: [],
    contacts: [{ id: 'p1', company_id: 'c1', name: 'Khun Ploy', email: null, phone: '089 999 0000', phone_second: null, line: null, deleted_at: null }],
    deals: [],
  };
});

describe('captureWebsiteLead', () => {
  it('creates a tagged prospect, the person who wrote and a Research deal due today, then alerts Pat', async () => {
    const send = vi.fn().mockResolvedValue(1);
    const result = await captureWebsiteLead(lead(), fakeDb(tables), send);

    const company = tables.companies.at(-1)!;
    expect(company).toMatchObject({
      name: 'Baan Khanom', status: 'prospect', lead_source: 'Website form',
      acquisition_source: 'meta_ad', acquisition_campaign: 'Croissant Oct',
    });
    expect(company.notes).toBe('Website enquiry Thu 22 Oct: “Do you sell 5 kg butter?” (utm facebook / paid)');
    expect(tables.contacts.at(-1)).toMatchObject({ company_id: company.id, name: 'Khun Nok', identity_quality: 'named', phone: '081-234-5678' });
    expect(tables.deals).toEqual([expect.objectContaining({
      company_id: company.id, stage: 'research', followup_date: '2026-10-22', contact_ids: [tables.contacts.at(-1)!.id],
    })]);
    expect(result).toMatchObject({ matched: null, deal: { created: true }, alerted: true });
    expect(send.mock.calls[0][0]).toContain('Meta ad enquiry: Baan Khanom');
  });

  it('links a known business by its contact phone instead of duplicating it, keeping its source', async () => {
    const result = await captureWebsiteLead(lead({ business_name: 'Sweet Corner Bakery', phone: '+66 89 999 0000' }), fakeDb(tables), null);

    expect(tables.companies).toHaveLength(2);
    expect(tables.companies[0]).toMatchObject({ acquisition_source: 'outbound' });
    expect(tables.companies[0].notes).toMatch(/^Met at THAIFEX\nWebsite enquiry Thu 22 Oct/);
    expect(tables.contacts).toHaveLength(1);
    expect(tables.deals).toEqual([expect.objectContaining({ company_id: 'c1', contact_ids: ['p1'] })]);
    expect(result).toMatchObject({ companyId: 'c1', matched: 'phone', contactId: 'p1', alerted: false });
  });

  it('keeps an open deal rather than adding a second one', async () => {
    tables.deals.push({ id: 'd1', company_id: 'c1', title: 'Sweet Corner — Butter', stage: 'contacted', deleted_at: null });
    const result = await captureWebsiteLead(lead({ business_name: 'sweet corner' }), fakeDb(tables), null);

    expect(tables.deals).toHaveLength(1);
    expect(result).toMatchObject({ matched: 'name', dealId: 'd1', deal: { created: false, title: 'Sweet Corner — Butter' } });
    // A new person at a known account is added as a contact.
    expect(tables.contacts.at(-1)).toMatchObject({ company_id: 'c1', name: 'Khun Nok' });
  });

  it('tags a known account that had no source recorded', async () => {
    tables.companies[0].acquisition_source = null;
    await captureWebsiteLead(lead({ business_name: 'Sweet Corner' }), fakeDb(tables), null);
    expect(tables.companies[0]).toMatchObject({ acquisition_source: 'meta_ad', acquisition_campaign: 'Croissant Oct' });
  });

  it('does not match an archived account', async () => {
    await captureWebsiteLead(lead({ business_name: 'Old Bakery' }), fakeDb(tables), null);
    expect(tables.companies).toHaveLength(3);
  });

  it('keeps the lead when Telegram fails, and fails loudly when the account cannot be saved', async () => {
    const result = await captureWebsiteLead(lead(), fakeDb(tables), vi.fn().mockRejectedValue(new Error('down')));
    expect(result).toMatchObject({ alerted: false, deal: { created: true } });
    await expect(captureWebsiteLead(lead({ business_name: 'Another', phone: '082 000 0000' }), fakeDb(tables, { failInsertsOn: 'companies' }), null))
      .rejects.toThrow('Could not save the account');
  });
});
