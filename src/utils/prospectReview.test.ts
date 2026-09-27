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
  judgmentOptions,
  READINESS_DIMENSIONS,
  type ProspectReviewInput,
} from './prospectReview.ts';

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

  const judgedC1 = {
    company_id: 'c1',
    archetype_id: 'plant_based_restaurant_cafe' as const,
    archetype_name: 'Plant-based restaurant and cafe kitchens',
    archetype_confidence: 0.85,
    probabilities: {
      plant_based_restaurant_cafe: 0.85,
      modern_trade_specialty_retail: 0.05,
      bakery_patisserie_brands: 0.05,
      no_fit: 0.05,
    },
    role_support: 0.15,
    role_support_confidence: 0.85,
    judged_at: '2026-09-26T00:00:00.000Z',
  };

  it('returns everything when no filter is applied', () => {
    expect(filterProspects(report.candidates, {}, {})).toHaveLength(report.candidates.length);
  });

  it('filters by search text over name, industry and tags — never by keyword guess', () => {
    expect(filterProspects(report.candidates, { query: 'sunny' }, {}).map((f) => f.company_id)).toEqual(['c2']);
    expect(filterProspects(report.candidates, { query: 'bakery chain' }, {}).map((f) => f.company_id)).toEqual(['c2']);
  });

  it('searches the judged archetype name only when a judgment exists', () => {
    expect(filterProspects(report.candidates, { query: 'cafe kitchens' }, {}).map((f) => f.company_id)).toEqual([]);
    expect(filterProspects(report.candidates, { query: 'cafe kitchens' }, { c1: judgedC1 }).map((f) => f.company_id)).toEqual(['c1']);
  });

  it('filters by judgment state without touching the reachability filter', () => {
    expect(filterProspects(report.candidates, { judgment: 'unjudged' }, {}).map((f) => f.company_id).sort()).toEqual(['c1', 'c2']);
    expect(filterProspects(report.candidates, { judgment: 'unjudged' }, { c1: judgedC1 }).map((f) => f.company_id)).toEqual(['c2']);
    expect(filterProspects(report.candidates, { judgment: 'judged' }, { c1: judgedC1 }).map((f) => f.company_id)).toEqual(['c1']);
    // an empty judgment filter is no constraint at all
    expect(filterProspects(report.candidates, { judgment: '' }, { c1: judgedC1 })).toHaveLength(report.candidates.length);
  });

  it('filters by reachability', () => {
    expect(filterProspects(report.candidates, { reachability: 'none' }).map((f) => f.company_id).sort()).toEqual(['c1', 'c2']);
    expect(filterProspects(report.candidates, { reachability: 'named_contact' })).toHaveLength(0);
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

describe('judgment options', () => {
  it('offers only the judgment states actually present, with live counts', () => {
    const report = buildProspectReview(input());
    const empty = judgmentOptions(report.candidates, {});
    expect(empty).toEqual([{ id: 'unjudged', label: 'Not judged yet', count: 1 }]);

    const judged = {
      c1: {
        company_id: 'c1',
        archetype_id: 'bakery_patisserie_brands' as const,
        archetype_name: 'Bakery',
        archetype_confidence: 0.8,
        probabilities: {
          plant_based_restaurant_cafe: 0.05,
          modern_trade_specialty_retail: 0.05,
          bakery_patisserie_brands: 0.8,
          no_fit: 0.1,
        },
        role_support: 0.2,
        role_support_confidence: 0.8,
        judged_at: '2026-09-26T00:00:00.000Z',
      },
    };
    const options = judgmentOptions(report.candidates, judged);
    expect(options).toEqual([{ id: 'judged', label: 'Judged', count: 1 }]);
  });

  it('stays empty-count-free: no option is offered for a state nobody is in', () => {
    const report = buildProspectReview(input());
    for (const o of judgmentOptions(report.candidates, {})) {
      expect(o.count).toBeGreaterThan(0);
    }
  });
});
