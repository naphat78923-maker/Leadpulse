// ─── Lead Scoring ───
// Weighted system for B2B butter sales deals
// Score: 0-100 → Tier: S (Hot) / A (Warm) / B (Warming) / C (Cool) / D (Cold)

import { DealStage, Deal } from '@/types/crm';

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
export function followupScore(followupDate: string | null): number {
  if (!followupDate) return 5;
  const now = new Date();
  const followup = new Date(followupDate);
  const daysDiff = Math.floor((followup.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
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
  if (lower.includes('positive') || lower.includes('won') || lower.includes('confirmed') || lower.includes('agreed') || lower.includes('success')) return 10;
  if (lower.includes('neutral') || lower.includes('maybe') || lower.includes('follow up') || lower.includes('next')) return 5;
  if (lower.includes('negative') || lower.includes('lost') || lower.includes('no') || lower.includes('not interested') || lower.includes('rejected')) return 0;
  return 3;
}

// ── Calculate total score (0-100) ──
export function calculateLeadScore(deal: Pick<Deal, 'stage' | 'priority' | 'value' | 'followup_date' | 'last_outcome'>): number {
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
