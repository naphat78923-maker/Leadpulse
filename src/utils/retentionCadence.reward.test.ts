import { describe, it, expect } from 'vitest';
import { drawRetentionReward, REWARD_POOL } from './retentionCadence';

describe('drawRetentionReward', () => {
  it('triggers a win-back draw for slipping tiers (watch / at_risk / dormant)', () => {
    for (const tier of ['watch', 'at_risk', 'dormant'] as const) {
      const draw = drawRetentionReward({ tier, rng: () => 0 });
      expect(draw).not.toBeNull();
      expect(draw!.trigger).toBe('winback_touch');
    }
  });

  it('does not trigger on a healthy account touch (no milestone)', () => {
    expect(drawRetentionReward({ tier: 'healthy', orderCount: 3 })).toBeNull();
  });

  it('triggers a milestone draw on a lucky order count even when healthy', () => {
    const draw = drawRetentionReward({ tier: 'healthy', orderCount: 10, rng: () => 0 });
    expect(draw).not.toBeNull();
    expect(draw!.trigger).toBe('milestone');
  });

  it('win-back takes precedence when both triggers apply', () => {
    const draw = drawRetentionReward({ tier: 'at_risk', orderCount: 25, rng: () => 0 });
    expect(draw!.trigger).toBe('winback_touch');
  });

  it('rng makes the weighted draw deterministic (roll 0 → highest-weight first reward)', () => {
    const draw = drawRetentionReward({ tier: 'watch', rng: () => 0 });
    expect(draw!.option?.id).toBe(REWARD_POOL[0].id);
  });

  it('rng at the top of the range lands on the last reward in the pool', () => {
    const draw = drawRetentionReward({ tier: 'watch', rng: () => 0.999999 });
    expect(draw!.option?.id).toBe(REWARD_POOL[REWARD_POOL.length - 1].id);
  });

  it('non-milestone order counts never trigger on their own', () => {
    expect(drawRetentionReward({ tier: 'healthy', orderCount: 4 })).toBeNull();
    expect(drawRetentionReward({ tier: 'healthy', orderCount: 6 })).toBeNull();
  });
});
