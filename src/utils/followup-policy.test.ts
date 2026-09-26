import { describe, expect, it } from 'vitest';
import type { Company, Contact, Deal, Meeting } from '../types/crm';
import type { AccountEvent } from '../lib/crm';
import { businessDateKey } from './business-time';
import {
  buildFollowupActions,
  deriveRetentionDueSignals,
  existingRetentionReferenceDate,
} from './followup-policy';

const TODAY = '2026-09-26';

function makeDeal(overrides: Partial<Deal> = {}): Deal {
  return {
    id: 'synthetic-deal-1',
    company_id: 'synthetic-company-1',
    contact_ids: [],
    title: 'Butter · Synthetic Bakery',
    client: 'Synthetic Bakery',
    product: 'Butter',
    stage: 'contacted',
    value: null,
    priority: 'medium',
    next_action: 'Call after tasting',
    followup_date: '2026-09-25',
    ...overrides,
  } as Deal;
}

function makeCompany(overrides: Partial<Company> = {}): Company {
  return {
    id: 'synthetic-company-1',
    name: 'Synthetic Bakery',
    status: 'active_customer',
    created_at: '2025-01-01',
    next_touch_due: '2026-09-25',
    ...overrides,
  } as Company;
}

describe('follow-up policy', () => {
  it('keeps the existing retention calculation on its UTC date while the unified queue uses Bangkok date', () => {
    const BangkokAfterMidnight = new Date('2026-09-25T18:00:00.000Z');

    expect(existingRetentionReferenceDate(BangkokAfterMidnight)).toBe('2026-09-25');
    expect(businessDateKey(BangkokAfterMidnight)).toBe('2026-09-26');
  });

  it('surfaces the saved deal schedule without changing its date or action', () => {
    const deal = makeDeal();
    const before = structuredClone(deal);
    const actions = buildFollowupActions({
      today: TODAY,
      deals: [deal],
      companies: [makeCompany()],
      contacts: [],
      retentionDue: [],
    });

    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action: 'honor_saved_followup',
      dueDate: '2026-09-25',
      originalDueDate: '2026-09-25',
      dueDateSource: 'deals.followup_date',
      sourceRefs: ['deal:synthetic-deal-1:schedule'],
      dealId: 'synthetic-deal-1',
      companyId: 'synthetic-company-1',
    });
    expect(actions[0].reason).toContain('Call after tasting');
    expect(deal).toEqual(before);
  });

  it('does not resurrect closed, lost, parked, or success-exit deals', () => {
    const actions = buildFollowupActions({
      today: TODAY,
      deals: [
        makeDeal({ id: 'closed-won', stage: 'closed_won' }),
        makeDeal({ id: 'closed-lost', stage: 'closed_lost' }),
        makeDeal({ id: 'parked', workflow_action: 'parked' }),
        makeDeal({ id: 'success-exit', workflow_action: 'success' }),
      ],
      companies: [],
      contacts: [],
      retentionDue: [],
    });

    expect(actions).toEqual([]);
  });

  it('surfaces an unscheduled open deal as a review decision, not an invented date', () => {
    const actions = buildFollowupActions({
      today: TODAY,
      deals: [makeDeal({ followup_date: null, next_action: 'Check sample feedback' })],
      companies: [makeCompany()],
      contacts: [],
      retentionDue: [],
    });

    expect(actions[0]).toMatchObject({
      action: 'set_date_or_park',
      dueDate: null,
      originalDueDate: null,
      dueDateSource: null,
      section: 'unscheduled',
    });
    expect(actions[0].reason).toContain('Check sample feedback');
  });

  it('routes explicit not-interested and parked contacts to internal hold review', () => {
    const uninterested = { id: 'synthetic-contact-1', name: 'Demo Contact', status: 'not_interested' } as Contact;
    const parked = { id: 'synthetic-contact-2', name: 'Other Demo Contact', status: 'parked' } as Contact;
    const actions = buildFollowupActions({
      today: TODAY,
      deals: [
        makeDeal({ contact_ids: [uninterested.id] }),
        makeDeal({ id: 'synthetic-deal-2', contact_ids: [parked.id] }),
      ],
      companies: [makeCompany()],
      contacts: [uninterested, parked],
      retentionDue: [],
    });

    expect(actions).toHaveLength(2);
    expect(actions.map((action) => action.action)).toEqual(['review_contact_hold', 'review_contact_hold']);
    expect(actions.map((action) => action.holds[0].reasonCode)).toEqual([
      'known_not_interested',
      'known_parked',
    ]);
    expect(actions.every((action) => /internal|review/i.test(action.reason))).toBe(true);
  });

  it('flags malformed saved dates without normalizing or replacing them', () => {
    const actions = buildFollowupActions({
      today: TODAY,
      deals: [makeDeal({ followup_date: '2026-02-30' })],
      companies: [makeCompany()],
      contacts: [],
      retentionDue: [],
    });

    expect(actions[0]).toMatchObject({
      action: 'set_date_or_park',
      section: 'review',
      dueDate: null,
      originalDueDate: '2026-02-30',
      dueDateSource: 'deals.followup_date',
      reasonCode: 'invalid_saved_date',
    });
  });

  it('derives existing retention due signals only for active customers and preserves persisted dates', () => {
    const companies = [
      makeCompany(),
      makeCompany({ id: 'inactive-company', status: 'inactive', next_touch_due: '2026-09-24' }),
    ];
    const signals = deriveRetentionDueSignals({
      today: TODAY,
      companies,
      deals: [],
      meetings: [] as Meeting[],
      accountEvents: [] as AccountEvent[],
    });
    const actions = buildFollowupActions({
      today: TODAY,
      deals: [],
      companies,
      contacts: [],
      retentionDue: signals,
    });

    expect(signals).toHaveLength(1);
    expect(actions).toHaveLength(1);
    expect(actions[0]).toMatchObject({
      action: 'review_retention_due',
      companyId: 'synthetic-company-1',
      dueDate: '2026-09-25',
      originalDueDate: '2026-09-25',
      dueDateSource: 'companies.next_touch_due',
      section: 'retention',
    });
  });

  it('keeps retention-history gaps visible without claiming inactivity or churn', () => {
    const signals = deriveRetentionDueSignals({
      today: TODAY,
      companies: [makeCompany()],
      deals: [],
      meetings: [] as Meeting[],
      accountEvents: [] as AccountEvent[],
      accountEventsUnavailable: true,
    });

    expect(signals[0].coverage).toBe('incomplete');
    expect(signals[0].coverageNote).toMatch(/sales history is unavailable/i);
    expect(signals[0].coverageNote).toMatch(/not evidence of inactivity or churn/i);
  });
});
