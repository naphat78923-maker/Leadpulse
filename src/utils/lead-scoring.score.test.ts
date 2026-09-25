import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Deal } from '@/types/crm';
import { calculateLeadScore, followupPoints, outcomePoints, valuePoints, STAGE_POINTS, PRIORITY_POINTS } from './lead-scoring';

const openDeal: Pick<Deal, 'stage' | 'priority' | 'value' | 'followup_date' | 'last_outcome'> = {
  stage: 'negotiation',
  priority: 'high',
  value: 300000,
  followup_date: '2026-09-24',
  last_outcome: 'Buyer asked for a quote',
};

describe('followupPoints', () => {
  it('uses explicit business-calendar dates, not elapsed milliseconds', () => {
    expect(followupPoints('2026-09-24', '2026-09-24')).toBe(20);
    expect(followupPoints('2026-09-23', '2026-09-24')).toBe(18);
    expect(followupPoints('2026-09-27', '2026-09-24')).toBe(18);
    expect(followupPoints('2026-09-28', '2026-09-24')).toBe(15);
  });

  it('uses Asia/Bangkok when today is omitted, including across Bangkok midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T16:59:59.000Z'));
    expect(followupPoints('2026-09-24')).toBe(20);
    vi.setSystemTime(new Date('2026-09-24T17:00:01.000Z'));
    expect(followupPoints('2026-09-24')).toBe(18);
  });

  it('does not invent a due date score for malformed date keys', () => {
    expect(followupPoints('2026-02-30', '2026-09-24')).toBe(5);
    expect(followupPoints('not-a-date', '2026-09-24')).toBe(5);
    expect(followupPoints(null, '2026-09-24')).toBe(5);
  });
});

describe('outcomePoints', () => {
  it('checks negation and refusal before positive words', () => {
    expect(outcomePoints('Not confirmed')).toBe(0);
    expect(outcomePoints('Initially agreed, later declined')).toBe(0);
    expect(outcomePoints('Buyer asked for a quote but did not proceed')).toBe(0);
  });

  it('handles explicit Thai refusal/confirmation terms before scoring negated positives', () => {
    expect(outcomePoints('ลูกค้าไม่สนใจ แต่ตอนแรกบอกว่าสนใจ')).toBe(0);
    expect(outcomePoints('ลูกค้ายังไม่ยืนยัน')).toBe(0);
    expect(outcomePoints('ลูกค้าตกลงสั่งซื้อ')).toBe(10);
  });

  it('uses whole words for positive and neutral signals', () => {
    expect(outcomePoints('Confirmed order')).toBe(10);
    expect(outcomePoints('Follow-up next week')).toBe(5);
    expect(outcomePoints('')) .toBe(0);
  });
});

describe('calculateLeadScore', () => {
  it.each([
    ['closed_won', 'success'],
    ['closed_lost', 'parked'],
  ] as const)('does not score completed deal status %s', (stage, workflow_action) => {
    expect(calculateLeadScore({ ...openDeal, stage, workflow_action })).toBe(0);
  });

  it('does not inflate an explicitly parked open-stage deal', () => {
    expect(calculateLeadScore({ ...openDeal, workflow_action: 'parked' })).toBe(0);
  });

  it('still calculates a score for an open opportunity', () => {
    expect(calculateLeadScore(openDeal)).toBeGreaterThan(0);
  });
});


describe('rule table', () => {
  it('valuePoints thresholds', () => {
    expect(valuePoints(null)).toBe(0);
    expect(valuePoints(4999)).toBe(3);
    expect(valuePoints(5000)).toBe(5);
    expect(valuePoints(9999)).toBe(5);
    expect(valuePoints(10000)).toBe(7);
    expect(valuePoints(20000)).toBe(10);
    expect(valuePoints(50000)).toBe(15);
    expect(valuePoints(100000)).toBe(20);
    expect(valuePoints(1000000)).toBe(20);
  });

  it('stage and priority weights', () => {
    expect(STAGE_POINTS.research).toBe(5);
    expect(STAGE_POINTS.closed_won).toBe(30);
    expect(STAGE_POINTS.closed_lost).toBe(0);
    expect(PRIORITY_POINTS.high).toBe(20);
    expect(PRIORITY_POINTS.medium).toBe(10);
    expect(PRIORITY_POINTS.low).toBe(5);
  });

  // Deferred decision (kept by explicit approval): an unknown/missing follow-up
  // date scores 5, the same as "due in 15–30 days" — it never jumps to 0 or 10.
  // Changing this to 0 moves the record down at most one tier; see the
  // unknown-date ranking impact note before editing.
  it('pins missing and malformed follow-up dates to 5 points', () => {
    expect(followupPoints(null, '2026-09-24')).toBe(5);
    expect(followupPoints('2026-13-45', '2026-09-24')).toBe(5);
    expect(followupPoints('2026-09-24', null as never)).toBe(5);
  });

  // Known quirk, pinned so a "cleanup" cannot silently change scores: a
  // whitespace-only outcome note scores 3 like any other unmatched note text.
  it('pins whitespace-only outcome text to 3 points', () => {
    expect(outcomePoints('   ')).toBe(3);
  });
});

afterEach(() => vi.useRealTimers());
