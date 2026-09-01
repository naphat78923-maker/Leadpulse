import type { Deal, DealWorkflowAction, SampleStatus, NudgeStage } from '@/types/crm';
import { getWorkflowAction } from '@/utils/deal-workflow';

export type BoardAttentionFilter = 'all' | 'overdue' | 'today' | 'needs-review';

export interface DealBoardFilters {
  attention: BoardAttentionFilter;
  search: string;
  product: string | 'all';
  priority: Deal['priority'] | 'all';
  today: string;
}

export interface DoNowCounts {
  all: number;
  overdue: number;
  today: number;
  needsReview: number;
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function dealDueState(deal: Deal, today: string): 'overdue' | 'today' | 'upcoming' | 'none' {
  if (!deal.followup_date || deal.stage === 'closed_won' || deal.stage === 'closed_lost') return 'none';
  if (deal.followup_date < today) return 'overdue';
  if (deal.followup_date === today) return 'today';
  return 'upcoming';
}

const WAITING_FOR_RESPONSE_PATTERN = /\b(waiting|awaiting)\b.{0,80}\b(reply|response|feedback)\b|\bno response\b/i;
const PRE_CONTACT_ACTION_PATTERN = /\b(find|locate|identify|research|map)\b.{0,120}\b(buyer|contact|procurement|purchasing|r&d|decision.?maker|route)\b|before\s+(approach|outreach|contact)/i;

/**
 * Each broken-record case has a stable reason code. The codes are the single
 * source of truth for both the card badge and the dry-run repair list, so the
 * UI and the audit report can never drift apart.
 */
export type ReviewReason =
  | 'sample-status-missing'
  | 'testing-date-missing'
  | 'followup-date-or-nudge-missing'
  | 'parked-revisit-missing'
  | 'reply-outcome-missing'
  | 'pre-contact-action'
  | 'success-step-missing';

export const REVIEW_LABEL: Record<ReviewReason, string> = {
  'sample-status-missing': 'Sample missing sent/received status',
  'testing-date-missing': 'Testing missing a testing date',
  'followup-date-or-nudge-missing': 'Follow-up missing date or nudge level',
  'parked-revisit-missing': 'Parked missing a revisit date',
  'reply-outcome-missing': 'Reply lane missing an outcome',
  'pre-contact-action': 'Sample/testing started before contact researched',
  'success-step-missing': 'Won account missing a next success step',
};

export const REVIEW_FIX: Record<ReviewReason, string> = {
  'sample-status-missing': 'Set sample status to Sent or Received in the Sample lane.',
  'testing-date-missing': 'Add a testing date in the Testing lane.',
  'followup-date-or-nudge-missing': 'Add a follow-up date and pick one nudge level in the Follow-up lane.',
  'parked-revisit-missing': 'Add a revisit date in the Parked lane.',
  'reply-outcome-missing': 'Log the client reply outcome, or clear a "waiting for reply" next action.',
  'pre-contact-action': 'Resolve the pre-contact research step (find buyer/contact) before sample/testing.',
  'success-step-missing': 'Add a next customer-success step (next action) for the won account.',
};

export function reviewReasons(deal: Deal): ReviewReason[] {
  const reasons: ReviewReason[] = [];
  const action = getWorkflowAction(deal);
  const nextAction = deal.next_action?.trim() || '';

  if ((action === 'sample' || action === 'testing') && PRE_CONTACT_ACTION_PATTERN.test(nextAction)) {
    reasons.push('pre-contact-action');
  }

  switch (action) {
    case 'reply':
      if (!deal.last_outcome?.trim() || WAITING_FOR_RESPONSE_PATTERN.test(nextAction)) {
        reasons.push('reply-outcome-missing');
      }
      break;
    case 'sample':
      if (!deal.sample_status) reasons.push('sample-status-missing');
      break;
    case 'testing':
      if (!deal.followup_date) reasons.push('testing-date-missing');
      break;
    case 'reschedule':
      if (!deal.followup_date || !deal.nudge_stage) reasons.push('followup-date-or-nudge-missing');
      break;
    case 'parked':
      if (!deal.followup_date) reasons.push('parked-revisit-missing');
      break;
    case 'success':
      // A won account still needs a planned next customer-success step.
      if (deal.stage !== 'closed_won' || !nextAction) reasons.push('success-step-missing');
      break;
    case 'outreach':
    default:
      break;
  }

  return reasons;
}

export function dealNeedsReview(deal: Deal): boolean {
  return reviewReasons(deal).length > 0;
}

export interface ReviewItem {
  deal: Deal;
  lane: DealWorkflowAction;
  reasons: ReviewReason[];
  labels: string[];
  fix: string;
}

/**
 * Dry-run repair list. Pure + read-only: it groups flagged deals with a
 * human-readable reason and a suggested fix. It never writes to the CRM —
 * callers decide whether to act on the output.
 */
export function buildReviewReport(deals: Deal[]): ReviewItem[] {
  return deals
    .filter(deal => dealNeedsReview(deal))
    .map(deal => {
      const reasons = reviewReasons(deal);
      return {
        deal,
        lane: getWorkflowAction(deal),
        reasons,
        labels: reasons.map(r => REVIEW_LABEL[r]),
        fix: reasons.map(r => REVIEW_FIX[r]).join(' '),
      };
    });
}

/**
 * Maps the flagged deal's reasons + the user's fix inputs to a minimal set of
 * deal fields to update. Pure and testable — the modal collects inputs, this
 * function decides which fields they satisfy. Only the fields actually needed
 * to clear the flags are written; nothing else is touched.
 */
export function buildReviewFix(
  reasons: ReviewReason[],
  input: {
    sample_status?: SampleStatus | null;
    followup_date?: string | null;
    nudge_stage?: NudgeStage | null;
    reply_outcome?: string | null;
    reply_summary?: string | null;
    next_action?: string | null;
  }
): Partial<Deal> {
  const updates: Partial<Deal> = {};
  const has = (r: ReviewReason) => reasons.includes(r);

  if (has('sample-status-missing') && input.sample_status) {
    updates.sample_status = input.sample_status;
  }
  if ((has('testing-date-missing') || has('parked-revisit-missing')) && input.followup_date) {
    updates.followup_date = input.followup_date;
  }
  if (has('followup-date-or-nudge-missing')) {
    if (input.followup_date) updates.followup_date = input.followup_date;
    if (input.nudge_stage) updates.nudge_stage = input.nudge_stage;
  }
  if (has('reply-outcome-missing') && input.reply_outcome) {
    const detail = input.reply_summary ? `: ${input.reply_summary}` : '';
    updates.last_outcome = `💬 Client replied — ${input.reply_outcome}${detail}`;
  }
  if (has('success-step-missing') && input.next_action?.trim()) {
    updates.next_action = input.next_action.trim();
  }
  if (has('pre-contact-action') && input.next_action?.trim()) {
    updates.next_action = input.next_action.trim();
  }

  return updates;
}

const PRIORITY_RANK: Record<Deal['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};
const TEXT_COLLATOR = new Intl.Collator('en', { sensitivity: 'base', numeric: true });

function doNowBucket(deal: Deal, today: string): number {
  const dueState = dealDueState(deal, today);
  if (dueState === 'overdue') return 0;
  if (dueState === 'today') return 1;
  if (dueState === 'upcoming') return 2;
  if (deal.priority === 'high') return 3;
  return 4;
}

export function sortDealsForDoNow(deals: Deal[], today: string): Deal[] {
  return [...deals].sort((a, b) => {
    const bucketDifference = doNowBucket(a, today) - doNowBucket(b, today);
    if (bucketDifference !== 0) return bucketDifference;

    const bucket = doNowBucket(a, today);
    if (bucket <= 2) {
      const dateDifference = (a.followup_date || '').localeCompare(b.followup_date || '');
      if (dateDifference !== 0) return dateDifference;
    }

    const priorityDifference = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
    if (priorityDifference !== 0) return priorityDifference;

    const clientDifference = TEXT_COLLATOR.compare(a.client, b.client);
    if (clientDifference !== 0) return clientDifference;

    const titleDifference = TEXT_COLLATOR.compare(a.title, b.title);
    if (titleDifference !== 0) return titleDifference;

    return a.id.localeCompare(b.id);
  });
}

export function filterAndSortBoardDeals(deals: Deal[], filters: DealBoardFilters): Deal[] {
  const search = filters.search.trim().toLocaleLowerCase();

  const filtered = deals.filter(deal => {
    const dueState = dealDueState(deal, filters.today);
    if (filters.attention === 'overdue' && dueState !== 'overdue') return false;
    if (filters.attention === 'today' && dueState !== 'today') return false;
    if (filters.attention === 'needs-review' && !dealNeedsReview(deal)) return false;

    if (search) {
      const searchable = `${deal.client} ${deal.title}`.toLocaleLowerCase();
      if (!searchable.includes(search)) return false;
    }

    if (filters.product !== 'all' && deal.product !== filters.product) return false;
    if (filters.priority !== 'all' && deal.priority !== filters.priority) return false;

    return true;
  });

  return sortDealsForDoNow(filtered, filters.today);
}

export function getDoNowCounts(deals: Deal[], today: string): DoNowCounts {
  return deals.reduce<DoNowCounts>((counts, deal) => {
    const dueState = dealDueState(deal, today);
    counts.all += 1;
    if (dueState === 'overdue') counts.overdue += 1;
    if (dueState === 'today') counts.today += 1;
    if (dealNeedsReview(deal)) counts.needsReview += 1;
    return counts;
  }, { all: 0, overdue: 0, today: 0, needsReview: 0 });
}
