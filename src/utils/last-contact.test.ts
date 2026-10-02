import { describe, expect, it } from 'vitest';
import { lastContactDates, quietLabel } from './last-contact';

const row = (dealId: string | null, date: string, direction: string) =>
  ({ deal_id: dealId, type: 'email', direction, outcome: null, date });

describe('lastContactDates', () => {
  it('keeps the latest contact per deal, in either direction', () => {
    const dates = lastContactDates([
      row('a', '2026-09-01', 'outbound'), row('a', '2026-09-20T08:00:00Z', 'inbound'), row('a', '2026-09-10', 'outbound'),
      row('b', '2026-08-15', 'outbound'),
    ]);
    expect([...dates]).toEqual([['a', '2026-09-20'], ['b', '2026-08-15']]);
  });

  it('ignores internal notes, rows without a deal and rows without a date', () => {
    const dates = lastContactDates([row('a', '2026-09-20', 'internal'), row(null, '2026-09-20', 'outbound'), row('b', '', 'outbound')]);
    expect(dates.size).toBe(0);
  });
});

describe('quietLabel', () => {
  it('words the time since the last contact', () => {
    expect(quietLabel(undefined, '2026-10-02')).toBe('no contact logged');
    expect(quietLabel('2026-10-02', '2026-10-02')).toBe('contacted today');
    expect(quietLabel('2026-10-01', '2026-10-02')).toBe('quiet 1 day');
    expect(quietLabel('2026-09-20', '2026-10-02')).toBe('quiet 12 days');
  });
});
