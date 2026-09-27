// Pure display helpers shared by the Pipeline board, its table and the lane picker.
import type { Deal } from '@/types/crm';
import { dealNeedsReview } from '@/utils/deal-board';
import { WORKFLOW_BY_ID, getWorkflowAction } from '@/utils/deal-workflow';

export const LANE_CRITERIA: Record<string, string> = {
  outreach: 'No gate',
  reply: 'Requires: last outreach logged',
  sample: 'Requires: address / send intent',
  testing: 'Requires: sample delivered + date',
  reschedule: 'Requires: follow-up date',
};

export function dueStateFor(deal: Deal, todayStr: string): 'overdue' | 'today' | null {
  if (!deal.followup_date) return null;
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return null;
  if (deal.followup_date < todayStr) return 'overdue';
  if (deal.followup_date === todayStr) return 'today';
  return null;
}

export function compactDate(date?: string | null) {
  if (!date) return null;
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
}

export function whyNow(deal: Deal, due: 'overdue' | 'today' | null): string | null {
  if (!due) return null;
  if (dealNeedsReview(deal)) {
    return due === 'overdue' ? 'Past due and missing required lane details' : 'Due today but missing required lane details';
  }
  if (deal.priority === 'high') {
    return due === 'overdue' ? 'High-priority follow-up slipped' : 'High-priority follow-up due today';
  }
  const lane = WORKFLOW_BY_ID[getWorkflowAction(deal)];
  if (lane && lane.id !== 'outreach') {
    return `Scheduled ${lane.shortLabel.toLowerCase()} is ${due === 'overdue' ? 'overdue' : 'due today'}`;
  }
  return due === 'overdue' ? 'Follow-up is overdue' : 'Follow-up is due today';
}
