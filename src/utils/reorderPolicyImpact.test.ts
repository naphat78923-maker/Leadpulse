// LeadPulse — reorder POLICY impact report tests.
//
// Fixtures are synthetic; live corpus output lives only in the gitignored report artefact.

import { describe, it, expect } from 'vitest';
import { buildPolicyImpactReport, companyPolicyImpact, renderPolicyImpactMarkdown, type ImpactInputRow } from './reorderPolicyImpact';

const TODAY = '2026-09-11';

function row(over: Partial<ImpactInputRow> & { id: string }): ImpactInputRow {
  return {
    name: `Company ${over.id}`,
    status: 'active_customer',
    industry: null,
    tags: null,
    created_at: '2026-01-01T00:00:00Z',
    last_contact_date: null,
    last_human_touch: '2026-08-01',
    next_touch_due: null,
    meetings: [],
    deals: [],
    events: [],
    ...over,
  };
}

describe('companyPolicyImpact', () => {
  it('shows a longer interval for a manufacturer the legacy regex called a restaurant', () => {
    const r = companyPolicyImpact(row({ id: 'a', industry: 'Food Manufacturing' }), TODAY);
    expect(r.legacy.interval_days).toBe(45);
    expect(r.proposed.interval_days).toBe(60);
    expect(r.interval_delta_days).toBe(15);
    expect(r.interval_direction).toBe('longer');
    expect(r.proposed.basis).toBe('explicit_new');
    expect(r.role).toBe('manufacturer');
  });

  it('shows a shorter interval for catering, which the legacy path sent to the 60-day fallback', () => {
    const r = companyPolicyImpact(row({ id: 'b', industry: 'Event catering' }), TODAY);
    expect(r.legacy.interval_days).toBe(60);
    expect(r.proposed.interval_days).toBe(45);
    expect(r.interval_direction).toBe('shorter');
    expect(r.proposed.basis).toBe('explicit_new');
  });

  it('leaves an unchanged account alone in every dimension', () => {
    const r = companyPolicyImpact(row({ id: 'c', industry: 'Artisan bakery' }), TODAY);
    expect(r.interval_direction).toBe('same');
    expect(r.tier_changed).toBe(false);
    expect(r.due_changed).toBe(false);
  });

  it('does not let a longer interval reach a due date that is pinned by a persisted value', () => {
    const r = companyPolicyImpact(
      row({ id: 'd', industry: 'Food Manufacturing', next_touch_due: '2026-09-20' }),
      TODAY
    );
    expect(r.interval_direction).toBe('longer');
    expect(r.legacy.due_source).toBe('persisted');
    expect(r.due_date_reachable).toBe(false);
    expect(r.due_changed).toBe(false);
    expect(r.due_delta_days).toBe(0);
  });

  it('damps the change when a shorter tier cap is the binding constraint', () => {
    // The cadence uses min(tier interval, account interval). A dormant account is
    // capped at 30 days, below both 45 and 60, so the stated interval moves while
    // the due date does not. This is why the report counts "longer but due
    // unreachable" separately from "longer".
    const r = companyPolicyImpact(row({ id: 'h', industry: 'Food Manufacturing' }), TODAY);
    expect(r.legacy.tier).toBe('dormant');
    expect(r.interval_direction).toBe('longer');
    expect(r.legacy.effective_interval_days).toBe(30);
    expect(r.proposed.effective_interval_days).toBe(30);
    expect(r.due_changed).toBe(false);
  });

  it('moves the due date when the account interval is the binding constraint', () => {
    // A healthy account has a 90-day tier cap, so the account interval (45 -> 60)
    // binds and the due date genuinely moves.
    const healthy = row({
      id: 'e',
      industry: 'Food Manufacturing',
      last_human_touch: '2026-08-25',
      meetings: [
        { date: '2026-08-20', outcome: 'positive' },
        { date: '2026-08-10', outcome: 'positive' },
        { date: '2026-07-20', outcome: 'positive' },
      ],
      events: [
        { date: '2026-07-15', amount: 100000, product_line: 'butter' },
        { date: '2026-08-25', amount: 100000, product_line: 'butter' },
      ],
      next_touch_due: null,
    });
    const r = companyPolicyImpact(healthy, TODAY);
    expect(r.legacy.tier).toBe('healthy');
    expect(r.legacy.effective_interval_days).toBe(45);
    expect(r.proposed.effective_interval_days).toBe(60);
    expect(r.due_date_reachable).toBe(true);
    expect(r.due_changed).toBe(true);
    expect(r.due_delta_days).toBe(15);
  });

  it('changes the health score only where sales history exists to recompute', () => {
    // No events: the frequency sub-score is interval-independent, so tier cannot move.
    const noHistory = companyPolicyImpact(row({ id: 'f', industry: 'Food Manufacturing' }), TODAY);
    expect(noHistory.proposed.score).toBe(noHistory.legacy.score);
    expect(noHistory.tier_changed).toBe(false);

    // Two orders 60 days apart: the frequency sub-score scales with the expected interval.
    const withHistory = companyPolicyImpact(
      row({
        id: 'g',
        industry: 'Food Manufacturing',
        events: [
          { date: '2026-06-01', amount: 1000 },
          { date: '2026-08-01', amount: 1000 },
        ],
      }),
      TODAY
    );
    expect(withHistory.proposed.score).not.toBe(withHistory.legacy.score);
  });
});

describe('buildPolicyImpactReport', () => {
  const rows = [
    row({ id: 'a', industry: 'Food Manufacturing' }),
    row({ id: 'b', industry: 'Event catering' }),
    row({ id: 'c', industry: 'Artisan bakery' }),
    row({ id: 'd', industry: 'Food Manufacturing', next_touch_due: '2026-09-20' }),
    row({ id: 'e', name: 'Unlabelled Co' }),
  ];

  it('accounts for every row and reconciles the direction counts', () => {
    const report = buildPolicyImpactReport(rows, { source: 'test', now: new Date('2026-09-11T00:00:00Z') });
    expect(report.reconciliation.ok).toBe(true);
    expect(report.reconciliation.problems).toEqual([]);
    expect(report.counts.rows_in).toBe(5);
    expect(report.counts.longer + report.counts.shorter + report.counts.same).toBe(report.counts.rows_in);
    expect(report.counts.interval_changed).toBe(report.counts.longer + report.counts.shorter);
    expect(report.active_policy).toBe('v0-legacy');
    expect(report.proposed_policy).toBe('v1-role-keyed');
  });

  it('separates named-fallback rows and counts pinned due dates', () => {
    const report = buildPolicyImpactReport(rows, { source: 'test', now: new Date('2026-09-11T00:00:00Z') });
    expect(report.counts.named_fallback).toBeGreaterThan(0);
    expect(report.counts.due_pinned_by_persisted_value).toBe(1);
    const pinned = report.rows.find((r) => r.id === 'd')!;
    expect(pinned.proposed.basis).toBe('explicit_new');
    expect(report.counts.proposed_longer_but_due_unreachable).toBe(1);
  });

  it('flags duplicate company ids instead of double counting', () => {
    const report = buildPolicyImpactReport([...rows, row({ id: 'a', industry: 'Food Manufacturing' })], {
      source: 'test',
      now: new Date('2026-09-11T00:00:00Z'),
    });
    expect(report.reconciliation.ok).toBe(false);
    expect(report.reconciliation.problems.join(' ')).toContain('duplicate company ids');
  });
});

describe('renderPolicyImpactMarkdown', () => {
  it('lists every affected account, flags LONGER rows, and names the fallback', () => {
    const report = buildPolicyImpactReport(
      [
        row({ id: 'a', name: 'Example Foods', industry: 'Food Manufacturing' }),
        row({ id: 'b', name: 'Example Caterer', industry: 'Event catering' }),
        row({ id: 'c', name: 'Example Bakery', industry: 'Artisan bakery' }),
      ],
      { source: 'test', now: new Date('2026-09-11T00:00:00Z') }
    );
    const md = renderPolicyImpactMarkdown(report);
    expect(md).toContain('ACTIVE policy: **v0-legacy**');
    expect(md).toContain('## All 2 affected accounts');
    expect(md).toContain('Example Foods');
    expect(md).toContain('LONGER');
    expect(md).toContain('Example Caterer');
    expect(md).toContain('SHORTER');
    expect(md).toContain('Unaffected accounts (1)');
    expect(md).toContain('## Retention status changes');
  });

  it('labels a named-fallback account as having no timing evidence', () => {
    const report = buildPolicyImpactReport([row({ id: 'z', name: 'Mystery Co' })], {
      source: 'test',
      now: new Date('2026-09-11T00:00:00Z'),
    });
    const md = renderPolicyImpactMarkdown(report);
    expect(report.rows[0].proposed.basis).toBe('named_fallback');
    expect(md).toContain('NAMED FALLBACK');
  });
});
