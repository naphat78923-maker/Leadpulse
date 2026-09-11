// ─── LeadPulse — REORDER INTERVAL POLICY ───
//
// DELIBERATELY SEPARATE FROM CLASSIFICATION.
//   src/utils/companyRole.ts answers "what kind of business is this" (a label),
//   this module answers "how many days until we touch them again" (sales timing).
// Approving a better label is NOT approving a change to sales timing, so the two
// live in separate modules and the timing decision has its own version switch.

import type { AccountType } from './accountHealth.ts';
import {
  classifyCompanyRole,
  ROLE_TAXONOMY,
  type ClassifiableCompany,
  type CompanyRole,
} from './companyRole.ts';

export type ReorderPolicyVersion = 'v0-legacy' | 'v1-role-keyed';

/**
 * The ACTIVE timing policy.
 *
 * 'v0-legacy' preserves today's production behaviour exactly, including the
 * retired regex, so improving the company label cannot silently move a customer's
 * due date. Flip this to 'v1-role-keyed' only after Pat has reviewed
 * `scripts/reorder-policy-impact-report.ts` output for the affected accounts.
 */
export const ACTIVE_REORDER_POLICY: ReorderPolicyVersion = 'v0-legacy';

/** The policy held for review. Not active. */
export const REVIEWED_ALTERNATIVE_POLICY: ReorderPolicyVersion = 'v1-role-keyed';

export const REORDER_POLICY_VERSIONS: ReorderPolicyVersion[] = ['v0-legacy', 'v1-role-keyed'];

/** Expected reorder gap by legacy account type. Canonical copy: the parity test
 *  in reorderPolicy.test.ts asserts the copies in accountHealth (EXPECTED_INTERVAL)
 *  and retentionCadence (ACCOUNT_INTERVAL) still agree with this one. */
export const LEGACY_ACCOUNT_INTERVAL_DAYS: Record<AccountType, number> = {
  hotel: 90,
  restaurant: 45,
  bakery: 30,
  modern_trade: 30,
  other: 60,
};

/**
 * v0-legacy implementation: a VERBATIM copy of the render-time classifier that
 * used to live in src/app/retention/page.tsx.
 *
 * It is kept here only because it is what today's sales timing is computed from.
 * It is not the taxonomy, it should not be extended, and it is retired the moment
 * the v1 policy is approved. (Its `hotel` alternative in the last branch is
 * unreachable, exactly as it was in the page.)
 */
export function legacyAccountTypeForCompany(c: ClassifiableCompany): AccountType {
  const s = `${c.industry || ''} ${(c.tags || []).join(' ')}`.toLowerCase();
  if (/hotel|resort|hospital/.test(s)) return 'hotel';
  if (/bakery|patiss|bread/.test(s)) return 'bakery';
  if (/modern trade|retail|supermarket|hyper|mall|department/.test(s)) return 'modern_trade';
  if (/restaurant|cafe|hotel|f&b|food|kitchen/.test(s)) return 'restaurant';
  return 'other';
}

/**
 * Why an interval has the value it does:
 *  - legacy_equivalent: the role's timing matches what the legacy label already produced
 *  - explicit_new:      the role's timing is newly stated (the legacy path reached it
 *                       only through the generic 60-day fallback, or not at all)
 *  - named_fallback:    the role has no timing evidence; 60 days is a named default,
 *                       not a computed answer, and it is reported as such
 */
export type IntervalBasis = 'legacy_equivalent' | 'explicit_new' | 'named_fallback';

export interface RoleInterval {
  days: number;
  basis: IntervalBasis;
  note: string;
}

/** v1: one explicit interval per role. No role is left to a silent fallback. */
export const ROLE_REORDER_INTERVALS: Record<CompanyRole, RoleInterval> = {
  foodservice_hotel: { days: 90, basis: 'legacy_equivalent', note: 'Hotel kitchens reorder on a slow cycle; matches the legacy hotel interval.' },
  foodservice_restaurant: { days: 45, basis: 'legacy_equivalent', note: 'Matches the legacy restaurant interval.' },
  bakery_chain: { days: 30, basis: 'legacy_equivalent', note: 'Fast flour/butter cycle; matches the legacy bakery interval.' },
  patisserie_chain: { days: 30, basis: 'legacy_equivalent', note: 'Same production rhythm as a bakery chain.' },
  modern_trade_retail: { days: 30, basis: 'legacy_equivalent', note: 'Matches the legacy modern-trade interval.' },
  cloud_kitchen: { days: 45, basis: 'legacy_equivalent', note: 'Menu-driven like a restaurant; the legacy regex also landed here.' },
  manufacturer: { days: 60, basis: 'explicit_new', note: 'Bulk production buyer. The legacy path reached 60 only via the generic fallback.' },
  importer: { days: 60, basis: 'explicit_new', note: 'Container-scale buying; the legacy fallback value is now stated explicitly.' },
  distributor: { days: 60, basis: 'explicit_new', note: 'Distribution restock cycle; stated explicitly rather than inherited from the fallback.' },
  wholesaler: { days: 60, basis: 'explicit_new', note: 'Wholesale restock cycle; stated explicitly rather than inherited from the fallback.' },
  brand_owner: { days: 60, basis: 'explicit_new', note: 'No order-rhythm evidence yet; same 60 days, now named.' },
  catering: { days: 45, basis: 'explicit_new', note: 'Event-driven demand. Previously fell through to 60; proposed 45 as the restaurant-equivalent, so this one DOES change timing.' },
  unknown: { days: 60, basis: 'named_fallback', note: 'No role evidence: 60 days is a named default, not a measured reorder cadence.' },
};

export function accountTypeForPolicy(c: ClassifiableCompany, version: ReorderPolicyVersion): AccountType {
  if (version === 'v0-legacy') return legacyAccountTypeForCompany(c);
  return ROLE_TAXONOMY[classifyCompanyRole(c).role].account_type;
}

export function roleForPolicy(c: ClassifiableCompany, version: ReorderPolicyVersion): CompanyRole {
  if (version === 'v0-legacy') {
    // the legacy policy has no role concept; report the v1 label for context only
    return classifyCompanyRole(c).role;
  }
  return classifyCompanyRole(c).role;
}

export function intervalDaysForPolicy(c: ClassifiableCompany, version: ReorderPolicyVersion): number {
  if (version === 'v0-legacy') return LEGACY_ACCOUNT_INTERVAL_DAYS[legacyAccountTypeForCompany(c)];
  return ROLE_REORDER_INTERVALS[classifyCompanyRole(c).role].days;
}

export function intervalBasisForPolicy(c: ClassifiableCompany, version: ReorderPolicyVersion): IntervalBasis | 'legacy' {
  if (version === 'v0-legacy') return 'legacy';
  return ROLE_REORDER_INTERVALS[classifyCompanyRole(c).role].basis;
}
