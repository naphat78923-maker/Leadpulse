// ─── LeadPulse Slice 5 — Touch-Cadence & Intermittent Reward (Phase 1) ───
// Pure, testable functions. No Supabase calls, no DB writes.
// Scope: RETENTION SYSTEM = WON CUSTOMERS ONLY (company.status === 'active_customer').
// Cadence is DERIVED (read-only) from last touch + tier interval — no new column.

// Type-only: the Node-run report scripts load this module directly, and a value
// import of two types fails at runtime (types have no runtime export).
import type { AccountType, HealthTier } from './accountHealth.ts';

export type ISODate = string; // 'YYYY-MM-DD'

const DAY_MS = 86400000;

export function daysBetween(from: ISODate, to: ISODate): number {
  const a = new Date(from + 'T00:00:00').getTime();
  const b = new Date(to + 'T00:00:00').getTime();
  return Math.round((b - a) / DAY_MS);
}

// Base cadence by health tier (days between human touches).
export const TIER_INTERVAL: Record<HealthTier, number> = {
  healthy: 90,
  watch: 45,
  at_risk: 21,
  dormant: 30,
};

// Account-type expected reorder gap (from accountHealth EXPECTED_INTERVAL).
// The shorter of (tier interval, account interval) wins so fast-reorder
// accounts (bakery) aren't left 90 days.
export const ACCOUNT_INTERVAL: Record<AccountType, number> = {
  hotel: 90,
  restaurant: 45,
  bakery: 30,
  modern_trade: 30,
  other: 60,
};

export function cadenceInterval(tier: HealthTier, accountType: AccountType = 'other'): number {
  return Math.min(TIER_INTERVAL[tier], ACCOUNT_INTERVAL[accountType]);
}

/**
 * Next human-touch due date.
 * PREFERS a persisted `next_touch_due` (Phase 2) when present — this is what
 * was written on the last logged touch, so it survives manual edits and is the
 * source of truth. Falls back to deriving from last touch + tier interval when
 * no persisted value exists yet (zero-schema-transition friendly).
 */
export function nextTouchDue(params: {
  tier: HealthTier;
  accountType?: AccountType;
  lastTouch?: ISODate | null;
  lastContactDate?: ISODate | null;
  createdAt?: ISODate | null;
  persistedNextDue?: ISODate | null;
  today?: ISODate;
}): { due: ISODate; daysUntil: number; persisted: boolean } {
  const today = params.today || new Date().toISOString().slice(0, 10);
  if (params.persistedNextDue) {
    return { due: params.persistedNextDue, daysUntil: daysBetween(today, params.persistedNextDue), persisted: true };
  }
  const anchor =
    [params.lastTouch, params.lastContactDate, params.createdAt]
      .filter((d): d is ISODate => !!d)
      .sort()
      .slice(-1)[0] || today;
  const interval = cadenceInterval(params.tier, params.accountType);
  const dueMs = new Date(anchor + 'T00:00:00').getTime() + interval * DAY_MS;
  const due = new Date(dueMs).toISOString().slice(0, 10);
  return { due, daysUntil: daysBetween(today, due), persisted: false };
}

// Is this account in the retention system at all? Won customers only.
export function inRetentionSystem(status: string): boolean {
  return status === 'active_customer';
}

// ── Intermittent reward system (variable-ratio, NOT "every Nth") ──
// A reward is ELIGIBLE on a trigger touch, then granted by a RANDOM DRAW.
// `null` (no reward this time) is a valid, intended outcome — the
// unpredictability IS the hook.

export type RewardTrigger = 'winback_touch' | 'milestone';

export interface RewardOption {
  id: string;
  label: string;
  // Weight: higher = more likely in the draw. Personal/customized lean.
  weight: number;
  personal: boolean; // true = human-crafted touch, not a generic freebie
  note: string;
}

// Solo-friendly, margin-safe, biased to PERSONAL TOUCH + CUSTOMIZED GIFTS.
export const REWARD_POOL: RewardOption[] = [
  {
    id: 'voice_note',
    label: 'LINE voice note from Pat',
    weight: 30,
    personal: true,
    note: 'A 20s personal voice message asking how the kitchen is doing. Zero cost, highest memorability.',
  },
  {
    id: 'handwritten',
    label: 'Handwritten note with next delivery',
    weight: 24,
    personal: true,
    note: 'Card addressed to the chef by name. "Thinking of your new menu."',
  },
  {
    id: 'chef_recipe',
    label: 'Customized recipe / plating PDF for their chef',
    weight: 20,
    personal: true,
    note: 'Built around YOUR butter/gelato — makes them imagine new dishes with you.',
  },
  {
    id: 'sample_newline',
    label: 'Free sample of a NEW product line',
    weight: 14,
    personal: false,
    note: 'Gelato base or bread mix — gift that doubles as cross-sell.',
  },
  {
    id: 'priority_restock',
    label: 'Priority restock / free delivery slot',
    weight: 8,
    personal: false,
    note: 'Jump the queue on their next order. Operational favor they feel.',
  },
  {
    id: 'free_1kg',
    label: 'Free 1kg butter on next order',
    weight: 4,
    personal: false,
    note: 'Rarest, most tangible. Kept low-weight to protect margin.',
  },
];

/** Weighted random draw. Pass a 0..1 rng (default Math.random) for testability. */
export function pickReward(rng: () => number = Math.random): RewardOption | null {
  const total = REWARD_POOL.reduce((s, r) => s + r.weight, 0);
  let roll = rng() * total;
  for (const r of REWARD_POOL) {
    roll -= r.weight;
    if (roll <= 0) return r;
  }
  return REWARD_POOL[REWARD_POOL.length - 1];
}

/**
 * Should a reward draw happen on this logged touch?
 * Trigger = win-back touch on a slipping account, OR a milestone order.
 * Milestones use "lucky" numbers (not fixed cadence) so it stays intermittent.
 */
const MILESTONE_ORDERS = new Set([5, 10, 25, 50, 100]);

export function rewardTrigger(params: {
  tier: HealthTier;
  isWinBackTouch: boolean; // logged a touch on watch/at_risk/dormant
  orderCount?: number; // distinct orders for this account
}): RewardTrigger | null {
  if (params.isWinBackTouch && (params.tier === 'watch' || params.tier === 'at_risk' || params.tier === 'dormant')) {
    return 'winback_touch';
  }
  if (params.orderCount != null && MILESTONE_ORDERS.has(params.orderCount)) {
    return 'milestone';
  }
  return null;
}

/**
 * One-call reward decision for a logged touch: eligibility (trigger) + weighted
 * draw bundled together. Returns null when no draw should happen at all;
 * `option: null` is a valid drawn outcome (the miss IS the hook).
 * Pass a deterministic `rng` in tests.
 */
export function drawRetentionReward(params: {
  tier: HealthTier;
  orderCount?: number;
  rng?: () => number;
}): { trigger: RewardTrigger; option: RewardOption | null } | null {
  const isWinBackTouch =
    params.tier === 'watch' || params.tier === 'at_risk' || params.tier === 'dormant';
  const trigger = rewardTrigger({
    tier: params.tier,
    isWinBackTouch,
    orderCount: params.orderCount,
  });
  if (!trigger) return null;
  return { trigger, option: pickReward(params.rng) };
}

