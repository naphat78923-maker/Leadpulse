// Tests for the Prospect Review screen's shared helpers.
//
// These lock in two things that are easy to get wrong and expensive to get wrong:
//   1. the row-building semantics must stay identical to the CLI report
//      (scripts/prospect-fit-report.ts), because the screen and the report must agree
//   2. dimensions with no approved structured source must report as NOT ASSESSED,
//      never as a fact and never carrying pilot findings

import { describe, it, expect } from 'vitest';
import {
  buildProspectSourceRows,
  buildProspectReview,
  contactAvailability,
  filterProspects,
  classificationFor,
  READINESS_DIMENSIONS,
  segmentForRole,
  segmentOptions,
  type ProspectReviewInput,
} from './prospectReview.ts';
import { COMPANY_ROLES, ROLE_TAXONOMY } from './companyRole.ts';

function input(over: Partial<ProspectReviewInput> = {}): ProspectReviewInput {
  return {
    companies: [
      { id: 'c1', name: 'Green Bowl', status: 'prospect', industry: 'Vegan restaurant', tags: ['vegan'], website: 'https://example.test' },
    ],
    deals: [],
    meetings: [],
    events: [],
    contacts: [],
    ...over,
  };
}

describe('buildProspectSourceRows (must mirror the CLI report)', () => {
  it('counts only closed_won deals as buying evidence', () => {
    const rows = buildProspectSourceRows(
      input({
        deals: [
          { company_id: 'c1', stage: 'closed_won' },
          { company_id: 'c1', stage: 'research' },
          { company_id: 'c1', stage: 'closed_lost' },
        ],
      })
    );
    expect(rows[0].won_deals).toBe(1);
  });

  it('treats internal and direction-less rows as internal activity, never engagement', () => {
    const rows = buildProspectSourceRows(
      input({
        meetings: [
          { company_id: 'c1', outcome: 'positive', direction: 'internal' },
          { company_id: 'c1', outcome: 'positive', direction: null },
          { company_id: 'c1', outcome: 'positive' },
        ],
      })
    );
    expect(rows[0].internal_activity).toBe(3);
    expect(rows[0].customer_facing_activity).toBe(0);
    expect(rows[0].positive_contact_outcomes).toBe(0);
  });

  it('counts an outbound row as activity but not as a response or a positive outcome', () => {
    const rows = buildProspectSourceRows(
      input({ meetings: [{ company_id: 'c1', outcome: 'positive', direction: 'outbound' }] })
    );
    expect(rows[0].customer_facing_activity).toBe(1);
    expect(rows[0].inbound_responses).toBe(0);
  });

  it('counts an inbound response, and a positive outcome only when it is recorded', () => {
    const rows = buildProspectSourceRows(
      input({
        meetings: [
          { company_id: 'c1', outcome: 'positive', direction: 'inbound' },
          { company_id: 'c1', outcome: 'no_response', direction: 'inbound' },
        ],
      })
    );
    expect(rows[0].inbound_responses).toBe(2);
    expect(rows[0].positive_contact_outcomes).toBe(1);
  });

  it('requires identity_quality "named" for a named contact, and any route field for a route', () => {
    const rows = buildProspectSourceRows(
      input({
        contacts: [
          { company_id: 'c1', identity_quality: 'named', email: 'a@b.test', phone: null, line: null },
          { company_id: 'c1', identity_quality: 'unknown', email: null, phone: null, line: '@x' },
          { company_id: 'c1', identity_quality: 'unknown', email: null, phone: null, line: null },
        ],
      })
    );
    expect(rows[0].contact_named).toBe(1);
    expect(rows[0].contact_any_route).toBe(2);
  });

  it('ignores rows with no company_id', () => {
    const rows = buildProspectSourceRows(
      input({ meetings: [{ company_id: null, outcome: 'positive', direction: 'inbound' }] })
    );
    expect(rows[0].meetings).toBe(0);
  });
});

describe('buildProspectReview', () => {
  it('excludes accounts with buying evidence and reconciles the accounting', () => {
    const report = buildProspectReview(
      input({
        companies: [
          { id: 'c1', name: 'Green Bowl', status: 'prospect', industry: 'Vegan restaurant', tags: ['vegan'], website: null },
          { id: 'c2', name: 'Buyer Co', status: 'prospect', industry: 'Vegan cafe', tags: ['vegan'], website: null },
        ],
        events: [{ company_id: 'c2' }],
      })
    );
    expect(report.corpus.accounts).toBe(2);
    expect(report.corpus.candidates).toBe(1);
    expect(report.corpus.excluded_already_buying).toBe(1);
    expect(report.reconciliation.ok).toBe(true);
  });

  it('excludes non-prospect statuses with a reason instead of dropping them', () => {
    const report = buildProspectReview(
      input({
        companies: [
          { id: 'c1', name: 'Green Bowl', status: 'prospect', industry: 'Vegan restaurant', tags: ['vegan'], website: null },
          { id: 'c2', name: 'Gone Away', status: 'lost', industry: 'Vegan restaurant', tags: ['vegan'], website: null },
        ],
      })
    );
    expect(report.corpus.excluded_not_a_prospect).toBe(1);
    expect(report.excluded.some((e) => e.name === 'Gone Away')).toBe(true);
    expect(report.reconciliation.ok).toBe(true);
  });
});

describe('filterProspects', () => {
  const report = buildProspectReview(
    input({
      companies: [
        { id: 'c1', name: 'Green Bowl', status: 'prospect', industry: 'Vegan restaurant', tags: ['vegan'], website: null },
        { id: 'c2', name: 'Sunny Bake', status: 'prospect', industry: 'Bakery chain', tags: ['bakery', 'chain'], website: null },
      ],
    })
  );

  it('returns everything when no filter is applied', () => {
    expect(filterProspects(report.fits, {})).toHaveLength(report.fits.length);
  });

  it('filters by search text', () => {
    expect(filterProspects(report.fits, { query: 'sunny' })).toHaveLength(1);
  });

  it('filters by archetype and returns nothing for a filter nobody matches', () => {
    const first = report.fits[0].archetype_id;
    expect(filterProspects(report.fits, { archetypeId: first }).every((f) => f.archetype_id === first)).toBe(true);
    expect(filterProspects(report.fits, { archetypeId: 'no_such_archetype' })).toHaveLength(0);
  });

  it('filters by reachability', () => {
    expect(filterProspects(report.fits, { reachability: 'none' })).toHaveLength(report.fits.length);
    expect(filterProspects(report.fits, { reachability: 'named_contact' })).toHaveLength(0);
  });
});

describe('contactAvailability', () => {
  it('separates named, route-only and unusable contacts per company', () => {
    const map = contactAvailability([
      { company_id: 'c1', identity_quality: 'named', email: 'a@b.test', phone: null, line: null },
      { company_id: 'c1', identity_quality: 'unknown', email: null, phone: '081', line: null },
      { company_id: 'c1', identity_quality: 'unknown', email: null, phone: null, line: null },
    ]);
    expect(map.get('c1')).toEqual({ named: 1, routeOnly: 1, none: 1, total: 3 });
  });
});

describe('classificationFor', () => {
  it('returns the same role the evaluator used, with evidence', () => {
    const rows = buildProspectSourceRows(input());
    const report = buildProspectReview(input());
    const cls = classificationFor(report.fits[0], rows);
    expect(cls).not.toBeNull();
    expect(cls!.role).toBe(report.fits[0].role);
    expect(cls!.evidence.length).toBeGreaterThan(0);
  });

  it('returns null for a company that is not in the row set', () => {
    const rows = buildProspectSourceRows(input());
    const report = buildProspectReview(input());
    expect(classificationFor({ ...report.fits[0], company_id: 'not-there' }, rows)).toBeNull();
  });
});

describe('readiness dimensions', () => {
  it('keeps exactly three separate dimensions and reports none of them as established', () => {
    expect(READINESS_DIMENSIONS.map((d) => d.key)).toEqual([
      'serviceability',
      'sales_qualification',
      'outreach_authorisation',
    ]);
    for (const d of READINESS_DIMENSIONS) {
      expect(['not_assessed', 'not_started', 'not_authorised']).toContain(d.state);
      expect(d.source.length).toBeGreaterThan(10);
    }
  });

  it('does not smuggle pilot findings or counts into the app', () => {
    const blob = JSON.stringify(READINESS_DIMENSIONS).toLowerCase();
    for (const banned of ['verified route', 'suppression review completed', 'cleared', 'review list', 'pilot']) {
      expect(blob).not.toContain(banned);
    }
  });
});

describe('segments (the scannable short form of a role)', () => {
  it('derives every segment from the one taxonomy, never from a second classification', () => {
    for (const role of COMPANY_ROLES) {
      expect(segmentForRole(role)).toBe(ROLE_TAXONOMY[role].segment);
      expect(segmentForRole(role).length).toBeGreaterThan(0);
      // a segment is a shortening, not a new sentence
      expect(segmentForRole(role).length).toBeLessThanOrEqual(16);
    }
  });

  it('keeps unknown as its own segment instead of folding it into a nearby type', () => {
    const segments = COMPANY_ROLES.map((r) => segmentForRole(r));
    expect(segments).toContain('Unknown');
    expect(segments.filter((s) => s === 'Unknown')).toHaveLength(1);
    expect(segmentForRole('unknown')).not.toBe(segmentForRole('modern_trade_retail'));
  });

  it('offers only the segments present in the candidate set, with live counts', () => {
    const report = buildProspectReview(input());
    const options = segmentOptions(report.fits);
    const expected = new Map<string, number>();
    for (const f of report.fits) {
      const s = segmentForRole(f.role);
      expected.set(s, (expected.get(s) ?? 0) + 1);
    }
    expect(new Set(options.map((o) => o.label))).toEqual(new Set(expected.keys()));
    for (const o of options) expect(o.count).toBe(expected.get(o.label));
    // a segment nobody carries is not offered as an empty option
    expect(options.map((o) => o.label)).not.toContain('Hotel');
  });

  it('filters by segment without touching the archetype or reachability filters', () => {
    const report = buildProspectReview(input());
    const target = segmentForRole(report.fits[0].role);
    const filtered = filterProspects(report.fits, { segment: target });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every((f) => segmentForRole(f.role) === target)).toBe(true);
    expect(filterProspects(report.fits, { segment: 'no such segment' })).toHaveLength(0);
    // an empty segment filter is no constraint at all
    expect(filterProspects(report.fits, { segment: '' })).toHaveLength(report.fits.length);
  });
});
