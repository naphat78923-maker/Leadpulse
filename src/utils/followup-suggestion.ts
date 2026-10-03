// ─── Follow-up prompt when logging outreach ───
// Pure. A deal with no follow-up date drops out of every due list once the outreach is
// logged, so the log form points at the first rung of the nudge ladder for it. A prompt
// only: logging a touch never writes the deal's date unless one is chosen.

import type { InteractionEventKind } from './interaction-event';

/** The first nudge rung ("Warm 3d") and the form's first quick date. */
export const SUGGESTED_FOLLOWUP_DAYS = 3;

/** Days until the follow-up to offer, or null when there is nothing to prompt for. */
export function suggestedFollowupDays(input: {
  kind: InteractionEventKind;
  /** the deal's saved follow-up date, if any */
  followupDate: string | null | undefined;
  /** a lane move that carries its own date owns the schedule */
  laneRequiresDate: boolean;
}): number | null {
  if (input.kind !== 'outbound_attempt' || input.laneRequiresDate || input.followupDate) return null;
  return SUGGESTED_FOLLOWUP_DAYS;
}
