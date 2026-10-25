// ─── Lane playbooks ───
// Pure. What a deal entering a lane does next, the way HubSpot creates a task when a deal
// enters a stage: a default follow-up date and next action. The lane-move forms start with
// them filled in, and Pat changes or clears them before saving; nothing is written on its own.
//
// Outreach has no playbook: its follow-ups come from the nudge ladder (followup-suggestion.ts).

import type { Deal, DealWorkflowAction } from '@/types/crm';
import { addDaysToDateKey } from './deal-workflow';

export interface LanePlaybook {
  /** days from today to the follow-up */
  days: number;
  /** the next action the lane starts with */
  nextAction: string;
}

/** One place for the defaults: change a lane's days or text here. */
export const LANE_PLAYBOOKS: Partial<Record<DealWorkflowAction, LanePlaybook>> = {
  reply: { days: 2, nextAction: 'Send product sheet / ask for address' },
  sample: { days: 3, nextAction: 'Check the sample arrived' },
  testing: { days: 7, nextAction: 'Ask how the test went' },
  reschedule: { days: 14, nextAction: 'Check in on next steps' },
};

export interface LanePrefill {
  /** the date the form starts with: the deal's own date when it has one, else the lane default */
  followupDate: string | null;
  /** true when followupDate is the lane default, false when it is the deal's saved date */
  dateIsDefault: boolean;
  /** the lane default, also offered when the deal's own date is kept */
  defaultDate: string | null;
  days: number | null;
  nextAction: string | null;
}

/** What a move into `target` starts the form with. A date already on the deal is never replaced. */
export function lanePrefill(
  deal: Pick<Deal, 'followup_date'>,
  target: DealWorkflowAction,
  today: string,
): LanePrefill {
  const saved = deal.followup_date || null;
  const playbook = LANE_PLAYBOOKS[target];
  if (!playbook) return { followupDate: saved, dateIsDefault: false, defaultDate: null, days: null, nextAction: null };
  const defaultDate = addDaysToDateKey(today, playbook.days);
  return {
    followupDate: saved ?? defaultDate,
    dateIsDefault: !saved,
    defaultDate,
    days: playbook.days,
    nextAction: playbook.nextAction,
  };
}
