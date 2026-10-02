'use client';

// ─── This week: deals where the buyer spoke last ───
// Shown only when something is waiting. Each row links to the deal. Review-only.

import { useMemo } from 'react';
import Link from 'next/link';
import type { Deal, Meeting } from '@/types/crm';
import { useLayaGrades } from '@/hooks/useLayaReviewList';
import { buildWaitingOnYou, waitingLabel } from '@/utils/waiting-on-you';

const SHOWN = 8;

export default function WaitingOnYouCard({ deals, meetings, today }: { deals: Deal[]; meetings: Meeting[]; today: string }) {
  const { grades } = useLayaGrades(deals, meetings);
  const items = useMemo(() => buildWaitingOnYou({ deals, meetings, grades, today }), [deals, meetings, grades, today]);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="waiting-on-you" className="rounded-xl border border-clay-hairline bg-white p-3.5 dark:bg-clay-card" data-testid="waiting-on-you-card">
      <h2 id="waiting-on-you" className="mb-1 text-sm font-semibold text-clay-ink">Waiting on you · {items.length}</h2>
      <p className="mb-2 text-xs text-clay-muted">The buyer replied and nothing has gone back since.</p>
      <ul className="divide-y divide-clay-hairline">
        {items.slice(0, SHOWN).map(({ deal, daysWaiting, asked }) => (
          <li key={deal.id} className="py-2">
            <Link href={`/deals?deal=${encodeURIComponent(deal.id)}`} className="block rounded-md hover:bg-clay-surface">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-clay-ink">{deal.client}</span>
                <span className="shrink-0 text-[11px] text-clay-muted">replied {waitingLabel(daysWaiting)}</span>
              </div>
              {asked && <p className="text-xs text-clay-ochre">Laya: the buyer asked for a next step</p>}
            </Link>
          </li>
        ))}
      </ul>
      {items.length > SHOWN && (
        <Link href="/deals?filter=waiting-on-you" className="mt-1 block text-xs text-clay-muted underline decoration-clay-hairline underline-offset-2 hover:text-clay-ink">
          Show all {items.length} on the board
        </Link>
      )}
    </section>
  );
}
