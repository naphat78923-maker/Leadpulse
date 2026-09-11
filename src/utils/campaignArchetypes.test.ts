// LeadPulse Intelligence — Slice 1 Deliverable B tests: the archetype definitions.
//
// These guard the two things Pat cares about here: an archetype cannot exist
// without declared evidence behind it, and committed archetypes cannot smuggle
// live customer data into git.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ARCHETYPE_COUNT_BOUNDS, CAMPAIGN_ARCHETYPES_V1, CONSIDERED_NOT_PUBLISHED_V1 } from './campaignArchetypes';
import { ROLE_TAXONOMY, TAXONOMY_VERSION } from './companyRole';

describe('archetype set', () => {
  it('publishes between three and five archetypes, not a wish list', () => {
    expect(CAMPAIGN_ARCHETYPES_V1.length).toBeGreaterThanOrEqual(ARCHETYPE_COUNT_BOUNDS.min);
    expect(CAMPAIGN_ARCHETYPES_V1.length).toBeLessThanOrEqual(ARCHETYPE_COUNT_BOUNDS.max);
  });

  it('gives every archetype a unique id', () => {
    const ids = CAMPAIGN_ARCHETYPES_V1.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('records the taxonomy version on every archetype', () => {
    for (const a of CAMPAIGN_ARCHETYPES_V1) {
      expect(a.taxonomy_version, `archetype ${a.id}`).toBe(TAXONOMY_VERSION);
    }
  });

  it('targets a real taxonomy role that its own coverage includes', () => {
    for (const a of CAMPAIGN_ARCHETYPES_V1) {
      expect(ROLE_TAXONOMY[a.vertical_role], `archetype ${a.id}`).toBeDefined();
      expect(a.evidence_requirement.roles_covered, `archetype ${a.id}`).toContain(a.vertical_role);
      expect(a.evidence_requirement.roles_covered.length).toBeGreaterThan(0);
    }
  });

  it('demands buying evidence and customer-facing outcome evidence from every archetype', () => {
    for (const a of CAMPAIGN_ARCHETYPES_V1) {
      expect(a.evidence_requirement.min_buying_accounts, `archetype ${a.id}`).toBeGreaterThanOrEqual(1);
      expect(a.evidence_requirement.min_positive_contact_outcomes, `archetype ${a.id}`).toBeGreaterThanOrEqual(1);
      expect(a.evidence_requirement.basis.length, `archetype ${a.id}`).toBeGreaterThan(20);
    }
  });

  it('does not assert a closing mechanism that the evidence does not support', () => {
    // The reconciliation disproved the original claim: the journal says the promo bundle
    // was never confirmed, so no archetype may present it as the reason a win closed.
    for (const a of CAMPAIGN_ARCHETYPES_V1) {
      expect(a.origin_signal.toLowerCase(), `archetype ${a.id}`).not.toContain('promo bundle');
      expect(a.origin_signal.toLowerCase(), `archetype ${a.id}`).not.toContain('closed only after');
    }
  });

  it('states a pain, an offer angle, an origin signal, and real criteria', () => {
    for (const a of CAMPAIGN_ARCHETYPES_V1) {
      expect(a.pain.length, `archetype ${a.id}`).toBeGreaterThan(80);
      expect(a.offer_angle.length, `archetype ${a.id}`).toBeGreaterThan(40);
      expect(a.origin_signal.length, `archetype ${a.id}`).toBeGreaterThan(40);
      expect(a.criteria.length, `archetype ${a.id}`).toBeGreaterThanOrEqual(3);
      expect(a.criteria.every((c) => c.length > 10)).toBe(true);
    }
  });

  it('declares its expected evidence strength so thin evidence is visible', () => {
    const strengths = CAMPAIGN_ARCHETYPES_V1.map((a) => a.evidence_requirement.strength_expectation);
    for (const s of strengths) expect(['well_evidenced', 'emerging', 'single_account']).toContain(s);
    // most of the set must be explicit that its evidence is thin, not sold as proven
    expect(strengths.filter((s) => s !== 'well_evidenced').length).toBeGreaterThanOrEqual(2);
  });

  it('does not publish an archetype whose evidence bar it failed', () => {
    // Withheld, not deleted: the hotel archetype failed its outcome bar when internal
    // workflow rows stopped counting, so it moved to considered-and-not-published.
    expect(CAMPAIGN_ARCHETYPES_V1.map((a) => a.id)).not.toContain('hotel_resort_foodservice');
    const hotel = CONSIDERED_NOT_PUBLISHED_V1.find((c) => c.id === 'hotel_resort_foodservice')!;
    expect(hotel, 'the withheld hotel archetype must still be documented').toBeDefined();
    expect(hotel.roles).toEqual(['foodservice_hotel']);
    expect(hotel.intended_vertical_role).toBe('foodservice_hotel');
    // the failed bar is stated, and it was NOT lowered to keep it published
    expect(hotel.unmet_requirement).toContain('NOT met (0 of 1)');
    expect(hotel.unmet_requirement).toContain('deliberately NOT lowered');
    // the hypothesis survives intact so the thinking is not lost
    expect(hotel.untested_hypothesis!.pain.length).toBeGreaterThan(80);
    expect(hotel.untested_hypothesis!.offer_angle.length).toBeGreaterThan(40);
    expect(hotel.untested_hypothesis!.criteria.length).toBeGreaterThanOrEqual(3);
    expect(hotel.untested_hypothesis!.observed_origin_signal.length).toBeGreaterThan(40);
  });

  it('records what was considered and rejected, with a reason', () => {
    expect(CONSIDERED_NOT_PUBLISHED_V1.length).toBeGreaterThan(0);
    for (const c of CONSIDERED_NOT_PUBLISHED_V1) {
      expect(c.reason.length, `rejected archetype ${c.id}`).toBeGreaterThan(60);
      expect(c.roles.length, `rejected archetype ${c.id}`).toBeGreaterThan(0);
    }
    const rejectedRoles = new Set(CONSIDERED_NOT_PUBLISHED_V1.flatMap((c) => c.roles));
    const publishedRoles = new Set(CAMPAIGN_ARCHETYPES_V1.flatMap((a) => a.evidence_requirement.roles_covered));
    // a role cannot be both published and withheld: that would be a silent contradiction
    for (const role of rejectedRoles) {
      expect(publishedRoles.has(role), `role ${role} is both published and rejected`).toBe(false);
    }
  });
});

describe('committed archetypes carry no live customer data', () => {
  it('embeds no company ids and no recorded won values', () => {
    const src = readFileSync(join(__dirname, 'campaignArchetypes.ts'), 'utf8');
    expect(src).not.toMatch(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/);
    // record ids and money amounts belong in the gitignored evidence report
    expect(src).not.toMatch(/won_value\s*[:=]\s*\d/);
    expect(src).not.toMatch(/\bTHB\b|\b฿/);
  });
});
