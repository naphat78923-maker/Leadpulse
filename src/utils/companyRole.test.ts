// LeadPulse Intelligence — Slice 1 tests: taxonomy v1 classifier.
//
// Fixtures are SYNTHETIC. They reproduce the shapes of real industry/tag values
// (free-text industry, role-ish tags, provenance tags) without carrying real
// company names, ids, or counts. Live corpus results live only in the
// gitignored report artefact, never in this file.

import { describe, it, expect } from 'vitest';
import {
  accountTypeForCompany,
  classifyCompanyRole,
  COMPANY_ROLES,
  ROLE_RULES_FOR_REVIEW,
  ROLE_TAXONOMY,
  TAXONOMY_VERSION,
  type CompanyRole,
} from './companyRole';

describe('classifyCompanyRole — identity matches', () => {
  it('classifies an unambiguous bakery from the industry field', () => {
    const c = classifyCompanyRole({ name: 'Example Bakery', industry: 'Artisan bakery' });
    expect(c.role).toBe('bakery_chain');
    expect(c.account_type).toBe('bakery');
    expect(c.confidence).toBe('high');
    expect(c.ambiguous).toBe(false);
    expect(c.reason_code).toBe('identity_match');
    expect(c.taxonomy_version).toBe(TAXONOMY_VERSION);
    expect(c.source).toBe('derived');
  });

  it('keeps the hotel branch reachable and winning over restaurant wording', () => {
    // The old render-time regex ended with /restaurant|cafe|hotel|f&b|food|kitchen/,
    // whose `hotel` alternative could never fire because the hotel branch already
    // returned. This asserts the hotel role is reachable, and that a
    // hotel-with-restaurants record resolves to the hotel buyer.
    const hotel = classifyCompanyRole({ industry: 'Boutique hotel' });
    expect(hotel.role).toBe('foodservice_hotel');
    expect(hotel.account_type).toBe('hotel');

    const mixed = classifyCompanyRole({ industry: 'Luxury hotel / multi-restaurant dining' });
    expect(mixed.role).toBe('foodservice_hotel');
    expect(mixed.ambiguous).toBe(true);
    expect(mixed.candidates.map((c) => c.role)).toContain('foodservice_restaurant');
  });

  it('treats hospitality and resort wording as hotel foodservice', () => {
    expect(classifyCompanyRole({ industry: 'Hospitality group' }).role).toBe('foodservice_hotel');
    expect(classifyCompanyRole({ industry: 'Island resort' }).role).toBe('foodservice_hotel');
  });
});

describe('classifyCompanyRole — regression: manufacturers are not restaurants', () => {
  it('classifies Food Manufacturing as a manufacturer, not a restaurant', () => {
    // Old behaviour: /food/ in the final branch returned 'restaurant' for a
    // manufacturer. That is the exact defect class this slice removes.
    const c = classifyCompanyRole({ industry: 'Food Manufacturing' });
    expect(c.role).toBe('manufacturer');
    expect(c.account_type).toBe('other');
    expect(accountTypeForCompany({ industry: 'Food Manufacturing' })).not.toBe('restaurant');
  });

  it('prefers manufacturer identity over the bakery and cake words on the same record', () => {
    const c = classifyCompanyRole({ industry: 'Bakery / cake manufacturer / OEM' });
    expect(c.role).toBe('manufacturer');
    expect(c.ambiguous).toBe(true);
    expect(c.candidates.map((x) => x.role)).toEqual(expect.arrayContaining(['bakery_chain', 'patisserie_chain']));
  });

  it('classifies co-packing as a manufacturer', () => {
    expect(classifyCompanyRole({ industry: 'Co-packing' }).role).toBe('manufacturer');
  });

  it('keeps a chain bakery with a factory as a bakery, not a manufacturer', () => {
    // "factory bakery" describes production inside a chain, and the buying role
    // is the chain. The manufacturer words that DO imply identity ('manufactur',
    // 'oem', 'co-pack') still win above.
    const c = classifyCompanyRole({ industry: 'Bakery chain / snack box / factory bakery' });
    expect(c.role).toBe('bakery_chain');
  });
});

describe('classifyCompanyRole — field priority', () => {
  it('lets identity fields outrank channel/provenance tags', () => {
    // A cafe tagged with a bakery-foodservice channel descriptor is still a restaurant.
    const c = classifyCompanyRole({
      industry: '100% vegan cafe',
      tags: ['vegan / bakery foodservice', 'Thailand'],
    });
    expect(c.role).toBe('foodservice_restaurant');
    expect(c.candidates.map((x) => x.role)).toContain('bakery_chain');
    expect(c.reason).toContain('Contested');
  });

  it('falls back to tags when identity fields carry no role wording', () => {
    const c = classifyCompanyRole({ industry: 'Food & Beverage', tags: ['bakery', 'vegan'] });
    expect(c.role).toBe('bakery_chain');
    expect(c.reason_code).toBe('tag_only_match');
    expect(c.confidence).toBe('medium');
    expect(c.evidence[0].field).toBe('tags');
    expect(c.evidence[0].matched_text).toBe('bakery');
  });

  it('distinguishes restaurant, bakery, and retail rows that share one generic industry', () => {
    const generic = (tags: string[]) => classifyCompanyRole({ industry: 'Food & Beverage', tags });
    expect(generic(['restaurant', 'vegan']).role).toBe('foodservice_restaurant');
    expect(generic(['cafe', 'vegan']).role).toBe('foodservice_restaurant');
    expect(generic(['bakery', 'vegan']).role).toBe('bakery_chain');
    expect(generic(['grocery', 'vegan']).role).toBe('modern_trade_retail');
  });
});

describe('classifyCompanyRole — supply chain and channel roles', () => {
  it('classifies a multi-role importer record and exposes the competing roles', () => {
    const c = classifyCompanyRole({
      industry: 'importer/distributor/foodservice (fine foods + gourmet retail)',
    });
    expect(c.role).toBe('importer');
    expect(c.ambiguous).toBe(true);
    expect(c.candidates.map((x) => x.role)).toEqual(expect.arrayContaining(['distributor', 'modern_trade_retail']));
  });

  it('prefers explicit modern trade over the generic wholesale description', () => {
    const c = classifyCompanyRole({ industry: 'Modern trade / wholesale (cash and carry)' });
    expect(c.role).toBe('modern_trade_retail');
    expect(c.candidates.map((x) => x.role)).toContain('wholesaler');
  });

  it('classifies a standalone wholesaler', () => {
    expect(classifyCompanyRole({ industry: 'wholesaler / organic retailer' }).role).toBe('wholesaler');
  });

  it('classifies a scattered retail channel', () => {
    expect(classifyCompanyRole({ industry: 'premium supermarket / gourmet retailer' }).role).toBe('modern_trade_retail');
    expect(classifyCompanyRole({ industry: 'Organic grocery' }).role).toBe('modern_trade_retail');
  });

  it('classifies model-specific foodservice roles', () => {
    expect(classifyCompanyRole({ industry: 'Cloud kitchen operator' }).role).toBe('cloud_kitchen');
    expect(classifyCompanyRole({ industry: 'Event catering producer' }).role).toBe('catering');
  });

  it('does not let a menu word override the business identity', () => {
    // 'dessert' appears in restaurant menus; it must not pull the record to patisserie.
    const c = classifyCompanyRole({ industry: 'Cafe and restaurant chain / dessert menu' });
    expect(c.role).toBe('foodservice_restaurant');
  });

  it('classifies a dessert-brand record as patisserie', () => {
    const c = classifyCompanyRole({ industry: 'Doughnut / dessert brand' });
    expect(c.role).toBe('patisserie_chain');
    expect(c.account_type).toBe('bakery');
  });
});

describe('classifyCompanyRole — unknown is a value, never a silent other', () => {
  it('returns an explicit unknown with no evidence when nothing matches', () => {
    const c = classifyCompanyRole({ name: 'Nimbus Holdings', industry: null, tags: [] });
    expect(c.role).toBe('unknown');
    expect(c.reason_code).toBe('no_role_match');
    expect(c.confidence).toBe('low');
    expect(c.evidence).toEqual([]);
    expect(c.candidates).toEqual([]);
    expect(c.account_type).toBe('other');
  });

  it('flags an institutional buyer as a taxonomy gap rather than forcing a venue role', () => {
    // v1 has no education/institution role. Forcing these into a bakery or
    // restaurant role would be the same silent-collapse error as mapping
    // unknown onto 'other'.
    const c = classifyCompanyRole({ industry: 'Pastry school' });
    expect(c.role).toBe('unknown');
    expect(c.reason_code).toBe('taxonomy_gap');
    expect(c.reason).toMatch(/no role for an educational or institutional buyer/);
    expect(c.candidates.map((x) => x.role)).toContain('patisserie_chain');
  });

  it('never reports unknown with high confidence', () => {
    for (const role of ['unknown'] as CompanyRole[]) {
      expect(ROLE_TAXONOMY[role].account_type).toBe('other');
    }
    const cases = [
      { name: 'Unlabelled Co' },
      { industry: 'Pastry school' },
      { industry: 'Food & Beverage', tags: ['VG Saveur', 'Thailand', 'Butter'] },
    ];
    for (const c of cases) {
      expect(classifyCompanyRole(c).confidence).toBe('low');
    }
  });
});

describe('classifyCompanyRole — Pat override', () => {
  it('honours a stored override and keeps the derived disagreement for audit', () => {
    const base = { industry: 'Organic grocery' };
    const derived = classifyCompanyRole(base);
    expect(derived.role).toBe('modern_trade_retail');

    const overridden = classifyCompanyRole(base, { role: 'distributor', note: 'confirmed on call' });
    expect(overridden.role).toBe('distributor');
    expect(overridden.source).toBe('pat_override');
    expect(overridden.reason_code).toBe('pat_override');
    expect(overridden.confidence).toBe('high');
    expect(overridden.ambiguous).toBe(false);
    expect(overridden.reason).toContain('confirmed on call');
    expect(overridden.candidates.map((c) => c.role)).toContain('modern_trade_retail');
  });

  it('ignores an override that is not in the taxonomy', () => {
    const c = classifyCompanyRole({ industry: 'Artisan bakery' }, { role: 'not_a_role' as CompanyRole });
    expect(c.role).toBe('bakery_chain');
    expect(c.source).toBe('derived');
  });
});

describe('taxonomy invariants', () => {
  it('is deterministic and idempotent for identical input', () => {
    const input = { name: 'Example Foods', industry: 'Bakery / cake manufacturer', tags: ['export'] };
    expect(JSON.stringify(classifyCompanyRole(input))).toBe(JSON.stringify(classifyCompanyRole(input)));
  });

  it('maps every role onto a legacy AccountType so retention cadence keeps working', () => {
    const allowed = ['hotel', 'restaurant', 'bakery', 'modern_trade', 'other'];
    for (const role of COMPANY_ROLES) {
      expect(allowed).toContain(ROLE_TAXONOMY[role].account_type);
    }
    expect(accountTypeForCompany({ industry: 'Doughnut shop' })).toBe('bakery');
    expect(accountTypeForCompany({ industry: 'Cloud kitchen' })).toBe('restaurant');
    expect(accountTypeForCompany({ name: 'Unlabelled Co' })).toBe('other');
  });

  it('gives every non-unknown role at least one rule', () => {
    const rolesWithRules = new Set(ROLE_RULES_FOR_REVIEW.map((r) => r.role));
    for (const role of COMPANY_ROLES) {
      if (role === 'unknown') continue;
      expect(rolesWithRules.has(role)).toBe(true);
    }
  });

  it('keeps rule priorities unique so precedence is never a tie', () => {
    const priorities = ROLE_RULES_FOR_REVIEW.map((r) => r.priority);
    expect(new Set(priorities).size).toBe(priorities.length);
  });

  it('carries evidence on every confident classification', () => {
    const c = classifyCompanyRole({ industry: 'Luxury hotel / afternoon tea' });
    expect(c.role).not.toBe('unknown');
    expect(c.evidence.length).toBeGreaterThan(0);
    expect(c.evidence.every((e) => !!e.matched_text && !!e.rule && !!e.field)).toBe(true);
    expect(c.reason.length).toBeGreaterThan(0);
  });
});
