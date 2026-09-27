import type { Company, Contact, Deal, Meeting } from '../types/crm';
import type { AccountEvent } from '../lib/crm';
import { accountHealthScore } from './accountHealth';
import { isCalendarDateKey, businessDaysBetween } from './business-time';
import { currentDealSchedule } from './deal-schedule';
import { isOnJourneyBoard } from './deal-workflow';
import { ACTIVE_REORDER_POLICY, accountTypeForPolicy } from './reorderPolicy';
import { inRetentionSystem, nextTouchDue } from './retentionCadence';
import type { HealthTier } from './accountHealth';

export type AttentionAction =
  | 'review_contact_hold'
  | 'resolve_customer_problem'
  | 'answer_customer'
  | 'honor_saved_followup'
  | 'review_sample_followup'
  | 'review_retention_due'
  | 'set_date_or_park';

export type QueueSection = 'review' | 'customer_response' | 'saved' | 'retention' | 'unscheduled';

export interface ContactHold {
  contactId: string;
  reasonCode: 'known_not_interested' | 'known_parked';
  reason: string;
}

export interface RetentionDueSignal {
  companyId: string;
  companyName: string;
  companyStatus: string;
  dueDate: string;
  dueDateSource: 'companies.next_touch_due' | 'derived_retention_cadence';
  tier: HealthTier;
  coverage: 'incomplete';
  coverageNote: string;
}

export interface AttentionCandidate {
  id: string;
  action: AttentionAction;
  section: QueueSection;
  reasonCode: string;
  reason: string;
  sourceRefs: string[];
  dueDate: string | null;
  originalDueDate: string | null;
  dueDateSource: string | null;
  companyId: string | null;
  companyName: string | null;
  dealId: string | null;
  dealTitle: string | null;
  /** The deal's saved next action, verbatim; absent for account-level items. */
  nextAction?: string | null;
  priority: 'high' | 'medium' | 'low';
  holds: ContactHold[];
}

export interface DeriveRetentionDueInput {
  /** Bangkok business date used by the unified queue. */
  today: string;
  /** Existing /retention UTC reference date; distinct from Bangkok due-state comparison. */
  retentionCalculationDate?: string;
  companies: readonly Company[];
  deals: readonly Deal[];
  meetings: readonly Meeting[];
  accountEvents: readonly AccountEvent[];
  accountEventsUnavailable?: boolean;
}

export interface BuildFollowupActionsInput {
  today: string;
  deals: readonly Deal[];
  companies: readonly Pick<Company, 'id' | 'name'>[];
  contacts: readonly Pick<Contact, 'id' | 'name' | 'status'>[];
  retentionDue: readonly RetentionDueSignal[];
}

function priorityOf(value: string | null | undefined): AttentionCandidate['priority'] {
  if (value === 'high' || value === 'low') return value;
  return 'medium';
}

function retentionHistoryNote(rowCount: number, unavailable: boolean): string {
  if (unavailable) {
    return 'Sales history is unavailable; this saved/derived date is advisory, not evidence of inactivity or churn.';
  }
  if (rowCount === 0) {
    return 'No account-event rows loaded; this is not proof of no orders, inactivity, or churn.';
  }
  return 'Account-event rows are present, but source completeness is unverified; do not infer inactivity or churn.';
}

/** Mirrors /retention's current UTC reference date while Today compares urgency on the Bangkok calendar. */
export function existingRetentionReferenceDate(now: Date = new Date()): string {
  if (!Number.isFinite(now.getTime())) throw new RangeError('now must be a valid instant');
  return now.toISOString().slice(0, 10);
}

export function deriveRetentionDueSignals(input: DeriveRetentionDueInput): RetentionDueSignal[] {
  if (!isCalendarDateKey(input.today)) throw new RangeError('today must be a real YYYY-MM-DD business date');
  const retentionCalculationDate = input.retentionCalculationDate ?? input.today;
  if (!isCalendarDateKey(retentionCalculationDate)) {
    throw new RangeError('retentionCalculationDate must be a real YYYY-MM-DD date');
  }

  const meetingsByCompany = new Map<string, Meeting[]>();
  for (const meeting of input.meetings) {
    if (!meeting.company_id) continue;
    const rows = meetingsByCompany.get(meeting.company_id) ?? [];
    rows.push(meeting);
    meetingsByCompany.set(meeting.company_id, rows);
  }

  const dealsByCompany = new Map<string, Deal[]>();
  for (const deal of input.deals) {
    if (!deal.company_id) continue;
    const rows = dealsByCompany.get(deal.company_id) ?? [];
    rows.push(deal);
    dealsByCompany.set(deal.company_id, rows);
  }

  const eventsByCompany = new Map<string, AccountEvent[]>();
  for (const event of input.accountEvents) {
    const rows = eventsByCompany.get(event.company_id) ?? [];
    rows.push(event);
    eventsByCompany.set(event.company_id, rows);
  }

  return input.companies.flatMap((company) => {
    const companyMeetings = meetingsByCompany.get(company.id) ?? [];
    const companyDeals = dealsByCompany.get(company.id) ?? [];
    const events = eventsByCompany.get(company.id) ?? [];
    const wonDeals = companyDeals.filter((deal) => deal.stage === 'closed_won');
    const hasSignal = companyMeetings.length > 0
      || wonDeals.length > 0
      || company.status === 'active_customer'
      || company.status === 'inactive';

    if (!hasSignal || !inRetentionSystem(company.status)) return [];

    const lastOrderDate = events.length
      ? events.map((event) => event.event_date).sort().slice(-1)[0]
      : null;
    const accountType = accountTypeForPolicy(company, ACTIVE_REORDER_POLICY);
    const health = accountHealthScore({
      companyId: company.id,
      companyName: company.name,
      createdAt: company.created_at?.slice(0, 10) || retentionCalculationDate,
      meetings: companyMeetings.map((meeting) => ({ date: meeting.date, outcome: meeting.outcome })),
      deals: companyDeals.map((deal) => ({
        stage: deal.stage,
        last_outcome: deal.last_outcome,
        value: deal.value,
      })),
      events: events.map((event) => ({
        date: event.event_date,
        amount: event.amount,
        product_line: event.product_line ?? undefined,
        order_id: event.order_id ?? undefined,
      })),
      lastOrderDate,
      accountType,
      today: retentionCalculationDate,
    });

    const lastTouch = [
      ...(companyMeetings.length
        ? [companyMeetings.map((meeting) => meeting.date).sort().slice(-1)[0]]
        : []),
      ...(company.last_human_touch ? [company.last_human_touch.slice(0, 10)] : []),
    ].sort().slice(-1)[0] || null;

    const touch = nextTouchDue({
      tier: health.tier,
      accountType,
      lastTouch,
      lastContactDate: company.last_contact_date?.slice(0, 10) || null,
      createdAt: company.created_at?.slice(0, 10) || null,
      persistedNextDue: company.next_touch_due?.slice(0, 10) || null,
      today: retentionCalculationDate,
    });

    return [{
      companyId: company.id,
      companyName: company.name,
      companyStatus: company.status,
      dueDate: touch.due,
      dueDateSource: touch.persisted ? 'companies.next_touch_due' as const : 'derived_retention_cadence' as const,
      tier: health.tier,
      coverage: 'incomplete' as const,
      coverageNote: retentionHistoryNote(events.length, input.accountEventsUnavailable ?? false),
    }];
  });
}

function knownContactHolds(
  deal: Deal,
  contactsById: ReadonlyMap<string, Pick<Contact, 'id' | 'name' | 'status'>>,
): ContactHold[] {
  return (deal.contact_ids ?? []).flatMap((contactId) => {
    const contact = contactsById.get(contactId);
    if (!contact || (contact.status !== 'not_interested' && contact.status !== 'parked')) return [];
    const reasonCode = contact.status === 'not_interested' ? 'known_not_interested' : 'known_parked';
    const holdReason = contact.status === 'not_interested' ? 'marked not interested' : 'marked parked';
    return [{
      contactId,
      reasonCode,
      reason: `${contact.name || 'Contact'} is ${holdReason}; internal review only.`,
    }];
  });
}

function dealCandidate(params: {
  deal: Deal;
  action: AttentionAction;
  section: QueueSection;
  reasonCode: string;
  reason: string;
  dueDate: string | null;
  originalDueDate: string | null;
  dueDateSource: string | null;
  companyName: string | null;
  holds?: ContactHold[];
}): AttentionCandidate {
  const holds = params.holds ?? [];
  const sourceRefs = [`deal:${params.deal.id}:schedule`, ...holds.map((hold) => `contact:${hold.contactId}:status`)];
  return {
    id: `${params.action}:deal:${params.deal.id}`,
    action: params.action,
    section: params.section,
    reasonCode: params.reasonCode,
    reason: params.reason,
    sourceRefs,
    dueDate: params.dueDate,
    originalDueDate: params.originalDueDate,
    dueDateSource: params.dueDateSource,
    companyId: params.deal.company_id ?? null,
    companyName: params.companyName,
    dealId: params.deal.id,
    dealTitle: params.deal.title || null,
    nextAction: currentDealSchedule(params.deal).next_action || null,
    priority: priorityOf(params.deal.priority),
    holds,
  };
}

/** Compose read-only action candidates from current deal schedules and existing retention outputs. */
export function buildFollowupActions(input: BuildFollowupActionsInput): AttentionCandidate[] {
  if (!isCalendarDateKey(input.today)) throw new RangeError('today must be a real YYYY-MM-DD business date');

  const companiesById = new Map(input.companies.map((company) => [company.id, company]));
  const contactsById = new Map(input.contacts.map((contact) => [contact.id, contact]));
  const actions: AttentionCandidate[] = [];

  for (const deal of input.deals) {
    if (!isOnJourneyBoard(deal)) continue;
    const schedule = currentDealSchedule(deal);
    const companyName = deal.company_id ? companiesById.get(deal.company_id)?.name ?? deal.client ?? null : deal.client ?? null;
    const holds = knownContactHolds(deal, contactsById);
    const originalDueDate = schedule.followup_date;

    if (originalDueDate && !isCalendarDateKey(originalDueDate)) {
      const hasHold = holds.length > 0;
      actions.push(dealCandidate({
        deal,
        action: hasHold ? 'review_contact_hold' : 'set_date_or_park',
        section: 'review',
        reasonCode: hasHold ? 'known_contact_hold' : 'invalid_saved_date',
        reason: hasHold
          ? `${holds.map((hold) => hold.reason).join(' ')} Saved schedule date “${originalDueDate}” is invalid; do not contact or replace it automatically.`
          : `Saved schedule date “${originalDueDate}” is not a valid calendar date; review it without automatic replacement.`,
        dueDate: null,
        originalDueDate,
        dueDateSource: 'deals.followup_date',
        companyName,
        holds,
      }));
      continue;
    }

    if (!originalDueDate) {
      actions.push(dealCandidate({
        deal,
        action: holds.length ? 'review_contact_hold' : 'set_date_or_park',
        section: holds.length ? 'review' : 'unscheduled',
        reasonCode: holds.length ? 'known_contact_hold' : 'unscheduled_deal',
        reason: holds.length
          ? `${holds.map((hold) => hold.reason).join(' ')} No saved follow-up date; review internally before considering any next step.`
          : `No saved follow-up date. Review the existing next action${schedule.next_action ? ` “${schedule.next_action}”` : ''}; choose a date or park the deal.`,
        dueDate: null,
        originalDueDate: null,
        dueDateSource: null,
        companyName,
        holds,
      }));
      continue;
    }

    const daysUntil = businessDaysBetween(input.today, originalDueDate);
    if (daysUntil > 7) continue;

    if (holds.length) {
      actions.push(dealCandidate({
        deal,
        action: 'review_contact_hold',
        section: 'review',
        reasonCode: 'known_contact_hold',
        reason: `${holds.map((hold) => hold.reason).join(' ')} Saved follow-up is ${daysUntil < 0 ? `${Math.abs(daysUntil)} day(s) overdue` : daysUntil === 0 ? 'due today' : `due in ${daysUntil} day(s)`}; this is not contact clearance.`,
        dueDate: originalDueDate,
        originalDueDate,
        dueDateSource: 'deals.followup_date',
        companyName,
        holds,
      }));
      continue;
    }

    actions.push(dealCandidate({
      deal,
      action: 'honor_saved_followup',
      section: 'saved',
      reasonCode: 'saved_followup_due',
      reason: `${schedule.next_action ? `Saved action: “${schedule.next_action}”. ` : ''}Existing follow-up is ${daysUntil < 0 ? `${Math.abs(daysUntil)} day(s) overdue` : daysUntil === 0 ? 'due today' : `due in ${daysUntil} day(s)`}.`,
      dueDate: originalDueDate,
      originalDueDate,
      dueDateSource: 'deals.followup_date',
      companyName,
    }));
  }

  for (const signal of input.retentionDue) {
    if (!inRetentionSystem(signal.companyStatus)) continue;
    if (isCalendarDateKey(signal.dueDate) && businessDaysBetween(input.today, signal.dueDate) > 0) continue;

    const validDate = isCalendarDateKey(signal.dueDate);
    actions.push({
      id: `review_retention_due:company:${signal.companyId}`,
      action: 'review_retention_due',
      section: validDate ? 'retention' : 'review',
      reasonCode: validDate ? 'retention_due' : 'invalid_retention_due_date',
      reason: validDate
        ? `Existing ${signal.tier.replace('_', '-')} retention date is ${signal.dueDateSource === 'companies.next_touch_due' ? 'saved' : 'derived'}${signal.dueDate < input.today ? ` and ${businessDaysBetween(signal.dueDate, input.today)} day(s) overdue` : ' and due today'}. ${signal.coverageNote}`
        : `Existing retention date “${signal.dueDate}” is invalid; review without changing it. ${signal.coverageNote}`,
      sourceRefs: [`company:${signal.companyId}:${signal.dueDateSource}`],
      dueDate: validDate ? signal.dueDate : null,
      originalDueDate: signal.dueDate,
      dueDateSource: signal.dueDateSource,
      companyId: signal.companyId,
      companyName: signal.companyName,
      dealId: null,
      dealTitle: null,
      priority: 'medium',
      holds: [],
    });
  }

  return actions;
}
