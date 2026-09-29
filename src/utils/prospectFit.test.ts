// LeadPulse Intelligence — Slice 2 tests: read-only prospect candidates (part 1).
// (Part 1: membership and judgments. Part 2 below covers ordering + markdown.)

import { describe, it, expect } from 'vitest';
import {
  buildProspectFitReport,
  FIT_THRESHOLD,
  judgmentFromAnswers,
  orderCandidates,
  renderProspectFitMarkdown,
  type ProspectSourceRow,
} from './prospectFit';
import type { LayaFitAnswers } from './laya-buyer-response';

const NOW = new Date('2026-09-11T00:00:00.000Z');

export function row(over: Partial<ProspectSourceRow> & { company_id: string }): ProspectSourceRow {
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

export function answers(choice: 'bakery_patisserie_brands' | 'no_fit', bakery = 0.8): LayaFitAnswers {
  const noul = (value: number) => ({ noul: value, confidence: Math.max(value, 1 - value) });
  return {
    support: {
      plant_based_restaurant_cafe: noul(0.05),
      modern_trade_specialty_retail: noul(0.1),
      bakery_patisserie_brands: noul(choice === 'bakery_patisserie_brands' ? bakery : 0.2),
    },
  };
}

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
    expect(report.corpus.candidates).toBe(1);
    expect(report.candidates[0].company_id).toBe('fresh');
    expect(report.excluded.find((e) => e.company_id === 'buyer')!.reason).toContain('already has buying evidence');
  });

  it('excludes non-prospect statuses with the stated status', () => {
    const report = buildProspectFitReport(
      [
        row({ company_id: 'lost', status: 'lost', industry: 'Vegan restaurant' }),
        row({ company_id: 'ok', industry: 'Vegan restaurant' }),
      ],
      { source: 'test', now: NOW }
    );
    expect(report.corpus.excluded_not_a_prospect).toBe(1);
    expect(report.corpus.candidates).toBe(1);
    expect(report.excluded.find((e) => e.company_id === 'lost')!.reason).toContain('status is "lost", not a prospect');
  });

  it('pre-gates institutional identities so schools never spend an inference pass', () => {
    const report = buildProspectFitReport(
      [
        row({ company_id: 'school', name: 'Pastry school', industry: 'Pastry school' }),
        row({ company_id: 'attached', name: 'Bake School', industry: 'Bakery / baking school' }),
        row({ company_id: 'catering', industry: 'International school catering' }),
        row({ company_id: 'regular', industry: 'Vegan restaurant' }),
      ],
      { source: 'test', now: NOW }
    );
    expect(report.corpus.excluded_institutional).toBe(1);
    expect(report.excluded.find((e) => e.company_id === 'school')!.reason).toContain('institutional identity');
    expect(report.candidates.map((c) => c.company_id).sort()).toEqual(['attached', 'catering', 'regular']);
    expect(report.reconciliation.ok).toBe(true);
  });
});


describe('judgmentFromAnswers', () => {
  const at = new Date('2026-09-29T00:00:00Z');

  it('picks the highest fit Noul at or above the threshold, with its published name', () => {
    const j = judgmentFromAnswers('c1', answers('bakery_patisserie_brands', 0.82), at);
    expect(j.archetype_id).toBe('bakery_patisserie_brands');
    expect(j.archetype_name).toBeTruthy();
    expect(j.archetype_confidence).toBe(0.82);
    expect(j.support).toEqual({
      plant_based_restaurant_cafe: 0.05,
      modern_trade_specialty_retail: 0.1,
      bakery_patisserie_brands: 0.82,
    });
    expect(j.judged_at).toBe(at.toISOString());
  });

  it('is no_fit with a null name when no Noul reaches the threshold', () => {
    const j = judgmentFromAnswers('c1', answers('bakery_patisserie_brands', FIT_THRESHOLD - 0.01), at);
    expect(j.archetype_id).toBe('no_fit');
    expect(j.archetype_name).toBeNull();
    expect(j.archetype_confidence).toBeCloseTo(1 - (FIT_THRESHOLD - 0.01));
  });

  it('counts a Noul exactly at the threshold as a fit', () => {
    expect(judgmentFromAnswers('c1', answers('bakery_patisserie_brands', FIT_THRESHOLD), at).archetype_id)
      .toBe('bakery_patisserie_brands');
  });

  it('breaks two supported archetypes by the higher Noul', () => {
    const both = answers('bakery_patisserie_brands', 0.85);
    both.support.modern_trade_specialty_retail = { noul: 0.82, confidence: 0.82 };
    expect(judgmentFromAnswers('c1', both, at).archetype_id).toBe('bakery_patisserie_brands');
  });
});

describe('orderCandidates', () => {
  const candidates = buildProspectFitReport(
    [
      row({ company_id: 'a', name: 'Alpha', industry: 'Retail' }),
      row({ company_id: 'b', name: 'Beta', industry: 'Retail' }),
      row({ company_id: 'c', name: 'Gamma', industry: 'Retail' }),
    ],
    { source: 'test', now: NOW }
  ).candidates;

  const judged = (company_id: string, confidence: number) => ({
    company_id,
    archetype_id: 'bakery_patisserie_brands' as const,
    archetype_name: 'Bakery, patisserie and multi-line dessert brands',
    archetype_confidence: confidence,
    support: {
      plant_based_restaurant_cafe: 0.05,
      modern_trade_specialty_retail: 0.05,
      bakery_patisserie_brands: confidence,
    },
    judged_at: '2026-09-11T00:00:00.000Z',
  });

  it('orders judged by archetype confidence first, then unjudged by name', () => {
    const { queue, droppedNoFit } = orderCandidates(candidates, {
      a: judged('a', 0.4),
      c: judged('c', 0.9),
    });
    expect(droppedNoFit).toEqual([]);
    expect(queue.map((c) => c.company_id)).toEqual(['c', 'a', 'b']);
  });

  it('drops judged no_fit rows with a stated list, never silently', () => {
    const { queue, droppedNoFit } = orderCandidates(candidates, {
      b: { ...judged('b', 0.9), archetype_id: 'no_fit', archetype_name: null },
    });
    expect(queue.map((c) => c.company_id)).toEqual(['a', 'c']);
    expect(droppedNoFit.map((c) => c.company_id)).toEqual(['b']);
  });

describe('renderProspectFitMarkdown', () => {
  it('states that it is read-only, carries no judgments, and drops the score language', () => {
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
    expect(md).toContain('judge them in the app for archetype and role support');
    expect(md).not.toContain('by transparent score');
    expect(md).not.toContain('criteria hits (textual, unverified)');
    expect(md).toContain('## Everything excluded, and why');
  });

  it('prints the gap when a candidate has no contact route', () => {
    const md = renderProspectFitMarkdown(
      buildProspectFitReport([row({ company_id: 'a', name: 'Reachable? Co', industry: 'Vegan restaurant' })], { source: 'test', now: NOW })
    );
    expect(md).toContain('gap: no contact route at all');
  });
});
});