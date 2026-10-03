import { describe, expect, it } from 'vitest';
import type { ReviewDecisionRow } from '@/lib/crm';
import type { DealGrade } from './grade';
import { decisionFor, decisionRow, withDecision } from './laya-decisions';

const review: DealGrade = {
  status: 'needs_review', baseTier: 'C', tier: 'C', suggestedTier: 'B', momentum: 0.3, reasons: [],
  review: ['unclear whether the buyer asked for a next step (0.5)'], quantity: 'none',
};

const row = (decision: 'confirm' | 'reject', sha = 'x', over: Partial<ReviewDecisionRow> = {}): ReviewDecisionRow => ({
  deal_id: 'd1', input_sha256: sha, decision, base_tier: 'C', suggested_tier: 'B', momentum: 0.3, review_reasons: [], decided_at: '2026-10-03T00:00:00Z', ...over,
});

describe('decisionFor', () => {
  it('finds the newest decision for this deal and reply', () => {
    const rows = [row('reject'), row('confirm'), row('confirm', 'old'), row('confirm', 'x', { deal_id: 'd2' })];
    expect(decisionFor(rows, 'd1', 'x')!.decision).toBe('reject');
    expect(decisionFor(rows, 'd1', 'new')).toBeNull();
    expect(decisionFor(rows, 'd1', null)).toBeNull();
  });
});

describe('withDecision', () => {
  it('takes the suggested tier on confirm and keeps the CRM tier on reject', () => {
    expect(withDecision(review, row('confirm'))).toMatchObject({ status: 'graded', tier: 'B', decision: 'confirm' });
    expect(withDecision(review, row('reject'))).toMatchObject({ status: 'graded', tier: 'C', decision: 'reject' });
  });

  it('keeps the CRM tier when there was nothing to suggest (a Thai reply)', () => {
    expect(withDecision({ ...review, suggestedTier: null, momentum: null }, row('confirm'))).toMatchObject({ status: 'graded', tier: 'C' });
  });

  it('leaves other grades and undecided ones alone', () => {
    expect(withDecision(review, null)).toBe(review);
    const graded = { ...review, status: 'graded' as const };
    expect(withDecision(graded, row('reject'))).toBe(graded);
  });
});

describe('decisionRow', () => {
  it('records what Pat saw when deciding', () => {
    expect(decisionRow('d1', 'x', review, 'confirm')).toEqual({
      deal_id: 'd1', input_sha256: 'x', decision: 'confirm', base_tier: 'C', suggested_tier: 'B', momentum: 0.3,
      review_reasons: ['unclear whether the buyer asked for a next step (0.5)'],
    });
  });
});
