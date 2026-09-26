import { isCalendarDateKey } from './business-time';
import type { AttentionCandidate, QueueSection } from './followup-policy';

export const QUEUE_SECTION_ORDER: QueueSection[] = [
  'review',
  'customer_response',
  'saved',
  'retention',
  'unscheduled',
];

const SECTION_LABELS: Record<QueueSection, string> = {
  review: 'Needs review / contact holds',
  customer_response: 'Customer needs',
  saved: 'Saved commitments',
  retention: 'Retention due',
  unscheduled: 'Date or park',
};

export interface QueueGroup {
  key: string;
  companyId: string | null;
  companyName: string | null;
  items: AttentionCandidate[];
}

export interface DailyQueueSection {
  id: QueueSection;
  label: string;
  count: number;
  items: AttentionCandidate[];
  groups: QueueGroup[];
}

export interface DailyFollowupQueue {
  today: string;
  totalCount: number;
  counts: Record<QueueSection, number>;
  sections: DailyQueueSection[];
}

const PRIORITY_ORDER: Record<AttentionCandidate['priority'], number> = {
  high: 0,
  medium: 1,
  low: 2,
};

function compareCandidates(a: AttentionCandidate, b: AttentionCandidate): number {
  if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
  if (a.dueDate && !b.dueDate) return -1;
  if (!a.dueDate && b.dueDate) return 1;
  const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
  if (priorityDiff !== 0) return priorityDiff;
  return a.id.localeCompare(b.id);
}

function dedupeKey(candidate: AttentionCandidate): string {
  return [
    candidate.action,
    [...candidate.sourceRefs].sort().join(','),
    candidate.dueDateSource ?? '',
    candidate.originalDueDate ?? '',
  ].join('|');
}

function groupItems(items: AttentionCandidate[]): QueueGroup[] {
  const groups = new Map<string, QueueGroup>();
  for (const item of items) {
    const key = item.companyId ? `company:${item.companyId}` : `action:${item.id}`;
    const group = groups.get(key) ?? {
      key,
      companyId: item.companyId,
      companyName: item.companyName,
      items: [],
    };
    group.items.push(item);
    if (!group.companyName && item.companyName) group.companyName = item.companyName;
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => ({ ...group, items: group.items.sort(compareCandidates) }))
    .sort((a, b) => {
      const itemOrder = compareCandidates(a.items[0], b.items[0]);
      if (itemOrder !== 0) return itemOrder;
      return (a.companyName ?? a.key).localeCompare(b.companyName ?? b.key);
    });
}

/** Stable, inspectable queue; no inference score affects section or row order. */
export function buildDailyFollowupQueue(
  candidates: readonly AttentionCandidate[],
  today: string,
): DailyFollowupQueue {
  if (!isCalendarDateKey(today)) throw new RangeError('today must be a real YYYY-MM-DD business date');

  const unique = new Map<string, AttentionCandidate>();
  for (const candidate of candidates) {
    const key = dedupeKey(candidate);
    if (!unique.has(key)) unique.set(key, candidate);
  }

  const allItems = [...unique.values()];
  const sections = QUEUE_SECTION_ORDER.map((id) => {
    const items = allItems
      .filter((candidate) => candidate.section === id)
      .sort(compareCandidates);
    return {
      id,
      label: SECTION_LABELS[id],
      count: items.length,
      items,
      groups: groupItems(items),
    };
  });
  const counts = Object.fromEntries(
    sections.map((section) => [section.id, section.count]),
  ) as Record<QueueSection, number>;

  return {
    today,
    totalCount: sections.reduce((sum, section) => sum + section.count, 0),
    counts,
    sections,
  };
}
