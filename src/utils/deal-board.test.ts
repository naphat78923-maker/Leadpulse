import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import type { ReviewReason } from './deal-board';
import {
  buildReviewReport,
  buildReviewFix,
  dealNeedsReview,
  filterAndSortBoardDeals,
  getDoNowCounts,
  localDateKey,
  reviewReasons,
  sortDealsForDoNow,
} from './deal-board';

function deal(overrides: Partial<Deal> & Pick<Deal, 'id' | 'client'>): Deal {
  const { id, client, ...rest } = overrides;
  return {
    id,
    title: rest.title ?? `Butter · ${client}`,
    stage: 'research',
    product: 'Butter',
    client,
    company_id: null,
    contact_ids: [],
    value: null,
    priority: 'medium',
    next_action: null,
    followup_date: null,
    last_outcome: null,
    nudge_count: 0,
    workflow_action: 'outreach',
    nudge_stage: null,
    sample_status: null,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...rest,
  };
}

const today = '2026-08-25';

describe('localDateKey', () => {
  it('uses local calendar fields with zero padding instead of UTC conversion', () => {
    expect(localDateKey(new Date(2026, 7, 5, 1, 30))).toBe('2026-08-05');
  });
});

describe('sortDealsForDoNow', () => {
  it('sorts overdue, today, upcoming, undated high priority, then the remainder', () => {
    const input = [
      deal({ id: 'remaining', client: 'Zulu', priority: 'low' }),
      deal({ id: 'high', client: 'Hotel', priority: 'high' }),
      deal({ id: 'upcoming', client: 'Uniform', followup_date: '2026-08-27', priority: 'low' }),
      deal({ id: 'today', client: 'Tango', followup_date: today, priority: 'low' }),
      deal({ id: 'overdue', client: 'Oscar', followup_date: '2026-08-20', priority: 'low' }),
    ];

    expect(sortDealsForDoNow(input, today).map(item => item.id)).toEqual([
      'overdue',
      'today',
      'upcoming',
      'high',
      'remaining',
    ]);
  });

  it('uses priority and client as deterministic tie breakers', () => {
    const input = [
      deal({ id: 'b-low', client: 'Beta', followup_date: today, priority: 'low' }),
      deal({ id: 'z-high', client: 'Zulu', followup_date: today, priority: 'high' }),
      deal({ id: 'a-high', client: 'Alpha', followup_date: today, priority: 'high' }),
    ];

    expect(sortDealsForDoNow(input, today).map(item => item.id)).toEqual([
      'a-high',
      'z-high',
      'b-low',
    ]);
  });
});

describe('buildReviewFix', () => {
  const reasons = (...r: ReviewReason[]): ReviewReason[] => r;

  it('maps only the fields the flagged reasons require', () => {
    expect(buildReviewFix(reasons('sample-status-missing'), { sample_status: 'sent' })).toEqual({ sample_status: 'sent' });
    expect(buildReviewFix(reasons('testing-date-missing'), { followup_date: '2026-09-01' })).toEqual({ followup_date: '2026-09-01' });
    expect(buildReviewFix(reasons('parked-revisit-missing'), { followup_date: '2026-09-01' })).toEqual({ followup_date: '2026-09-01' });
    expect(buildReviewFix(reasons('followup-date-missing'), { followup_date: '2026-09-01' })).toEqual({ followup_date: '2026-09-01' });
    expect(buildReviewFix(reasons('reply-outcome-missing'), { reply_outcome: 'positive', reply_summary: 'ok' })).toEqual({ last_outcome: '💬 Client replied — positive: ok' });
  });

  it('ignores inputs for reasons the deal does not have', () => {
    const updates = buildReviewFix(reasons('sample-status-missing'), {
      sample_status: 'sent',
      followup_date: '2026-09-01', // not requested for this deal
      next_action: 'stray',
    });
    expect(updates).toEqual({ sample_status: 'sent' });
  });

  it('writes nothing when the required inputs are empty', () => {
    expect(buildReviewFix(reasons('sample-status-missing'), {})).toEqual({});
  });
});

describe('dealNeedsReview', () => {
  it('flags incomplete action-lane records and accepts complete ones', () => {
    expect(dealNeedsReview(deal({ id: 'reply', client: 'Reply', workflow_action: 'reply' }))).toBe(true);
    expect(dealNeedsReview(deal({
      id: 'waiting-reply',
      client: 'Waiting Reply',
      workflow_action: 'reply',
      last_outcome: 'Initial outreach sent',
      next_action: 'Waiting for reply before following up',
    }))).toBe(true);
    expect(dealNeedsReview(deal({ id: 'sample', client: 'Sample', workflow_action: 'sample' }))).toBe(true);
    expect(dealNeedsReview(deal({ id: 'testing', client: 'Testing', workflow_action: 'testing' }))).toBe(true);
    expect(dealNeedsReview(deal({
      id: 'testing-before-outreach',
      client: 'After You',
      workflow_action: 'testing',
      followup_date: '2026-08-27',
      next_action: 'Find central kitchen/R&D buyer or corporate procurement contact before approaching store-level staff',
    }))).toBe(true);
    expect(dealNeedsReview(deal({ id: 'followup', client: 'Follow-up', workflow_action: 'reschedule' }))).toBe(true);
    expect(dealNeedsReview(deal({ id: 'followup-ok', client: 'Follow-up OK', workflow_action: 'reschedule', followup_date: today }))).toBe(false);
    expect(dealNeedsReview(deal({ id: 'parked', client: 'Parked', workflow_action: 'parked' }))).toBe(true);

    expect(dealNeedsReview(deal({ id: 'complete-sample', client: 'Complete', workflow_action: 'sample', sample_status: 'sent' }))).toBe(false);
  });
});

describe('reviewReasons', () => {
  it('returns stable reason codes for each broken-record case', () => {
    expect(reviewReasons(deal({ id: 's', client: 'Sample', workflow_action: 'sample' }))).toEqual(['sample-status-missing']);
    expect(reviewReasons(deal({ id: 't', client: 'Testing', workflow_action: 'testing' }))).toEqual(['testing-date-missing']);
    expect(reviewReasons(deal({ id: 'f', client: 'Follow-up', workflow_action: 'reschedule' }))).toEqual(['followup-date-missing']);
    expect(reviewReasons(deal({ id: 'p', client: 'Parked', workflow_action: 'parked' }))).toEqual(['parked-revisit-missing']);
    expect(reviewReasons(deal({ id: 'r', client: 'Reply', workflow_action: 'reply' }))).toEqual(['reply-outcome-missing']);
  });
});

describe('buildReviewReport', () => {
  it('produces a read-only list of flagged deals with labels and fixes', () => {
    const input = [
      deal({ id: 'sample', client: 'Sample Co', workflow_action: 'sample' }),
      deal({ id: 'ok', client: 'Clean Co', workflow_action: 'sample', sample_status: 'sent' }),
    ];
    const report = buildReviewReport(input);
    expect(report).toHaveLength(1);
    expect(report[0].deal.id).toBe('sample');
    expect(report[0].labels).toContain('Sample missing sent/received status');
    expect(report[0].fix).toMatch(/address|send intent|sample/i);
    // Report must never mutate the source deals.
    expect(input[0].sample_status).toBeNull();
  });
});

describe('filterAndSortBoardDeals', () => {
  const deals = [
    deal({ id: 'overdue-match', client: 'Alice Bakery', title: 'White Chocolate · Alice Bakery', product: 'White Chocolate', priority: 'high', followup_date: '2026-08-20' }),
    deal({ id: 'today-other', client: 'Bravo Cafe', product: 'Butter', priority: 'high', followup_date: today }),
    deal({ id: 'review-match', client: 'Alice Foods', product: 'White Chocolate', priority: 'high', workflow_action: 'sample' }),
    deal({ id: 'low-match', client: 'Alice Low', product: 'White Chocolate', priority: 'low' }),
  ];

  it('combines status, search, product, and priority filters', () => {
    const visible = filterAndSortBoardDeals(deals, {
      attention: 'overdue',
      search: 'alice',
      product: 'White Chocolate',
      priority: 'high',
      today,
    });

    expect(visible.map(item => item.id)).toEqual(['overdue-match']);
  });

  it('returns actionable counts for all, overdue, today, and needs review', () => {
    expect(getDoNowCounts(deals, today)).toEqual({
      all: 4,
      overdue: 1,
      today: 1,
      needsReview: 1,
    });
  });
});
