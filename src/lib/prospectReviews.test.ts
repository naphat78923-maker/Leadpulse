// Tests for the saved-review writer.
//
// The point of these is the payload, not the plumbing: what exactly reaches the
// database when a review is saved. Two properties matter and both are asserted here:
//   * a review row carries review columns only
//   * the single permitted CRM write is one `followup_date` field, and it goes
//     through the app's own deal writer so nothing else on the deal moves with it

import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  table: '' as string,
  selectColumns: null as string | null,
  selectResult: { data: null as unknown[] | null, error: null as { code?: string; message?: string } | null },
  upserts: [] as { table: string; payload: Record<string, unknown>; options: unknown }[],
  deletes: [] as { table: string; column: string; value: unknown }[],
}));

const crmMocks = vi.hoisted(() => ({ updateDeal: vi.fn() }));

vi.mock('./supabase', () => {
  const result = (data: unknown, error: unknown) => {
    const promise = Promise.resolve({ data, error }) as Promise<unknown> & { single: () => Promise<unknown> };
    promise.single = async () => ({ data, error });
    return promise;
  };
  return {
    supabase: {
      from(table: string) {
        db.table = table;
        return {
          select(columns?: string) {
            db.selectColumns = columns ?? null;
            return result(db.selectResult.data, db.selectResult.error);
          },
          upsert(payload: Record<string, unknown>, options: unknown) {
            db.upserts.push({ table, payload, options });
            return { select: () => ({ single: async () => ({ data: { ...payload, id: 'row-1' }, error: null }) }) };
          },
          delete() {
            return {
              eq: async (column: string, value: unknown) => {
                db.deletes.push({ table, column, value });
                return { error: null };
              },
            };
          },
        };
      },
    },
  };
});

vi.mock('./crm', () => crmMocks);

import {
  clearProspectReview,
  loadProspectReviews,
  restoreProspectReview,
  saveProspectReview,
  setDealFollowupDate,
  type ProspectReviewRow,
} from './prospectReviews';
import type { ReviewRowPayload } from '@/utils/prospectReviewDecision';

const payload: ReviewRowPayload = {
  company_id: 'company-1',
  decision: 'shortlist',
  reason_code: 'plausible_application',
  reason_note: 'Vegan concept with its own pastry section',
  criterion_ref: null,
  reviewed_at: '2026-09-11T10:00:00.000Z',
  next_action: 'Send the sample list',
  next_action_owner: 'Pat',
  next_action_due: '2026-09-30',
  evidence_note: 'Menu checked on their own site',
  evidence_links: ['https://example.test'],
  needs_data_review: false,
};

const REVIEW_COLUMNS = Object.keys(payload).sort();

beforeEach(() => {
  db.selectResult = { data: [], error: null };
  db.upserts = [];
  db.deletes = [];
  db.selectColumns = null;
  crmMocks.updateDeal.mockReset();
  crmMocks.updateDeal.mockResolvedValue({});
});

describe('saveProspectReview', () => {
  it('writes one review row, keyed by company, with no field outside the review shape', () => {
    return saveProspectReview(payload).then(() => {
      expect(db.table).toBe('prospect_reviews');
      expect(db.upserts).toHaveLength(1);
      const { payload: sent, options } = db.upserts[0];
      expect(options).toEqual({ onConflict: 'company_id' });
      expect(Object.keys(sent).filter((k) => k !== 'updated_at').sort()).toEqual(REVIEW_COLUMNS);
      // nothing that could touch account state rides along
      for (const forbidden of ['status', 'stage', 'nudge_stage', 'last_outcome', 'account_owner']) {
        expect(sent).not.toHaveProperty(forbidden);
      }
    });
  });
});

describe('restoreProspectReview', () => {
  it('restores the recorded values verbatim, including the original review timestamp', async () => {
    const row: ProspectReviewRow = {
      ...payload,
      id: 'row-9',
      created_at: '2026-09-11T09:00:00.000Z',
      updated_at: '2026-09-11T10:00:00.000Z',
    };
    await restoreProspectReview(row);
    const sent = db.upserts[0].payload;
    expect(sent.reviewed_at).toBe('2026-09-11T10:00:00.000Z');
    expect(sent.decision).toBe('shortlist');
    expect(Object.keys(sent).filter((k) => k !== 'updated_at').sort()).toEqual(REVIEW_COLUMNS);
  });
});

describe('clearProspectReview', () => {
  it('removes exactly the row for one company', async () => {
    await clearProspectReview('company-1');
    expect(db.deletes).toEqual([{ table: 'prospect_reviews', column: 'company_id', value: 'company-1' }]);
  });
});

describe('setDealFollowupDate (the only permitted CRM write)', () => {
  it('sends one field through the app\u2019s own deal writer', async () => {
    await setDealFollowupDate('deal-1', '2026-09-30');
    expect(crmMocks.updateDeal).toHaveBeenCalledTimes(1);
    const [id, patch] = crmMocks.updateDeal.mock.calls[0];
    expect(id).toBe('deal-1');
    expect(patch).toEqual({ followup_date: '2026-09-30' });
    expect(Object.keys(patch)).toEqual(['followup_date']);
  });

  it('can revert a date it set, and still sends only that field', async () => {
    await setDealFollowupDate('deal-1', null);
    const [, patch] = crmMocks.updateDeal.mock.calls[0];
    expect(patch).toEqual({ followup_date: null });
    expect(Object.keys(patch)).toEqual(['followup_date']);
  });
});

describe('loadProspectReviews', () => {
  it('returns the saved rows', async () => {
    db.selectResult = { data: [{ company_id: 'company-1', decision: 'shortlist' }], error: null };
    const result = await loadProspectReviews();
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.rows).toHaveLength(1);
  });

  it('reports a missing table as such, so the screen can say the migration has not run', async () => {
    db.selectResult = { data: null, error: { code: '42P01', message: 'relation "public.prospect_reviews" does not exist' } };
    const result = await loadProspectReviews();
    expect(result).toMatchObject({ ok: false, tableMissing: true });
  });

  it('does not treat an unrelated error as a missing table', async () => {
    db.selectResult = { data: null, error: { code: '42501', message: 'permission denied for table prospect_reviews' } };
    const result = await loadProspectReviews();
    expect(result).toMatchObject({ ok: false, tableMissing: false });
  });
});
