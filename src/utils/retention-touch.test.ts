import { describe, expect, it } from 'vitest';
import type { Company } from '../types/crm';
import { distinctOrderCount, planRetentionTouch } from './retention-touch';

const company = (status: string): Company =>
  ({ id: 'c1', name: 'Synthetic Market', status, tags: [], industry: null } as unknown as Company);

describe('planRetentionTouch', () => {
  it('moves the saved check-in date forward from today for an active customer', () => {
    const plan = planRetentionTouch({ company: company('active_customer'), tier: 'at_risk', orderCount: 3, today: '2026-09-27', rng: () => 0.99 });

    expect(plan?.companyPatch.last_human_touch).toBe('2026-09-27');
    expect(plan!.companyPatch.next_touch_due > '2026-09-27').toBe(true);
  });

  it('draws a reward only on a win-back touch', () => {
    const atRisk = planRetentionTouch({ company: company('active_customer'), tier: 'at_risk', orderCount: 3, today: '2026-09-27', rng: () => 0 });
    const healthy = planRetentionTouch({ company: company('active_customer'), tier: 'healthy', orderCount: 3, today: '2026-09-27', rng: () => 0 });

    expect(atRisk?.reward?.trigger).toBe('winback_touch');
    expect(healthy?.reward).toBeNull();
    // A healthy touch still moves the date — previously it only moved when a reward was drawn.
    expect(healthy?.companyPatch.last_human_touch).toBe('2026-09-27');
  });

  it('leaves accounts outside the retention system alone', () => {
    expect(planRetentionTouch({ company: company('prospect'), tier: 'at_risk', orderCount: 0, today: '2026-09-27' })).toBeNull();
  });
});

describe('distinctOrderCount', () => {
  it('counts distinct orders, falling back to won deals when there is no history', () => {
    expect(distinctOrderCount([
      { order_id: 'A', event_date: '2026-01-01' },
      { order_id: 'A', event_date: '2026-01-01', product_line: 'Butter' },
      { order_id: null, event_date: '2026-02-01', product_line: 'Butter' },
    ], [])).toBe(2);
    expect(distinctOrderCount([], [{}, {}])).toBe(2);
  });
});
