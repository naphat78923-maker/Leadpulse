'use client';

// ─── This week: deals that have sat in their lane too long ───
// Stalled = longer in the lane than won deals took there (lane-time.ts). Shown only
// when something is stalled. Each row links to the deal. Review-only.

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Deal } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { WORKFLOW_BY_ID } from '@/utils/deal-workflow';
import { buildStalled, laneTimelines, stallThresholds } from '@/utils/lane-time';

const SHOWN = 8;

export default function GoingQuietCard({ deals }: { deals: Deal[] }) {
  const { activities = [] } = useCrm();
  const [now] = useState(() => Date.now());
  const items = useMemo(() => {
    const timelines = laneTimelines(deals, activities);
    return buildStalled({ deals, timelines, thresholds: stallThresholds(deals, timelines), now });
  }, [deals, activities, now]);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="going-quiet" className="rounded-xl border border-clay-hairline bg-white p-3.5 dark:bg-clay-card" data-testid="going-quiet-card">
      <h2 id="going-quiet" className="mb-1 text-sm font-semibold text-clay-ink">Stalled · {items.length}</h2>
      <p className="mb-2 text-xs text-clay-muted">In the same lane past its limit: 14 days, or 1.2× what won deals took once three have passed through.</p>
      <ul className="divide-y divide-clay-hairline">
        {items.slice(0, SHOWN).map(({ deal, lane, days }) => (
          <li key={deal.id} className="py-2">
            <Link href={`/deals?deal=${encodeURIComponent(deal.id)}`} className="flex items-baseline justify-between gap-2 rounded-md hover:bg-clay-surface">
              <span className="truncate text-sm font-medium text-clay-ink">{deal.client}</span>
              <span className="shrink-0 text-[11px] text-clay-muted">{days} days in {WORKFLOW_BY_ID[lane].shortLabel}</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <Link href="/deals?filter=stalled" className="mt-1 block text-xs text-clay-muted underline decoration-clay-hairline underline-offset-2 hover:text-clay-ink">
          Show all {items.length} on the board
        </Link>
      )}
    </section>
  );
}
