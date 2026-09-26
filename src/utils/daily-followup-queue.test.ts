import { describe, expect, it } from 'vitest';
import type { AttentionCandidate } from './followup-policy';
import { buildDailyFollowupQueue, QUEUE_SECTION_ORDER } from './daily-followup-queue';

function candidate(overrides: Partial<AttentionCandidate> = {}): AttentionCandidate {
  return {
    id: 'honor_saved_followup:deal:synthetic-deal-1',
    action: 'honor_saved_followup',
    section: 'saved',
    reasonCode: 'saved_followup_due',
    reason: 'Synthetic saved follow-up is due.',
    sourceRefs: ['deal:synthetic-deal-1:schedule'],
    dueDate: '2026-09-25',
    originalDueDate: '2026-09-25',
    dueDateSource: 'deals.followup_date',
    companyId: 'synthetic-company-1',
    companyName: 'Synthetic Bakery',
    dealId: 'synthetic-deal-1',
    dealTitle: 'Synthetic bakery sample follow-up',
    priority: 'medium',
    holds: [],
    ...overrides,
  };
}

describe('daily follow-up queue', () => {
  it('keeps every distinct deal obligation when grouping by company', () => {
    const first = candidate();
    const second = candidate({
      id: 'honor_saved_followup:deal:synthetic-deal-2',
      dealId: 'synthetic-deal-2',
      sourceRefs: ['deal:synthetic-deal-2:schedule'],
      dueDate: '2026-09-26',
      originalDueDate: '2026-09-26',
    });
    const queue = buildDailyFollowupQueue([first, second], '2026-09-26');

    expect(queue.totalCount).toBe(2);
    const savedSection = queue.sections.find((section) => section.id === 'saved');
    expect(savedSection?.groups).toHaveLength(1);
    expect(savedSection?.groups[0].items.map((item) => item.dealId)).toEqual([
      'synthetic-deal-1',
      'synthetic-deal-2',
    ]);
  });

  it('deduplicates only the same action and source, not just the same company', () => {
    const duplicate = candidate();
    const otherDeal = candidate({
      id: 'honor_saved_followup:deal:synthetic-deal-2',
      dealId: 'synthetic-deal-2',
      sourceRefs: ['deal:synthetic-deal-2:schedule'],
    });
    const queue = buildDailyFollowupQueue([duplicate, { ...duplicate }, otherDeal], '2026-09-26');

    expect(queue.totalCount).toBe(2);
  });

  it('orders deadlines before priority and gives equal-date ties a stable ID order', () => {
    const queue = buildDailyFollowupQueue([
      candidate({
        id: 'z-low', dealId: 'z-low', sourceRefs: ['deal:z-low:schedule'], priority: 'low',
        dueDate: '2026-09-26', originalDueDate: '2026-09-26',
      }),
      candidate({
        id: 'a-high', dealId: 'a-high', sourceRefs: ['deal:a-high:schedule'], priority: 'high',
        dueDate: '2026-09-26', originalDueDate: '2026-09-26',
      }),
      candidate({
        id: 'm-late-high', dealId: 'm-late-high', sourceRefs: ['deal:m-late-high:schedule'], priority: 'high',
        dueDate: '2026-09-27', originalDueDate: '2026-09-27',
      }),
    ], '2026-09-26');

    expect(queue.sections.find((section) => section.id === 'saved')?.items.map((item) => item.id)).toEqual([
      'a-high',
      'z-low',
      'm-late-high',
    ]);
  });

  it('keeps null-date items visible after dated obligations', () => {
    const queue = buildDailyFollowupQueue([
      candidate({ id: 'unscheduled', action: 'set_date_or_park', section: 'unscheduled', dueDate: null }),
      candidate({ id: 'dated', dueDate: '2026-09-27' }),
    ], '2026-09-26');

    expect(queue.sections.flatMap((section) => section.items).map((item) => item.id)).toContain('unscheduled');
    expect(queue.sections.find((section) => section.id === 'saved')?.items[0].id).toBe('dated');
  });

  it('derives visible totals and uses the specified section order', () => {
    const queue = buildDailyFollowupQueue([
      candidate({
        id: 'unscheduled',
        action: 'set_date_or_park',
        section: 'unscheduled',
        dueDate: null,
        originalDueDate: null,
        dueDateSource: null,
      }),
      candidate({ id: 'retention', section: 'retention', action: 'review_retention_due', dealId: null }),
      candidate({ id: 'hold', section: 'review', action: 'review_contact_hold' }),
      candidate({ id: 'answer', section: 'customer_response', action: 'answer_customer' }),
      candidate({ id: 'saved', section: 'saved' }),
    ], '2026-09-26');

    expect(queue.sections.map((section) => section.id)).toEqual(QUEUE_SECTION_ORDER);
    expect(queue.sections.reduce((sum, section) => sum + section.count, 0)).toBe(queue.totalCount);
    expect(queue.totalCount).toBe(5);
    expect(queue.counts).toEqual({
      review: 1,
      customer_response: 1,
      saved: 1,
      retention: 1,
      unscheduled: 1,
    });
  });
});
