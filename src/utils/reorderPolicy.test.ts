// LeadPulse — reorder POLICY tests.
//
// The point of these tests is the separation: classification can improve freely
// while sales timing stays put until someone deliberately flips the policy.

import { describe, it, expect } from 'vitest';
import {
  ACTIVE_REORDER_POLICY,
  REVIEWED_ALTERNATIVE_POLICY,
  LEGACY_ACCOUNT_INTERVAL_DAYS,
  ROLE_REORDER_INTERVALS,
  accountTypeForPolicy,
  intervalBasisForPolicy,
  intervalDaysForPolicy,
  legacyAccountTypeForCompany,
} from './reorderPolicy';
import { COMPANY_ROLES, ROLE_TAXONOMY } from './companyRole';
import { EXPECTED_INTERVAL } from './accountHealth';
import { ACCOUNT_INTERVAL } from './retentionCadence';

describe('policy separation', () => {
  it('ships with the legacy policy ACTIVE, so classification cannot move sales timing', () => {
    // If someone flips this, they must also have reviewed the impact report and
    // changed this expectation deliberately. That is the whole point of the guard.
    expect(ACTIVE_REORDER_POLICY).toBe('v0-legacy');
    expect(REVIEWED_ALTERNATIVE_POLICY).toBe('v1-role-keyed');
    expect(ACTIVE_REORDER_POLICY).not.toBe(REVIEWED_ALTERNATIVE_POLICY);
  });

  it('reproduces the archived render-time classifier verbatim as the legacy policy', () => {
    expect(legacyAccountTypeForCompany({ industry: 'Luxury hotel / dining' })).toBe('hotel');
    expect(legacyAccountTypeForCompany({ industry: 'Artisan bakery' })).toBe('bakery');
    expect(legacyAccountTypeForCompany({ industry: 'premium supermarket' })).toBe('modern_trade');
    expect(legacyAccountTypeForCompany({ name: 'Unlabelled Co' })).toBe('other');
  });

  it('keeps the legacy misclassification in place rather than silently fixing timing', () => {
    // The old regex called a manufacturer a restaurant via /food/. v0-legacy keeps
    // doing exactly that so this commit changes no customer's due date.
    expect(legacyAccountTypeForCompany({ industry: 'Food Manufacturing' })).toBe('restaurant');
    expect(intervalDaysForPolicy({ industry: 'Food Manufacturing' }, 'v0-legacy')).toBe(45);

    // v1 states the manufacturer's own interval instead.
    expect(accountTypeForPolicy({ industry: 'Food Manufacturing' }, 'v1-role-keyed')).toBe('other');
    expect(intervalDaysForPolicy({ industry: 'Food Manufacturing' }, 'v1-role-keyed')).toBe(60);
  });
});

describe('v1 role-keyed intervals', () => {
  it('states an interval for every role, with no role left implicit', () => {
    for (const role of COMPANY_ROLES) {
      const rule = ROLE_REORDER_INTERVALS[role];
      expect(rule, `role ${role} has no interval`).toBeDefined();
      expect(rule.days).toBeGreaterThan(0);
      expect(rule.note.length).toBeGreaterThan(0);
    }
  });

  it('keeps each role interval consistent with its mapped account-type interval', () => {
    for (const role of COMPANY_ROLES) {
      const mapped = ROLE_TAXONOMY[role].account_type;
      expect(ROLE_REORDER_INTERVALS[role].days, `role ${role}`).toBe(LEGACY_ACCOUNT_INTERVAL_DAYS[mapped]);
    }
  });

  it('names the roles that inherit the fallback value instead of implying evidence', () => {
    expect(ROLE_REORDER_INTERVALS.unknown.basis).toBe('named_fallback');
    expect(ROLE_REORDER_INTERVALS.manufacturer.basis).toBe('explicit_new');
    expect(ROLE_REORDER_INTERVALS.importer.basis).toBe('explicit_new');
    expect(ROLE_REORDER_INTERVALS.distributor.basis).toBe('explicit_new');
    expect(ROLE_REORDER_INTERVALS.wholesaler.basis).toBe('explicit_new');
    expect(ROLE_REORDER_INTERVALS.catering.basis).toBe('explicit_new');
    expect(ROLE_REORDER_INTERVALS.bakery_chain.basis).toBe('legacy_equivalent');
    expect(ROLE_REORDER_INTERVALS.foodservice_hotel.basis).toBe('legacy_equivalent');
  });

  it('reports the basis so an interval is never presented as more than it is', () => {
    expect(intervalBasisForPolicy({ name: 'Unlabelled Co' }, 'v1-role-keyed')).toBe('named_fallback');
    expect(intervalBasisForPolicy({ industry: 'Artisan bakery' }, 'v1-role-keyed')).toBe('legacy_equivalent');
    expect(intervalBasisForPolicy({ industry: 'Artisan bakery' }, 'v0-legacy')).toBe('legacy');
  });

  it('is deterministic', () => {
    const c = { name: 'Example Foods', industry: 'Bakery / cake manufacturer' };
    expect(intervalDaysForPolicy(c, 'v1-role-keyed')).toBe(intervalDaysForPolicy(c, 'v1-role-keyed'));
    expect(accountTypeForPolicy(c, 'v1-role-keyed')).toBe(accountTypeForPolicy(c, 'v1-role-keyed'));
  });
});

describe('interval-table parity (anti-drift)', () => {
  it('agrees across the legacy policy, accountHealth, and retentionCadence', () => {
    // Three copies of the same table exist today. This test fails the moment they
    // diverge, so the duplication cannot silently change behaviour.
    expect(EXPECTED_INTERVAL).toEqual(LEGACY_ACCOUNT_INTERVAL_DAYS);
    expect(ACCOUNT_INTERVAL).toEqual(LEGACY_ACCOUNT_INTERVAL_DAYS);
  });
});
