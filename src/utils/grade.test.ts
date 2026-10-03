import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import LAYA_CUTOFFS from './laya-cutoffs.json';
import { GRADE_WEIGHTS, gradeDeal, type SavedAnswer, type SavedJudgment } from './grade';

// proposal 20 + medium 10 + no value 0 + no follow-up 5 + no outcome → tier C (20–39).
const deal: Deal = {
  id: 'deal-1',
  title: 'Butter · Bakery',
  stage: 'proposal',
  product: 'Butter',
  client: 'Bakery',
  company_id: null,
  contact_ids: [],
  value: null,
  priority: 'medium',
  next_action: null,
  followup_date: null,
  last_outcome: null,
  buyer_reply: 'Please send us a quotation.',
  nudge_count: 0,
  workflow_action: 'sample',
  nudge_stage: null,
  sample_status: null,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-01T00:00:00Z',
};

const NOULS = Object.keys(LAYA_CUTOFFS.deal).filter(id => id !== 'buyer_response');

/** A complete, confident, neutral judgment; overrides change single answers. */
function judgment(
  overrides: Record<string, number> = {},
  probabilities: Record<string, number> = {},
  extra: Partial<SavedJudgment> = {},
): SavedJudgment {
  const answers: Record<string, SavedAnswer> = {
    buyer_response: {
      probabilities: { unclear: 0.7, no_commitment: 0.1, declined: 0.05, deferred: 0.05, requested_next_step: 0.1, ...probabilities },
    },
  };
  for (const id of NOULS) answers[id] = { noul: overrides[id] ?? 0.05 };
  return { status: 'scored', answers, fresh: true, ...extra };
}

describe('gradeDeal — deterministic gates', () => {
  it('does not grade closed or parked deals', () => {
    for (const changed of [{ stage: 'closed_won' as const }, { stage: 'closed_lost' as const }, { workflow_action: 'parked' as const }]) {
      expect(gradeDeal({ deal: { ...deal, ...changed }, judgment: judgment(), chasesSinceReply: 0 }).status).toBe('not_graded');
    }
  });

  it('does not grade without a verbatim reply, and keeps the deterministic tier', () => {
    const grade = gradeDeal({ deal: { ...deal, buyer_reply: '  ' }, judgment: judgment(), chasesSinceReply: 0 });
    expect(grade).toMatchObject({ status: 'not_graded', baseTier: 'C', tier: 'C', momentum: null });
    expect(grade.review).toEqual(['no verbatim buyer reply recorded']);
  });

  it('does not grade without a judgment, or with one made on an older reply', () => {
    expect(gradeDeal({ deal, judgment: null, chasesSinceReply: 0 }).review).toEqual(['not judged yet']);
    const stale = gradeDeal({ deal, judgment: judgment({}, {}, { fresh: false }), chasesSinceReply: 0 });
    expect(stale.status).toBe('not_graded');
    expect(stale.review[0]).toMatch(/older reply/);
  });
});

describe('gradeDeal — routed to Pat', () => {
  it('sends a Thai reply to review before looking at any answer', () => {
    const grade = gradeDeal({ deal: { ...deal, buyer_reply: 'ขอใบเสนอราคาครับ' }, judgment: judgment(), chasesSinceReply: 0 });
    expect(grade).toMatchObject({ status: 'needs_review', tier: 'C', momentum: null });
    expect(grade.review[0]).toMatch(/Thai reply/);
  });

  it('sends a refused judgment to review with its reason', () => {
    const grade = gradeDeal({ deal, judgment: { status: 'not_scored', not_scored_code: 'contact_opt_out', fresh: true }, chasesSinceReply: 0 });
    expect(grade.status).toBe('needs_review');
    expect(grade.review[0]).toMatch(/contact_opt_out/);
  });

  it('sends an incomplete judgment to review', () => {
    const partial = judgment();
    delete partial.answers!.concern_price;
    const grade = gradeDeal({ deal, judgment: partial, chasesSinceReply: 0 });
    expect(grade.status).toBe('needs_review');
    expect(grade.review[0]).toMatch(/missing concern_price/);
  });

  it('sends unsure buyer intent to review, keeping the tier but showing a suggestion', () => {
    const grade = gradeDeal({ deal, judgment: judgment({}, { requested_next_step: 0.5, unclear: 0.3 }), chasesSinceReply: 0 });
    expect(grade.status).toBe('needs_review');
    expect(grade.tier).toBe('C');
    expect(grade.suggestedTier).not.toBeNull();
    expect(grade.review[0]).toMatch(/asked for a next step \(0\.5\)/);
  });

  it('sends a signal-tier answer near its cut-off to review', () => {
    const grade = gradeDeal({ deal, judgment: judgment({ concern_price: 0.5 }), chasesSinceReply: 0 });
    expect(grade.status).toBe('needs_review');
    expect(grade.review.join(' ')).toMatch(/price concern \(0\.5 vs cut-off 0\.45\)/);
  });
});

describe('gradeDeal — graded', () => {
  it('moves a clearly warm deal up a tier and explains why', () => {
    const grade = gradeDeal({
      deal: { ...deal, buyer_reply: 'We tested the sample and loved it. Please quote 40 kg per month.' },
      judgment: judgment({ trial_reported: 0.9, trial_positive: 0.9 }, { requested_next_step: 0.9, unclear: 0, declined: 0.02, deferred: 0.02 }),
      chasesSinceReply: 0,
    });
    expect(grade.status).toBe('graded');
    expect(grade.quantity).toBe('large');
    expect(grade.momentum!).toBeGreaterThanOrEqual(0.25);
    expect(grade.tier).toBe('B');
    expect(grade.reasons[0].label).toMatch(/asked for a next step/);
    expect(grade.reasons.map(r => r.label)).toEqual(expect.arrayContaining(['buyer reported a good trial', 'order size: large']));
    // Each reason says where it comes from; weighted answers carry their probability.
    expect(grade.reasons[0]).toMatchObject({ group: 'buyer', strength: 0.9 });
    expect(grade.reasons.find(r => r.label === 'order size: large')).toMatchObject({ group: 'order' });
    expect(grade.reasons.find(r => r.label === 'buyer reported a good trial')!.strength).toBeUndefined();
  });

  it('moves a clearly lost deal down two tiers, clamped at D', () => {
    const grade = gradeDeal({
      deal: { ...deal, buyer_reply: 'Too expensive and it melted in testing. We will not proceed.' },
      judgment: judgment({ concern_price: 0.9, concern_technical: 0.9, trial_negative: 0.9 }, { declined: 0.95, unclear: 0, requested_next_step: 0.01 }),
      chasesSinceReply: 0,
    });
    expect(grade.status).toBe('graded');
    expect(grade.momentum!).toBeLessThanOrEqual(-0.5);
    expect(grade.tier).toBe('D');
  });

  it('subtracts chases since the last reply, capped at four', () => {
    const quiet = gradeDeal({ deal, judgment: judgment(), chasesSinceReply: 0 }).momentum!;
    const three = gradeDeal({ deal, judgment: judgment(), chasesSinceReply: 3 }).momentum!;
    const nine = gradeDeal({ deal, judgment: judgment(), chasesSinceReply: 9 }).momentum!;
    expect(three).toBeCloseTo(quiet + 3 * GRADE_WEIGHTS.perChaseSinceReply, 1);
    expect(nine).toBeCloseTo(quiet + 4 * GRADE_WEIGHTS.perChaseSinceReply, 1);
    expect(nine).toBeLessThan(three);
  });

  it('shows display-only answers without counting them', () => {
    const low = gradeDeal({ deal, judgment: judgment({ commercial_info_request: 0.05 }), chasesSinceReply: 0 });
    const high = gradeDeal({ deal, judgment: judgment({ commercial_info_request: 0.95 }), chasesSinceReply: 0 });
    expect(high.momentum).toBe(low.momentum);
    expect(high.reasons.find(r => r.label.startsWith('commercial_info_request'))).toMatchObject({ effect: 0 });
  });

  it('keeps the tier when momentum is small', () => {
    const grade = gradeDeal({ deal, judgment: judgment(), chasesSinceReply: 0 });
    expect(grade.status).toBe('graded');
    expect(grade.tier).toBe(grade.baseTier);
  });
});
