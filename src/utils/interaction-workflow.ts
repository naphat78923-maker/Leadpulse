// Resolves an explicitly chosen post-interaction lane into a deal update.
//
// Two things are deliberately separate here:
//   1. the EVENT (what happened — see interaction-event.ts), which owns direction and
//      sentiment, and
//   2. the LANE MOVE, which is always a separate explicit choice the user makes.
// Selecting the current lane is always a no-op, and nothing is inferred from the
// interaction channel or from the outcome's sentiment alone.
import type { Deal, DealWorkflowAction, Meeting, MeetingType, SampleStatus } from '@/types/crm';
import { WORKFLOW_BY_ID, getWorkflowAction, stageFromWorkflow } from '@/utils/deal-workflow';
import {
  directionForEvent,
  eventKindLabel,
  isCustomerResponseOutcome,
  validateInteractionEvent,
  type InteractionEventKind,
} from '@/utils/interaction-event';

export interface InteractionWorkflowDetails {
  kind: InteractionEventKind;
  outcome: Meeting['outcome'];
  interactionDescription: string;
  channel?: MeetingType | null;
  sampleStatus?: SampleStatus | null;
  testingDate?: string | null;
  confirmSuccess?: boolean;
}

export interface LaneTargetOption {
  target: DealWorkflowAction;
  label: string;
  hint: string;
}

/**
 * Forward lanes offered for a given event from a given lane.
 * `reschedule` (Follow-up) is reachable directly so a legitimate follow-up never has to
 * be dressed up as a sample or a testing event. A recorded client reply is never a move
 * into "Waiting on reply": that lane means outreach was sent and nothing has come back.
 */
const FORWARD_LANES: Partial<Record<DealWorkflowAction, DealWorkflowAction[]>> = {
  outreach: ['reply', 'reschedule'],
  reply: ['sample', 'reschedule'],
  sample: ['testing', 'reschedule'],
  testing: ['reschedule'],
  reschedule: [],
};

const LANE_MOVE_LABELS: Partial<Record<`${InteractionEventKind}:${DealWorkflowAction}`, { label: string; hint: string }>> = {
  'outbound_attempt:reply': {
    label: 'Log outreach and wait for reply',
    hint: 'Waiting on reply means outreach was sent and nothing has come back yet.',
  },
  'outbound_attempt:reschedule': {
    label: 'Log outreach and set a follow-up date',
    hint: 'A direct follow-up — no sample or testing step needed.',
  },
  'customer_response:sample': {
    label: 'Record reply and choose next action · Sample',
    hint: 'The client replied. Shipping a sample is your explicit choice, not an automatic one.',
  },
  'customer_response:testing': {
    label: 'Record reply and choose next action · Testing',
    hint: 'Book the client kitchen test with its date.',
  },
  'customer_response:reschedule': {
    label: 'Record reply and schedule the follow-up',
    hint: 'Follow up directly — no sample or testing step needed.',
  },
};

export function laneTargetOptions(deal: Deal, kind: InteractionEventKind): LaneTargetOption[] {
  const current = getWorkflowAction(deal);
  if (kind === 'internal_note') return [];
  return (FORWARD_LANES[current] || [])
    .filter(target => !(kind === 'customer_response' && target === 'reply'))
    .map(target => {
      const meta = LANE_MOVE_LABELS[`${kind}:${target}`];
      return {
        target,
        label: meta?.label ?? `Move forward · ${WORKFLOW_BY_ID[target].shortLabel}`,
        hint: meta?.hint ?? '',
      };
    });
}

/** True when the chosen event permits the chosen lane move. */
export function isLaneTargetAllowed(deal: Deal, target: DealWorkflowAction, kind: InteractionEventKind): boolean {
  return laneTargetOptions(deal, kind).some(option => option.target === target);
}

export function directionForInteraction(details: Pick<InteractionWorkflowDetails, 'kind'>) {
  return directionForEvent(details.kind);
}

function journalEntryFor(kind: InteractionEventKind, target: DealWorkflowAction, details: InteractionWorkflowDetails) {
  const description = details.interactionDescription.trim();
  if (kind === 'customer_response') {
    const sentiment = isCustomerResponseOutcome(details.outcome) ? ` (${details.outcome})` : ' (sentiment not recorded)';
    return `💬 Customer reply${sentiment}: ${description}`;
  }
  if (kind === 'internal_note') {
    return `📝 Internal note: ${description}`;
  }
  const sentiment = isCustomerResponseOutcome(details.outcome) ? ` (${details.outcome})` : '';
  const waiting = target === 'reply' ? ' — waiting on reply' : '';
  return `✅ Outreach logged${sentiment}${waiting}: ${description}`;
}

export function buildInteractionWorkflowUpdate(
  deal: Deal,
  targetAction: DealWorkflowAction,
  details: InteractionWorkflowDetails
): Partial<Deal> | null {
  const currentAction = getWorkflowAction(deal);
  if (targetAction === currentAction) return null;

  // Won / Park are exits — never offered as a post-log next lane.
  if (targetAction === 'success' || targetAction === 'parked') {
    throw new Error('Mark won or park from the deal exit menu — not by logging a touch.');
  }

  const eventError = validateInteractionEvent({ kind: details.kind, outcome: details.outcome });
  if (eventError) throw new Error(eventError);

  if (targetAction === 'reply' && details.kind === 'customer_response') {
    throw new Error(
      'Waiting on reply means outreach was sent and no reply has arrived. Record the reply with an explicit next action — keep the lane, move to Sample, or set a Follow-up.'
    );
  }

  if (!isLaneTargetAllowed(deal, targetAction, details.kind)) {
    throw new Error(
      `A ${eventKindLabel(details.kind).toLowerCase()} cannot move this deal to that lane. Choose the current lane or one of the offered next actions.`
    );
  }

  const updates: Partial<Deal> = {
    workflow_action: targetAction,
    stage: stageFromWorkflow(targetAction, deal.stage),
    last_outcome: appendOutcome(
      deal.last_outcome || '',
      timestampedEntry(journalEntryFor(details.kind, targetAction, details))
    ),
  };

  if (targetAction === 'sample') {
    if (!details.sampleStatus) {
      throw new Error('Choose a sample status before moving this deal to Sample.');
    }
    updates.sample_status = details.sampleStatus;
  }

  if (targetAction === 'testing') {
    if (!details.testingDate) {
      throw new Error('Choose a testing date before moving this deal to Testing.');
    }
    updates.followup_date = details.testingDate;
  }

  if (targetAction === 'reschedule') {
    if (!details.testingDate && !deal.followup_date) {
      throw new Error('Set a follow-up date before moving this deal to Follow-up.');
    }
    if (details.testingDate) updates.followup_date = details.testingDate;
  }

  return updates;
}

function appendOutcome(existing: string, entry?: string) {
  if (!entry) return existing;
  return existing ? `${existing}\n---\n${entry}` : entry;
}

function timestampedEntry(text: string) {
  const stamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  return `[${stamp}] ${text}`;
}
