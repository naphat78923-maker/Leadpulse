import type { Deal, SampleStatus } from '@/types/crm';
import { getWorkflowAction, isOnJourneyBoard } from '@/utils/deal-workflow';

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
  if (getWorkflowAction(deal) === 'parked') return 'none';
  if (deal.followup_date < today) return 'overdue';
  if (deal.followup_date === today) return 'today';
  return 'upcoming';
}

const WAITING_FOR_RESPONSE_PATTERN = /\b(waiting|awaiting)\b.{0,80}\b(reply|response|feedback)\b|\bno response\b/i;
const PRE_CONTACT_ACTION_PATTERN = /\b(find|locate|identify|research|map)\b.{0,120}\b(buyer|contact|procurement|purchasing|r&d|decision.?maker|route)\b|before\s+(approach|outreach|contact)/i;

export type ReviewReason =
  | 'sample-status-missing'
  | 'testing-date-missing'
  | 'followup-date-missing'
  | 'parked-revisit-missing'
  | 'reply-outcome-missing'
  | 'pre-contact-action';

export const REVIEW_LABEL: Record<ReviewReason, string> = {
  'sample-status-missing': 'Sample missing sent/received status',
  'testing-date-missing': 'Testing missing a testing date',
  'followup-date-missing': 'Follow-up missing a date',
  'parked-revisit-missing': 'Parked missing a revisit date',
  'reply-outcome-missing': 'Waiting-on-reply missing last outreach confirmation',
  'pre-contact-action': 'Sample/testing started before contact researched',
};

export const REVIEW_FIX: Record<ReviewReason, string> = {
  'sample-status-missing': 'Confirm address / send intent (sample status Sent or Received).',
  'testing-date-missing': 'Add a testing date in the Testing lane.',
  'followup-date-missing': 'Add a follow-up date in the Follow-up lane.',
  'parked-revisit-missing': 'Add a revisit date when parking.',
  'reply-outcome-missing': 'Confirm last outreach was logged, or clear a "waiting for reply" next action.',
  'pre-contact-action': 'Resolve the pre-contact research step (find buyer/contact) before sample/testing.',
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
      if (!deal.followup_date) reasons.push('followup-date-missing');
      break;
    case 'parked':
      if (!deal.followup_date) reasons.push('parked-revisit-missing');
      break;
    case 'success':
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
  lane: ReturnType<typeof getWorkflowAction>;
  reasons: ReviewReason[];
  labels: string[];
  fix: string;
}

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

export function buildReviewFix(
  reasons: ReviewReason[],
  input: {
    sample_status?: SampleStatus | null;
    followup_date?: string | null;
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
  if ((has('testing-date-missing') || has('parked-revisit-missing') || has('followup-date-missing')) && input.followup_date) {
    updates.followup_date = input.followup_date;
  }
  if (has('reply-outcome-missing') && input.reply_outcome) {
    const detail = input.reply_summary ? `: ${input.reply_summary}` : '';
    updates.last_outcome = `💬 Client replied — ${input.reply_outcome}${detail}`;
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
    void isOnJourneyBoard;
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
