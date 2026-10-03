// ─── Pat's decisions on deals Laya routed to review ───
// Pure. A decision is about one reply (the judged input hash). Confirm takes the tier
// Laya suggested; reject keeps the CRM tier. Either way the deal leaves the review list
// until the buyer replies again. The saved rows are the record weights get calibrated on.

import type { ReviewDecisionRow } from '@/lib/crm';
import type { DealGrade } from './grade';
import type { LeadTier } from './lead-scoring';

/** The newest decision made for this reply; `rows` newest first. */
export function decisionFor(rows: ReviewDecisionRow[], dealId: string, currentSha: string | null): ReviewDecisionRow | null {
  if (!currentSha) return null;
  return rows.find(row => row.deal_id === dealId && row.input_sha256 === currentSha) ?? null;
}

/** A needs_review grade with Pat's decision applied; any other grade is returned as is. */
export function withDecision(grade: DealGrade, decision: ReviewDecisionRow | null): DealGrade {
  if (!decision || grade.status !== 'needs_review') return grade;
  const tier = decision.decision === 'confirm' ? grade.suggestedTier ?? grade.baseTier : grade.baseTier;
  return { ...grade, status: 'graded', tier: tier as LeadTier, decision: decision.decision };
}

/** The row to save for a decision on this grade. */
export function decisionRow(
  dealId: string,
  currentSha: string | null,
  grade: DealGrade,
  decision: 'confirm' | 'reject',
): Omit<ReviewDecisionRow, 'decided_at'> {
  return {
    deal_id: dealId,
    input_sha256: currentSha,
    decision,
    base_tier: grade.baseTier,
    suggested_tier: grade.suggestedTier,
    momentum: grade.momentum,
    review_reasons: grade.review,
  };
}

/** Fired on the window after a decision is saved, so open lists re-read. */
export const DECISION_EVENT = 'laya-review-decision';
