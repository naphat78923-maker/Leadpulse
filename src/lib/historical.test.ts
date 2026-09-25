import { describe, expect, it, vi } from 'vitest';
import { rankSignals, getReorderSignals, type ReorderSignalRow } from './historical';
import type { Deal, Meeting } from '@/types/crm';

// This module is pure — no DB is touched — but importing it pulls in the
// Supabase client, whose realtime socket needs Node 22+.
vi.mock('@/lib/supabase', () => ({ supabase: { from: vi.fn() } }));

function row(overrides: Partial<ReorderSignalRow>): ReorderSignalRow {
  return {
    customer_id: 'cust-1',
    name_en: 'Bakery One',
    is_intercompany: false,
    order_count: 6,
    first_order: '2025-01-01',
    last_order: '2026-06-01',
    span_days: 500,
    median_gap_days: 30,
    median_value: 4200,
    days_since_last: 62,
    threshold_days: 30,
    severity_days: 32,
    is_overdue: true,
    crm_company_id: 'company-1',
    match_confidence: 'high',
    ...overrides,
  };
}

const meeting = (company_id: string, date: string) =>
  ({ id: 'm1', company_id, date } as unknown as Meeting);
const deal = (company_id: string, stage: Deal['stage']) =>
  ({ id: 'd1', company_id, stage } as unknown as Deal);

describe('rankSignals', () => {
  it('keeps unlinked historical buyers only when includeUnlinked is set', () => {
    const rows = [row({ customer_id: 'linked' }), row({ customer_id: 'unlinked', crm_company_id: null })];
    expect(rankSignals(rows, [], [], {}).map((s) => s.customerId)).toEqual(['linked']);
    expect(
      rankSignals(rows, [], [], {}, { includeUnlinked: true }).map((s) => s.customerId).sort(),
    ).toEqual(['linked', 'unlinked']);
  });

  it('makes the "not yet in CRM" action reachable for unlinked rows', () => {
    const [signal] = rankSignals(
      [row({ crm_company_id: null })],
      [],
      [],
      {},
      { includeUnlinked: true },
    );
    expect(signal.inCrm).toBe(false);
    expect(signal.suggestedAction).toContain('Not yet in CRM');
  });

  it('carries severity: days past the usual cycle, zero when inside it', () => {
    const [overdue] = rankSignals([row({ days_since_last: 62, threshold_days: 30 })], [], [], {});
    expect(overdue.severityDays).toBe(32);
    expect(overdue.evidence).toContain('32 days past that cycle');

    const [inside] = rankSignals(
      [row({ days_since_last: 12, threshold_days: 30, is_overdue: false })],
      [],
      [],
      {},
    );
    expect(inside.severityDays).toBe(0);
    expect(inside.evidence).toContain('still inside the cycle');
  });

  it('says so honestly for burst buyers with no cycle', () => {
    const [burst] = rankSignals(
      [row({ median_gap_days: 0, threshold_days: 0, days_since_last: 20 })],
      [],
      [],
      {},
    );
    expect(burst.evidence).toContain('Orders arrive in bursts');
  });

  it('hides rows whose dismissal window is still in the future', () => {
    const rows = [row({ customer_id: 'snoozed' })];
    expect(rankSignals(rows, [], [], { snoozed: Date.now() + 86400000 })).toHaveLength(0);
    expect(rankSignals(rows, [], [], { snoozed: Date.now() - 86400000 })).toHaveLength(1);
  });

  it('suppresses accounts already contacted inside their reorder window', () => {
    const today = new Date().toISOString().slice(0, 10);
    const rows = [row({ customer_id: 'fresh' })];
    expect(rankSignals(rows, [meeting('company-1', today)], [], {})).toHaveLength(0);
    expect(rankSignals(rows, [meeting('other-company', today)], [], {})).toHaveLength(1);
  });

  it('suppresses accounts that already have an open deal', () => {
    const rows = [row({ customer_id: 'open' })];
    expect(rankSignals(rows, [], [deal('company-1', 'proposal')], {})).toHaveLength(0);
    expect(rankSignals(rows, [], [deal('company-1', 'closed_won')], {})).toHaveLength(1);
  });

  it('ranks by commercial weight (severity × typical value), not view order', () => {
    const rows = [
      row({ customer_id: 'small', severity_days: 5, median_value: 1000 }),
      row({ customer_id: 'big', severity_days: 40, median_value: 9000 }),
    ];
    expect(rankSignals(rows, [], [], {}).map((s) => s.customerId)).toEqual(['big', 'small']);
  });

  it('getReorderSignals still caps Home at 5 and keeps the CRM gate', () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      row({ customer_id: `c${i}`, crm_company_id: i === 0 ? null : 'company-1' }),
    );
    const teaser = getReorderSignals(rows, [], [], {});
    expect(teaser).toHaveLength(5);
    expect(teaser.every((s) => s.inCrm)).toBe(true);
  });
});
