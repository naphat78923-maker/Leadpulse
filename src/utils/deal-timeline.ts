// ─── One thread per deal ───
// Pure. Merges what happened on a deal into one newest-first list: every logged touch
// (ours, theirs, internal notes), every lane move the activity log shows, and the
// deal's creation. The buyer's saved exact words ride on their newest reply.

import type { Deal, Meeting } from '@/types/crm';
import { WORKFLOW_BY_ID } from './deal-workflow';
import type { LaneTimeline } from './lane-time';

export type TimelineKind = 'theirs' | 'ours' | 'note' | 'lane' | 'created';

export interface TimelineEntry {
  id: string;
  kind: TimelineKind;
  /** epoch ms, for ordering */
  at: number;
  /** YYYY-MM-DD shown to the reader */
  date: string;
  title: string;
  detail: string | null;
  /** the buyer's exact words, on their newest reply only */
  quote: string | null;
}

const CHANNEL: Record<string, string> = {
  call: 'Call', email: 'Email', dm: 'DM', meeting: 'Meeting', sample_sent: 'Sample sent', note: 'Note', nudge: 'Nudge', reward: 'Reward',
};

const dateKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function buildDealTimeline(
  deal: Deal,
  meetings: Pick<Meeting, 'id' | 'deal_id' | 'type' | 'date' | 'description' | 'summary' | 'outcome' | 'direction'>[],
  timeline: LaneTimeline | undefined,
): TimelineEntry[] {
  const entries: TimelineEntry[] = [];

  for (const m of meetings) {
    if (m.deal_id !== deal.id || m.type === 'reward') continue;
    const at = Date.parse(m.date);
    if (!Number.isFinite(at)) continue;
    const kind: TimelineKind = m.direction === 'internal' || m.type === 'note' ? 'note' : m.direction === 'inbound' ? 'theirs' : 'ours';
    const channel = CHANNEL[m.type] ?? m.type;
    entries.push({
      id: `m-${m.id}`,
      kind,
      at,
      date: m.date.slice(0, 10),
      title: kind === 'theirs' ? `They replied · ${channel}` : kind === 'ours' ? `You reached out · ${channel}` : 'Note',
      detail: [m.description, m.summary].filter(Boolean).join(' — ') || null,
      quote: null,
    });
  }

  const stays = timeline?.stays ?? [];
  stays.forEach((stay, index) => {
    if (index === 0 || stay.from === null) return;
    entries.push({
      id: `l-${stay.from}`,
      kind: 'lane',
      at: stay.from,
      date: dateKey(stay.from),
      title: `Moved to ${WORKFLOW_BY_ID[stay.lane]?.shortLabel ?? stay.lane}`,
      detail: `from ${WORKFLOW_BY_ID[stays[index - 1].lane]?.shortLabel ?? stays[index - 1].lane}`,
      quote: null,
    });
  });

  const created = Date.parse(deal.created_at);
  if (Number.isFinite(created)) {
    entries.push({ id: 'created', kind: 'created', at: created, date: dateKey(created), title: 'Deal created', detail: null, quote: null });
  }

  // Newest first; on the same day a lane move and a touch keep a stable, readable order.
  entries.sort((a, b) => b.date.localeCompare(a.date) || b.at - a.at);

  const reply = deal.buyer_reply?.trim();
  if (reply) {
    const newestReply = entries.find(entry => entry.kind === 'theirs');
    if (newestReply) newestReply.quote = reply;
  }
  return entries;
}
