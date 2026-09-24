import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Deal } from '@/types/crm';
import { calculateLeadScore, followupScore, outcomeScore } from './lead-scoring';

const openDeal: Pick<Deal, 'stage' | 'priority' | 'value' | 'followup_date' | 'last_outcome'> = {
  stage: 'negotiation',
  priority: 'high',
  value: 300000,
  followup_date: '2026-09-24',
  last_outcome: 'Buyer asked for a quote',
};

describe('followupScore', () => {
  it('uses explicit business-calendar dates, not elapsed milliseconds', () => {
    expect(followupScore('2026-09-24', '2026-09-24')).toBe(20);
    expect(followupScore('2026-09-23', '2026-09-24')).toBe(18);
    expect(followupScore('2026-09-27', '2026-09-24')).toBe(18);
    expect(followupScore('2026-09-28', '2026-09-24')).toBe(15);
  });

  it('uses Asia/Bangkok when today is omitted, including across Bangkok midnight', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-24T16:59:59.000Z'));
    expect(followupScore('2026-09-24')).toBe(20);
    vi.setSystemTime(new Date('2026-09-24T17:00:01.000Z'));
    expect(followupScore('2026-09-24')).toBe(18);
  });

  it('does not invent a due date score for malformed date keys', () => {
    expect(followupScore('2026-02-30', '2026-09-24')).toBe(5);
    expect(followupScore('not-a-date', '2026-09-24')).toBe(5);
    expect(followupScore(null, '2026-09-24')).toBe(5);
  });
});

describe('outcomeScore', () => {
  it('checks negation and refusal before positive words', () => {
    expect(outcomeScore('Not confirmed')).toBe(0);
    expect(outcomeScore('Initially agreed, later declined')).toBe(0);
    expect(outcomeScore('Buyer asked for a quote but did not proceed')).toBe(0);
  });

  it('handles explicit Thai refusal/confirmation terms before scoring negated positives', () => {
    expect(outcomeScore('ลูกค้าไม่สนใจ แต่ตอนแรกบอกว่าสนใจ')).toBe(0);
    expect(outcomeScore('ลูกค้ายังไม่ยืนยัน')).toBe(0);
    expect(outcomeScore('ลูกค้าตกลงสั่งซื้อ')).toBe(10);
  });

  it('uses whole words for positive and neutral signals', () => {
    expect(outcomeScore('Confirmed order')).toBe(10);
    expect(outcomeScore('Follow-up next week')).toBe(5);
    expect(outcomeScore('')) .toBe(0);
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

afterEach(() => vi.useRealTimers());
