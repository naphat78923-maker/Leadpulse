// Lane-gate decisions, extracted from the board so they are testable and cannot drift from the
// event rules the interaction modal follows.
//
// Two rules learned the hard way:
//   - "No response" is NOT a client reply. Dragging into Waiting on reply with no response means
//     the outreach is logged and nothing has come back; it must not claim a reply or be stamped
//     inbound, and it must not read as fabricating engagement.
//   - The date a drag writes is the BUSINESS calendar date, not `toISOString().slice(0,10)`,
//     which is the previous day for the first seven hours of a Bangkok day.
import type { Deal, DealWorkflowAction, Meeting, MeetingType, SampleStatus } from '@/types/crm';
import { buyerReplyUpdate } from '@/utils/buyer-reply';
import { isCustomerResponseOutcome } from '@/utils/interaction-event';

export interface LaneGateDecisionInput {
  target: DealWorkflowAction;
  channel?: MeetingType | null;
  reply_outcome?: string | null;
  reply_summary?: string | null;
  /** the buyer's exact words, pasted — written to deals.buyer_reply for Laya */
  buyer_reply?: string | null;
  next_action?: string | null;
  sample_status?: SampleStatus | null;
  followup_date?: string | null;
  contact_ids?: string[];
}

export interface LaneGateDecision {
  updates: Partial<Deal>;
  /** The interaction row to log for this move, or null when the move logs nothing. */
  meeting: (Omit<Meeting, 'id' | 'created_at'> & { date: string }) | null;
}

const channelLabel = (channel: MeetingType) =>
  channel === 'dm' ? 'DM' : channel === 'email' ? 'Email' : 'Call';

function appendOutcome(existing: string | null | undefined, entry: string) {
  return existing ? `${existing}\n---\n${entry}` : entry;
}

function timestampedEntry(text: string) {
  const stamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  return `[${stamp}] ${text}`;
}

export function buildLaneGateDecision(
  deal: Deal,
  input: LaneGateDecisionInput,
  opts: { dateKey: string }
): LaneGateDecision {
  const { target } = input;
  const updates: Partial<Deal> = {
    workflow_action: target,
    nudge_stage: null, // nudges are derived — never stored from a drag
  };

  if (target === 'sample') updates.sample_status = input.sample_status || null;
  if (target === 'testing') {
    updates.followup_date = input.followup_date || null;
    if (input.sample_status) updates.sample_status = input.sample_status;
  }
  if (target === 'reschedule') updates.followup_date = input.followup_date || null;
  if (target === 'outreach' && input.next_action) updates.next_action = input.next_action;

  // A reply is only recorded when the client actually responded with a sentiment.
  const hasRealReply = target === 'reply' && isCustomerResponseOutcome(input.reply_outcome);

  if (target === 'reply') {
    if (hasRealReply) {
      const detail = input.reply_summary ? `: ${input.reply_summary}` : '';
      updates.last_outcome = appendOutcome(
        deal.last_outcome,
        timestampedEntry(`💬 Client replied — ${input.reply_outcome}${detail}`)
      );
      Object.assign(updates, buyerReplyUpdate(deal.buyer_reply, input.buyer_reply));
    } else {
      updates.last_outcome = appendOutcome(
        deal.last_outcome,
        timestampedEntry('✅ Outreach logged — waiting on reply')
      );
    }
  }

  const base = {
    date: opts.dateKey,
    company_id: deal.company_id,
    contact_ids: input.contact_ids || deal.contact_ids || [],
    deal_id: deal.id,
    product: deal.product,
  };

  let meeting: LaneGateDecision['meeting'] = null;
  if (target === 'outreach' && input.channel) {
    meeting = {
      ...base,
      type: input.channel,
      description: `${channelLabel(input.channel)} outreach — ${deal.client}`,
      summary: input.next_action || null,
      outcome: null,
      followup_date: null,
      direction: 'outbound',
    };
  } else if (target === 'reply' && input.channel) {
    meeting = hasRealReply
      ? {
          ...base,
          type: input.channel,
          description: `${channelLabel(input.channel)} reply from ${deal.client}`,
          summary: input.reply_summary || null,
          outcome: (input.reply_outcome as Meeting['outcome']) || null,
          followup_date: null,
          direction: 'inbound',
        }
      : {
          ...base,
          type: input.channel,
          description: `${channelLabel(input.channel)} follow-up — ${deal.client}`,
          summary: input.reply_summary || null,
          outcome: 'no_response',
          followup_date: null,
          direction: 'outbound',
        };
  } else if (target === 'sample' && input.sample_status) {
    meeting = {
      ...base,
      type: 'sample_sent',
      description: `Sample ${input.sample_status} — ${deal.client}`,
      summary: null,
      outcome: null,
      followup_date: null,
      direction: 'outbound',
    };
  }

  return { updates, meeting };
}
