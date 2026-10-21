import { describe, expect, it } from 'vitest';
import { monthLabel, rhythmStatus, shortCustomerName, shortDate, splitRegulars, usualMonth, type CustomerRhythm } from './sales-rhythm';

const base: CustomerRhythm = {
  customer_id: 'c', name_en: 'Cafe Co., Ltd.', name_th: null, crm_company_id: null,
  order_count: 10, first_order: '2025-01-01', last_order: '2026-10-01', median_gap_days: 14, median_value: 2000,
};
const at = (last_order: string, extra: Partial<CustomerRhythm> = {}) => rhythmStatus({ ...base, last_order, ...extra }, '2026-10-21');

describe('rhythmStatus', () => {
  it('places a 14-day buyer by days since their last order', () => {
    expect(at('2026-10-10')).toMatchObject({ status: 'on_track', expected: '2026-10-24', daysSinceLast: 11 });
    expect(at('2026-10-02').status).toBe('due');   // 19 days: within a week past
    expect(at('2026-09-25').status).toBe('late');  // 26 days
    expect(at('2026-08-24').status).toBe('quiet'); // 58 days: over three rhythms
  });

  it('gives slow buyers room before calling them quiet', () => {
    expect(at('2026-07-01', { median_gap_days: 61 }).status).toBe('late');  // 112 days
    expect(at('2026-03-25', { median_gap_days: 61 }).status).toBe('quiet'); // 210 days
  });

  it('treats a customer without a rhythm as on track until 180 days pass', () => {
    expect(at('2026-06-01', { median_gap_days: null })).toMatchObject({ status: 'on_track', expected: null });
    expect(at('2026-01-01', { median_gap_days: null }).status).toBe('quiet');
  });
});

describe('splitRegulars', () => {
  it('lists late before due before on track, leaves out one-off buyers, and ranks quiet by value', () => {
    const rows = [
      { ...base, customer_id: 'ontrack', last_order: '2026-10-15' },
      { ...base, customer_id: 'late', last_order: '2026-09-25' },
      { ...base, customer_id: 'due', last_order: '2026-10-02' },
      { ...base, customer_id: 'oneoff', order_count: 2, last_order: '2026-01-01' },
      { ...base, customer_id: 'quiet-small', last_order: '2025-01-01', median_value: 500 },
      { ...base, customer_id: 'quiet-big', last_order: '2025-01-01', median_value: 5000 },
    ];
    const { regulars, quiet } = splitRegulars(rows, '2026-10-21');
    expect(regulars.map((r) => r.customer_id)).toEqual(['late', 'due', 'ontrack']);
    expect(quiet.map((r) => r.customer_id)).toEqual(['quiet-big', 'quiet-small']);
  });
});

describe('usualMonth', () => {
  it('takes the median of past months, ignoring the month in progress', () => {
    const months = [
      { month: '2026-06-01', amount: 142000 }, { month: '2026-07-01', amount: 40000 },
      { month: '2026-08-01', amount: 29000 }, { month: '2026-10-01', amount: 1000 },
    ];
    expect(usualMonth(months, '2026-10-01')).toBe(40000);
    expect(usualMonth([], '2026-10-01')).toBeNull();
  });
});

describe('shortCustomerName', () => {
  it('drops legal suffixes and head office', () => {
    expect(shortCustomerName('Healthy Lux Co., Ltd. (Head Office)')).toBe('Healthy Lux');
    expect(shortCustomerName('Graph Quarter Ltd., Part.')).toBe('Graph Quarter');
    expect(shortCustomerName('OHTL Public Company Limited')).toBe('OHTL');
  });
});

describe('dates', () => {
  it('writes Sep, not Sept', () => {
    expect(shortDate('2026-09-07')).toBe('7 Sep');
    expect(shortDate('2025-10-10', true)).toBe('10 Oct 2025');
    expect(monthLabel('2026-09-01')).toBe('Sep 2026');
  });
});
