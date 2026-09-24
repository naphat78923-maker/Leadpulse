// ─── Lead Scoring ───
// Weighted system for B2B butter sales deals
// Score: 0-100 → Tier: S (Hot) / A (Warm) / B (Warming) / C (Cool) / D (Cold)

import { Company, DealStage, Deal } from '@/types/crm';

export type LayaAttentionLevel = 'priority' | 'nurture' | 'research' | 'deprioritize';

export interface LayaAttentionInput {
  state: string;
  questions: {
    attention: {
      type: 'choice';
      instructions: string;
      criteria: Record<LayaAttentionLevel, string>;
    };
  };
}

const LAYA_ATTENTION_QUESTION: LayaAttentionInput['questions'] = {
  attention: {
    type: 'choice',
    instructions: 'Best sales attention?',
    criteria: {
      priority: 'Reply soon. Clear fit and signal.',
      nurture: 'Keep warm. No immediate signal.',
      research: 'Need fit or buyer info.',
      deprioritize: 'Weak or negative signal.',
    },
  },
};


function isCalendarDateKey(value: string | null | undefined): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function bangkokDateKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function calendarDaysBetween(start: string, end: string): number {
  const [startYear, startMonth, startDay] = start.split('-').map(Number);
  const [endYear, endMonth, endDay] = end.split('-').map(Number);
  const startUtc = Date.UTC(startYear, startMonth - 1, startDay);
  const endUtc = Date.UTC(endYear, endMonth - 1, endDay);
  return (endUtc - startUtc) / 86_400_000;
}

function followupLabel(followupDate: string | null, today: string): string {
  if (!followupDate) return 'unscheduled';
  if (!isCalendarDateKey(followupDate)) return 'invalid date';
  if (followupDate === today) return 'today';
  if (followupDate < today) return 'overdue';
  return 'scheduled';
}

export interface LayaSalesEvidence {
  industry: string;
  tags: string;
  product: string;
  stage: DealStage;
  value: string;
  valueType: string;
  followup: string;
  outcome: string;
}

/** Visible CRM context for a human reviewer; deliberately not part of the Laya buyer-message request. */
export function buildLayaSalesEvidence(input: {
  deal: Pick<Deal, 'product' | 'stage' | 'value' | 'value_type' | 'followup_date' | 'last_outcome'>;
  company?: Pick<Company, 'industry' | 'tags'>;
  today: string;
}): LayaSalesEvidence {
  return {
    industry: input.company?.industry?.trim() || 'unknown',
    tags: input.company?.tags?.map(tag => tag.trim()).filter(Boolean).join(', ') || 'unknown',
    product: input.deal.product?.trim() || 'unknown',
    stage: input.deal.stage,
    value: input.deal.value == null ? 'unknown' : `THB ${input.deal.value.toLocaleString('en-US')}`,
    valueType: input.deal.value_type || 'unknown',
    followup: followupLabel(input.deal.followup_date, input.today),
    outcome: input.deal.last_outcome?.trim() || 'unknown',
  };
}

/**
 * Preserves the complete selected evidence; the local worker checks the actual
 * encoded token budget and refuses oversized requests instead of cutting facts.
 * Dedicated identity/contact/company-note fields are excluded, but free text is
 * NOT anonymized. This never changes LeadPulse priority, stage, or workflow.
 * @deprecated Retained for the historical benchmark only; the runtime scorer rejects this broad schema.
 */
export function buildLayaAttentionInput(input: {
  deal: Pick<Deal, 'product' | 'stage' | 'value' | 'followup_date' | 'last_outcome'>;
  company?: Pick<Company, 'industry' | 'size' | 'tags'>;
  today: string;
}): LayaAttentionInput {
  const industry = input.company?.industry?.trim() || 'unknown';
  const tags = input.company?.tags?.map(tag => tag.trim()).filter(Boolean).join(', ') || 'unknown';
  const product = input.deal.product?.trim() || 'unknown';
  const value = input.deal.value == null ? 'unknown' : `THB ${input.deal.value}`;
  const outcome = input.deal.last_outcome?.trim() || 'unknown';

  return {
    state: [
      `Industry: ${industry}.`,
      `Tags: ${tags}.`,
      `Product: ${product}.`,
      `Stage: ${input.deal.stage}.`,
      `Value: ${value}.`,
      `Follow-up: ${followupLabel(input.deal.followup_date, input.today)}.`,
      `Outcome: ${outcome}.`,
    ].join(' '),
    questions: LAYA_ATTENTION_QUESTION,
  };
}

// ─── Buyer-response interpretation (narrow question) ───
// Evidence: scripts/eval_results/2026-09-23-buyer-response-eval-report.md
// The model reads the buyer's OWN WORDS far better than paraphrased CRM notes,
// and a small sentence-form state beats any structured/compacted format.
// Stage, value, follow-up, and tags are deliberately excluded: they are policy
// inputs owned by code, not part of the language judgment.

export type LayaBuyerResponseLevel =
  'requested_next_step' | 'deferred' | 'declined' | 'no_commitment' | 'unclear';

export interface LayaBuyerResponseInput {
  state: string;
  questions: {
    buyer_response: {
      type: 'choice';
      instructions: string;
      criteria: Record<LayaBuyerResponseLevel, string>;
    };
  };
  /** false when the state paraphrases an outcome note instead of the buyer's verbatim reply */
  verbatim: boolean;
}

// Option order is FROZEN reversed (eval variant v_verbatim_revopts): measured
// 8/8 requested_next_step recalled with only 2 false positives, vs visible
// decline over-prediction in the original order. Must stay byte-identical to
// BUYER_RESPONSE_QUESTION in scripts/laya_score_server.py.
const LAYA_BUYER_RESPONSE_QUESTION: LayaBuyerResponseInput['questions'] = {
  buyer_response: {
    type: 'choice',
    instructions: "Which option best describes the buyer's latest message?",
    criteria: {
      unclear: 'no buyer response is stated, or responses conflict with no stated order',
      no_commitment: 'only acknowledges or shows interest, with no request',
      declined: 'says no, not interested, or that they chose another supplier',
      deferred: 'asks to revisit later or after a stated time, without declining',
      requested_next_step: 'requests a sample, quotation, order, contract, or pricing to proceed with a purchase',
    },
  },
};

/**
 * Small sentence-form state for the narrow buyer-response question.
 *
 * Prefers `buyer_reply` (verbatim, first-person) and marks the result verbatim;
 * falls back to the paraphrased `last_outcome` note marked verbatim: false so the
 * caller can route those to human review. Returns null when there is no buyer
 * text at all — a needs_evidence safeguard handled in code, never by the model.
 * The complete selected text is preserved; the worker's input-budget guard
 * refuses oversized input instead of cutting it.
 */
export function buildLayaBuyerResponseInput(input: {
  deal: Pick<Deal, 'product' | 'last_outcome'> & { buyer_reply?: string | null };
}): LayaBuyerResponseInput | null {
  const product = input.deal.product?.trim() || 'our products';
  const reply = input.deal.buyer_reply?.trim();
  const note = input.deal.last_outcome?.trim();

  if (reply) {
    return {
      state: `We supply ${product} to this account. The buyer's latest reply: "${reply}"`,
      questions: LAYA_BUYER_RESPONSE_QUESTION,
      verbatim: true,
    };
  }
  if (note) {
    return {
      state: `We supply ${product} to this account. The latest recorded outcome note says: "${note}"`,
      questions: LAYA_BUYER_RESPONSE_QUESTION,
      verbatim: false,
    };
  }
  return null;
}

// ─── Shipped handling: 2-class slice only (eval report option 1, frozen 2026-09-23) ───
// Evidence: scripts/eval_results/2026-09-23-buyer-response-eval-report.md.
// On verbatim replies (reversed option order) the model recalls
// requested_next_step 8/8 with only 2 false positives, while the other four
// classes collapse into each other (~1/4 each) — so ONLY a verbatim
// requested_next_step may raise the buyer-asked flag. Paraphrased outcome
// notes (verbatim: false) never raise it: the same question measured 2/8 on
// third-person notes. Everything else routes to manual triage with no label.

export type LayaBuyerSignal = 'buyer_requested' | 'manual_triage';

export const LAYA_BUYER_REQUEST_LABEL = 'Buyer-request signal — review this deal';

export function buyerResponseSignal(
  level: LayaBuyerResponseLevel,
  verbatim: boolean,
): LayaBuyerSignal {
  return verbatim && level === 'requested_next_step' ? 'buyer_requested' : 'manual_triage';
}

// ── Stage scoring (max 30) ──
export const STAGE_WEIGHTS: Record<DealStage, number> = {
  research: 5,
  contacted: 10,
  proposal: 20,
  negotiation: 25,
  closed_won: 30,
  closed_lost: 0,
};

// ── Priority scoring (max 20) ──
export const PRIORITY_WEIGHTS: Record<Deal['priority'], number> = {
  high: 20,
  medium: 10,
  low: 5,
};

// ── Value scoring (max 20) ──
export function valueScore(value: number | null): number {
  if (!value) return 0;
  if (value >= 100000) return 20;
  if (value >= 50000) return 15;
  if (value >= 20000) return 10;
  if (value >= 10000) return 7;
  if (value >= 5000) return 5;
  return 3;
}

// ── Follow-up recency scoring (max 20) ──
export function followupScore(followupDate: string | null, today: string = bangkokDateKey()): number {
  if (!followupDate) return 5;
  if (!isCalendarDateKey(followupDate) || !isCalendarDateKey(today)) return 5;
  const daysDiff = calendarDaysBetween(today, followupDate);
  if (daysDiff < 0) return 18;
  if (daysDiff === 0) return 20;
  if (daysDiff <= 3) return 18;
  if (daysDiff <= 7) return 15;
  if (daysDiff <= 14) return 10;
  if (daysDiff <= 30) return 5;
  return 0;
}

// ── Outcome sentiment scoring (max 10) ──
export function outcomeScore(lastOutcome: string | null): number {
  if (!lastOutcome) return 0;
  const lower = lastOutcome.toLowerCase();
  // Check explicit refusal/negation before positive keywords so "not confirmed"
  // or "initially agreed, later declined" cannot receive a positive score.
  if (/\b(?:not\s+(?:interested|confirmed|agreed|successful|proceeding)|declin(?:e|ed|ing)|reject(?:ed|ion)?|lost|negative|no[\s-]+(?:order|interest|response|reply|need|contact)|did\s+not\s+proceed|do\s+not\s+contact|stop\s+contacting|will\s+not\s+proceed)\b/i.test(lower) ||
      /(?:ไม่(?:สนใจ|ยืนยัน|ตกลง|ซื้อ|สั่งซื้อ|ต้องติดต่อ|ติดต่อ)|ปฏิเสธ|ยกเลิก|ห้ามติดต่อ)/u.test(lastOutcome)) return 0;
  if (/\b(?:positive|won|confirmed|agreed|success(?:ful)?)\b/i.test(lower) || /(?:ตกลง|ยืนยัน|สนใจ|สั่งซื้อ|ซื้อ)/u.test(lastOutcome)) return 10;
  if (/\b(?:neutral|maybe|follow[ -]?up|next\s+step|possibly|considering)\b/i.test(lower)) return 5;
  return 3;
}

// ── Calculate total score (0-100) ──
export function calculateLeadScore(deal: Pick<Deal, 'stage' | 'priority' | 'value' | 'followup_date' | 'last_outcome'> & Partial<Pick<Deal, 'workflow_action'>>): number {
  // Closed and parked deals are not active leads. Reorder opportunity must be
  // represented as its own open deal rather than inflating a completed deal.
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost' || deal.workflow_action === 'parked' || deal.workflow_action === 'success') return 0;
  let score = 0;
  score += STAGE_WEIGHTS[deal.stage] || 0;
  score += PRIORITY_WEIGHTS[deal.priority] || 0;
  score += valueScore(deal.value);
  score += followupScore(deal.followup_date);
  score += outcomeScore(deal.last_outcome);
  return Math.min(100, Math.max(0, score));
}

// ── Tier mapping ──
export type LeadTier = 'S' | 'A' | 'B' | 'C' | 'D';

export function scoreToTier(score: number): LeadTier {
  if (score >= 80) return 'S';
  if (score >= 60) return 'A';
  if (score >= 40) return 'B';
  if (score >= 20) return 'C';
  return 'D';
}

export const TIER_LABELS: Record<LeadTier, string> = {
  S: '🔴 Hot Lead',
  A: '🟠 Warm',
  B: '🟡 Warming Up',
  C: '🟢 Cooling',
  D: '⚪ Cold',
};

export const TIER_COLORS: Record<LeadTier, string> = {
  S: 'bg-clay-error/10 text-clay-error border-clay-error/20',
  A: 'bg-clay-ochre/10 text-clay-ochre border-clay-ochre/20',
  B: 'bg-clay-lavender/10 text-clay-lavender border-clay-lavender/20',
  C: 'bg-clay-card text-clay-muted border-clay-hairline',
  D: 'bg-clay-ink/5 text-clay-muted-soft border-clay-hairline/30',
};

export const TIER_BG: Record<LeadTier, string> = {
  S: 'bg-clay-error/5 border-l-2 border-clay-error/30',
  A: 'bg-clay-ochre/5 border-l-2 border-clay-ochre/30',
  B: 'bg-clay-lavender/5 border-l-2 border-clay-lavender/30',
  C: 'bg-white dark:bg-clay-card border-clay-hairline',
  D: 'bg-white dark:bg-clay-card border-clay-hairline/50',
};

// ── Priority visual classes (now with stronger color coding) ──
export const PRIORITY_CLASSES: Record<Deal['priority'], string> = {
  high: 'bg-clay-error/15 text-clay-error border-l-2 border-clay-error/40 px-2 py-0.5 rounded text-xs font-semibold min-h-[20px]',
  medium: 'bg-clay-ochre/15 text-clay-ochre border-l-2 border-clay-ochre/30 px-2 py-0.5 rounded text-xs font-medium min-h-[20px]',
  low: 'bg-clay-card text-clay-muted border-l-2 border-clay-hairline/50 px-2 py-0.5 rounded text-xs min-h-[20px]',
};

export const PRIORITY_LABELS: Record<Deal['priority'], string> = {
  high: '🔥 High',
  medium: '◉ Medium',
  low: '○ Low',
};

// ── Entity rollups: account/contact-level signals for list pages ──
// Deterministic only — no model call, so these are safe to compute for every
// row on /companies and /contacts from any device (they never touch the
// Mac-local Laya worker). The on-device buyer-response scorer stays on-demand
// per deal; dealsWithVerbatimBuyerReply pre-filters which deals may offer it.

export interface LeadSignal {
  deal: Deal;
  score: number;
  tier: LeadTier;
}

/**
 * Hottest open deal by deterministic lead score. calculateLeadScore already
 * returns 0 for closed, parked and completed deals, so they can never win.
 */
export function bestLeadSignal(deals: Deal[]): LeadSignal | null {
  let best: LeadSignal | null = null;
  for (const deal of deals) {
    const score = calculateLeadScore(deal);
    if (score <= 0) continue;
    if (!best || score > best.score) best = { deal, score, tier: scoreToTier(score) };
  }
  return best;
}

/**
 * Open deals carrying a verbatim buyer reply — the only deals Laya may score
 * (LayaScoreCard enforces the same gate at request time; this pre-filters so
 * account/contact rollups only surface genuinely scorable deals). Sorted
 * hottest-first by deterministic lead score.
 */
export function dealsWithVerbatimBuyerReply(deals: Deal[]): Deal[] {
  return deals
    .filter(deal => !!deal.buyer_reply?.trim() && calculateLeadScore(deal) > 0)
    .sort((a, b) => calculateLeadScore(b) - calculateLeadScore(a));
}

