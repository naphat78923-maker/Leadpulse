// ─── Monthly goal: won so far, gap, and pipeline coverage ───
// Pure. A won deal counts in the month it closed: its close_date, else the logged move
// to Won (lane-time.ts). A won deal with neither is left out and counted as undated.

import type { Deal } from '@/types/crm';
import { isOnJourneyBoard } from './deal-workflow';
import { businessDateKey } from './business-time';
import type { LaneTimeline } from './lane-time';

export interface GoalProgress {
  /** value of deals won in the month */
  won: number;
  wonDeals: number;
  /** won deals whose closing month is unknown */
  undatedWon: number;
  /** value of every open deal on the board */
  openPipeline: number;
  /** goal − won, never below 0; null without a goal */
  gap: number | null;
  /** open pipeline ÷ gap; null without a goal or once the goal is met */
  coverage: number | null;
}

/** "2026-10-01" for any date key in October 2026. */
export function monthStart(dateKey: string): string {
  return `${dateKey.slice(0, 7)}-01`;
}

function closedMonth(deal: Deal, timeline: LaneTimeline | undefined): string | null {
  if (deal.close_date && /^\d{4}-\d{2}/.test(deal.close_date)) return deal.close_date.slice(0, 7);
  if (timeline?.source === 'moved') return businessDateKey(new Date(timeline.enteredAt)).slice(0, 7);
  return null;
}

export function goalProgress(input: {
  deals: Deal[];
  timelines: ReadonlyMap<string, LaneTimeline>;
  /** any date key inside the month */
  today: string;
  goal: number | null;
}): GoalProgress {
  const month = input.today.slice(0, 7);
  let won = 0;
  let wonDeals = 0;
  let undatedWon = 0;
  let openPipeline = 0;
  for (const deal of input.deals) {
    if (deal.stage === 'closed_won') {
      const closed = closedMonth(deal, input.timelines.get(deal.id));
      if (closed === null) undatedWon += 1;
      else if (closed === month) { won += deal.value || 0; wonDeals += 1; }
    } else if (isOnJourneyBoard(deal)) {
      openPipeline += deal.value || 0;
    }
  }
  const gap = input.goal === null ? null : Math.max(0, input.goal - won);
  return {
    won, wonDeals, undatedWon, openPipeline, gap,
    coverage: gap === null || gap === 0 ? null : Math.round((openPipeline / gap) * 10) / 10,
  };
}
