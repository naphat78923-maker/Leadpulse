// LeadPulse Intelligence — Slice 1 Deliverable B tests: evidence evaluation.
//
// Fixtures are synthetic. The point of these tests is that an archetype which
// loses its evidence support stops being reported as supported.

import { describe, it, expect } from 'vitest';
import {
  buildArchetypeEvidenceReport,
  evaluateArchetype,
  renderArchetypeEvidenceMarkdown,
  type ArchetypeEvidenceRow,
} from './campaignArchetypeEvidence';
import { CAMPAIGN_ARCHETYPES_V1, type CampaignArchetype } from './campaignArchetypes';

const NOW = new Date('2026-09-11T00:00:00.000Z');

function supportedRows(): ArchetypeEvidenceRow[] {
  return [
    row({ company_id: 'r1', role: 'foodservice_restaurant', won_deals: 1, won_value: 500, positive_outcomes: 4 }),
    row({ company_id: 'r2', role: 'foodservice_restaurant', won_deals: 1, positive_outcomes: 3 }),
    row({ company_id: 'r3', role: 'foodservice_restaurant', won_deals: 1, positive_outcomes: 2 }),
    row({ company_id: 'm1', role: 'modern_trade_retail', won_deals: 1, won_value: 900, positive_outcomes: 1 }),
    row({ company_id: 'm2', role: 'modern_trade_retail', won_deals: 1 }),
    row({ company_id: 'b1', role: 'bakery_chain', won_deals: 1, positive_outcomes: 1 }),
    row({ company_id: 'b2', role: 'patisserie_chain', won_deals: 1 }),
    row({ company_id: 'h1', role: 'foodservice_hotel', won_deals: 1, positive_outcomes: 1 }),
    row({ company_id: 'h2', role: 'foodservice_hotel', order_events: 6 }),
  ];
}

function row(over: Partial<ArchetypeEvidenceRow> & { company_id: string }): ArchetypeEvidenceRow {
  return {
    name: `Account ${over.company_id}`,
    status: 'active_customer',
    role: 'foodservice_restaurant',
    won_deals: 0,
    won_value: 0,
    positive_outcomes: 0,
    negative_outcomes: 0,
    no_response_outcomes: 0,
    order_events: 0,
    ...over,
  };
}

const testArchetype: CampaignArchetype = {
  id: 'test_role',
  name: 'Test archetype',
  taxonomy_version: CAMPAIGN_ARCHETYPES_V1[0].taxonomy_version,
  vertical_role: 'foodservice_restaurant',
  pain: 'A placeholder pain statement long enough to satisfy the shape checks in this suite.',
  criteria: ['one', 'two', 'three'],
  offer_angle: 'A placeholder offer angle that is long enough to be plausible.',
  origin_signal: 'A placeholder origin signal that is long enough to be plausible.',
  evidence_requirement: {
    roles_covered: ['foodservice_restaurant'],
    min_buying_accounts: 3,
    min_positive_outcomes: 5,
    basis: 'Synthetic requirement used only to exercise the evaluator.',
    strength_expectation: 'well_evidenced',
  },
};

describe('evaluateArchetype', () => {
  it('reports an archetype as unsupported when no account has ever bought', () => {
    const r = evaluateArchetype(testArchetype, [row({ company_id: 'a', positive_outcomes: 9 })]);
    expect(r.met).toBe(false);
    expect(r.strength).toBe('unsupported');
    expect(r.problems.join(' ')).toContain('needs 3 proven buying accounts, found 0');
  });

  it('counts recorded order history as proof of buying, not only won deals', () => {
    // The CRM holds active customers with hundreds of order events and no won deal.
    // Requiring a deal would mark real buyers as non-buyers.
    const orderOnly = evaluateArchetype(testArchetype, [
      row({ company_id: 'a', order_events: 12, positive_outcomes: 3 }),
      row({ company_id: 'b', order_events: 4, positive_outcomes: 2 }),
      row({ company_id: 'c', order_events: 1, positive_outcomes: 1 }),
    ]);
    expect(orderOnly.counts.buying_accounts).toBe(3);
    expect(orderOnly.counts.won_accounts).toBe(0);
    expect(orderOnly.counts.order_event_only_accounts).toBe(3);
    expect(orderOnly.met).toBe(true);
    // advisory, not a failure: the gap is in the CRM records, not in demand
    expect(orderOnly.notes.join(' ')).toContain('order history only');
    expect(orderOnly.problems.join(' ')).not.toContain('order history only');
  });

  it('grades evidence strength from the corpus rather than from the label', () => {
    const three = evaluateArchetype(testArchetype, [
      row({ company_id: 'a', won_deals: 1, positive_outcomes: 3 }),
      row({ company_id: 'b', won_deals: 1, positive_outcomes: 2 }),
      row({ company_id: 'c', won_deals: 1, positive_outcomes: 1 }),
    ]);
    expect(three.strength).toBe('well_evidenced');
    expect(three.met).toBe(true);

    const two = evaluateArchetype(testArchetype, [
      row({ company_id: 'a', won_deals: 1, positive_outcomes: 6 }),
      row({ company_id: 'b', won_deals: 1 }),
    ]);
    expect(two.strength).toBe('emerging');

    const one = evaluateArchetype(testArchetype, [row({ company_id: 'a', won_deals: 1, positive_outcomes: 6 })]);
    expect(one.strength).toBe('single_account');
  });

  it('flags an archetype claiming more evidence strength than the corpus shows', () => {
    const one = evaluateArchetype(testArchetype, [row({ company_id: 'a', won_deals: 1, positive_outcomes: 6 })]);
    expect(one.problems.join(' ')).toContain('expects well-evidenced support');
  });

  it('flags a single-account archetype that has outgrown its own claim', () => {
    const thin: CampaignArchetype = {
      ...testArchetype,
      evidence_requirement: { ...testArchetype.evidence_requirement, strength_expectation: 'single_account', min_buying_accounts: 1 },
    };
    const grown = evaluateArchetype(thin, [
      row({ company_id: 'a', won_deals: 1, positive_outcomes: 2 }),
      row({ company_id: 'b', won_deals: 1 }),
      row({ company_id: 'c', won_deals: 1 }),
    ]);
    expect(grown.problems.join(' ')).toContain('revisit the pain statement');
  });

  it('sums only the roles the archetype covers', () => {
    const r = evaluateArchetype(testArchetype, [
      row({ company_id: 'a', role: 'foodservice_restaurant', won_deals: 1, won_value: 100, order_events: 2 }),
      row({ company_id: 'b', role: 'manufacturer', won_deals: 5, won_value: 9999, order_events: 40 }),
    ]);
    expect(r.counts.matched_accounts).toBe(1);
    expect(r.counts.won_value).toBe(100);
    expect(r.counts.order_events).toBe(2);
  });
});

describe('buildArchetypeEvidenceReport', () => {
  it('passes when every published archetype is supported', () => {
    const rows = supportedRows();
    const report = buildArchetypeEvidenceReport(rows, { source: 'test', now: NOW });
    expect(report.reconciliation.ok).toBe(true);
    expect(report.reconciliation.problems).toEqual([]);
    expect(report.reconciliation.unsupported).toBe(0);
    expect(report.reconciliation.published).toBe(CAMPAIGN_ARCHETYPES_V1.length);
    expect(report.corpus.won_accounts_total).toBe(8);
    // the second hotel buyer's proof is order history, not a won deal
    const hotel = report.archetypes.find((a) => a.archetype_id === 'hotel_resort_foodservice')!;
    expect(hotel.counts.buying_accounts).toBe(2);
    expect(hotel.counts.won_accounts).toBe(1);
    expect(hotel.counts.order_event_only_accounts).toBe(1);
  });

  it('fails loudly when an archetype has lost its evidence', () => {
    const rows = [row({ company_id: 'r1', role: 'foodservice_restaurant' })];
    const report = buildArchetypeEvidenceReport(rows, { source: 'test', now: NOW });
    expect(report.reconciliation.ok).toBe(false);
    expect(report.reconciliation.unsupported).toBeGreaterThan(0);
    expect(report.reconciliation.problems.join(' ')).toContain('is not supported by the current corpus');
  });

  it('reports which roles have no won account, so omissions are visible', () => {
    const rows = [
      row({ company_id: 'x', role: 'foodservice_restaurant', won_deals: 1 }),
      row({ company_id: 'y', role: 'distributor' }),
      row({ company_id: 'z', role: 'importer' }),
    ];
    const report = buildArchetypeEvidenceReport(rows, { source: 'test', now: NOW });
    const dist = report.role_coverage.find((r) => r.role === 'distributor')!;
    expect(dist.accounts).toBe(1);
    expect(dist.buying_accounts).toBe(0);
    expect(dist.won_accounts).toBe(0);
    const md = renderArchetypeEvidenceMarkdown(report);
    expect(md).toContain('no proven buyer: no archetype published');
  });
});

describe('renderArchetypeEvidenceMarkdown', () => {
  it('names the supporting accounts and states the requirement', () => {
    const rows = supportedRows().map((r) =>
      r.company_id === 'h1' ? { ...r, name: 'Example Hotel', won_value: 1234 } : r
    );
    const report = buildArchetypeEvidenceReport(rows, { source: 'test', now: NOW });
    const md = renderArchetypeEvidenceMarkdown(report);
    expect(md).toContain('Example Hotel');
    expect(md).toContain('h1');
    expect(md).toContain('supported: **yes**');
    expect(md).toContain('This report contains live customer names and is gitignored by design');
    expect(md).toContain('## Role coverage across the corpus');
    expect(md).toContain('## Considered and deliberately NOT published');
    expect(md).toContain('rejected on evidence');
  });

  it('says plainly when an archetype has nothing behind it', () => {
    const report = buildArchetypeEvidenceReport([row({ company_id: 'a' })], { source: 'test', now: NOW });
    const md = renderArchetypeEvidenceMarkdown(report);
    expect(md).toContain('NOTHING');
    expect(md).toContain('must not be published');
  });
});
