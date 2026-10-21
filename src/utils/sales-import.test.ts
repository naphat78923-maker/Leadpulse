import { describe, expect, it } from 'vitest';
import type { InvoiceRow } from './flowaccount';
import { planImport, rowsToSave, suggestCompany, type PreviewRow } from './sales-import';

const row = (document_no: string, customer_name: string, date: string, amount_original: number, fx_rate = 1): InvoiceRow =>
  ({ document_no, customer_name, date, amount_original, fx_rate, currency: fx_rate === 1 ? 'THB' : 'USD' });
const preview = (document_no: string, extra: Partial<PreviewRow> = {}): PreviewRow => ({
  document_no, already_in: false, customer_id: null, customer_name: null, crm_company_id: null, ...extra,
});
const companies = [{ id: 'hl', name: 'Healthy Lux' }, { id: 'mia', name: 'Mia Restaurant' }, { id: 'v1', name: 'Veganerie' }, { id: 'v2', name: 'Veganerie Concept' }];

describe('planImport', () => {
  it('counts what is already in, groups unlinked customers, and totals invoices without credit notes', () => {
    const rows = [
      row('INV1000001', 'Healthy Lux Co., Ltd.', '2026-09-05', 2000),
      row('INV1000002', 'Mia Restaurant Co., Ltd.', '2026-09-06', 1000),
      row('INV1000003', 'Mia Restaurant Co., Ltd.', '2026-09-20', 1000),
      row('INV1000004', 'บริษัท ใหม่ จำกัด', '2026-09-21', 100, 34.5),
      row('CN10000001', 'Mia Restaurant Co., Ltd.', '2026-09-22', -200),
      row('INV0900009', 'Healthy Lux Co., Ltd.', '2026-08-22', 900),
    ];
    const plan = planImport(rows, [
      preview('INV1000001', { customer_id: 'hl-c', crm_company_id: 'hl' }),
      preview('INV1000002', { customer_id: 'mia-c' }),
      preview('INV1000003', { customer_id: 'mia-c' }),
      preview('INV1000004'),
      preview('CN10000001', { customer_id: 'mia-c' }),
      preview('INV0900009', { already_in: true }),
    ], companies);
    expect(plan.alreadyIn).toBe(1);
    expect(plan.newRows).toHaveLength(5);
    expect(plan.total).toBe(2000 + 1000 + 1000 + 3450);
    expect(plan.toMatch).toEqual([
      { name: 'Mia Restaurant Co., Ltd.', invoices: 3, known: true, suggestedCompanyId: 'mia' },
      { name: 'บริษัท ใหม่ จำกัด', invoices: 1, known: false, suggestedCompanyId: null },
    ]);
  });

  it('carries the account picked for each first-time customer into the saved rows', () => {
    const rows = [row('INV1000002', 'Mia Restaurant Co., Ltd.', '2026-09-06', 1000), row('INV1000003', 'Other', '2026-09-06', 10)];
    const plan = planImport(rows, [preview('INV1000002'), preview('INV1000003')], companies);
    expect(rowsToSave(plan, { 'Mia Restaurant Co., Ltd.': 'mia' }).map((r) => r.crm_company_id)).toEqual(['mia', null]);
  });

  it('suggests the account from the English name on file when FlowAccount writes the Thai one', () => {
    const rows = [row('INV1000002', 'บริษัท มีอา เรสเทอรองต์ จำกัด', '2026-09-06', 2200)];
    const plan = planImport(rows, [preview('INV1000002', { customer_id: 'mia-c', customer_name: 'Mia Restaurant Co., Ltd.' })], companies);
    expect(plan.toMatch[0]).toMatchObject({ known: true, suggestedCompanyId: 'mia' });
  });
});

describe('suggestCompany', () => {
  it('suggests only an unambiguous name match', () => {
    expect(suggestCompany('Healthy Lux Co., Ltd. (Head Office)', companies)).toBe('hl');
    expect(suggestCompany('Veganerie Concept Co., Ltd.', companies)).toBeNull(); // both Veganeries match
    expect(suggestCompany('บริษัท วิสโตร จำกัด', companies)).toBeNull();
  });
});
