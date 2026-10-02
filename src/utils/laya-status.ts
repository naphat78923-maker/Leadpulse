// ─── Is Laya keeping up? ───
// Pure. The Mac worker writes no heartbeat, so its state is read from what the app can
// see: open deals with a pasted reply, the grade each one got, and when the newest
// judgment was saved. A reply nobody has judged after STALLED_AFTER_MINUTES means the
// worker or the local Laya server has most likely stopped.

import type { Deal } from '@/types/crm';
import type { LayaJudgmentRow } from '@/lib/crm';
import type { DealGrade } from './grade';
import { isOnJourneyBoard } from './deal-workflow';
import { hasThaiScript } from './laya-buyer-response';

/** The worker passes every few minutes; a reply waiting longer than this is not normal. */
export const STALLED_AFTER_MINUTES = 15;

export interface LayaStatus {
  /** open deals with the buyer's exact words pasted */
  withReply: number;
  graded: number;
  /** routed to Pat, Thai replies included */
  needsReview: number;
  /** of needsReview: Thai replies, which the worker never sends to Laya */
  thai: number;
  /** pasted, not Thai, and no judgment for the current reply yet */
  waiting: number;
  /** minutes the longest-waiting reply has certainly waited (from the deal's last edit) */
  oldestWaitingMinutes: number | null;
  /** when the newest saved judgment was made, across all deals */
  lastJudgedAt: string | null;
  health: 'idle' | 'ok' | 'waiting' | 'stalled';
}

export function buildLayaStatus(input: {
  deals: Deal[];
  /** gradeDealsWithReplies() — one entry per deal with a pasted reply */
  grades: ReadonlyMap<string, DealGrade>;
  judgments: Pick<LayaJudgmentRow, 'scored_at'>[];
  now: number;
}): LayaStatus {
  const status: LayaStatus = {
    withReply: 0, graded: 0, needsReview: 0, thai: 0, waiting: 0,
    oldestWaitingMinutes: null, lastJudgedAt: null, health: 'idle',
  };
  for (const deal of input.deals) {
    const grade = input.grades.get(deal.id);
    if (!grade || !deal.buyer_reply?.trim() || !isOnJourneyBoard(deal)) continue;
    status.withReply += 1;
    if (grade.status === 'graded') status.graded += 1;
    else if (grade.status === 'needs_review') {
      status.needsReview += 1;
      if (hasThaiScript(deal.buyer_reply)) status.thai += 1;
    } else {
      status.waiting += 1;
      // The reply was pasted no later than the deal's last edit, so this never overstates.
      const edited = Date.parse(deal.updated_at);
      if (Number.isFinite(edited)) {
        const minutes = Math.max(0, Math.floor((input.now - edited) / 60_000));
        status.oldestWaitingMinutes = Math.max(status.oldestWaitingMinutes ?? 0, minutes);
      }
    }
  }
  for (const row of input.judgments) {
    if (row.scored_at && (!status.lastJudgedAt || row.scored_at > status.lastJudgedAt)) status.lastJudgedAt = row.scored_at;
  }
  status.health = status.withReply === 0 ? 'idle'
    : status.waiting === 0 ? 'ok'
    : (status.oldestWaitingMinutes ?? 0) >= STALLED_AFTER_MINUTES ? 'stalled' : 'waiting';
  return status;
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function formatAgo(iso: string | null, now: number): string | null {
  const then = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(then)) return null;
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}
