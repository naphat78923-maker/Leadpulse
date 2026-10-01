'use client';

// ─── This week: deals Laya routed to Pat ───
// Shown only when something needs a look. Each row links to the deal, where the
// "Laya grade" row explains the full reasoning. Review-only.

import Link from 'next/link';
import type { Deal, Meeting } from '@/types/crm';
import { useLayaReviewList } from '@/hooks/useLayaReviewList';
import { TIER_LABELS } from '@/utils/lead-scoring';

export default function LayaReviewCard({ deals, meetings }: { deals: Deal[]; meetings: Meeting[] }) {
  const { items } = useLayaReviewList(deals, meetings);
  if (items.length === 0) return null;
  return (
    <section aria-labelledby="laya-review" className="rounded-xl border border-clay-ochre/30 bg-clay-ochre/5 p-3.5" data-testid="laya-review-card">
      <h2 id="laya-review" className="mb-1 text-sm font-semibold text-clay-ink">Laya: needs your review · {items.length}</h2>
      <p className="mb-2 text-xs text-clay-muted">Laya was unsure, refused, or the reply is in Thai. You decide.</p>
      <ul className="divide-y divide-clay-hairline">
        {items.map(({ deal, grade }) => (
          <li key={deal.id} className="py-2">
            <Link href={`/deals?deal=${encodeURIComponent(deal.id)}`} className="block rounded-md hover:bg-white/60 dark:hover:bg-clay-card">
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate text-sm font-medium text-clay-ink">{deal.client}</span>
                <span className="shrink-0 text-[11px] text-clay-muted">{TIER_LABELS[grade.baseTier]}</span>
              </div>
              <p className="truncate text-xs text-clay-ochre">
                {grade.review[0]}{grade.review.length > 1 ? ` · +${grade.review.length - 1} more` : ''}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
