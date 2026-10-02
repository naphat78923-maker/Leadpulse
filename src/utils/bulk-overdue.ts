// ─── Bulk actions for overdue deals: the plan, not the write ───
// Pure. Each item carries the deal patch and the snapshot its undo restores, built with
// the same rules a single snooze or park uses. The component applies them one by one with
// the version check, so a deal changed in the meantime is skipped rather than overwritten.

import type { Deal } from '@/types/crm';
import { buildCloseUpdate } from './deal-close';
import { addDaysToDateKey } from './deal-workflow';

export interface BulkItem {
  deal: Deal;
  updates: Partial<Deal>;
  /** what undo restores */
  before: Partial<Deal>;
  label: string;
  description: string;
}

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** Move every deal's follow-up to `days` after today (the business date key). */
export function planBulkSnooze(deals: Deal[], today: string, days: number): { date: string; items: BulkItem[] } {
  const date = addDaysToDateKey(today, days);
  return {
    date,
    items: deals.map(deal => ({
      deal,
      updates: { followup_date: date },
      before: { followup_date: deal.followup_date },
      label: 'Follow-up snoozed (bulk)',
      description: `${deal.client} follow-up moved to ${date}`,
    })),
  };
}

/** Park every deal with one shared reason; a reason is required, exactly as for a single park. */
export function planBulkPark(
  deals: Deal[],
  intent: { reason: string; revisitDate?: string | null },
): { items: BulkItem[]; error: string | null } {
  const reason = intent.reason.trim();
  if (!reason) return { items: [], error: 'Give a reason for parking these deals.' };
  const revisit = intent.revisitDate?.trim() || null;
  if (revisit && !DATE_KEY.test(revisit)) return { items: [], error: 'The revisit date is not a valid date.' };

  const items: BulkItem[] = [];
  for (const deal of deals) {
    const { updates, error } = buildCloseUpdate(deal, { kind: 'park', park_reason: reason, followup_date: revisit });
    if (error) return { items: [], error };
    items.push({
      deal,
      updates,
      before: {
        stage: deal.stage,
        workflow_action: deal.workflow_action,
        nudge_stage: deal.nudge_stage || null,
        last_outcome: deal.last_outcome,
        park_reason: deal.park_reason || null,
        followup_date: deal.followup_date,
      },
      label: 'Parked (bulk)',
      description: `${deal.client} parked — ${reason}`,
    });
  }
  return { items, error: null };
}
