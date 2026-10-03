// ─── Quick reply: one paste records a buyer's reply ───
// Pure. Builds the same two writes the log form makes for a client reply — an inbound
// interaction, and the deal's verbatim buyer_reply — from nothing but the pasted words.
// The deal's lane, schedule and next action are left alone.

import type { Deal, Meeting, MeetingType } from '@/types/crm';
import { buyerReplyUpdate } from './buyer-reply';

export type ReplyChannel = Extract<MeetingType, 'dm' | 'email' | 'call'>;

export const REPLY_CHANNELS: Array<{ value: ReplyChannel; label: string }> = [
  { value: 'dm', label: 'DM / LINE' },
  { value: 'email', label: 'Email' },
  { value: 'call', label: 'Call' },
];

export interface QuickReply {
  meeting: Omit<Meeting, 'id' | 'created_at'>;
  /** the deal change; empty when the same words are already saved */
  dealPatch: Partial<Deal>;
  /** what undo restores */
  before: Partial<Deal>;
}

/** null when nothing was pasted. */
export function buildQuickReply(deal: Deal, words: string, channel: ReplyChannel, date: string): QuickReply | null {
  const text = words.trim();
  if (!text) return null;
  return {
    meeting: {
      description: 'Client reply',
      type: channel,
      date,
      company_id: deal.company_id,
      contact_ids: [],
      deal_id: deal.id,
      product: deal.product || 'Butter',
      summary: null,
      outcome: null,
      followup_date: null,
      direction: 'inbound',
    } as Omit<Meeting, 'id' | 'created_at'>,
    dealPatch: buyerReplyUpdate(deal.buyer_reply, text),
    before: { buyer_reply: deal.buyer_reply ?? null },
  };
}
