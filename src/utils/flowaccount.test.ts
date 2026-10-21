import { describe, expect, it } from 'vitest';
import { flowDate, parseCsv, parseFlowAccountSales } from './flowaccount';

// Shaped like FlowAccount's รายงานยอดขาย export (names and amounts made up).
const REPORT = [
  '﻿รายงานยอดขาย,,,,,,',
  'ชื่อบริษัท,"VG saveur co.,ltd.",,,,,',
  'เลขผู้เสียภาษี :,0000000000000,,,,,',
  'ช่วงเวลา :,มกราคม-ธันวาคม 2026,,,,,',
  ',,,,สกุลเงินอื่น,,',
  'ลำดับที่,เลขที่เอกสาร,วัน/เดือน/ปี,ชื่อลูกค้า,สกุลเงินในเอกสาร,อัตราแลกเปลี่ยน,ยอดรวมสุทธิ',
  '1,INV2026090003,07/09/2026,บริษัท ทดสอบ  จำกัด,THB,1.00,"2,200.00"',
  '2,INV2026090002,05/09/2026,"TEST BAKERY CO., LTD.",USD,34.50,100.00',
  '3,CN2026090001,04/09/2026,บริษัท ทดสอบ จำกัด,THB,1.00,-200.00',
  '4,INV2026090003,07/09/2026,บริษัท ทดสอบ จำกัด,THB,1.00,"2,200.00"',
  ',,,,,รวม,"2,100.00"',
  '',
].join('\r\n');

describe('parseFlowAccountSales', () => {
  it('reads every document after the title lines, skipping the totals line and repeats', () => {
    const result = parseFlowAccountSales(REPORT);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.skipped).toBe(2);
    expect(result.rows).toEqual([
      { document_no: 'INV2026090003', date: '2026-09-07', customer_name: 'บริษัท ทดสอบ จำกัด', currency: 'THB', fx_rate: 1, amount_original: 2200 },
      { document_no: 'INV2026090002', date: '2026-09-05', customer_name: 'TEST BAKERY CO., LTD.', currency: 'USD', fx_rate: 34.5, amount_original: 100 },
      { document_no: 'CN2026090001', date: '2026-09-04', customer_name: 'บริษัท ทดสอบ จำกัด', currency: 'THB', fx_rate: 1, amount_original: -200 },
    ]);
  });

  it('accepts English headers', () => {
    const result = parseFlowAccountSales('No.,Document No.,Date,Customer Name,Currency,Exchange Rate,Grand Total\n1,INV2026100001,01/10/2026,Cafe,THB,1,500');
    expect(result.ok && result.rows[0]).toMatchObject({ document_no: 'INV2026100001', date: '2026-10-01', amount_original: 500 });
  });

  it('says what to export when the file is something else', () => {
    const result = parseFlowAccountSales('name,email\nPat,pat@example.com');
    expect(result).toEqual({ ok: false, error: expect.stringContaining('sales report') });
    expect(parseFlowAccountSales(REPORT.split('\r\n').slice(0, 6).join('\n'))).toEqual({ ok: false, error: 'No invoices found in this file.' });
  });
});

describe('helpers', () => {
  it('parses quoted CSV fields with commas, quotes and newlines', () => {
    expect(parseCsv('a,"b, c","say ""hi""","two\nlines"\n1,2')).toEqual([['a', 'b, c', 'say "hi"', 'two\nlines'], ['1', '2']]);
  });

  it('reads day-first dates, Buddhist-era years included, and rejects impossible ones', () => {
    expect(flowDate('22/08/2026')).toBe('2026-08-22');
    expect(flowDate('2/9/2569')).toBe('2026-09-02');
    expect(flowDate('31/02/2026')).toBeNull();
    expect(flowDate('2026-08-22')).toBeNull();
  });
});
