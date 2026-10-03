// ─── Time in lane, read from the activity log ───
// Pure. The deals table has no "entered this lane on" column, but every deal edit is
// logged with the values it replaced (activity_events.undo_payload). Walking a deal's
// events in order gives the lane before each edit; the lane after it is the lane before
// the next one, or the deal's current lane. A change between the two is a lane move.
//
// Limits: the app reads the newest 500 events, and logging began 2026-08-20, so a move
// outside that window is unseen and the deal falls back to its created date. An undone
// event is skipped. A durable column would remove both limits.

import type { Deal, DealWorkflowAction } from '@/types/crm';
import { getWorkflowAction, isOnJourneyBoard } from './deal-workflow';

export interface LaneEvent {
  entity: string;
  entityId?: string | null;
  /** epoch milliseconds */
  timestamp: number;
  undoPayload?: Record<string, unknown> | null;
  applied?: boolean;
}

export interface LaneStay {
  lane: DealWorkflowAction;
  /** epoch ms; null when the stay began before anything the log shows */
  from: number | null;
  /** epoch ms; null for the lane the deal is in now */
  to: number | null;
}

export interface LaneTimeline {
  /** when the deal entered its current lane (epoch ms) */
  enteredAt: number;
  /** 'moved': a logged lane move; 'created': no move seen, so the deal's created date */
  source: 'moved' | 'created';
  /** every stay the log shows, oldest first, the current lane last */
  stays: LaneStay[];
}

const DAY_MS = 86_400_000;

/** The lane a logged "before" snapshot was in, or null when the edit did not touch the lane. */
function laneBefore(deal: Deal, payload: Record<string, unknown> | null | undefined): DealWorkflowAction | null {
  if (!payload || !('workflow_action' in payload || 'stage' in payload)) return null;
  return getWorkflowAction({
    ...deal,
    stage: ('stage' in payload ? payload.stage : deal.stage) as Deal['stage'],
    workflow_action: ('workflow_action' in payload ? payload.workflow_action : deal.workflow_action) as Deal['workflow_action'],
  });
}

export function laneTimeline(deal: Deal, events: LaneEvent[]): LaneTimeline {
  const created = Date.parse(deal.created_at);
  const edits = events
    .filter(e => e.entity === 'deal' && e.entityId === deal.id && e.applied !== false)
    .map(e => ({ at: e.timestamp, before: laneBefore(deal, e.undoPayload) }))
    .filter((e): e is { at: number; before: DealWorkflowAction } => e.before !== null)
    .sort((a, b) => a.at - b.at);

  const stays: LaneStay[] = [];
  let from: number | null = edits.length > 0 ? null : (Number.isFinite(created) ? created : null);
  edits.forEach((edit, index) => {
    const after = index + 1 < edits.length ? edits[index + 1].before : getWorkflowAction(deal);
    if (after === edit.before) return;
    stays.push({ lane: edit.before, from, to: edit.at });
    from = edit.at;
  });
  stays.push({ lane: getWorkflowAction(deal), from, to: null });
  // The first stay of a deal the log saw from its creation starts at the created date.
  if (stays[0].from === null && Number.isFinite(created) && created <= (stays[0].to ?? Infinity)) stays[0].from = created;

  const current = stays[stays.length - 1];
  const moved = stays.length > 1;
  return { enteredAt: current.from ?? created, source: moved ? 'moved' : 'created', stays };
}

/** Whole days since the deal entered its current lane. */
export function daysInLane(timeline: LaneTimeline, now: number): number {
  return Math.max(0, Math.floor((now - timeline.enteredAt) / DAY_MS));
}

export function laneTimelines(deals: Deal[], events: LaneEvent[]): Map<string, LaneTimeline> {
  const byDeal = new Map<string, LaneEvent[]>();
  for (const event of events) {
    if (event.entity !== 'deal' || !event.entityId) continue;
    const list = byDeal.get(event.entityId);
    if (list) list.push(event); else byDeal.set(event.entityId, [event]);
  }
  return new Map(deals.map(deal => [deal.id, laneTimeline(deal, byDeal.get(deal.id) ?? [])]));
}

// ─── Stalled ───

/** Until enough won deals have passed through a lane, this many days counts as stalled. */
export const DEFAULT_STALL_DAYS = 14;
/** Won deals needed in a lane before its own average replaces the default. */
export const MIN_WON_SAMPLES = 3;
/** Stalled = this much longer than won deals took in the lane. */
export const STALL_FACTOR = 1.2;

/** Outreach holds deals not yet contacted — a backlog, not a stall. */
const STALL_LANES: DealWorkflowAction[] = ['reply', 'sample', 'testing', 'reschedule'];

/** Days in a lane after which a deal is stalled: 1.2× the won-deal average, else the default. */
export function stallThresholds(deals: Deal[], timelines: ReadonlyMap<string, LaneTimeline>): Record<string, number> {
  const samples = new Map<string, number[]>();
  for (const deal of deals) {
    if (deal.stage !== 'closed_won') continue;
    for (const stay of timelines.get(deal.id)?.stays ?? []) {
      if (stay.from === null || stay.to === null) continue;
      const list = samples.get(stay.lane) ?? [];
      list.push((stay.to - stay.from) / DAY_MS);
      samples.set(stay.lane, list);
    }
  }
  const thresholds: Record<string, number> = {};
  for (const lane of STALL_LANES) {
    const days = samples.get(lane) ?? [];
    thresholds[lane] = days.length >= MIN_WON_SAMPLES
      ? Math.max(1, Math.ceil((days.reduce((a, b) => a + b, 0) / days.length) * STALL_FACTOR))
      : DEFAULT_STALL_DAYS;
  }
  return thresholds;
}

export interface StalledItem {
  deal: Deal;
  lane: DealWorkflowAction;
  days: number;
  threshold: number;
}

/** Open deals past their lane's threshold, longest first. */
export function buildStalled(input: {
  deals: Deal[];
  timelines: ReadonlyMap<string, LaneTimeline>;
  thresholds: Record<string, number>;
  now: number;
}): StalledItem[] {
  const items: StalledItem[] = [];
  for (const deal of input.deals) {
    if (!isOnJourneyBoard(deal)) continue;
    const lane = getWorkflowAction(deal);
    const threshold = input.thresholds[lane];
    const timeline = input.timelines.get(deal.id);
    if (threshold === undefined || !timeline) continue;
    const days = daysInLane(timeline, input.now);
    if (days > threshold) items.push({ deal, lane, days, threshold });
  }
  return items.sort((a, b) => b.days - a.days || (a.deal.client ?? '').localeCompare(b.deal.client ?? ''));
}

// ─── Velocity and win rate ───

export interface PipelineOutcomes {
  won: number;
  lost: number;
  /** won / (won + lost), 0–100; null when nothing is closed */
  winRate: number | null;
  /** average days from created to closed, over deals whose closing the log shows */
  daysToWin: { average: number; deals: number } | null;
  daysToLose: { average: number; deals: number } | null;
}

function closedAt(deal: Deal, timeline: LaneTimeline | undefined): number | null {
  if (timeline?.source === 'moved') return timeline.enteredAt;
  const fromDate = deal.close_date ? Date.parse(deal.close_date) : NaN;
  return Number.isFinite(fromDate) ? fromDate : null;
}

export function pipelineOutcomes(deals: Deal[], timelines: ReadonlyMap<string, LaneTimeline>): PipelineOutcomes {
  const average = (stage: 'closed_won' | 'closed_lost') => {
    const days: number[] = [];
    for (const deal of deals) {
      if (deal.stage !== stage) continue;
      const closed = closedAt(deal, timelines.get(deal.id));
      const created = Date.parse(deal.created_at);
      if (closed === null || !Number.isFinite(created) || closed < created) continue;
      days.push((closed - created) / DAY_MS);
    }
    return days.length > 0 ? { average: Math.round(days.reduce((a, b) => a + b, 0) / days.length), deals: days.length } : null;
  };
  const won = deals.filter(d => d.stage === 'closed_won').length;
  const lost = deals.filter(d => d.stage === 'closed_lost').length;
  return {
    won, lost,
    winRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : null,
    daysToWin: average('closed_won'),
    daysToLose: average('closed_lost'),
  };
}
