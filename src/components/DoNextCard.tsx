'use client';

// ─── This week: do next ───
// One ranked list in place of separate "waiting on you", "stalled" and "Laya review"
// cards: each deal appears once, with every reason it needs attention. Each row opens
// the deal, where the reply box, the grade and the log form are. Review-only.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import type { Deal, Meeting } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { useLayaGrades } from '@/hooks/useLayaReviewList';
import { buildDoNext, type DoNextKind } from '@/utils/do-next';
import { laneTimelines } from '@/utils/lane-time';

const PREVIEW = 8;

const TONE: Record<DoNextKind, string> = {
  asked: 'text-clay-ochre',
  review: 'text-clay-ochre',
  waiting: 'text-clay-body',
  'reply-words': 'text-clay-body',
  stalled: 'text-clay-muted',
};

export default function DoNextCard({ deals, meetings, today }: { deals: Deal[]; meetings: Meeting[]; today: string }) {
  const { activities = [] } = useCrm();
  const { grades } = useLayaGrades(deals, meetings);
  const [now] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);
  const items = useMemo(
    () => buildDoNext({ deals, meetings, grades, timelines: laneTimelines(deals, activities), today, now }),
    [deals, meetings, grades, activities, today, now],
  );
  if (items.length === 0) return null;
  const shown = showAll ? items : items.slice(0, PREVIEW);
  return (
    <section aria-labelledby="do-next" className="rounded-xl border border-clay-hairline bg-white p-3.5 dark:bg-clay-card" data-testid="do-next-card">
      <h2 id="do-next" className="mb-1 text-sm font-semibold text-clay-ink">Do next · {items.length}</h2>
      <p className="mb-2 text-xs text-clay-muted">Most pressing first. Each deal is listed once, with every reason.</p>
      <ol className="divide-y divide-clay-hairline">
        {shown.map(({ deal, reasons }) => (
          <li key={deal.id} className="py-2">
            <Link href={`/deals?deal=${encodeURIComponent(deal.id)}`} className="block rounded-md hover:bg-clay-surface">
              <span className="block truncate text-sm font-medium text-clay-ink">{deal.client}</span>
              {reasons.map((reason, index) => (
                <span key={reason.kind} data-reason={reason.kind}
                  className={clsx('block text-xs', index === 0 ? TONE[reason.kind] : 'text-clay-muted')}>
                  {reason.label}
                </span>
              ))}
            </Link>
          </li>
        ))}
      </ol>
      {items.length > PREVIEW && (
        <button type="button" onClick={() => setShowAll(value => !value)}
          className="mt-1 h-8 text-xs font-medium text-clay-lavender">
          {showAll ? 'Show fewer' : `Show all ${items.length}`}
        </button>
      )}
    </section>
  );
}
