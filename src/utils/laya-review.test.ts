import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import type { LayaJudgmentRow } from '@/lib/crm';
import LAYA_CUTOFFS from './laya-cutoffs.json';
import { buildLayaReviewList, toSavedJudgment } from './laya-review';

const base: Deal = {
  id: 'd1', title: 'Butter · A', stage: 'proposal', product: 'Butter', client: 'Alpha Bakery', company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: 'Please send us a quotation.', nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
};

function row(dealId: string, sha: string, pRequest: number): LayaJudgmentRow {
  const answers: LayaJudgmentRow['answers'] = {
    buyer_response: { probabilities: { requested_next_step: pRequest, declined: 0.05, deferred: 0.05, unclear: 0.5 - pRequest / 2, no_commitment: 0.4 - pRequest / 2 } },
  };
  for (const id of Object.keys(LAYA_CUTOFFS.deal)) if (id !== 'buyer_response') answers![id] = { noul: 0.05 };
  return { deal_id: dealId, question_set: 'terminal', input_sha256: sha, status: 'scored', not_scored_code: null, answers, model_package_sha256: 'a'.repeat(64), scored_at: '2026-10-01T00:00:00Z' };
}

describe('toSavedJudgment', () => {
  it('is fresh only when the saved hash matches the current one', () => {
    expect(toSavedJudgment(row('d1', 'x', 0.9), 'x')!.fresh).toBe(true);
    expect(toSavedJudgment(row('d1', 'x', 0.9), 'y')!.fresh).toBe(false);
    expect(toSavedJudgment(row('d1', 'x', 0.9), null)!.fresh).toBe(false);
    expect(toSavedJudgment(null, 'x')).toBeNull();
  });
});

describe('buildLayaReviewList', () => {
  const deals: Deal[] = [
    { ...base, id: 'sure', client: 'Sure Bakery' },
    { ...base, id: 'unsure', client: 'Unsure Cafe' },
    { ...base, id: 'thai', client: 'Thai Shop', buyer_reply: 'ขอใบเสนอราคาครับ' },
    { ...base, id: 'noreply', client: 'Silent Co', buyer_reply: null },
    { ...base, id: 'stale', client: 'Stale Co' },
  ];
  const judgments = [row('sure', 'h-sure', 0.95), row('unsure', 'h-unsure', 0.5), row('stale', 'old', 0.5)];
  const currentShas = new Map<string, string | null>([['sure', 'h-sure'], ['unsure', 'h-unsure'], ['thai', null], ['stale', 'new']]);

  it('keeps exactly the deals routed to Pat: unsure answers and Thai replies', () => {
    const items = buildLayaReviewList({ deals, meetings: [], judgments, currentShas });
    expect(items.map(i => i.deal.id).sort()).toEqual(['thai', 'unsure']);
  });

  it('leaves out confident, stale and reply-less deals', () => {
    const ids = buildLayaReviewList({ deals, meetings: [], judgments, currentShas }).map(i => i.deal.id);
    for (const id of ['sure', 'stale', 'noreply']) expect(ids).not.toContain(id);
  });

  it('orders by CRM tier, hottest first', () => {
    const hot = { ...base, id: 'hot', client: 'Zulu', stage: 'negotiation' as const, priority: 'high' as const, value: 120000 };
    const items = buildLayaReviewList({
      deals: [{ ...base, id: 'cold', client: 'Alpha', buyer_reply: 'ขอราคาครับ' }, { ...hot, buyer_reply: 'ขอราคาครับ' }],
      meetings: [], judgments: [], currentShas: new Map(),
    });
    expect(items.map(i => i.deal.id)).toEqual(['hot', 'cold']);
  });
});
