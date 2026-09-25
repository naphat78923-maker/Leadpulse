import { describe, expect, it } from 'vitest';
import { buildLayaSalesEvidence } from './laya-evidence';

const TODAY = '2026-09-25';

describe('buildLayaSalesEvidence — reviewer panel (never part of the scored request)', () => {
  const deal = {
    product: 'Butter',
    stage: 'contacted' as const,
    value: 30000,
    value_type: 'estimated' as const,
    followup_date: TODAY,
    last_outcome: 'Asked for price',
  };

  it('labels present fields plainly', () => {
    expect(buildLayaSalesEvidence({
      deal,
      company: { industry: 'Bakery', tags: ['bakery', ' foodservice ', ''] },
      today: TODAY,
    })).toEqual({
      industry: 'Bakery',
      tags: 'bakery, foodservice',
      product: 'Butter',
      stage: 'contacted',
      value: 'THB 30,000',
      valueType: 'estimated',
      followup: 'today',
      outcome: 'Asked for price',
    });
  });

  it('labels missing data as unknown rather than inventing values', () => {
    expect(buildLayaSalesEvidence({
      deal: { ...deal, product: '  ', value: null, value_type: null, followup_date: null, last_outcome: null },
      company: undefined,
      today: TODAY,
    })).toEqual({
      industry: 'unknown', tags: 'unknown', product: 'unknown', stage: 'contacted',
      value: 'unknown', valueType: 'unknown', followup: 'unscheduled', outcome: 'unknown',
    });
  });

  it('distinguishes overdue, scheduled and malformed follow-up dates', () => {
    const label = (followup_date: string | null) =>
      buildLayaSalesEvidence({ deal: { ...deal, followup_date }, today: TODAY }).followup;
    expect(label('2026-09-24')).toBe('overdue');
    expect(label('2026-09-26')).toBe('scheduled');
    expect(label('2026-02-30')).toBe('invalid date');
    expect(label(null)).toBe('unscheduled');
  });

  it('accepts a zero value as a real number', () => {
    expect(buildLayaSalesEvidence({ deal: { ...deal, value: 0, value_type: 'committed' }, today: TODAY }).value)
      .toBe('THB 0');
  });
});
