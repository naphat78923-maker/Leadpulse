// What a logged customer check-in changes on the account: the human-touch date,
// the next check-in date, and the intermittent reward draw. Pure; the caller writes.

import type { Company } from '../types/crm';
import type { HealthTier } from './accountHealth';
import { ACTIVE_REORDER_POLICY, accountTypeForPolicy } from './reorderPolicy';
import { drawRetentionReward, inRetentionSystem, nextTouchDue, type RewardOption, type RewardTrigger } from './retentionCadence';

/** True order count: distinct orders from sales history, falling back to won deals. */
export function distinctOrderCount(
  events: { order_id: string | null; event_date: string; product_line?: string | null }[],
  wonDeals: unknown[],
): number {
  if (events.length > 0) {
    return new Set(events.map((e) => e.order_id || `${e.event_date}:${e.product_line ?? ''}`)).size;
  }
  return wonDeals.length;
}

export interface RetentionTouchPlan {
  companyPatch: { last_human_touch: string; next_touch_due: string };
  reward: { trigger: RewardTrigger; option: RewardOption | null } | null;
}

/**
 * Null for accounts outside the retention system. Otherwise the touch always moves
 * the saved check-in date — a saved next_touch_due outranks logged meetings, so
 * without this an account stays overdue after you have contacted it.
 */
export function planRetentionTouch(params: {
  company: Company;
  tier: HealthTier;
  orderCount: number;
  today: string;
  rng?: () => number;
}): RetentionTouchPlan | null {
  if (!inRetentionSystem(params.company.status)) return null;
  const next = nextTouchDue({
    tier: params.tier,
    accountType: accountTypeForPolicy(params.company, ACTIVE_REORDER_POLICY),
    lastTouch: params.today,
    today: params.today,
  });
  return {
    companyPatch: { last_human_touch: params.today, next_touch_due: next.due },
    reward: drawRetentionReward({ tier: params.tier, orderCount: params.orderCount, rng: params.rng }),
  };
}
