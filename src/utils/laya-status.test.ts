import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import type { DealGrade } from './grade';
import { STALLED_AFTER_MINUTES, buildLayaStatus, formatAgo } from './laya-status';

const NOW = Date.parse('2026-10-02T12:00:00Z');
const minutesAgo = (m: number) => new Date(NOW - m * 60_000).toISOString();

const deal = (id: string, reply: string | null, updated = minutesAgo(5)): Deal => ({
  id, title: 'Butter', stage: 'proposal', product: 'Butter', client: id, company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: reply, nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: updated,
});

const grade = (status: DealGrade['status']): DealGrade => ({
  status, baseTier: 'B', tier: 'B', suggestedTier: null, momentum: null, reasons: [], review: [], quantity: 'none',
});

describe('buildLayaStatus', () => {
  it('is idle when no open deal has a pasted reply', () => {
    const status = buildLayaStatus({ deals: [deal('a', null)], grades: new Map(), judgments: [], now: NOW });
    expect(status).toMatchObject({ withReply: 0, waiting: 0, health: 'idle', lastJudgedAt: null });
  });

  it('counts graded, review (with Thai) and waiting replies', () => {
    const deals = [deal('a', 'Send a quote'), deal('b', 'ขอใบเสนอราคา'), deal('c', 'Maybe later'), deal('d', 'New reply')];
    const grades = new Map([['a', grade('graded')], ['b', grade('needs_review')], ['c', grade('needs_review')], ['d', grade('not_graded')]]);
    const status = buildLayaStatus({ deals, grades, judgments: [{ scored_at: minutesAgo(90) }, { scored_at: minutesAgo(30) }], now: NOW });
    expect(status).toMatchObject({ withReply: 4, graded: 1, needsReview: 2, thai: 1, waiting: 1, oldestWaitingMinutes: 5, health: 'waiting' });
    expect(status.lastJudgedAt).toBe(minutesAgo(30));
  });

  it('is ok when every pasted reply has a result', () => {
    const status = buildLayaStatus({ deals: [deal('a', 'Send a quote')], grades: new Map([['a', grade('graded')]]), judgments: [], now: NOW });
    expect(status.health).toBe('ok');
  });

  it('is stalled once a reply has waited past the limit', () => {
    const deals = [deal('a', 'New reply', minutesAgo(STALLED_AFTER_MINUTES + 1)), deal('b', 'Newer', minutesAgo(2))];
    const grades = new Map([['a', grade('not_graded')], ['b', grade('not_graded')]]);
    const status = buildLayaStatus({ deals, grades, judgments: [], now: NOW });
    expect(status).toMatchObject({ waiting: 2, oldestWaitingMinutes: STALLED_AFTER_MINUTES + 1, health: 'stalled' });
  });

  it('leaves closed and parked deals out', () => {
    const closed = { ...deal('a', 'Send a quote'), stage: 'closed_lost' as const };
    const status = buildLayaStatus({ deals: [closed], grades: new Map([['a', grade('not_graded')]]), judgments: [], now: NOW });
    expect(status).toMatchObject({ withReply: 0, health: 'idle' });
  });
});

describe('formatAgo', () => {
  it('words the age in the largest sensible unit', () => {
    expect(formatAgo(minutesAgo(0), NOW)).toBe('just now');
    expect(formatAgo(minutesAgo(12), NOW)).toBe('12 min ago');
    expect(formatAgo(minutesAgo(200), NOW)).toBe('3 h ago');
    expect(formatAgo(minutesAgo(60 * 72), NOW)).toBe('3 days ago');
    expect(formatAgo(null, NOW)).toBeNull();
  });
});
