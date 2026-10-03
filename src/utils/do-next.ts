// ─── Do next: one ranked list of deals that need Pat ───
// Pure. Merges the separate signals — the buyer asked for something, Laya needs a
// review, the buyer spoke last, a reply has no exact words, the deal is stalled — into
// one row per deal carrying every reason, so a deal never shows up in three lists.
// The strongest reason sets the rank; each extra reason nudges it up.

import type { Deal } from '@/types/crm';
import type { DealGrade } from './grade';
import type { DatedChaseCountableMeeting } from './interaction-event';
import { buildDataGapReport } from './deal-data-gaps';
import { WORKFLOW_BY_ID } from './deal-workflow';
import { buildStalled, stallThresholds, type LaneTimeline } from './lane-time';
import { buildWaitingOnYou, waitingLabel } from './waiting-on-you';

export type DoNextKind = 'asked' | 'review' | 'waiting' | 'reply-words' | 'stalled';

export interface DoNextReason {
  kind: DoNextKind;
  label: string;
}

export interface DoNextItem {
  deal: Deal;
  /** strongest first */
  reasons: DoNextReason[];
  score: number;
}

const BASE: Record<DoNextKind, number> = { asked: 100, review: 80, waiting: 60, 'reply-words': 50, stalled: 30 };
const EXTRA_REASON = 5;

export function buildDoNext(input: {
  deals: Deal[];
  meetings: DatedChaseCountableMeeting[];
  grades: ReadonlyMap<string, DealGrade>;
  timelines: ReadonlyMap<string, LaneTimeline>;
  today: string;
  now: number;
}): DoNextItem[] {
  const byDeal = new Map<string, { deal: Deal; reasons: Array<DoNextReason & { score: number }> }>();
  const add = (deal: Deal, kind: DoNextKind, label: string, bonus = 0) => {
    const entry = byDeal.get(deal.id) ?? { deal, reasons: [] };
    entry.reasons.push({ kind, label, score: BASE[kind] + bonus });
    byDeal.set(deal.id, entry);
  };

  for (const item of buildWaitingOnYou(input)) {
    const when = `Buyer replied ${waitingLabel(item.daysWaiting)}, nothing sent since`;
    if (item.asked) add(item.deal, 'asked', `Buyer asked for a next step (replied ${waitingLabel(item.daysWaiting)})`, Math.min(item.daysWaiting, 20));
    else add(item.deal, 'waiting', when, Math.min(item.daysWaiting, 15));
  }

  for (const deal of input.deals) {
    const grade = input.grades.get(deal.id);
    if (grade?.status === 'needs_review') add(deal, 'review', `Laya needs your call: ${grade.review[0] ?? 'unsure'}`);
  }

  const gaps = buildDataGapReport(input.deals, input.meetings);
  for (const deal of input.deals) {
    if (gaps.byDeal.get(deal.id)?.includes('reply-words')) add(deal, 'reply-words', "Reply logged, paste the buyer's exact words");
  }

  const stalled = buildStalled({
    deals: input.deals, timelines: input.timelines, thresholds: stallThresholds(input.deals, input.timelines), now: input.now,
  });
  for (const item of stalled) {
    add(item.deal, 'stalled', `${item.days} days in ${WORKFLOW_BY_ID[item.lane].shortLabel}`, Math.min(item.days, 60) / 6);
  }

  return [...byDeal.values()]
    .map(({ deal, reasons }) => {
      const sorted = reasons.sort((a, b) => b.score - a.score);
      return {
        deal,
        reasons: sorted.map(({ kind, label }) => ({ kind, label })),
        score: Math.round(sorted[0].score + EXTRA_REASON * (sorted.length - 1)),
      };
    })
    .sort((a, b) => b.score - a.score || (a.deal.client ?? '').localeCompare(b.deal.client ?? ''));
}
