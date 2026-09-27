import { describe, expect, it } from 'vitest';
import type { AttentionCandidate, RetentionDueSignal } from './followup-policy';
import type { ReorderSignal } from '../lib/historical';
import { buildThisWeekQueue } from './this-week-queue';

const today = '2026-09-26';

function candidate(overrides: Partial<AttentionCandidate> = {}): AttentionCandidate {
  const dealId = overrides.dealId ?? 'deal-1';
  return {
    id: `honor_saved_followup:deal:${dealId}`,
    action: 'honor_saved_followup',
    section: 'saved',
    reasonCode: 'saved_followup_due',
    reason: 'Synthetic saved follow-up is due.',
    sourceRefs: [`deal:${dealId}:schedule`],
    dueDate: today,
    originalDueDate: today,
    dueDateSource: 'deals.followup_date',
    companyId: 'company-1',
    companyName: 'Synthetic Bakery',
    dealId,
    dealTitle: 'Synthetic bakery follow-up',
    nextAction: 'Check sample feedback',
    priority: 'medium',
    holds: [],
    ...overrides,
  };
}

function retentionCandidate(companyId: string, dueDate: string): AttentionCandidate {
  return candidate({
    id: `review_retention_due:company:${companyId}`,
    action: 'review_retention_due',
    section: 'retention',
    sourceRefs: [`company:${companyId}:companies.next_touch_due`],
    dueDate,
    originalDueDate: dueDate,
    dueDateSource: 'companies.next_touch_due',
    companyId,
    companyName: `Account ${companyId}`,
    dealId: null,
    dealTitle: null,
    nextAction: null,
  });
}

function retentionSignal(companyId: string, tier: RetentionDueSignal['tier']): RetentionDueSignal {
  return {
    companyId,
    companyName: `Account ${companyId}`,
    companyStatus: 'active_customer',
    dueDate: today,
    dueDateSource: 'companies.next_touch_due',
    tier,
    coverage: 'incomplete',
    coverageNote: '',
  };
}

function reorderSignal(overrides: Partial<ReorderSignal>): ReorderSignal {
  return {
    customerId: 'customer-1',
    name: 'Historical Buyer',
    medianGapDays: 30,
    daysSinceLast: 90,
    thresholdDays: 45,
    severityDays: 45,
    isOverdue: true,
    orderCount: 4,
    matchConfidence: 'exact',
    typicalValue: 2000,
    crmCompanyId: 'company-9',
    inCrm: true,
    evidence: 'Usually reorders every ~30 days.',
    suggestedAction: 'Check current stock.',
    ...overrides,
  };
}

describe('this-week queue', () => {
  it('splits saved follow-ups into overdue and due this week', () => {
    const queue = buildThisWeekQueue({
      candidates: [
        candidate({ dealId: 'late', dueDate: '2026-09-20', originalDueDate: '2026-09-20' }),
        candidate({ dealId: 'today' }),
        candidate({ dealId: 'later', dueDate: '2026-09-30', originalDueDate: '2026-09-30' }),
      ],
      retentionDue: [],
      signals: [],
      today,
    });

    expect(queue.overdue.map((c) => c.dealId)).toEqual(['late']);
    expect(queue.dueThisWeek.map((c) => c.dealId)).toEqual(['today', 'later']);
  });

  it('keeps holds and invalid dates in their own section, and undated deals in needsDate', () => {
    const queue = buildThisWeekQueue({
      candidates: [
        candidate({ dealId: 'held', action: 'review_contact_hold', section: 'review' }),
        candidate({ dealId: 'undated', action: 'set_date_or_park', section: 'unscheduled', dueDate: null, originalDueDate: null }),
      ],
      retentionDue: [],
      signals: [],
      today,
    });

    expect(queue.needsReview.map((c) => c.dealId)).toEqual(['held']);
    expect(queue.needsDate.map((c) => c.dealId)).toEqual(['undated']);
    expect(queue.overdue).toHaveLength(0);
  });

  it('merges retention and reorder signals into one check-in row per account', () => {
    const queue = buildThisWeekQueue({
      candidates: [retentionCandidate('company-1', '2026-09-10'), retentionCandidate('company-2', '2026-09-20')],
      retentionDue: [retentionSignal('company-1', 'at_risk'), retentionSignal('company-2', 'watch')],
      signals: [
        reorderSignal({ crmCompanyId: 'company-1', severityDays: 10, evidence: 'Short gap.' }),
        reorderSignal({ crmCompanyId: 'company-1', severityDays: 90, evidence: 'Long gap.' }),
        reorderSignal({ crmCompanyId: 'company-9', name: 'Reorder Only' }),
        reorderSignal({ crmCompanyId: null, inCrm: false, name: 'Not In CRM' }),
      ],
      today,
    });

    expect(queue.checkIns.map((row) => row.companyId)).toEqual(['company-1', 'company-2', 'company-9']);
    expect(queue.checkIns[0]).toMatchObject({ tier: 'at_risk', reorder: { evidence: 'Long gap.', severityDays: 90 } });
    expect(queue.checkIns[2]).toMatchObject({ companyName: 'Reorder Only', dueDate: null, tier: null });
  });

  it('orders reorder-only check-ins by how far past cycle they are', () => {
    const queue = buildThisWeekQueue({
      candidates: [],
      retentionDue: [],
      signals: [
        reorderSignal({ crmCompanyId: 'a', name: 'A', severityDays: 5 }),
        reorderSignal({ crmCompanyId: 'b', name: 'B', severityDays: 50 }),
      ],
      today,
    });

    expect(queue.checkIns.map((row) => row.companyName)).toEqual(['B', 'A']);
  });
});
