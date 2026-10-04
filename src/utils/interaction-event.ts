// Interaction event classification — what actually happened on a touch.
//
// The event kind is chosen explicitly by the person logging the touch. It is the
// ONLY input to direction: the lane the deal happens to be in, or moves to, must
// never redefine the event. See `directionForEvent` and `countsTowardUnansweredChase`.
//
// Counting policy note: `ACTIVE_CHASE_POLICY_ID` is deliberately the cumulative-sends
// policy that production already serves, so this module changes no live nudge badge on
// its own. The reviewed alternative (`v1-unanswered-chases`) separates a conversation
// from an unanswered chase and is a four-send-policy decision that needs Pat's explicit
// sign-off — it is implemented and tested here, not switched on.
import type { MeetingDirection, MeetingType } from '@/types/crm';

export type InteractionEventKind = 'outbound_attempt' | 'customer_response' | 'internal_note';

/** The minimum shape the counting policy reads from an interaction row. */
export interface ChaseCountableMeeting {
  deal_id?: string | null;
  type: string;
  direction?: string | null;
  outcome?: string | null;
}

/** Channels that represent us reaching out. A `nudge` row is workflow activity, not a send. */
export const UNANSWERED_CHASE_CHANNELS = ['call', 'email', 'dm'] as const;

/** A sentiment the client actually expressed. `no_response` is not a response. */
export const CUSTOMER_RESPONSE_OUTCOMES = ['positive', 'neutral', 'negative'] as const;

export function isCustomerResponseOutcome(outcome: string | null | undefined): boolean {
  return !!outcome && (CUSTOMER_RESPONSE_OUTCOMES as readonly string[]).includes(outcome);
}

export const INTERACTION_EVENT_OPTIONS: Array<{
  value: InteractionEventKind;
  label: string;
  hint: string;
  direction: MeetingDirection;
}> = [
  {
    value: 'outbound_attempt',
    label: 'Outbound attempt',
    hint: 'You contacted them. Waiting on a reply is allowed with no response recorded.',
    direction: 'outbound',
  },
  {
    value: 'customer_response',
    label: 'Client replied',
    hint: 'They responded — a real outcome is required and the next action is yours to choose.',
    direction: 'inbound',
  },
  {
    value: 'internal_note',
    label: 'Internal note',
    hint: 'Your own note or meeting. Never counts as outreach or a reply.',
    direction: 'internal',
  },
];

/** Who initiated the touch. Direction comes from the event kind, never from a lane move. */
export function directionForEvent(kind: InteractionEventKind): MeetingDirection {
  if (kind === 'customer_response') return 'inbound';
  if (kind === 'internal_note') return 'internal';
  return 'outbound';
}

/** The kind a channel implies before the user says otherwise. */
export function defaultEventKind(type: MeetingType): InteractionEventKind {
  if (type === 'note' || type === 'meeting') return 'internal_note';
  return 'outbound_attempt';
}

export function eventKindLabel(kind: InteractionEventKind): string {
  return INTERACTION_EVENT_OPTIONS.find(option => option.value === kind)?.label ?? kind;
}

/**
 * Guards the event itself. Direction and sentiment are kept separate: an outbound
 * attempt may carry a recorded sentiment (the call went well), and a client reply may
 * have NO sentiment recorded — what is blocked is a contradiction, such as tagging a
 * reply as "no response".
 */
export function validateInteractionEvent(input: {
  kind: InteractionEventKind;
  outcome: string | null | undefined;
}): string | null {
  if (input.kind === 'customer_response' && input.outcome === 'no_response') {
    return "A client reply cannot be recorded as 'No Response' — leave the outcome blank or record how they responded.";
  }
  return null;
}

export interface ChaseCountingPolicy {
  id: string;
  label: string;
  /** One-line statement of what the policy counts, shown wherever the policy id is surfaced. */
  summary: string;
  countsRow: (meeting: ChaseCountableMeeting) => boolean;
}

const inChaseChannel = (meeting: ChaseCountableMeeting) =>
  (UNANSWERED_CHASE_CHANNELS as readonly string[]).includes(meeting.type);

const isDealScoped = (meeting: ChaseCountableMeeting) => !!meeting.deal_id && meeting.direction !== 'internal';

/**
 * Cumulative sends (what production serves today): every logged call/email/DM on the
 * deal counts, whether or not the client answered. A captured inbound reply never counts.
 */
const v0CumulativeSends: ChaseCountingPolicy = {
  id: 'v0-cumulative-sends',
  label: 'Cumulative sends',
  summary: 'Every logged call, email, or DM on the deal counts as a send. An inbound reply never counts.',
  countsRow: meeting => isDealScoped(meeting) && inChaseChannel(meeting) && meeting.direction !== 'inbound',
};

/**
 * Reviewed alternative: the ladder counts UNANSWERED chases, so a touch that carries a
 * recorded client response is a conversation, not an unanswered nudge, and a row whose
 * direction is unknown is never asserted to have been outbound. Measured on the live
 * corpus (2026-09-14, 80 `meetings` rows; none carry an unknown or absent direction) it
 * moves 17 deal badges, which is why it is not the active policy.
 */
const v1UnansweredChases: ChaseCountingPolicy = {
  id: 'v1-unanswered-chases',
  label: 'Unanswered chases',
  summary:
    'Only explicitly outbound call, email, or DM touches with no recorded client response count. A conversation is not a chase, and unknown direction stays unknown.',
  countsRow: meeting =>
    !!meeting.deal_id &&
    inChaseChannel(meeting) &&
    meeting.direction === 'outbound' &&
    !isCustomerResponseOutcome(meeting.outcome),
};

export const CHASE_COUNTING_POLICIES: Record<string, ChaseCountingPolicy> = {
  'v0-cumulative-sends': v0CumulativeSends,
  'v1-unanswered-chases': v1UnansweredChases,
};

/** Flip this one constant to adopt the reviewed alternative — a deliberate, reviewed act. */
export const ACTIVE_CHASE_POLICY_ID = 'v0-cumulative-sends';

export function countsTowardUnansweredChase(
  meeting: ChaseCountableMeeting,
  policyId: string = ACTIVE_CHASE_POLICY_ID
): boolean {
  const policy = CHASE_COUNTING_POLICIES[policyId] ?? v0CumulativeSends;
  return policy.countsRow(meeting);
}

export function unansweredChaseCount(
  meetings: ChaseCountableMeeting[],
  dealId: string,
  policyId: string = ACTIVE_CHASE_POLICY_ID
): number {
  return meetings.filter(m => m.deal_id === dealId && countsTowardUnansweredChase(m, policyId)).length;
}

/** A meeting row with the ordering fields a since-last-reply count needs. */
export interface DatedChaseCountableMeeting extends ChaseCountableMeeting {
  date?: string | null;
  created_at?: string | null;
}

/**
 * A message from the buyer: an inbound row, nothing else. This is the rule for anything
 * the app states to Pat as fact ("the buyer replied", "reply logged"). A touch Pat made
 * is never the buyer's reply, whatever outcome it carries: history was bulk-marked
 * outbound (20260906_add_meeting_direction) and the old log form put an outcome on plain
 * sends ("1st DM · neutral"), so an outcome on an outbound row is not evidence of a reply.
 * chasesSinceLastReply below keeps its own looser rule, as decided for grading.
 */
export function isBuyerReplyRow(row: { direction?: string | null }): boolean {
  return row.direction === 'inbound';
}

/**
 * Unanswered chases SINCE the buyer's last reply — the grading signal (decided with Pat,
 * 2026-10-01). It resets whenever the buyer replies, so a deal that came back to life is
 * not penalised for earlier silence. A reply is an inbound row or any row carrying a
 * recorded client response; a chase is an explicitly outbound call, email or DM with no
 * recorded response (unknown direction is never asserted to be outbound). The pipeline's
 * 4/4 badge keeps its own lifetime count (ACTIVE_CHASE_POLICY_ID); this does not change it.
 */
export function chasesSinceLastReply(meetings: DatedChaseCountableMeeting[], dealId: string): number {
  return chaseStatusSinceReply(meetings, dealId).chases;
}

/** chasesSinceLastReply plus whether the buyer has ever replied on this deal. */
export function chaseStatusSinceReply(
  meetings: DatedChaseCountableMeeting[],
  dealId: string,
): { chases: number; buyerReplied: boolean } {
  const rows = meetings
    .filter(m => m.deal_id === dealId && m.direction !== 'internal')
    .sort((a, b) =>
      (a.date ?? '').localeCompare(b.date ?? '') || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  let chases = 0;
  let buyerReplied = false;
  for (const row of rows) {
    if (row.direction === 'inbound' || isCustomerResponseOutcome(row.outcome)) {
      chases = 0;
      buyerReplied = true;
    } else if (row.direction === 'outbound' && inChaseChannel(row)) {
      chases += 1;
    }
  }
  return { chases, buyerReplied };
}
