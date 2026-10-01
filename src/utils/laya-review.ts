// ─── Deals Laya routed to Pat ───
// Pure: given deals, their saved judgments and the current input hash of each reply,
// grade every open deal that has a verbatim reply and keep the ones gradeDeal sends to
// review. The deal panel and the This week list share toSavedJudgment, so they agree.

import type { Deal } from '@/types/crm';
import type { LayaJudgmentRow } from '@/lib/crm';
import { gradeDeal, type DealGrade, type SavedJudgment } from './grade';
import { chasesSinceLastReply, type DatedChaseCountableMeeting } from './interaction-event';
import type { LeadTier } from './lead-scoring';

/** A saved row as gradeDeal reads it; fresh only when it was made for the current reply. */
export function toSavedJudgment(row: LayaJudgmentRow | null | undefined, currentSha: string | null): SavedJudgment | null {
  if (!row) return null;
  return {
    status: row.status,
    not_scored_code: row.not_scored_code,
    answers: row.answers,
    fresh: !!currentSha && row.input_sha256 === currentSha,
  };
}

export interface LayaReviewItem {
  deal: Deal;
  grade: DealGrade;
}

const TIER_ORDER: LeadTier[] = ['S', 'A', 'B', 'C', 'D'];

export function buildLayaReviewList(input: {
  deals: Deal[];
  meetings: DatedChaseCountableMeeting[];
  judgments: LayaJudgmentRow[];
  /** dealId -> dealInputSha256(deal) for deals with a verbatim reply */
  currentShas: Map<string, string | null>;
}): LayaReviewItem[] {
  const byDeal = new Map(input.judgments.map(row => [row.deal_id, row]));
  const items: LayaReviewItem[] = [];
  for (const deal of input.deals) {
    if (!deal.buyer_reply?.trim()) continue;
    const grade = gradeDeal({
      deal,
      judgment: toSavedJudgment(byDeal.get(deal.id), input.currentShas.get(deal.id) ?? null),
      chasesSinceReply: chasesSinceLastReply(input.meetings, deal.id),
    });
    if (grade.status === 'needs_review') items.push({ deal, grade });
  }
  // Hottest CRM tier first, then by client name.
  return items.sort((a, b) =>
    TIER_ORDER.indexOf(a.grade.baseTier) - TIER_ORDER.indexOf(b.grade.baseTier) ||
    (a.deal.client ?? '').localeCompare(b.deal.client ?? ''));
}
