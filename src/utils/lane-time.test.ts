import { describe, expect, it } from 'vitest';
import type { Deal } from '@/types/crm';
import {
  DEFAULT_STALL_DAYS, buildStalled, daysInLane, laneTimeline, laneTimelines, pipelineOutcomes, stallThresholds, type LaneEvent,
} from './lane-time';

const at = (iso: string) => Date.parse(iso);
const NOW = at('2026-10-03T00:00:00Z');

const deal = (id: string, over: Partial<Deal> = {}): Deal => ({
  id, title: 'Butter', stage: 'proposal', product: 'Butter', client: id, company_id: null,
  contact_ids: [], value: null, priority: 'medium', next_action: null, followup_date: null, last_outcome: null,
  buyer_reply: null, nudge_count: 0, workflow_action: 'sample', nudge_stage: null,
  sample_status: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z', ...over,
});

const edit = (id: string, iso: string, before: Record<string, unknown>, applied = true): LaneEvent =>
  ({ entity: 'deal', entityId: id, timestamp: at(iso), undoPayload: before, applied });

describe('laneTimeline', () => {
  it('falls back to the created date when the log shows no lane move', () => {
    const timeline = laneTimeline(deal('a'), [edit('a', '2026-09-10T00:00:00Z', { workflow_action: 'sample', stage: 'proposal' })]);
    expect(timeline).toMatchObject({ source: 'created', enteredAt: at('2026-09-01T00:00:00Z') });
    expect(timeline.stays).toEqual([{ lane: 'sample', from: at('2026-09-01T00:00:00Z'), to: null }]);
  });

  it('reads the moves from the values each edit replaced', () => {
    const timeline = laneTimeline(deal('a'), [
      edit('a', '2026-09-05T00:00:00Z', { workflow_action: 'outreach', stage: 'research' }),  // outreach → reply
      edit('a', '2026-09-12T00:00:00Z', { workflow_action: 'reply', stage: 'contacted' }),    // reply → sample
      edit('a', '2026-09-20T00:00:00Z', { workflow_action: 'sample', stage: 'proposal' }),    // no lane change
      edit('a', '2026-09-21T00:00:00Z', { followup_date: '2026-09-25' }),                     // not a lane edit
    ]);
    expect(timeline.source).toBe('moved');
    expect(timeline.enteredAt).toBe(at('2026-09-12T00:00:00Z'));
    expect(timeline.stays.map(s => s.lane)).toEqual(['outreach', 'reply', 'sample']);
    expect(timeline.stays[1]).toEqual({ lane: 'reply', from: at('2026-09-05T00:00:00Z'), to: at('2026-09-12T00:00:00Z') });
    expect(daysInLane(timeline, NOW)).toBe(21);
  });

  it('skips an undone edit and edits on other deals', () => {
    const timeline = laneTimeline(deal('a'), [
      edit('a', '2026-09-05T00:00:00Z', { workflow_action: 'outreach' }, false),
      edit('b', '2026-09-06T00:00:00Z', { workflow_action: 'outreach' }),
    ]);
    expect(timeline.source).toBe('created');
  });
});

describe('stalled', () => {
  const quiet = deal('quiet', { created_at: '2026-09-01T00:00:00Z' });      // 32 days in sample
  const fresh = deal('fresh', { created_at: '2026-09-28T00:00:00Z' });      // 5 days in sample
  const backlog = deal('backlog', { stage: 'research', workflow_action: 'outreach' });
  const parked = deal('parked', { workflow_action: 'parked' });

  it('uses the default threshold until enough won deals passed through a lane', () => {
    const deals = [quiet, fresh, backlog, parked];
    const timelines = laneTimelines(deals, []);
    const thresholds = stallThresholds(deals, timelines);
    expect(thresholds.sample).toBe(DEFAULT_STALL_DAYS);
    expect(thresholds.outreach).toBeUndefined();
    const items = buildStalled({ deals, timelines, thresholds, now: NOW });
    expect(items.map(i => [i.deal.id, i.lane, i.days])).toEqual([['quiet', 'sample', 32]]);
  });

  it('switches to 1.2× the won-deal average once three won deals show the lane', () => {
    const won = ['w1', 'w2', 'w3'].map(id => deal(id, { stage: 'closed_won', workflow_action: 'success', created_at: '2026-08-01T00:00:00Z' }));
    const events = won.flatMap(d => [
      edit(d.id, '2026-08-02T00:00:00Z', { workflow_action: 'outreach', stage: 'research' }),
      edit(d.id, '2026-08-12T00:00:00Z', { workflow_action: 'sample', stage: 'proposal' }),  // 10 days in sample
    ]);
    const deals = [...won, quiet, deal('mid', { created_at: '2026-09-18T00:00:00Z' })];
    const timelines = laneTimelines(deals, events);
    const thresholds = stallThresholds(deals, timelines);
    expect(thresholds.sample).toBe(12);
    expect(buildStalled({ deals, timelines, thresholds, now: NOW }).map(i => i.deal.id)).toEqual(['quiet', 'mid']);
  });
});

describe('pipelineOutcomes', () => {
  it('reports the win rate and the average days to close where the closing is known', () => {
    const won = deal('won', { stage: 'closed_won', workflow_action: 'success', created_at: '2026-09-01T00:00:00Z' });
    const lostDated = deal('lost', { stage: 'closed_lost', workflow_action: 'parked', created_at: '2026-09-01T00:00:00Z', close_date: '2026-09-11' });
    const lostUnknown = deal('lost2', { stage: 'closed_lost', workflow_action: 'parked' });
    const deals = [won, lostDated, lostUnknown, deal('open')];
    const timelines = laneTimelines(deals, [edit('won', '2026-09-21T00:00:00Z', { workflow_action: 'testing', stage: 'negotiation' })]);
    expect(pipelineOutcomes(deals, timelines)).toEqual({
      won: 1, lost: 2, winRate: 33,
      daysToWin: { average: 20, deals: 1 },
      daysToLose: { average: 10, deals: 1 },
    });
  });

  it('has no win rate before anything is closed', () => {
    expect(pipelineOutcomes([deal('open')], new Map())).toMatchObject({ winRate: null, daysToWin: null });
  });
});
