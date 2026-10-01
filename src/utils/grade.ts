// ─── Deal grade: deterministic tier, adjusted by saved Laya judgments ───
// Pure code. Never calls a model: it reads one saved judgment of the deal set
// (laya_judgments / laya-questions.json "terminal") plus CRM facts, and returns
// a grade with its reasons. Nothing here changes a deal or contacts anyone.
//
// The loop, in order:
//   1. Deterministic gates — closed/parked, no verbatim reply, no fresh judgment →
//      no model grade; the deterministic tier stands alone.
//   2. Human review — Thai reply, a refused judgment, an incomplete answer set, or
//      any key answer Laya is unsure of → "needs_review" for Pat, with the reason.
//   3. Momentum — a weighted sum over the answers laya-cutoffs.json allows to count,
//      plus code signals (order quantity, chases since the last reply).
//   4. Tier shift — the deterministic tier (lead-scoring.ts) moves up or down by
//      momentum.
//
// Weights are a first guess, NOT calibrated: tune them against real replies as
// they arrive. Cut-offs and tiers come from laya-cutoffs.json (tuned 2026-10-01).

import type { Deal } from '@/types/crm';
import LAYA_CUTOFFS from './laya-cutoffs.json';
import { hasThaiScript } from './laya-buyer-response';
import { calculateLeadScore, scoreToTier, type LeadTier } from './lead-scoring';
import { kilogramsStated, quantityTier, type QuantityTier } from './order-quantity';

/** A saved answer as the worker stores it: a Choice carries probabilities, a Noul a value. */
export interface SavedAnswer {
  probabilities?: Record<string, number>;
  noul?: number;
}

export interface SavedJudgment {
  status: 'scored' | 'not_scored';
  not_scored_code?: string | null;
  answers?: Record<string, SavedAnswer> | null;
  /** true only when the judgment's input hash matches the deal's CURRENT reply */
  fresh: boolean;
}

export type GradeStatus = 'graded' | 'needs_review' | 'not_graded';

export interface GradeReason {
  label: string;
  /** contribution to momentum; 0 for display-only notes */
  effect: number;
}

export interface DealGrade {
  status: GradeStatus;
  /** the deterministic tier from CRM fields alone */
  baseTier: LeadTier;
  /** the tier to show: shifted only when status is "graded" */
  tier: LeadTier;
  /** what the tier would be if Pat confirms a needs_review grade; null without momentum */
  suggestedTier: LeadTier | null;
  momentum: number | null;
  reasons: GradeReason[];
  /** why the deal goes to Pat (needs_review) or was not graded (not_graded) */
  review: string[];
  quantity: QuantityTier;
}

export interface GradeInput {
  deal: Deal;
  judgment: SavedJudgment | null;
  /** chasesSinceLastReply() from interaction-event.ts */
  chasesSinceReply: number;
}

/** Uncalibrated first weights — tune against real replies. */
export const GRADE_WEIGHTS = {
  requestedNextStep: 0.3,
  declined: -0.4,
  deferred: -0.1,
  trialReported: 0.05,
  trialPositive: 0.2,
  trialNegative: -0.2,
  concernPrice: -0.1,
  concernTechnical: -0.15,
  concernDelivery: -0.05,
  concernTiming: -0.05,
  nextStepCommitment: 0.1,
  quantity: { none: 0, small: 0.05, moderate: 0.1, large: 0.15 } as Record<QuantityTier, number>,
  perChaseSinceReply: -0.08,
  maxChases: 4,
} as const;

/** Momentum needed to move the tier: one step at ±0.25, a second step down at −0.5. */
export const TIER_SHIFT = { up: 0.25, down: -0.25, downTwo: -0.5 } as const;

/** A probability inside this band counts as Laya being unsure. */
export const UNSURE_BAND = { low: 0.35, high: 0.65 } as const;
/** A signal-tier Noul this close to its cut-off counts as unsure. */
export const NEAR_CUTOFF = 0.1;

const TIERS: LeadTier[] = ['D', 'C', 'B', 'A', 'S'];
const DEAL_CUTOFFS = LAYA_CUTOFFS.deal as Record<string, { tier: string; cutoff?: number }>;
const DEAL_SET = Object.keys(DEAL_CUTOFFS);

const LABELS: Record<string, string> = {
  trial_reported: 'buyer reported on our sample',
  trial_positive: 'buyer reported a good trial',
  concern_price: 'price concern',
  concern_technical: 'product performance concern',
};

function shiftTier(tier: LeadTier, momentum: number): LeadTier {
  const steps = momentum >= TIER_SHIFT.up ? 1 : momentum <= TIER_SHIFT.downTwo ? -2 : momentum <= TIER_SHIFT.down ? -1 : 0;
  const index = Math.min(TIERS.length - 1, Math.max(0, TIERS.indexOf(tier) + steps));
  return TIERS[index];
}

function inUnsureBand(p: number): boolean {
  return p > UNSURE_BAND.low && p < UNSURE_BAND.high;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function gradeDeal({ deal, judgment, chasesSinceReply }: GradeInput): DealGrade {
  const baseTier = scoreToTier(calculateLeadScore(deal));
  const quantity = quantityTier(kilogramsStated(deal.buyer_reply));
  const result = (status: GradeStatus, review: string[], extra: Partial<DealGrade> = {}): DealGrade => ({
    status, baseTier, tier: baseTier, suggestedTier: null, momentum: null, reasons: [], review, quantity, ...extra,
  });

  // 1. Deterministic gates
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost' ||
      deal.workflow_action === 'parked' || deal.workflow_action === 'success') {
    return result('not_graded', ['closed or parked']);
  }
  const reply = deal.buyer_reply?.trim();
  if (!reply) return result('not_graded', ['no verbatim buyer reply recorded']);

  // 2a. Routing that needs no judgment
  if (hasThaiScript(reply)) return result('needs_review', ['Thai reply — review it yourself; Laya is unreliable on Thai']);
  if (!judgment) return result('not_graded', ['not judged yet']);
  if (!judgment.fresh) return result('not_graded', ['judged on an older reply; not judged for the current one']);
  if (judgment.status === 'not_scored') {
    return result('needs_review', [`Laya refused to score (${judgment.not_scored_code ?? 'unknown reason'})`]);
  }

  const answers = judgment.answers ?? {};
  const missing = DEAL_SET.filter(id => !answers[id]);
  const br = answers.buyer_response?.probabilities;
  if (missing.length > 0 || !br) return result('needs_review', [`incomplete judgment: missing ${missing.join(', ') || 'buyer_response'}`]);
  const value = (id: string) => answers[id]?.noul ?? 0;

  // 2b. Unsure answers → review
  const review: string[] = [];
  const pRequest = br.requested_next_step ?? 0;
  const pDeclined = br.declined ?? 0;
  const pDeferred = br.deferred ?? 0;
  if (inUnsureBand(pRequest)) review.push(`unclear whether the buyer asked for a next step (${round2(pRequest)})`);
  if (inUnsureBand(pDeclined)) review.push(`unclear whether the buyer declined (${round2(pDeclined)})`);
  for (const [id, entry] of Object.entries(DEAL_CUTOFFS)) {
    if (entry.tier !== 'signal' || entry.cutoff === undefined) continue;
    if (Math.abs(value(id) - entry.cutoff) < NEAR_CUTOFF) {
      review.push(`unclear: ${LABELS[id] ?? id} (${round2(value(id))} vs cut-off ${entry.cutoff})`);
    }
  }

  // 3. Momentum
  const signal = (id: string) => {
    const cutoff = DEAL_CUTOFFS[id]?.cutoff;
    return cutoff !== undefined && value(id) >= cutoff;
  };
  const w = GRADE_WEIGHTS;
  const chases = Math.min(Math.max(chasesSinceReply, 0), w.maxChases);
  const terms: GradeReason[] = [
    { label: `asked for a next step (P ${round2(pRequest)})`, effect: w.requestedNextStep * pRequest },
    { label: `declined (P ${round2(pDeclined)})`, effect: w.declined * pDeclined },
    { label: `asked to come back later (P ${round2(pDeferred)})`, effect: w.deferred * pDeferred },
    ...(signal('trial_reported') ? [{ label: LABELS.trial_reported, effect: w.trialReported }] : []),
    ...(signal('trial_positive') ? [{ label: LABELS.trial_positive, effect: w.trialPositive }] : []),
    { label: `trial went badly (P ${round2(value('trial_negative'))})`, effect: w.trialNegative * value('trial_negative') },
    ...(signal('concern_price') ? [{ label: LABELS.concern_price, effect: w.concernPrice }] : []),
    ...(signal('concern_technical') ? [{ label: LABELS.concern_technical, effect: w.concernTechnical }] : []),
    { label: `delivery concern (P ${round2(value('concern_delivery'))})`, effect: w.concernDelivery * value('concern_delivery') },
    { label: `timing concern (P ${round2(value('concern_timing'))})`, effect: w.concernTiming * value('concern_timing') },
    { label: `committed to a next action (P ${round2(value('next_step_commitment'))})`, effect: w.nextStepCommitment * value('next_step_commitment') },
    ...(quantity !== 'none' ? [{ label: `order size: ${quantity}`, effect: w.quantity[quantity] }] : []),
    ...(chases > 0 ? [{ label: `${chases} unanswered chase${chases === 1 ? '' : 's'} since the last reply`, effect: w.perChaseSinceReply * chases }] : []),
  ];
  const momentum = round2(terms.reduce((sum, t) => sum + t.effect, 0));
  const reasons = terms
    .filter(t => Math.abs(t.effect) >= 0.01)
    .map(t => ({ ...t, effect: round2(t.effect) }))
    .sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect));
  // Display-only answers: shown, never counted.
  for (const id of Object.keys(DEAL_CUTOFFS).filter(id => DEAL_CUTOFFS[id].tier === 'display')) {
    reasons.push({ label: `${id} (display only, P ${round2(value(id))})`, effect: 0 });
  }

  // 4. Tier shift — only applied when Laya was sure enough
  const suggestedTier = shiftTier(baseTier, momentum);
  if (review.length > 0) return result('needs_review', review, { momentum, reasons, suggestedTier });
  return result('graded', [], { tier: suggestedTier, suggestedTier, momentum, reasons });
}
