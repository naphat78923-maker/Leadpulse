// One authoritative deal schedule.
//
// `deals.next_action` + `deals.followup_date` are the deal's CURRENT schedule: the action
// board, the detail panel and the due/overdue queues all read them. A `meetings.followup_date`
// is the intent recorded on that individual interaction — history, not a competing schedule.
//
// The three operations are deliberately distinct, because a single optional date field cannot
// express them: an empty field must never be read as "clear".
import type { Deal } from '@/types/crm';
// Relative `.ts` import on purpose: the Node-run report scripts load these modules directly.
import { isDateKey } from './business-time.ts';

export type ScheduleMode = 'preserve' | 'replace' | 'clear';

export type ScheduleIntent =
  | { mode: 'preserve' }
  | { mode: 'replace'; date: string }
  | { mode: 'clear' };

export interface DealSchedule {
  next_action: string | null;
  followup_date: string | null;
}

export function currentDealSchedule(deal: Deal): DealSchedule {
  return {
    next_action: deal.next_action?.trim() || null,
    followup_date: deal.followup_date || null,
  };
}

export function formatScheduleDate(date?: string | null): string {
  if (!isDateKey(date)) return 'no date';
  const [year, month, day] = (date as string).split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** One line a form can show BEFORE it changes anything. */
export function describeDealSchedule(schedule: DealSchedule): string {
  return `${schedule.next_action || 'No next action'} · ${formatScheduleDate(schedule.followup_date)}`;
}

export function validateScheduleIntent(intent: ScheduleIntent): string | null {
  if (intent.mode === 'replace' && !isDateKey(intent.date)) {
    return 'Choose a follow-up date before replacing the schedule.';
  }
  return null;
}

/**
 * The deal patch a schedule intent produces. `preserve` and a meaningless `clear` write nothing
 * at all, so a field the user did not touch can never erase a schedule.
 */
export function scheduleUpdateForIntent(
  deal: Deal | null | undefined,
  intent: ScheduleIntent
): Partial<Deal> {
  if (!deal) return {};
  if (intent.mode === 'replace') {
    return isDateKey(intent.date) ? { followup_date: intent.date } : {};
  }
  if (intent.mode === 'clear') {
    return deal.followup_date ? { followup_date: null } : {};
  }
  return {};
}
