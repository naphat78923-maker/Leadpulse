import type { Deal } from '@/types/crm';
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

export function dealNeedsReview(deal: Deal): boolean {
  const action = getWorkflowAction(deal);
  const nextAction = deal.next_action?.trim() || '';

  if ((action === 'sample' || action === 'testing') && PRE_CONTACT_ACTION_PATTERN.test(nextAction)) {
    return true;
  }

  switch (action) {
    case 'reply':
      return !deal.last_outcome?.trim() || WAITING_FOR_RESPONSE_PATTERN.test(nextAction);
    case 'sample':
      return !deal.sample_status;
    case 'testing':
      return !deal.followup_date;
    case 'reschedule':
      return !deal.followup_date || !deal.nudge_stage;
    case 'parked':
      return !deal.followup_date;
    case 'success':
      return deal.stage !== 'closed_won';
    case 'outreach':
    default:
      return false;
  }
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
