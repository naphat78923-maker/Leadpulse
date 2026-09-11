// ─── LeadPulse Slice 5 — Account Health Score (Phase A, pure/read-only) ───
// Weighted per-account retention score (0–100) from the retention spec.
// No Supabase calls, no DB writes — takes typed inputs, returns a score.
// Phase B (CSV pipeline → account_events) unlocks the M component + full weights.

type ISODate = string; // 'YYYY-MM-DD'

export type AccountType = 'hotel' | 'restaurant' | 'bakery' | 'modern_trade' | 'other';

export interface HealthInputs {
  companyId: string;
  companyName: string;
  createdAt: ISODate;
  /** last order date if known (from CRM deals or future account_events) */
  lastOrderDate?: ISODate | null;
  /** Meeting rows already filtered to this company */
  meetings: { date: ISODate; outcome: 'positive' | 'neutral' | 'negative' | 'no_response' | null }[];
  /** Won/reorder deals for this company (drives O + order count for F) */
  deals: { stage: 'closed_won' | 'closed_lost' | string; last_outcome: string | null; value: number | null }[];
  /** Future: piped sales history. Empty now → M=0, interim weights used. */
  events?: { date: ISODate; amount: number; product_line?: string; order_id?: string }[];
  /** Not in schema yet — optional, safe default false. */
  standingOrder?: boolean;
  /** Derived from taxonomy v1 via classifyCompanyRole().account_type (src/utils/companyRole.ts). Optional; absent input still falls back to 'other'. */
  accountType?: AccountType;
  /** Pat-logged referrals (future meeting type). Default 0. */
  referrals?: number;
  /** "today" injection for deterministic tests; defaults to real now. */
  today?: ISODate;
}

export interface HealthResult {
  score: number; // 0–100
  tier: HealthTier;
  R: number; // 0–1
  F: number; // 0–1
  M: number; // 0–1 (0 until events piped)
  O: number; // 0–1
  weightsUsed: 'interim' | 'full';
  missing: string[]; // human-readable gaps
}

export type HealthTier = 'healthy' | 'watch' | 'at_risk' | 'dormant';

// ── Weights ──
export const W_INTERIM = { R: 0.40, F: 0.33, O: 0.27 } as const;
export const W_FULL = { R: 0.30, F: 0.25, M: 0.25, O: 0.20 } as const;

export const AHS_TIERS: { tier: HealthTier; min: number; label: string }[] = [
  { tier: 'healthy', min: 75, label: 'Healthy' },
  { tier: 'watch', min: 50, label: 'Watch' },
  { tier: 'at_risk', min: 25, label: 'At-risk' },
  { tier: 'dormant', min: 0, label: 'Dormant' },
];

// ── Helpers ──
function clamp(n: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, n));
}

function daysBetween(from: ISODate, to: ISODate): number {
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  return Math.round((b - a) / 86400000);
}

function todayISO(inject?: ISODate): ISODate {
  if (inject) return inject;
  return new Date().toISOString().slice(0, 10);
}

export const EXPECTED_INTERVAL: Record<AccountType, number> = {
  hotel: 90,
  restaurant: 45,
  bakery: 30,
  modern_trade: 30,
  other: 60,
};

// ── Sub-scores ──

/** R — Recency: silence since last meeting/order. 0 at 180+ days. */
function recencyScore(inputs: HealthInputs, today: ISODate): number {
  const dates = [
    inputs.lastOrderDate,
    ...inputs.meetings.map((m) => m.date),
  ].filter((d): d is ISODate => !!d);
  const latest = dates.length ? dates.reduce((a, b) => (b > a ? b : a)) : inputs.createdAt;
  const days = Math.max(0, daysBetween(latest, today));
  return clamp(1 - days / 180);
}

/**
 * F — Reorder cadence: standing order = 1.0; meets expected interval → 1.0.
 * Counts DISTINCT orders (events may have multiple line items per order_id),
 * not raw event rows. Falls back to won-deal count when no events yet.
 */
function distinctOrderCount(inputs: HealthInputs): number {
  if (inputs.events && inputs.events.length > 0) {
    const ids = inputs.events.map((e) => e.order_id ?? `${e.date}:${e.product_line ?? ''}`);
    return new Set(ids).size;
  }
  return inputs.deals.filter((d) => d.stage === 'closed_won').length;
}

function frequencyScore(inputs: HealthInputs): number {
  if (inputs.standingOrder) return 1.0;
  const orders = distinctOrderCount(inputs);
  if (orders >= 2 && inputs.events && inputs.events.length >= 2) {
    // gap between distinct orders (dedupe by order_id, take earliest date per order)
    const byOrder = new Map<string, ISODate>();
    for (const e of inputs.events) {
      const key = e.order_id ?? `${e.date}:${e.product_line ?? ''}`;
      const cur = byOrder.get(key);
      if (!cur || e.date < cur) byOrder.set(key, e.date);
    }
    const sorted = [...byOrder.values()].sort();
    let gaps = 0;
    for (let i = 1; i < sorted.length; i++) gaps += daysBetween(sorted[i - 1], sorted[i]);
    const avgGap = gaps / (sorted.length - 1);
    const expected = EXPECTED_INTERVAL[inputs.accountType ?? 'other'];
    return clamp(expected / Math.max(avgGap, 1));
  }
  // single purchase = weak signal
  if (orders === 1) return 0.30;
  return 0;
}

/** M — Monetary / share-of-wallet. Returns 0 until events piped. */
function monetaryScore(inputs: HealthInputs): { score: number; missing: boolean } {
  const events = inputs.events;
  if (!events || events.length === 0) return { score: 0, missing: true };
  const net = events.reduce((s, e) => s + (e.amount || 0), 0);
  const aov = net / Math.max(events.length, 1);
  const lines = new Set(events.map((e) => e.product_line).filter(Boolean)).size;
  const breadth = clamp(lines / 3);
  const normNet = clamp(net / 100000);
  const normAov = clamp(aov / 20000);
  const raw = 0.6 * normNet + 0.2 * normAov + 0.2 * breadth;
  return { score: clamp(raw), missing: false };
}

/** O — Outcome + Advocacy. */
function outcomeScore(inputs: HealthInputs): number {
  const pos = inputs.meetings.filter((m) => m.outcome === 'positive').length;
  const ref = inputs.referrals ?? 0;
  const exp = inputs.deals.filter(
    (d) => !!d.last_outcome && /expansion|reorder target/i.test(d.last_outcome)
  ).length;
  const raw = 0.5 * clamp(pos / 3) + 0.3 * clamp(ref / 2) + 0.2 * clamp(exp / 1);
  return clamp(raw);
}

// ── Main ──
export function accountHealthScore(inputs: HealthInputs): HealthResult {
  const today = todayISO(inputs.today);
  const R = recencyScore(inputs, today);
  const F = frequencyScore(inputs);
  const Mres = monetaryScore(inputs);
  const O = outcomeScore(inputs);

  const hasMoney = !Mres.missing;
  const w = hasMoney ? W_FULL : W_INTERIM;
  const raw = w.R * R + w.F * F + (hasMoney ? (w as typeof W_FULL).M * Mres.score : 0) + w.O * O;
  const score = Math.round(100 * raw);

  const tier = AHS_TIERS.find((t) => score >= t.min)!.tier;
  const missing: string[] = [];
  if (Mres.missing) missing.push('monetary (no account_events yet)');
  if (!inputs.standingOrder && inputs.standingOrder === undefined) missing.push('standing_order_flag (schema pending)');
  if ((inputs.referrals ?? 0) === 0) missing.push('referrals (Pat-logged later)');

  return {
    score,
    tier,
    R: +R.toFixed(3),
    F: +F.toFixed(3),
    M: +Mres.score.toFixed(3),
    O: +O.toFixed(3),
    weightsUsed: hasMoney ? 'full' : 'interim',
    missing,
  };
}

export function tierLabel(tier: HealthTier): string {
  return AHS_TIERS.find((t) => t.tier === tier)!.label;
}
