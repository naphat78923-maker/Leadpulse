// ─── Open deals with missing data ───
// Pure. Sibling to deal-board's ReviewReason (lane requirements): these are the fields the
// grade and the forecast read, so a gap here means a deal Laya cannot grade or the pipeline
// cannot value. Only deals on the journey board count; closed and parked deals are done.

import type { Deal } from '@/types/crm';
import { isOnJourneyBoard } from './deal-workflow';
import { isConcreteNextAction } from './deal-card';
import { isBuyerReplyRow, type DatedChaseCountableMeeting } from './interaction-event';
import { latestLoggedReplyNote } from './laya-buyer-response';

export type DataGap = 'reply-words' | 'next-action' | 'contact' | 'value';

/** Most actionable first: the order of the chips and of each deal's gap list. */
export const DATA_GAPS: DataGap[] = ['reply-words', 'next-action', 'contact', 'value'];

export const DATA_GAP_LABEL: Record<DataGap, string> = {
  'reply-words': 'Reply logged, exact words missing',
  'next-action': 'No next action',
  contact: 'No contact',
  value: 'No deal value',
};

export const DATA_GAP_FIX: Record<DataGap, string> = {
  'reply-words': "Paste the buyer's exact words so Laya can grade the deal.",
  'next-action': 'Set a concrete next action.',
  contact: 'Link the person you are talking to.',
  value: 'Enter the expected deal value.',
};

export function isDataGap(value: string | null | undefined): value is DataGap {
  return !!value && (DATA_GAPS as string[]).includes(value);
}

/**
 * Whether the buyer has replied on this deal: an inbound interaction, or a reply note in
 * the deal's log. An outbound touch with an outcome is not a reply, so "exact words
 * missing" is only ever asked for a reply that was actually logged.
 */
export function buyerHasReplied(deal: Deal, meetings: DatedChaseCountableMeeting[]): boolean {
  return meetings.some(m => m.deal_id === deal.id && isBuyerReplyRow(m)) || !!latestLoggedReplyNote(deal.last_outcome);
}

/** The gaps of one deal; empty for a deal off the journey board. */
export function dataGaps(deal: Deal, buyerReplied: boolean): DataGap[] {
  if (!isOnJourneyBoard(deal)) return [];
  const gaps: DataGap[] = [];
  if (buyerReplied && !deal.buyer_reply?.trim()) gaps.push('reply-words');
  if (!isConcreteNextAction(deal.next_action)) gaps.push('next-action');
  if ((deal.contact_ids ?? []).length === 0) gaps.push('contact');
  if (deal.value == null) gaps.push('value');
  return gaps;
}

export interface DataGapReport {
  /** dealId -> its gaps, only for deals that have at least one */
  byDeal: Map<string, DataGap[]>;
  counts: Record<DataGap, number>;
  /** deals with at least one gap */
  total: number;
}

export function buildDataGapReport(deals: Deal[], meetings: DatedChaseCountableMeeting[]): DataGapReport {
  const byDeal = new Map<string, DataGap[]>();
  const counts: Record<DataGap, number> = { 'reply-words': 0, 'next-action': 0, contact: 0, value: 0 };
  for (const deal of deals) {
    const gaps = dataGaps(deal, buyerHasReplied(deal, meetings));
    if (gaps.length === 0) continue;
    byDeal.set(deal.id, gaps);
    for (const gap of gaps) counts[gap] += 1;
  }
  return { byDeal, counts, total: byDeal.size };
}

/** Ids of the deals with the given gap, or with any gap for 'all'. */
export function dealIdsWithGap(report: DataGapReport, gap: DataGap | 'all'): Set<string> {
  const ids = new Set<string>();
  for (const [id, gaps] of report.byDeal) if (gap === 'all' || gaps.includes(gap)) ids.add(id);
  return ids;
}
