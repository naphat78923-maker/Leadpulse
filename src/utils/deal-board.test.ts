import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import type { AccountInputRow, ReviewReason } from './deal-board';
import {
  ACCOUNT_REASONS,
  ACCOUNT_REVIEW_FIX,
  ACCOUNT_REVIEW_LABEL,
  ACCOUNT_SIGNAL_CONFIG,
  REVIEW_FIX,
  REVIEW_LABEL,
  accountDisposition,
  buildAccountSignalReport,
  buildCompStatusUpdate,
  buildReviewReport,
  buildReviewFix,
  dealDueState,
  dealNeedsReview,
  evaluateAccountSignals,
  filterAndSortBoardDeals,
  findDealsMatchingSearch,
  getDoNowCounts,
  localDateKey,
  medianInterOrderDays,
  medianOrderValue,
  renderAccountSignalReport,
  reviewReasons,
  sortDealsForDoNow,
} from './deal-board';
import { businessDateKey } from './business-time';

describe('business-calendar due dates and the search escape', () => {
  it('classifies due-today and overdue on the business calendar, not UTC', () => {
    // 01:00 on the 15th in Bangkok is the 14th in UTC.
    const today = localDateKey(new Date('2026-09-14T18:00:00Z'));
    expect(today).toBe('2026-09-15');
    expect(businessDateKey(new Date('2026-09-14T18:00:00Z'))).toBe(today);

    const dueToday = deal({ id: 'd1', client: 'Due Today Cafe', followup_date: '2026-09-15' });
    const overdue = deal({ id: 'd2', client: 'Overdue Cafe', followup_date: '2026-09-14' });

    expect(dealDueState(dueToday, today)).toBe('today');
    expect(dealDueState(overdue, today)).toBe('overdue');
    expect(getDoNowCounts([dueToday, overdue], today)).toMatchObject({ all: 2, today: 1, overdue: 1 });
  });

  it('finds a deal the active filters excluded, and preserves the query', () => {
    const today = '2026-09-15';
    const overdue = deal({ id: 'd1', client: 'Overdue Cafe', followup_date: '2026-09-01' });
    const later = deal({ id: 'd2', client: 'Later Cafe', followup_date: '2026-10-01' });
    const pool = [overdue, later];

    const filtered = filterAndSortBoardDeals(pool, {
      search: 'Later',
      attention: 'overdue',
      product: 'all',
      priority: 'all',
      today,
    });
    expect(filtered).toHaveLength(0);

    expect(findDealsMatchingSearch(pool, 'Later', today).map(d => d.client)).toEqual(['Later Cafe']);
    expect(findDealsMatchingSearch(pool, '  ', today)).toEqual([]);
    expect(findDealsMatchingSearch(pool, 'Nothing Here', today)).toEqual([]);
  });
});

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
  it('resolves on the business calendar regardless of the host timezone', () => {
    // A host at any offset must produce the same Bangkok day — this test used to assert the
    // device's local calendar fields, and failed under TZ=Asia/Tokyo or Pacific/Auckland.
    expect(localDateKey(new Date('2026-08-04T18:30:00Z'))).toBe('2026-08-05');
    expect(localDateKey(new Date('2026-08-04T16:59:59.999Z'))).toBe('2026-08-04');
    expect(localDateKey(new Date('2026-08-04T17:00:00.000Z'))).toBe('2026-08-05');
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
      layaReview: 0,
    });
  });

  it('counts and filters the deals Laya routed to Pat', () => {
    const layaReviewIds = new Set([deals[0].id, deals[2].id]);
    expect(getDoNowCounts(deals, today, layaReviewIds).layaReview).toBe(2);
    const visible = filterAndSortBoardDeals(deals, {
      attention: 'laya-review', search: '', product: 'all', priority: 'all', today, layaReviewIds,
    });
    expect(visible.map(item => item.id).sort()).toEqual([deals[0].id, deals[2].id].sort());
    // Without review ids the Laya filter shows nothing rather than everything.
    expect(filterAndSortBoardDeals(deals, { attention: 'laya-review', search: '', product: 'all', priority: 'all', today })).toEqual([]);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Account-level revenue signals (spec rev 2)
//
// Every fixture below is SYNTHETIC. No live customer name, id, domain, or
// amount appears anywhere in this file — the corpus contributes the SHAPE worth
// testing, never the identity.
// ════════════════════════════════════════════════════════════════════════════

const ACCOUNT_TODAY = '2026-09-14';

function order(date: string, amount: number) {
  return { date, amount };
}

function account(
  overrides: Partial<AccountInputRow> & Pick<AccountInputRow, 'id' | 'name'>,
): AccountInputRow {
  const { id, name, ...rest } = overrides;
  return { id, name, status: 'active_customer', orders: [], deals: [], ...rest };
}

const resultFor = (
  subject: AccountInputRow,
  reason: (typeof ACCOUNT_REASONS)[number],
  today = ACCOUNT_TODAY,
) => evaluateAccountSignals(subject, ACCOUNT_SIGNAL_CONFIG, today).find(r => r.reason === reason)!;

describe('medianInterOrderDays', () => {
  it('returns the median gap between consecutive orders', () => {
    expect(
      medianInterOrderDays([
        order('2026-01-01', 100),
        order('2026-02-01', 100),
        order('2026-03-01', 100),
      ]),
    ).toBe(29.5); // gaps 31 and 28
  });

  it('returns null when there are fewer than two orders', () => {
    expect(medianInterOrderDays([])).toBeNull();
    expect(medianInterOrderDays([order('2026-01-01', 100)])).toBeNull();
  });

  it('returns 0 for same-day order bursts — no cycle exists to measure', () => {
    expect(
      medianInterOrderDays([
        order('2026-08-01', 100),
        order('2026-08-01', 100),
        order('2026-08-01', 100),
      ]),
    ).toBe(0);
  });
});

describe('medianOrderValue', () => {
  it('returns the median of recorded order values', () => {
    expect(medianOrderValue([order('2026-01-01', 10000), order('2026-02-01', 30000)])).toBe(20000);
  });

  it('averages the middle pair for an even count', () => {
    expect(
      medianOrderValue([
        order('2026-01-01', 100),
        order('2026-01-02', 200),
        order('2026-01-03', 300),
        order('2026-01-04', 400),
      ]),
    ).toBe(250);
  });

  it('returns null with no orders — a value is never invented', () => {
    expect(medianOrderValue([])).toBeNull();
  });
});

describe('account signals — reorder-gap', () => {
  const steady = account({
    id: 'acct-steady',
    name: 'Synthetic Bakery',
    orders: [order('2026-01-01', 10000), order('2026-02-01', 20000), order('2026-03-01', 30000)],
  });

  it('fires when silence exceeds the account’s own cycle times the config multiplier', () => {
    const result = resultFor(steady, 'reorder-gap');
    expect(result.status).toBe('fired');
    expect(result.metrics?.median_gap_days).toBe(29.5);
    expect(result.metrics?.threshold_days).toBe(29.5 * ACCOUNT_SIGNAL_CONFIG.reorderGapMultiplier);
    expect(result.metrics?.silence_days).toBe(197);
  });

  it('stays clear when the account is still inside its own cycle', () => {
    expect(resultFor(steady, 'reorder-gap', '2026-03-10').status).toBe('clear');
  });

  it('is insufficient — not clear — below the minimum order count', () => {
    const thin = account({
      id: 'acct-thin',
      name: 'Synthetic Cafe',
      orders: [order('2026-01-01', 100), order('2026-02-01', 100)],
    });
    const result = resultFor(thin, 'reorder-gap');
    expect(result.status).toBe('insufficient');
    expect(result.insufficient_reason).toBe('orders_below_minimum');
  });

  it('is insufficient when orders arrive in bursts and no interval exists', () => {
    const burst = account({
      id: 'acct-burst',
      name: 'Synthetic Burst Co',
      orders: [order('2026-08-01', 1000), order('2026-08-01', 1000), order('2026-08-01', 1000)],
    });
    const result = resultFor(burst, 'reorder-gap');
    expect(result.status).toBe('insufficient');
    expect(result.insufficient_reason).toBe('interval_undeterminable');
  });

  it('is insufficient when status claims a customer but no orders exist', () => {
    const result = resultFor(account({ id: 'acct-nostock', name: 'Synthetic Empty' }), 'reorder-gap');
    expect(result.status).toBe('insufficient');
    expect(result.insufficient_reason).toBe('no_order_history');
  });

  it('does not apply outside retention scope', () => {
    const prospect = account({
      id: 'acct-prospect',
      name: 'Synthetic Prospect',
      status: 'prospect',
      orders: [order('2026-01-01', 100), order('2026-02-01', 100), order('2026-03-01', 100)],
    });
    expect(resultFor(prospect, 'reorder-gap').status).toBe('not_applicable');
  });
});

describe('account signals — customer-no-won-deal', () => {
  it('fires for a buying account with no recorded won deal', () => {
    const subject = account({
      id: 'acct-buying',
      name: 'Synthetic Grocer',
      orders: [order('2026-01-01', 5000), order('2026-02-01', 5000)],
    });
    expect(resultFor(subject, 'customer-no-won-deal').status).toBe('fired');
  });

  it('stays clear once a won deal is recorded', () => {
    const subject = account({
      id: 'acct-won',
      name: 'Synthetic Won Co',
      orders: [order('2026-01-01', 5000)],
      deals: [{ stage: 'closed_won', value: 12000 }],
    });
    expect(resultFor(subject, 'customer-no-won-deal').status).toBe('clear');
  });

  it('is insufficient with no order history — no customer claim to contradict', () => {
    const result = resultFor(
      account({ id: 'acct-nostock', name: 'Synthetic Empty' }),
      'customer-no-won-deal',
    );
    expect(result.insufficient_reason).toBe('no_order_history');
  });
});

describe('account signals — status-hides-customer', () => {
  it('fires when a won deal sits on an account outside retention scope', () => {
    const subject = account({
      id: 'acct-hidden',
      name: 'Synthetic Hidden Co',
      status: 'prospect',
      deals: [{ stage: 'closed_won', value: 9000 }],
    });
    const result = resultFor(subject, 'status-hides-customer');
    expect(result.status).toBe('fired');
    expect(result.evidence.join(' ')).toMatch(/outside retention scope/);
  });

  it('stays clear for a won deal on an active customer', () => {
    const subject = account({
      id: 'acct-visible',
      name: 'Synthetic Visible Co',
      deals: [{ stage: 'closed_won', value: 9000 }],
    });
    expect(resultFor(subject, 'status-hides-customer').status).toBe('clear');
  });

  it('stays clear when no won deal exists', () => {
    expect(
      resultFor(account({ id: 'acct-none', name: 'Synthetic None' }), 'status-hides-customer').status,
    ).toBe('clear');
  });
});

describe('account signals — unknown inputs are never guessed', () => {
  const unknownStatus = account({
    id: 'acct-unknown',
    name: 'Synthetic Unknown Status',
    status: null,
    orders: [order('2026-01-01', 100)],
  });

  it('reports an unrecognised status as insufficient rather than assuming a scope', () => {
    const result = resultFor(unknownStatus, 'reorder-gap');
    expect(result.status).toBe('insufficient');
    expect(result.insufficient_reason).toBe('status_missing_or_unrecognised');
  });

  it('reports every reason for every account — an absent entry can never mean "clear"', () => {
    const results = evaluateAccountSignals(unknownStatus, ACCOUNT_SIGNAL_CONFIG, ACCOUNT_TODAY);
    expect(results.map(r => r.reason)).toEqual(ACCOUNT_REASONS);
  });
});

describe('accountDisposition', () => {
  it('prefers a fired reason over an insufficient one', () => {
    const subject = account({
      id: 'acct-mixed',
      name: 'Synthetic Mixed',
      orders: [order('2026-08-01', 1000)], // below minimum → reorder-gap insufficient
    });
    const results = evaluateAccountSignals(subject, ACCOUNT_SIGNAL_CONFIG, ACCOUNT_TODAY);
    expect(results.find(r => r.reason === 'reorder-gap')!.status).toBe('insufficient');
    expect(results.find(r => r.reason === 'customer-no-won-deal')!.status).toBe('fired');
    expect(accountDisposition(results)).toBe('signalled');
  });

  it('returns insufficient_data when nothing fired but evidence is missing', () => {
    const results = evaluateAccountSignals(
      account({ id: 'acct-nostock', name: 'Synthetic Empty' }),
      ACCOUNT_SIGNAL_CONFIG,
      ACCOUNT_TODAY,
    );
    expect(accountDisposition(results)).toBe('insufficient_data');
  });

  it('returns clear when everything was evaluated and nothing fired', () => {
    const results = evaluateAccountSignals(
      account({ id: 'acct-clear', name: 'Synthetic Clear', status: 'prospect' }),
      ACCOUNT_SIGNAL_CONFIG,
      ACCOUNT_TODAY,
    );
    expect(accountDisposition(results)).toBe('clear');
  });
});

describe('buildAccountSignalReport', () => {
  // Covers every reason firing, plus every insufficient reason, plus clear.
  const fixture: AccountInputRow[] = [
    account({
      id: 'acct-gap',
      name: 'Synthetic Steady',
      orders: [order('2026-01-01', 10000), order('2026-02-01', 20000), order('2026-03-01', 30000)],
    }),
    account({
      id: 'acct-hidden',
      name: 'Synthetic Hidden',
      status: 'prospect',
      deals: [{ stage: 'closed_won', value: 9000 }],
    }),
    account({
      id: 'acct-thin',
      name: 'Synthetic Thin',
      orders: [order('2026-08-01', 50000)],
    }),
    account({
      id: 'acct-insufficient',
      name: 'Synthetic Short',
      orders: [order('2026-01-01', 100), order('2026-02-01', 100)],
      deals: [{ stage: 'closed_won', value: 100 }],
    }),
    account({
      id: 'acct-burst',
      name: 'Synthetic Burst',
      orders: [order('2026-08-01', 1000), order('2026-08-01', 1000), order('2026-08-01', 1000)],
      deals: [{ stage: 'closed_won', value: 100 }],
    }),
    account({ id: 'acct-unknown', name: 'Synthetic Unknown', status: null, orders: [order('2026-01-01', 100)] }),
    account({ id: 'acct-nostock', name: 'Synthetic Empty' }),
    account({ id: 'acct-clear', name: 'Synthetic Clear', status: 'prospect' }),
  ];

  const report = buildAccountSignalReport(fixture, {
    source: 'test:synthetic-fixture',
    now: new Date(`${ACCOUNT_TODAY}T00:00:00Z`),
    corpus: { accounts_file: fixture.length },
  });

  it('partitions every account — no silent exclusion', () => {
    expect(report.reconciliation.ok).toBe(true);
    expect(report.reconciliation.accounts_in).toBe(8);
    expect(report.reconciliation.signalled).toBe(3);
    expect(report.reconciliation.insufficient).toBe(4);
    expect(report.reconciliation.clear).toBe(1);
    expect(
      report.reconciliation.signalled + report.reconciliation.insufficient + report.reconciliation.clear,
    ).toBe(report.reconciliation.accounts_in);
  });

  it('records the insufficient_data list with an explicit reason per entry', () => {
    expect(report.insufficient.length).toBeGreaterThan(0);
    for (const item of report.insufficient) {
      expect(item.insufficient_reason).toBeTruthy();
      expect(item.evidence.length).toBeGreaterThan(0);
    }
    expect(report.counts.insufficient_by_reason.no_order_history).toBe(2);
    expect(report.counts.insufficient_by_reason.orders_below_minimum).toBe(2);
    expect(report.counts.insufficient_by_reason.interval_undeterminable).toBe(1);
    expect(report.counts.insufficient_by_reason.status_missing_or_unrecognised).toBe(2);
  });

  it('counts every reason and fires all three across the fixture', () => {
    expect(report.counts.by_reason).toEqual({
      'reorder-gap': 1,
      'customer-no-won-deal': 2,
      'status-hides-customer': 1,
    });
    expect(report.counts.signals_total).toBe(4);
  });

  it('publishes the rank rule and ranks recency-first, then revenue at risk', () => {
    expect(report.rank_rule).toContain('days_since_last_order ASC');
    expect(report.rank_rule).toContain('revenue_at_risk DESC');
    expect(
      report.signals.map(signal => `${signal.account_id}:${signal.reason}`),
    ).toEqual([
      'acct-thin:customer-no-won-deal', // 44d since last order
      'acct-gap:reorder-gap', // 197d, ฿20,000 × 1
      'acct-gap:customer-no-won-deal', // 197d, ฿20,000 × 0.5
      'acct-hidden:status-hides-customer', // never ordered → 0, sorts last
    ]);
    expect(report.signals[0].revenue_at_risk).toBe(25000);
    expect(report.signals[0].weight).toBe(ACCOUNT_SIGNAL_CONFIG.revenueAtRiskWeight['customer-no-won-deal']);
    expect(report.signals[3].revenue_basis).toBe('none');
  });

  it('exposes last_order_date and days_since_last_order on every signal', () => {
    for (const signal of report.signals) {
      expect(signal).toHaveProperty('last_order_date');
      expect(signal).toHaveProperty('days_since_last_order');
      // The two must agree: null date <=> null days.
      expect(signal.last_order_date === null).toBe(signal.days_since_last_order === null);
    }
    expect(report.signals[0].last_order_date).toBe('2026-08-01');
    expect(report.signals[0].days_since_last_order).toBe(44);
    expect(report.signals[3].last_order_date).toBeNull();
    expect(report.signals[3].days_since_last_order).toBeNull();
  });

  it('labels payment status as unknown and never claims a paid/free determination', () => {
    expect(report.notes.join(' ')).toMatch(/Payment status is unknown for every account/);
    const serialised = JSON.stringify(report);
    expect(serialised).not.toMatch(/"payment_status"\s*:\s*"paid"/);
    expect(serialised).not.toMatch(/"comp_status"\s*:\s*"free"/);
  });

  it('renders a terminal report naming the formula and the config', () => {
    const markdown = renderAccountSignalReport(report);
    expect(markdown).toContain('revenue_at_risk = trailing_median_order_value × weight[reason]');
    expect(markdown).toContain('insufficient_data');
    expect(markdown).toMatch(/population: 8 accounts/);
  });

  it('carries no warnings on a clean corpus, and surfaces any it is given', () => {
    expect(report.warnings).toEqual([]);
    expect(renderAccountSignalReport(report)).not.toContain('WARNINGS');

    const warned = buildAccountSignalReport(fixture, {
      source: 'test:blocked-source',
      now: new Date(`${ACCOUNT_TODAY}T00:00:00Z`),
      warnings: ['order-history sources returned 0 rows: sales, customers, customer_link.'],
    });
    expect(warned.warnings).toHaveLength(1);
    // A blocked read must be impossible to mistake for "nothing found".
    expect(renderAccountSignalReport(warned)).toContain('!! WARNINGS');
    expect(JSON.stringify(warned)).toContain('returned 0 rows');
  });
});

describe('ranking — recency outranks value', () => {
  // A long silence is a lost account, not a recoverable one. Money alone would
  // put the 927-day-dead rich account first; recency must not.
  const ranked = buildAccountSignalReport(
    [
      account({
        id: 'acct-lapsed-recent',
        name: 'Synthetic Recent',
        orders: [order('2026-05-01', 1000), order('2026-06-01', 1000), order('2026-07-01', 1000)],
      }),
      account({
        id: 'acct-dead-rich',
        name: 'Synthetic Old Rich',
        orders: [
          order('2024-01-01', 100000),
          order('2024-02-01', 100000),
          order('2024-03-01', 100000),
        ],
      }),
    ],
    { source: 'test:recency', now: new Date(`${ACCOUNT_TODAY}T00:00:00Z`) },
  );

  it('puts the recently-lapsed account first even though it is worth far less', () => {
    expect(ranked.signals.map(s => `${s.account_id}:${s.reason}`)).toEqual([
      'acct-lapsed-recent:reorder-gap',
      'acct-lapsed-recent:customer-no-won-deal',
      'acct-dead-rich:reorder-gap',
      'acct-dead-rich:customer-no-won-deal',
    ]);
  });

  it('proves the money-only ordering would have been the reverse', () => {
    expect(ranked.signals[0].revenue_at_risk).toBe(1000);
    expect(ranked.signals[2].revenue_at_risk).toBe(100000);
    // Rank 1 is worth 1% of rank 3 — recency, not value, put it there.
    expect(ranked.signals[0].revenue_at_risk).toBeLessThan(ranked.signals[2].revenue_at_risk);
  });

  it('reports the recency evidence that produced the order', () => {
    expect(ranked.signals[0].last_order_date).toBe('2026-07-01');
    expect(ranked.signals[0].days_since_last_order).toBe(75);
    expect(ranked.signals[2].last_order_date).toBe('2024-03-01');
    expect(ranked.signals[2].days_since_last_order).toBe(927);
  });

  it('does not change which signals fire — only their order', () => {
    expect(ranked.counts.by_reason).toEqual({
      'reorder-gap': 2,
      'customer-no-won-deal': 2,
      'status-hides-customer': 0,
    });
    expect(ranked.reconciliation.ok).toBe(true);
  });
});

describe('buildCompStatusUpdate — paid vs free', () => {
  it('writes the explicit comp status it is given', () => {
    expect(buildCompStatusUpdate({ comp_status: 'paid' })).toEqual({ comp_status: 'paid' });
    expect(buildCompStatusUpdate({ comp_status: 'comped' })).toEqual({ comp_status: 'comped' });
    expect(buildCompStatusUpdate({ comp_status: 'unknown' })).toEqual({ comp_status: 'unknown' });
  });

  it('resolves anything unrecognised to unknown — never to paid and never to free', () => {
    expect(buildCompStatusUpdate({ comp_status: 'free' })).toEqual({ comp_status: 'unknown' });
    expect(buildCompStatusUpdate({ comp_status: '' })).toEqual({ comp_status: 'unknown' });
    expect(buildCompStatusUpdate({ comp_status: null })).toEqual({ comp_status: 'unknown' });
    expect(buildCompStatusUpdate({ comp_status: undefined })).toEqual({ comp_status: 'unknown' });
    expect(buildCompStatusUpdate({ comp_status: 'PAID' })).toEqual({ comp_status: 'unknown' });
  });

  it('never infers payment — the builder is not given an order value at all', () => {
    // A paid/free determination cannot be derived from what this function sees,
    // so a call that states nothing produces no write rather than a default.
    expect(buildCompStatusUpdate({})).toEqual({});
  });

  it('does not clobber a known comp status when only the date is updated', () => {
    expect(buildCompStatusUpdate({ paid_test_date: '2026-09-01' })).toEqual({
      paid_test_date: '2026-09-01',
    });
    expect('comp_status' in buildCompStatusUpdate({ paid_test_date: '2026-09-01' })).toBe(false);
  });

  it('normalises a blank paid_test_date to null and trims a real one', () => {
    expect(buildCompStatusUpdate({ paid_test_date: '   ' })).toEqual({ paid_test_date: null });
    expect(buildCompStatusUpdate({ paid_test_date: null })).toEqual({ paid_test_date: null });
    expect(buildCompStatusUpdate({ paid_test_date: ' 2026-09-01 ' })).toEqual({
      paid_test_date: '2026-09-01',
    });
  });
});

// ════════════════════════════════════════════════════════════════════════════
// Regression guard for the SIX ORIGINAL deal-level reasons.
// Adding the account-level set must not have changed a single existing member.
// ════════════════════════════════════════════════════════════════════════════

describe('original ReviewReason members are untouched', () => {
  it('keeps exactly the six original labels', () => {
    expect(REVIEW_LABEL).toEqual({
      'sample-status-missing': 'Sample missing sent/received status',
      'testing-date-missing': 'Testing missing a testing date',
      'followup-date-missing': 'Follow-up missing a date',
      'parked-revisit-missing': 'Parked missing a revisit date',
      'reply-outcome-missing': 'Waiting-on-reply missing last outreach confirmation',
      'pre-contact-action': 'Sample/testing started before contact researched',
    });
  });

  it('keeps exactly the six original fixes', () => {
    expect(REVIEW_FIX).toEqual({
      'sample-status-missing': 'Confirm address / send intent (sample status Sent or Received).',
      'testing-date-missing': 'Add a testing date in the Testing lane.',
      'followup-date-missing': 'Add a follow-up date in the Follow-up lane.',
      'parked-revisit-missing': 'Add a revisit date when parking.',
      'reply-outcome-missing': 'Confirm last outreach was logged, or clear a "waiting for reply" next action.',
      'pre-contact-action': 'Resolve the pre-contact research step (find buyer/contact) before sample/testing.',
    });
  });

  it('keeps the deal union and the account union disjoint', () => {
    const dealReasons = Object.keys(REVIEW_LABEL);
    const accountReasons: string[] = [...ACCOUNT_REASONS];
    expect(dealReasons.filter(reason => accountReasons.includes(reason))).toEqual([]);
    expect(accountReasons.filter(reason => dealReasons.includes(reason))).toEqual([]);
    expect(dealReasons).toHaveLength(6);
    expect(Object.keys(ACCOUNT_REVIEW_LABEL)).toHaveLength(3);
    expect(Object.keys(ACCOUNT_REVIEW_FIX)).toHaveLength(3);
  });

  it('still returns the original codes through reviewReasons', () => {
    expect(reviewReasons(deal({ id: 's', client: 'Sample', workflow_action: 'sample' }))).toEqual([
      'sample-status-missing',
    ]);
    expect(reviewReasons(deal({ id: 't', client: 'Testing', workflow_action: 'testing' }))).toEqual([
      'testing-date-missing',
    ]);
    expect(reviewReasons(deal({ id: 'f', client: 'Follow-up', workflow_action: 'reschedule' }))).toEqual([
      'followup-date-missing',
    ]);
    expect(reviewReasons(deal({ id: 'p', client: 'Parked', workflow_action: 'parked' }))).toEqual([
      'parked-revisit-missing',
    ]);
    expect(reviewReasons(deal({ id: 'r', client: 'Reply', workflow_action: 'reply' }))).toEqual([
      'reply-outcome-missing',
    ]);
    expect(
      reviewReasons(
        deal({
          id: 'pc',
          client: 'Pre-contact',
          workflow_action: 'sample',
          sample_status: 'sent',
          next_action: 'Find central kitchen buyer before approaching',
        }),
      ),
    ).toEqual(['pre-contact-action']);
  });
});
