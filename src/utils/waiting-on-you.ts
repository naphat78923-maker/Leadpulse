// ─── Waiting on you: the buyer spoke last ───
// Pure. A deal is waiting on Pat when the buyer's latest reply has no outbound touch
// logged after it. A reply is an inbound row or any row carrying a recorded client
// response (the same rule chasesSinceLastReply uses); an answer is any explicitly
// outbound row after it. A follow-up scheduled for a later day means Pat already decided
// when to answer, so the deal stays off the list — unless Laya read the reply as the
// buyer asking for a next step, which should not sit.

import type { Deal } from '@/types/crm';
import type { DealGrade } from './grade';
import { UNSURE_BAND } from './grade';
import { isOnJourneyBoard } from './deal-workflow';
import { isCustomerResponseOutcome, type DatedChaseCountableMeeting } from './interaction-event';
import { daysBetween } from './retentionCadence';

export interface WaitingItem {
  deal: Deal;
  /** date key of the buyer's latest reply */
  repliedOn: string;
  daysWaiting: number;
  /** Laya is confident the buyer asked for a next step (verbatim, non-Thai replies only) */
  asked: boolean;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}/;

/** The date of the buyer's latest reply when nothing outbound was logged after it, else null. */
export function unansweredReplyDate(meetings: DatedChaseCountableMeeting[], dealId: string): string | null {
  const rows = meetings
    .filter(m => m.deal_id === dealId && m.direction !== 'internal')
    .sort((a, b) =>
      (a.date ?? '').localeCompare(b.date ?? '') || (a.created_at ?? '').localeCompare(b.created_at ?? ''));
  let repliedOn: string | null = null;
  for (const row of rows) {
    if (row.direction === 'inbound' || isCustomerResponseOutcome(row.outcome)) {
      repliedOn = DATE_KEY.exec(row.date ?? '')?.[0] ?? null;
    } else if (row.direction === 'outbound') {
      repliedOn = null;
    }
  }
  return repliedOn;
}

/** Deals where the buyer spoke last: asked-for-a-next-step first, then longest wait. */
export function buildWaitingOnYou(input: {
  deals: Deal[];
  meetings: DatedChaseCountableMeeting[];
  /** gradeDealsWithReplies(); a deal without a grade is simply not marked as asked */
  grades?: ReadonlyMap<string, DealGrade>;
  today: string;
}): WaitingItem[] {
  const items: WaitingItem[] = [];
  for (const deal of input.deals) {
    if (!isOnJourneyBoard(deal)) continue;
    const repliedOn = unansweredReplyDate(input.meetings, deal.id);
    if (!repliedOn) continue;
    const grade = input.grades?.get(deal.id);
    const asked = (grade?.pRequestedNextStep ?? 0) >= UNSURE_BAND.high;
    const scheduledLater = !!deal.followup_date && deal.followup_date > input.today;
    if (scheduledLater && !asked) continue;
    items.push({ deal, repliedOn, daysWaiting: Math.max(0, daysBetween(repliedOn, input.today)), asked });
  }
  return items.sort((a, b) =>
    Number(b.asked) - Number(a.asked) || b.daysWaiting - a.daysWaiting || (a.deal.client ?? '').localeCompare(b.deal.client ?? ''));
}

/** "today", "yesterday", "5 days ago". */
export function waitingLabel(days: number): string {
  return days <= 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`;
}
