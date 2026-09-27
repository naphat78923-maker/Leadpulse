// ─── Deterministic deal scoring (no model involved) ───
// Pure arithmetic over CRM fields → 0–100 → tier S/A/B/C/D. Nothing in this file
// calls Laya or any model: the tier chips on /companies and /lab
// and /meetings are computed from here alone, so they render identically on
// Vercel, on a phone, or on the Mac.
//
// Where the rest of the Laya surface lives:
//   • model-facing rules (buyer-response question + state) → laya-buyer-response.ts
//   • reviewer-facing evidence panel for a Laya result     → laya-evidence.ts
//   • endpoint/transport rules                             → laya-transport.ts
//
// Rule table — 100 points maximum:
//   stage 30 · priority 20 · value 20 · follow-up 20 · outcome 10

import type { Deal, DealStage } from '@/types/crm';
import { businessDateKey, businessDaysBetween, isCalendarDateKey } from '@/utils/business-time';

// ── Rule table: pipeline stage (max 30) ──
export const STAGE_POINTS: Record<DealStage, number> = {
  research: 5,
  contacted: 10,
  proposal: 20,
  negotiation: 25,
  closed_won: 30,
  closed_lost: 0,
};

// ── Rule table: stated priority (max 20) ──
export const PRIORITY_POINTS: Record<Deal['priority'], number> = {
  high: 20,
  medium: 10,
  low: 5,
};

// ── Rule table: deal value (max 20) ──
export function valuePoints(value: number | null): number {
  if (!value) return 0;
  if (value >= 100000) return 20;
  if (value >= 50000) return 15;
  if (value >= 20000) return 10;
  if (value >= 10000) return 7;
  if (value >= 5000) return 5;
  return 3;
}

// ── Rule table: follow-up recency (max 20) ──
// Distance from today on the BUSINESS calendar (Asia/Bangkok), so a phone in
// another timezone cannot disagree with the board about which day a deal is due.
//
//   overdue (< today)   18   — due or overdue is equally urgent
//   today               20
//   1–3 days out        18
//   4–7 days out        15
//   8–14 days out       10
//   15–30 days out       5
//   later                0
//   missing / malformed  5   — known honesty gap, kept by explicit decision:
//                              "unscheduled" scores the same as "due in 2–4
//                              weeks". Changing it to 0 moves ~9% of possible
//                              input combinations down one tier; see the
//                              unknown-date impact note before touching it.
export function followupPoints(
  followupDate: string | null,
  today: string = businessDateKey(),
): number {
  if (!followupDate) return 5;
  if (!isCalendarDateKey(followupDate) || !isCalendarDateKey(today)) return 5;
  const daysAhead = businessDaysBetween(today, followupDate);
  if (daysAhead < 0) return 18;
  if (daysAhead === 0) return 20;
  if (daysAhead <= 3) return 18;
  if (daysAhead <= 7) return 15;
  if (daysAhead <= 14) return 10;
  if (daysAhead <= 30) return 5;
  return 0;
}

// ── Rule table: last outcome text (max 10) ──
// Ordered on purpose: refusal/negation is tested BEFORE positive wording, so
// "not confirmed" and "initially agreed, later declined" can never score as
// positive. English patterns run on lowercase text; Thai ones on the original.
const REFUSAL_EN = [
  /\b(?:not\s+(?:interested|confirmed|agreed|successful|proceeding)|declin(?:e|ed|ing)|reject(?:ed|ion)?|lost|negative|no[\s-]+(?:order|interest|response|reply|need|contact)|did\s+not\s+proceed|do\s+not\s+contact|stop\s+contacting|will\s+not\s+proceed)\b/i,
];
const REFUSAL_TH = [
  /(?:ไม่(?:สนใจ|ยืนยัน|ตกลง|ซื้อ|สั่งซื้อ|ต้องติดต่อ|ติดต่อ)|ปฏิเสธ|ยกเลิก|ห้ามติดต่อ)/u,
];
const POSITIVE_EN = [
  /\b(?:positive|won|confirmed|agreed|success(?:ful)?)\b/i,
];
const POSITIVE_TH = [
  /(?:ตกลง|ยืนยัน|สนใจ|สั่งซื้อ|ซื้อ)/u,
];
const NEUTRAL_EN = [
  /\b(?:neutral|maybe|follow[ -]?up|next\s+step|possibly|considering)\b/i,
];

export function outcomePoints(lastOutcome: string | null): number {
  if (!lastOutcome) return 0;
  const lower = lastOutcome.toLowerCase();
  if (REFUSAL_EN.some(pattern => pattern.test(lower)) || REFUSAL_TH.some(pattern => pattern.test(lastOutcome))) return 0;
  if (POSITIVE_EN.some(pattern => pattern.test(lower)) || POSITIVE_TH.some(pattern => pattern.test(lastOutcome))) return 10;
  if (NEUTRAL_EN.some(pattern => pattern.test(lower))) return 5;
  // A note exists but matches no category (whitespace-only text lands here too).
  return 3;
}

// ── Total (0–100) ──
export function calculateLeadScore(
  deal: Pick<Deal, 'stage' | 'priority' | 'value' | 'followup_date' | 'last_outcome'>
    & Partial<Pick<Deal, 'workflow_action'>>,
): number {
  // Closed and parked deals are not active leads. A reorder opportunity must be
  // its own open deal rather than inflating a completed one.
  if (
    deal.stage === 'closed_won' ||
    deal.stage === 'closed_lost' ||
    deal.workflow_action === 'parked' ||
    deal.workflow_action === 'success'
  ) return 0;

  const score =
    (STAGE_POINTS[deal.stage] || 0) +
    (PRIORITY_POINTS[deal.priority] || 0) +
    valuePoints(deal.value) +
    followupPoints(deal.followup_date) +
    outcomePoints(deal.last_outcome);

  // The rule table sums to at most 100 by construction; clamp defends callers
  // that pass partial rows (e.g. synced data with an unexpected stage).
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

// ── Entity rollups: account/contact-level signals for list pages ──
// Deterministic only — no model call, so these are safe to compute for every
// row on /companies and /contacts from any device (they never touch the
// Mac-local Laya worker). The on-demand buyer-response scorer stays per deal;
// dealsWithVerbatimBuyerReply pre-filters which deals may offer it.

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
