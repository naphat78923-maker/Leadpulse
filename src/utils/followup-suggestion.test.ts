import { describe, expect, it } from 'vitest';
import { SUGGESTED_FOLLOWUP_DAYS, suggestedFollowupDays } from './followup-suggestion';

describe('suggestedFollowupDays', () => {
  const base = { kind: 'outbound_attempt' as const, followupDate: null, laneRequiresDate: false };

  it('suggests the first nudge rung for outreach on a deal with no follow-up date', () => {
    expect(suggestedFollowupDays(base)).toBe(SUGGESTED_FOLLOWUP_DAYS);
  });

  it('suggests nothing when the deal already has a date, even a past one', () => {
    expect(suggestedFollowupDays({ ...base, followupDate: '2026-09-01' })).toBeNull();
  });

  it('suggests nothing for a buyer reply or an internal note', () => {
    expect(suggestedFollowupDays({ ...base, kind: 'customer_response' })).toBeNull();
    expect(suggestedFollowupDays({ ...base, kind: 'internal_note' })).toBeNull();
  });

  it('leaves the schedule to a lane move that carries its own date', () => {
    expect(suggestedFollowupDays({ ...base, laneRequiresDate: true })).toBeNull();
  });
});
