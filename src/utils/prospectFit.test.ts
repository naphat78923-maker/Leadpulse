// LeadPulse Intelligence — Slice 2 tests: read-only prospect fit.
//
// Fixtures are synthetic. The invariants that matter: nothing is created, nobody
// already buying is offered as a prospect, every account is either a candidate or
// an explained exclusion, and a role with no published archetype is never smuggled
// into a campaign.

import { describe, it, expect } from 'vitest';
import {
  buildProspectFitReport,
  renderProspectFitMarkdown,
  scoreFit,
  type ProspectSourceRow,
} from './prospectFit';
import { CAMPAIGN_ARCHETYPES_V1 } from './campaignArchetypes';

const NOW = new Date('2026-09-11T00:00:00.000Z');

function row(over: Partial<ProspectSourceRow> & { company_id: string }): ProspectSourceRow {
  return {
    name: `Company ${over.company_id}`,
    status: 'prospect',
    industry: null,
    tags: null,
    website: 'https://example.com',
    won_deals: 0,
    order_events: 0,
    internal_activity: 0,
    customer_facing_activity: 0,
    inbound_responses: 0,
    positive_contact_outcomes: 0,
    meetings: 0,
    contact_named: 0,
    contact_any_route: 0,
    ...over,
  };
}

const restaurantArchetype = CAMPAIGN_ARCHETYPES_V1.find((a) => a.id === 'plant_based_restaurant_cafe')!;

describe('scoreFit', () => {
  it('awards the base for the role match and records it as a reason', () => {
    const s = scoreFit(row({ company_id: 'a', industry: 'Vegan restaurant' }), restaurantArchetype, 'high');
    expect(s.score).toBeGreaterThanOrEqual(40);
    expect(s.reasons.join(' ')).toContain('covered by this archetype');
    expect(s.reasons.join(' ')).toContain('high-confidence');
  });

  it('records criteria signal hits as TEXTUAL, and adds a gap when none match', () => {
    const hit = scoreFit(row({ company_id: 'a', industry: 'Vegan cafe', tags: ['plant-based'] }), restaurantArchetype, 'high');
    expect(hit.hits).toContain('plant-based or vegan concept');

    const miss = scoreFit(row({ company_id: 'b', industry: 'Restaurant' }), restaurantArchetype, 'high');
    expect(miss.hits).toEqual([]);
    expect(miss.gaps.join(' ')).toContain('no archetype criterion signal matched');
  });

  it('ranks a named contact above a bare route, and both above nothing', () => {
    const base = { industry: 'Vegan restaurant' };
    const named = scoreFit(row({ company_id: 'a', ...base, contact_named: 1, contact_any_route: 1 }), restaurantArchetype, 'high');
    const routed = scoreFit(row({ company_id: 'b', ...base, contact_any_route: 1 }), restaurantArchetype, 'high');
    const none = scoreFit(row({ company_id: 'c', ...base }), restaurantArchetype, 'high');
    expect(named.score).toBeGreaterThan(routed.score);
    expect(routed.score).toBeGreaterThan(none.score);
    expect(none.gaps.join(' ')).toContain('no contact route at all');
  });

  it('flags a low-confidence role rather than trusting it', () => {
    const s = scoreFit(row({ company_id: 'a', industry: 'Food & Beverage', tags: ['vegan'] }), restaurantArchetype, 'low');
    expect(s.gaps.join(' ')).toContain('low-confidence');
  });
});

describe('buildProspectFitReport', () => {
  it('never offers an account that already has buying evidence, and says why', () => {
    const report = buildProspectFitReport(
      [
        row({ company_id: 'buyer', industry: 'Vegan restaurant', order_events: 4, contact_named: 1 }),
        row({ company_id: 'won', industry: 'Vegan restaurant', won_deals: 1 }),
        row({ company_id: 'fresh', industry: 'Vegan restaurant', contact_named: 1 }),
      ],
      { source: 'test', now: NOW }
    );
    expect(report.corpus.excluded_already_buying).toBe(2);
    expect(report.fits.map((f) => f.company_id)).toEqual(['fresh']);
    const reason = report.excluded.find((e) => e.company_id === 'buyer')!.reason;
    expect(reason).toContain('already has buying evidence');
  });

  it('excludes non-prospects and roles with no published archetype', () => {
    const report = buildProspectFitReport(
      [
        row({ company_id: 'customer', status: 'active_customer', industry: 'Vegan restaurant' }),
        // hotels have no PUBLISHED archetype: their hypothesis is withheld
        row({ company_id: 'hotel', industry: 'Luxury hotel / dining' }),
      ],
      { source: 'test', now: NOW }
    );
    expect(report.corpus.excluded_not_a_prospect).toBe(1);
    expect(report.corpus.excluded_no_archetype).toBe(1);
    expect(report.fits).toEqual([]);
    expect(report.excluded.find((e) => e.company_id === 'hotel')!.reason).toContain('no published archetype covers role "foodservice_hotel"');
  });

  it('accounts for every row: candidate or explained exclusion, never dropped', () => {
    const rows = [
      row({ company_id: 'a', industry: 'Vegan restaurant' }),
      row({ company_id: 'b', industry: 'Bakery chain', tags: ['bakery', 'chain'] }),
      row({ company_id: 'c', order_events: 2, industry: 'Vegan restaurant' }),
      row({ company_id: 'd', status: 'lost', industry: 'Vegan restaurant' }),
      row({ company_id: 'e', industry: 'Luxury hotel' }),
    ];
    const report = buildProspectFitReport(rows, { source: 'test', now: NOW });
    expect(report.reconciliation.ok).toBe(true);
    expect(report.reconciliation.problems).toEqual([]);
    const { candidates, excluded_already_buying, excluded_not_a_prospect, excluded_no_archetype } = report.corpus;
    expect(candidates + excluded_already_buying + excluded_not_a_prospect + excluded_no_archetype).toBe(rows.length);
    expect(report.excluded.length).toBe(rows.length - candidates);
  });

  it('ranks candidates by score, highest first', () => {
    const report = buildProspectFitReport(
      [
        row({ company_id: 'weak', industry: 'Vegan restaurant' }),
        row({ company_id: 'strong', industry: 'Vegan cafe / bakery', tags: ['plant-based', 'patisserie'], contact_named: 1, contact_any_route: 1 }),
      ],
      { source: 'test', now: NOW }
    );
    expect(report.fits[0].company_id).toBe('strong');
    expect(report.fits[0].fit_score).toBeGreaterThan(report.fits[1].fit_score);
  });

  it('summarises candidates per archetype with reachability and prior work', () => {
    const report = buildProspectFitReport(
      [
        row({ company_id: 'a', industry: 'Vegan restaurant', contact_named: 1 }),
        row({ company_id: 'b', industry: 'Vegan restaurant', meetings: 2 }),
        row({ company_id: 'c', industry: 'Bakery chain', tags: ['bakery'] }),
      ],
      { source: 'test', now: NOW }
    );
    const resto = report.by_archetype.find((a) => a.archetype_id === 'plant_based_restaurant_cafe')!;
    expect(resto.candidates).toBe(2);
    expect(resto.with_named_contact).toBe(1);
    expect(resto.untouched).toBe(1);
  });
});

describe('renderProspectFitMarkdown', () => {
  it('states that it is read-only and that signals are unverified', () => {
    const md = renderProspectFitMarkdown(
      buildProspectFitReport([row({ company_id: 'a', name: 'Example Vegan Cafe', industry: 'Vegan cafe', contact_named: 1 })], {
        source: 'test',
        now: NOW,
      })
    );
    expect(md).toContain('READ-ONLY — nothing was created');
    expect(md).toContain('candidate set, not an outbound queue');
    expect(md).toContain('no suppression list exists yet');
    expect(md).toContain('Example Vegan Cafe');
    expect(md).toContain('criteria hits (textual, unverified)');
    expect(md).toContain('## Everything excluded, and why');
  });

  it('prints the gap when a candidate has no contact route', () => {
    const md = renderProspectFitMarkdown(
      buildProspectFitReport([row({ company_id: 'a', name: 'Reachable? Co', industry: 'Vegan restaurant' })], { source: 'test', now: NOW })
    );
    expect(md).toContain('gap: no contact route at all');
  });
});
