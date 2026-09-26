import type { AccountEvent } from '../lib/crm';
import type { Deal, Meeting, MeetingDirection } from '../types/crm';

export type CustomerEvidenceProvenance =
  | 'buyer_verbatim'
  | 'operator_note'
  | 'outbound'
  | 'internal'
  | 'unknown';

export type CustomerEvidenceSourceKind =
  | 'deal.buyer_reply'
  | 'deal.last_outcome'
  | 'meeting.description'
  | 'meeting.summary';

export interface CustomerEvidenceItem {
  sourceRef: string;
  entityId: string;
  sourceKind: CustomerEvidenceSourceKind;
  provenance: CustomerEvidenceProvenance;
  direction: MeetingDirection;
  /** Event/message time only. Null means the source did not record a reliable time. */
  observedAt: string | null;
  /** Kept exactly as recorded; never clipped or paraphrased here. */
  text: string;
  eligibleForCustomerJudgment: boolean;
  exclusionReason?: 'not_verbatim_buyer_text';
}

export type CustomerEvidencePacket =
  | {
      status: 'ready';
      entityId: string;
      evidence: CustomerEvidenceItem[];
      modelEvidence: CustomerEvidenceItem[];
      modelInput: string;
      inputBytes: number;
      requiresReview: boolean;
    }
  | {
      status: 'needs_review';
      entityId: string;
      evidence: CustomerEvidenceItem[];
      reason:
        | 'buyer_evidence_order_unknown'
        | 'duplicate_source_ref'
        | 'source_identity_mismatch';
      modelInput: null;
    }
  | {
      status: 'not_assessed';
      entityId: string;
      evidence: CustomerEvidenceItem[];
      reason:
        | 'no_attributed_buyer_text'
        | 'input_too_long'
        | 'invalid_input_limit'
        | 'source_loading'
        | 'source_unavailable'
        | 'deal_not_found'
        | 'buyer_reply_field_unavailable';
      modelInput: null;
    };

export type EvidenceSourceAvailability = 'loaded' | 'loading' | 'unavailable';

export type CustomerEvidenceFact<T> =
  | { status: 'recorded'; value: T; sourceRefs: string[]; caveat?: string }
  | {
      status: 'not_recorded';
      reason: 'no_stored_buyer_reply' | 'no_interaction_rows' | 'no_order_record' | 'no_positive_order_record' | 'no_saved_action' | 'no_saved_date';
      message: string;
    }
  | {
      status: 'unknown';
      reason: 'source_loading' | 'source_unavailable' | 'deal_not_found' | 'deal_identity_mismatch' | 'company_not_linked' | 'field_not_projected' | 'no_structured_promise_record';
      message: string;
    }
  | {
      status: 'needs_review';
      reason: 'invalid_saved_date' | 'invalid_order_date' | 'invalid_order_amount' | 'unknown_order_source';
      message: string;
      value?: T;
      sourceRefs?: string[];
    };

export type OrderRecordOrigin =
  | 'manual_sale_entry'
  | 'explicit_closed_won_order_entry'
  | 'historical_invoice_import'
  | 'imported_sales_history'
  | 'multiple_sources'
  | 'unknown';

type CustomerReplyValue = { text: string; observedAt: string | null };
type ActivityHistoryValue = { total: number; byDirection: Record<MeetingDirection, number> };
type RecordedOrderValue = {
  eventDate: string;
  origin: OrderRecordOrigin;
  productLines: string[];
  orderReference: 'present' | 'missing' | 'mixed';
};
type PipelineContextValue = {
  stage: Deal['stage'];
  valueType: NonNullable<Deal['value_type']> | 'unknown';
  isOrderEvidence: false;
};

export interface CustomerEvidenceFacts {
  customerReply: CustomerEvidenceFact<CustomerReplyValue>;
  activityHistory: CustomerEvidenceFact<ActivityHistoryValue>;
  lastRecordedOrder: CustomerEvidenceFact<RecordedOrderValue>;
  openPromise: CustomerEvidenceFact<null>;
  savedNextAction: CustomerEvidenceFact<string>;
  savedFollowupDate: CustomerEvidenceFact<string>;
  pipelineContext: CustomerEvidenceFact<PipelineContextValue>;
}

export interface CustomerEvidenceFolder {
  entityId: string;
  facts: CustomerEvidenceFacts;
  /** This packet contains only eligible verbatim buyer text, never structured scheduling/order facts. */
  judgmentPacket: CustomerEvidencePacket;
}

export interface CustomerEvidenceFolderInput {
  entityId: string;
  deal: (Pick<Deal, 'id' | 'company_id' | 'buyer_reply' | 'next_action' | 'followup_date' | 'stage' | 'value_type'> &
    Partial<Pick<Deal, 'last_outcome'>>) | null;
  meetings: readonly Pick<Meeting, 'id' | 'company_id' | 'deal_id' | 'date' | 'direction' | 'description' | 'summary'>[];
  accountEvents: readonly Pick<AccountEvent, 'company_id' | 'event_date' | 'amount' | 'product_line' | 'order_id' | 'source'>[];
  sourceAvailability: {
    deal: EvidenceSourceAvailability;
    meetings: EvidenceSourceAvailability;
    accountEvents: EvidenceSourceAvailability;
  };
  maxInputBytes: number;
}

const KNOWN_DIRECTIONS = new Set<MeetingDirection>(['inbound', 'outbound', 'internal', 'unknown']);

/** Local packet-size ceiling only; this is not evidence that a Laya question fits its tokenizer/model budget. */
export const CUSTOMER_EVIDENCE_MAX_INPUT_BYTES = 8 * 1024;

function directionOf(value: unknown): MeetingDirection {
  return typeof value === 'string' && KNOWN_DIRECTIONS.has(value as MeetingDirection)
    ? (value as MeetingDirection)
    : 'unknown';
}

function validObservedAt(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const timestampWithZone =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value);
  if (!dateOnly && !timestampWithZone) return null;
  const calendarDate = value.slice(0, 10);
  if (!Number.isFinite(Date.parse(`${calendarDate}T00:00:00Z`))) return null;
  if (new Date(`${calendarDate}T00:00:00Z`).toISOString().slice(0, 10) !== calendarDate) return null;
  if (!Number.isFinite(Date.parse(dateOnly ? `${value}T00:00:00Z` : value))) return null;
  return value;
}

function meetingProvenance(direction: MeetingDirection): CustomerEvidenceProvenance {
  if (direction === 'outbound') return 'outbound';
  if (direction === 'internal') return 'internal';
  if (direction === 'inbound') return 'operator_note';
  return 'unknown';
}

function meetingBelongsToDeal(
  deal: Pick<Deal, 'id' | 'company_id'>,
  meeting: Pick<Meeting, 'company_id' | 'deal_id'>,
): boolean {
  if (deal.company_id && meeting.company_id && deal.company_id !== meeting.company_id) return false;
  if (meeting.deal_id === deal.id) return true;
  return meeting.deal_id == null && Boolean(deal.company_id) && meeting.company_id === deal.company_id;
}

function validCalendarDate(value: unknown): string | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  return validObservedAt(value) === value ? value : null;
}

/**
 * Select display evidence for one deal from already-loaded rows.
 * Only deals.buyer_reply is source-attributed verbatim buyer text in v1.
 * Meeting summaries/descriptions stay visible but are never scored as buyer speech.
 */
export function collectDealCustomerEvidence(
  deal: Pick<Deal, 'id' | 'company_id' | 'buyer_reply'> & Partial<Pick<Deal, 'last_outcome'>>,
  meetings: readonly Pick<
    Meeting,
    'id' | 'company_id' | 'deal_id' | 'date' | 'direction' | 'description' | 'summary'
  >[],
): CustomerEvidenceItem[] {
  const evidence: CustomerEvidenceItem[] = [];
  const buyerText = deal.buyer_reply;

  if (typeof buyerText === 'string' && buyerText.trim().length > 0) {
    evidence.push({
      sourceRef: `deal:${deal.id}:buyer_reply`,
      entityId: deal.id,
      sourceKind: 'deal.buyer_reply',
      provenance: 'buyer_verbatim',
      direction: 'inbound',
      // buyer_reply has no message timestamp; updated_at is deliberately not a fallback.
      observedAt: null,
      text: buyerText,
      eligibleForCustomerJudgment: true,
    });
  }

  if (typeof deal.last_outcome === 'string' && deal.last_outcome.trim().length > 0) {
    evidence.push({
      sourceRef: `deal:${deal.id}:last_outcome`,
      entityId: deal.id,
      sourceKind: 'deal.last_outcome',
      provenance: 'operator_note',
      direction: 'internal',
      observedAt: null,
      text: deal.last_outcome,
      eligibleForCustomerJudgment: false,
      exclusionReason: 'not_verbatim_buyer_text',
    });
  }

  for (const meeting of meetings) {
    if (!meetingBelongsToDeal(deal, meeting)) continue;
    const direction = directionOf(meeting.direction);
    const provenance = meetingProvenance(direction);
    const observedAt = validObservedAt(meeting.date);

    for (const field of ['description', 'summary'] as const) {
      const text = meeting[field];
      if (typeof text !== 'string' || text.trim().length === 0) continue;
      evidence.push({
        sourceRef: `meeting:${meeting.id}:${field}`,
        entityId: deal.id,
        sourceKind: `meeting.${field}`,
        provenance,
        direction,
        observedAt,
        text,
        eligibleForCustomerJudgment: false,
        exclusionReason: 'not_verbatim_buyer_text',
      });
    }
  }

  return evidence;
}

function sourceUnavailable<T>(availability: EvidenceSourceAvailability, label: string): CustomerEvidenceFact<T> | null {
  if (availability === 'loaded') return null;
  if (availability === 'loading') {
    return { status: 'unknown', reason: 'source_loading', message: `${label} is still loading.` };
  }
  return { status: 'unknown', reason: 'source_unavailable', message: `${label} could not be loaded.` };
}

function dealUnavailable<T>(
  deal: CustomerEvidenceFolderInput['deal'],
  availability: EvidenceSourceAvailability,
  entityId?: string,
): CustomerEvidenceFact<T> | null {
  const unavailable = sourceUnavailable<T>(availability, 'Deal facts');
  if (unavailable) return unavailable;
  if (!deal) {
    return { status: 'unknown', reason: 'deal_not_found', message: 'This deal is not present in the loaded CRM rows.' };
  }
  if (entityId && deal.id !== entityId) {
    return { status: 'unknown', reason: 'deal_identity_mismatch', message: 'Loaded deal identity does not match this evidence folder; facts are withheld.' };
  }
  return null;
}

function accountEventSourceRef(event: CustomerEvidenceFolderInput['accountEvents'][number], index: number): string {
  const orderId = typeof event.order_id === 'string' ? event.order_id.trim() : '';
  const key = orderId || `${event.event_date || 'undated'}:row-${index}`;
  return `account_event:${event.company_id}:${key}`;
}

function amountNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function orderOrigin(value: unknown): OrderRecordOrigin {
  if (value === 'app_manual') return 'manual_sale_entry';
  if (value === 'app_closed_won') return 'explicit_closed_won_order_entry';
  if (typeof value !== 'string' || value.trim().length === 0) return 'unknown';
  if (value.startsWith('backfill-from-sales-')) return 'historical_invoice_import';
  return 'imported_sales_history';
}

function lastRecordedOrderFact(input: CustomerEvidenceFolderInput): CustomerEvidenceFacts['lastRecordedOrder'] {
  const unavailable = sourceUnavailable<RecordedOrderValue>(input.sourceAvailability.accountEvents, 'Sales-history source');
  if (unavailable) return unavailable;
  const dealState = dealUnavailable<RecordedOrderValue>(input.deal, input.sourceAvailability.deal, input.entityId);
  if (dealState) return dealState;
  if (!input.deal?.company_id) {
    return {
      status: 'unknown',
      reason: 'company_not_linked',
      message: 'This deal has no company link, so account order history cannot be safely matched.',
    };
  }

  const matching = input.accountEvents
    .map((event, index) => ({ event, sourceRef: accountEventSourceRef(event, index) }))
    .filter(({ event }) => event.company_id === input.deal!.company_id);
  if (matching.length === 0) {
    return {
      status: 'not_recorded',
      reason: 'no_order_record',
      message: 'No order entry was found in the loaded account history. History may be incomplete; this does not prove no purchases occurred.',
    };
  }

  const positive: { event: CustomerEvidenceFolderInput['accountEvents'][number]; sourceRef: string; date: string }[] = [];
  for (const { event, sourceRef } of matching) {
    const amount = amountNumber(event.amount);
    if (amount === null) {
      return {
        status: 'needs_review',
        reason: 'invalid_order_amount',
        message: 'A sales-history row has an invalid amount, so it cannot safely be included or excluded as an order.',
        sourceRefs: [sourceRef],
      };
    }
    if (amount <= 0) continue;
    const date = validCalendarDate(event.event_date);
    if (!date) {
      return {
        status: 'needs_review',
        reason: 'invalid_order_date',
        message: 'A positive sales-history row has an invalid date; it could be the latest order.',
        sourceRefs: [sourceRef],
      };
    }
    positive.push({ event, sourceRef, date });
  }

  if (positive.length === 0) {
    return {
      status: 'not_recorded',
      reason: 'no_positive_order_record',
      message: 'No positive-value order entry was found. Zero-value rows remain in the source history but do not establish a positive purchase here.',
    };
  }

  const eventDate = positive.reduce((latest, row) => row.date > latest ? row.date : latest, positive[0].date);
  const latest = positive.filter((row) => row.date === eventDate);
  const origins = [...new Set(latest.map(({ event }) => orderOrigin(event.source)))];
  const sourceRefs = [...new Set(latest.map(({ sourceRef }) => sourceRef))];
  const origin = origins.length === 1 ? origins[0] : 'multiple_sources';
  const orderIds = latest.map(({ event }) => typeof event.order_id === 'string' ? event.order_id.trim() : '');
  const orderReference = orderIds.every(Boolean) ? 'present' : orderIds.every((id) => !id) ? 'missing' : 'mixed';
  const value: RecordedOrderValue = {
    eventDate,
    origin,
    productLines: [...new Set(latest.map(({ event }) => event.product_line?.trim()).filter((line): line is string => Boolean(line)))],
    orderReference,
  };

  if (origins.includes('unknown')) {
    return {
      status: 'needs_review',
      reason: 'unknown_order_source',
      message: 'The latest positive sales-history row has no source provenance; verify it before treating it as an order.',
      value,
      sourceRefs,
    };
  }

  return {
    status: 'recorded',
    value,
    sourceRefs,
    caveat: 'A recorded sales-history entry is not independent proof of payment; absent history does not prove no purchase.',
  };
}

function buildCustomerEvidenceFacts(input: CustomerEvidenceFolderInput): CustomerEvidenceFacts {
  const deal = input.deal;
  const dealIssue = dealUnavailable<never>(deal, input.sourceAvailability.deal, input.entityId);

  let customerReply: CustomerEvidenceFacts['customerReply'];
  if (dealIssue) {
    customerReply = dealIssue;
  } else if (!Object.prototype.hasOwnProperty.call(deal, 'buyer_reply') || deal?.buyer_reply === undefined) {
    customerReply = {
      status: 'unknown',
      reason: 'field_not_projected',
      message: 'The buyer-reply field was not supplied; no absence can be inferred.',
    };
  } else if (typeof deal.buyer_reply === 'string' && deal.buyer_reply.trim().length > 0) {
    customerReply = {
      status: 'recorded',
      value: { text: deal.buyer_reply, observedAt: null },
      sourceRefs: [`deal:${deal.id}:buyer_reply`],
      caveat: 'The buyer-reply field has no message timestamp; record-update time is not substituted.',
    };
  } else {
    customerReply = {
      status: 'not_recorded',
      reason: 'no_stored_buyer_reply',
      message: 'No verbatim buyer reply is stored on this deal. This does not prove there was no reply or contact.',
    };
  }

  let activityHistory: CustomerEvidenceFacts['activityHistory'];
  const meetingsIssue =
    sourceUnavailable<ActivityHistoryValue>(input.sourceAvailability.meetings, 'Interaction history') ??
    dealUnavailable<ActivityHistoryValue>(deal, input.sourceAvailability.deal, input.entityId);
  if (meetingsIssue) {
    activityHistory = meetingsIssue;
  } else {
    const relevantMeetings = [...new Map(
      input.meetings
        .filter((meeting) => meetingBelongsToDeal(deal!, meeting))
        .map((meeting) => [meeting.id, meeting]),
    ).values()];
    if (relevantMeetings.length === 0) {
      activityHistory = {
        status: 'not_recorded',
        reason: 'no_interaction_rows',
        message: 'No linked interaction rows were found in the loaded history. This does not prove no customer activity occurred elsewhere.',
      };
    } else {
      const byDirection: Record<MeetingDirection, number> = { inbound: 0, outbound: 0, internal: 0, unknown: 0 };
      relevantMeetings.forEach((meeting) => { byDirection[directionOf(meeting.direction)] += 1; });
      activityHistory = {
        status: 'recorded',
        value: { total: relevantMeetings.length, byDirection },
        sourceRefs: relevantMeetings.map((meeting) => `meeting:${meeting.id}`),
        caveat: 'CRM interaction rows are not a guarantee that every customer contact was logged.',
      };
    }
  }

  let openPromise: CustomerEvidenceFacts['openPromise'];
  if (dealIssue) {
    openPromise = dealIssue;
  } else {
    openPromise = {
      status: 'unknown',
      reason: 'no_structured_promise_record',
      message: 'There is no structured open-promise field. Operator notes remain visible below but are not parsed or marked open.',
    };
  }

  let savedNextAction: CustomerEvidenceFacts['savedNextAction'];
  let savedFollowupDate: CustomerEvidenceFacts['savedFollowupDate'];
  let pipelineContext: CustomerEvidenceFacts['pipelineContext'];
  if (dealIssue) {
    savedNextAction = dealIssue;
    savedFollowupDate = dealIssue;
    pipelineContext = dealIssue;
  } else if (deal) {
    if (deal.next_action === undefined) {
      savedNextAction = {
        status: 'unknown', reason: 'field_not_projected', message: 'The saved next-action field was not supplied.',
      };
    } else if (typeof deal.next_action === 'string' && deal.next_action.trim().length > 0) {
      savedNextAction = {
        status: 'recorded', value: deal.next_action, sourceRefs: [`deal:${deal.id}:next_action`],
      };
    } else {
      savedNextAction = {
        status: 'not_recorded', reason: 'no_saved_action', message: 'No saved next action is recorded on this deal.',
      };
    }

    if (deal.followup_date === undefined) {
      savedFollowupDate = {
        status: 'unknown', reason: 'field_not_projected', message: 'The saved follow-up date field was not supplied.',
      };
    } else if (deal.followup_date == null || deal.followup_date === '') {
      savedFollowupDate = {
        status: 'not_recorded', reason: 'no_saved_date', message: 'No saved follow-up date is recorded on this deal.',
      };
    } else {
      const date = validCalendarDate(deal.followup_date);
      savedFollowupDate = date
        ? { status: 'recorded', value: date, sourceRefs: [`deal:${deal.id}:followup_date`] }
        : {
            status: 'needs_review', reason: 'invalid_saved_date',
            message: 'The saved follow-up date is invalid; it is not replaced or corrected here.',
          };
    }

    pipelineContext = {
      status: 'recorded',
      value: { stage: deal.stage, valueType: deal.value_type ?? 'unknown', isOrderEvidence: false },
      sourceRefs: [`deal:${deal.id}:pipeline`],
      caveat: 'Pipeline stage/value is separate from recorded account-event order history.',
    };
  } else {
    savedNextAction = { status: 'unknown', reason: 'deal_not_found', message: 'Deal data is unavailable.' };
    savedFollowupDate = savedNextAction;
    pipelineContext = { status: 'unknown', reason: 'deal_not_found', message: 'Deal data is unavailable.' };
  }

  return {
    customerReply,
    activityHistory,
    lastRecordedOrder: lastRecordedOrderFact(input),
    openPromise,
    savedNextAction,
    savedFollowupDate,
    pipelineContext,
  };
}

function unavailablePacket(
  entityId: string,
  evidence: CustomerEvidenceItem[],
  reason: 'source_loading' | 'source_unavailable' | 'deal_not_found' | 'buyer_reply_field_unavailable',
): CustomerEvidencePacket {
  return { status: 'not_assessed', entityId, evidence, reason, modelInput: null };
}

/**
 * Collect a reviewable customer folder from already-loaded rows. Structured
 * order/schedule facts remain separate from the only model-eligible buyer text.
 */
export function buildCustomerEvidenceFolder(input: CustomerEvidenceFolderInput): CustomerEvidenceFolder {
  const dealMatchesEntity = !input.deal || input.deal.id === input.entityId;
  const dealReady = input.sourceAvailability.deal === 'loaded' && dealMatchesEntity;
  const deal = dealReady ? input.deal : null;
  const evidence = deal
    ? collectDealCustomerEvidence(deal, input.sourceAvailability.meetings === 'loaded' ? input.meetings : [])
    : [];

  let judgmentPacket: CustomerEvidencePacket;
  if (input.sourceAvailability.deal === 'loading') {
    judgmentPacket = unavailablePacket(input.entityId, evidence, 'source_loading');
  } else if (input.sourceAvailability.deal === 'unavailable') {
    judgmentPacket = unavailablePacket(input.entityId, evidence, 'source_unavailable');
  } else if (input.deal && !dealMatchesEntity) {
    judgmentPacket = needsReview(input.entityId, evidence, 'source_identity_mismatch');
  } else if (!deal) {
    judgmentPacket = unavailablePacket(input.entityId, evidence, 'deal_not_found');
  } else if (!Object.prototype.hasOwnProperty.call(deal, 'buyer_reply') || deal.buyer_reply === undefined) {
    judgmentPacket = unavailablePacket(input.entityId, evidence, 'buyer_reply_field_unavailable');
  } else {
    judgmentPacket = buildCustomerEvidencePacket({
      entityId: input.entityId,
      evidence,
      maxInputBytes: input.maxInputBytes,
    });
  }

  return { entityId: input.entityId, facts: buildCustomerEvidenceFacts(input), judgmentPacket };
}

function isBuyerEvidenceCandidate(item: CustomerEvidenceItem): boolean {
  return (
    item.sourceKind === 'deal.buyer_reply' &&
    item.eligibleForCustomerJudgment &&
    item.provenance === 'buyer_verbatim' &&
    item.direction === 'inbound' &&
    typeof item.text === 'string' &&
    item.text.trim().length > 0
  );
}

function sourceRefMatchesDeal(item: CustomerEvidenceItem): boolean {
  const prefix = `deal:${item.entityId}:buyer_reply`;
  return item.sourceRef === prefix || item.sourceRef.startsWith(`${prefix}:`);
}

function isEligibleBuyerEvidence(item: CustomerEvidenceItem, entityId: string): boolean {
  return item.entityId === entityId && isBuyerEvidenceCandidate(item) && sourceRefMatchesDeal(item);
}

function needsReview(
  entityId: string,
  evidence: CustomerEvidenceItem[],
  reason: 'buyer_evidence_order_unknown' | 'duplicate_source_ref' | 'source_identity_mismatch',
): CustomerEvidencePacket {
  return { status: 'needs_review', entityId, evidence, reason, modelInput: null };
}

/**
 * Create the exact, inspectable JSON state for a later explicit local judgment.
 * `maxInputBytes` is supplied by the caller; this helper rejects rather than
 * truncating. The worker still owns tokenizer/model-capacity validation of the
 * complete question-plus-state payload.
 */
export function buildCustomerEvidencePacket(input: {
  entityId: string;
  evidence: CustomerEvidenceItem[];
  maxInputBytes: number;
}): CustomerEvidencePacket {
  const evidence = input.evidence.map((item) => ({ ...item }));
  if (!Number.isSafeInteger(input.maxInputBytes) || input.maxInputBytes < 0) {
    return {
      status: 'not_assessed',
      entityId: input.entityId,
      evidence,
      reason: 'invalid_input_limit',
      modelInput: null,
    };
  }
  const buyerEvidence = evidence.filter(isBuyerEvidenceCandidate);
  if (buyerEvidence.some((item) => item.entityId !== input.entityId || !sourceRefMatchesDeal(item))) {
    return needsReview(input.entityId, evidence, 'source_identity_mismatch');
  }
  const eligible = evidence.filter((item) => isEligibleBuyerEvidence(item, input.entityId));
  if (eligible.length === 0) {
    return {
      status: 'not_assessed',
      entityId: input.entityId,
      evidence,
      reason: 'no_attributed_buyer_text',
      modelInput: null,
    };
  }

  if (new Set(eligible.map((item) => item.sourceRef)).size !== eligible.length) {
    return needsReview(input.entityId, evidence, 'duplicate_source_ref');
  }

  let modelEvidence = eligible;
  if (eligible.length > 1) {
    const ordered = eligible.map((item) => ({ item, time: validObservedAt(item.observedAt) }));
    if (ordered.some(({ time }) => time === null)) {
      return needsReview(input.entityId, evidence, 'buyer_evidence_order_unknown');
    }
    const sorted = [...ordered].sort((a, b) => Date.parse(a.time!) - Date.parse(b.time!));
    if (sorted.some((entry, index) => index > 0 && Date.parse(entry.time!) === Date.parse(sorted[index - 1].time!))) {
      return needsReview(input.entityId, evidence, 'buyer_evidence_order_unknown');
    }
    modelEvidence = sorted.map(({ item }) => item);
  }

  const modelInput = JSON.stringify({
    evidence: modelEvidence.map((item) => ({
      source_kind: item.sourceKind,
      direction: item.direction,
      observed_at: validObservedAt(item.observedAt),
      text: item.text,
    })),
  });
  const inputBytes = new TextEncoder().encode(modelInput).byteLength;
  const maxInputBytes = input.maxInputBytes;
  if (inputBytes > maxInputBytes) {
    return {
      status: 'not_assessed',
      entityId: input.entityId,
      evidence,
      reason: 'input_too_long',
      modelInput: null,
    };
  }

  return {
    status: 'ready',
    entityId: input.entityId,
    evidence,
    modelEvidence,
    modelInput,
    inputBytes,
    requiresReview: modelEvidence.some((item) => validObservedAt(item.observedAt) === null),
  };
}
