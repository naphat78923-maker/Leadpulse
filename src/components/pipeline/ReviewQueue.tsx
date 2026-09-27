'use client';

import { AlertCircle } from 'lucide-react';
import type { Deal } from '@/types/crm';
import type { buildReviewReport } from '@/utils/deal-board';
import { WORKFLOW_BY_ID } from '@/utils/deal-workflow';

type ReviewItem = ReturnType<typeof buildReviewReport>[number];

/** Read-only list of deals that break a lane requirement; Fix opens the edit form. */
export default function ReviewQueue({
  items,
  onFix,
}: {
  items: ReviewItem[];
  onFix: (deal: Deal, reasons: ReviewItem['reasons']) => void;
}) {
  return (
    <section className="mb-3 rounded-xl border border-clay-lavender/30 bg-clay-lavender/5 p-3 md:p-4" aria-label="Data hygiene review queue">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div>
          <p className="zams-eyebrow mb-0.5">Data hygiene · dry run</p>
          <p className="text-sm font-semibold text-clay-ink">{items.length} deal{items.length === 1 ? '' : 's'} need review</p>
        </div>
        <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-medium text-clay-muted bg-clay-card border border-clay-hairline px-2 py-1 rounded-full">
          <AlertCircle className="w-3 h-3" /> Read-only · no changes made
        </span>
      </div>
      <p className="text-[11px] text-clay-muted mb-3">These deals violate a lane requirement (existing or imported). Review the reason and suggested fix — nothing is edited until you open a deal and save it yourself.</p>
      <ul className="space-y-2">
        {items.map(item => (
          <li key={item.deal.id} className="rounded-lg border border-clay-hairline bg-white dark:bg-clay-card p-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium text-clay-ink truncate">{item.deal.client}</span>
              <div className="flex items-center gap-1.5 shrink-0">
                <span className="text-[10px] font-medium text-clay-lavender bg-clay-lavender/15 px-1.5 py-0.5 rounded">{WORKFLOW_BY_ID[item.lane].shortLabel}</span>
                <button
                  onClick={() => onFix(item.deal, item.reasons)}
                  className="text-[10px] font-semibold text-clay-canvas bg-clay-lavender px-2 py-0.5 rounded active:opacity-85"
                >
                  Fix
                </button>
              </div>
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {item.labels.map(label => (
                <li key={label} className="text-[11px] text-clay-body flex items-start gap-1.5">
                  <span className="text-clay-lavender mt-0.5">•</span>
                  <span>{label}</span>
                </li>
              ))}
            </ul>
            <p className="text-[11px] text-clay-muted mt-1.5 leading-relaxed">Fix: {item.fix}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
