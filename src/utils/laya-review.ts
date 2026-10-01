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

export interface LayaGradeInput {
  deals: Deal[];
  meetings: DatedChaseCountableMeeting[];
  judgments: LayaJudgmentRow[];
  /** dealId -> dealInputSha256(deal) for deals with a verbatim reply */
  currentShas: Map<string, string | null>;
}

/** gradeDeal for every deal with a verbatim reply; deals without one are absent. */
export function gradeDealsWithReplies(input: LayaGradeInput): Map<string, DealGrade> {
  const byDeal = new Map(input.judgments.map(row => [row.deal_id, row]));
  const grades = new Map<string, DealGrade>();
  for (const deal of input.deals) {
    if (!deal.buyer_reply?.trim()) continue;
    grades.set(deal.id, gradeDeal({
      deal,
      judgment: toSavedJudgment(byDeal.get(deal.id), input.currentShas.get(deal.id) ?? null),
      chasesSinceReply: chasesSinceLastReply(input.meetings, deal.id),
    }));
  }
  return grades;
}

/** The deals Laya routed to Pat, hottest CRM tier first, then by client name. */
export function buildLayaReviewList(input: LayaGradeInput): LayaReviewItem[] {
  const grades = gradeDealsWithReplies(input);
  const items: LayaReviewItem[] = input.deals
    .filter(deal => grades.get(deal.id)?.status === 'needs_review')
    .map(deal => ({ deal, grade: grades.get(deal.id)! }));
  return items.sort((a, b) =>
    TIER_ORDER.indexOf(a.grade.baseTier) - TIER_ORDER.indexOf(b.grade.baseTier) ||
    (a.deal.client ?? '').localeCompare(b.deal.client ?? ''));
}
