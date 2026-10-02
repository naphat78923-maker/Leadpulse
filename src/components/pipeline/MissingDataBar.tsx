'use client';

// ─── Missing-data filter: which gap ───
// Shown with the "Missing data" filter. One chip per gap narrows the board to the deals
// with that gap; the count is over every open deal, not only the cards in view.

import clsx from 'clsx';
import { DATA_GAPS, DATA_GAP_FIX, DATA_GAP_LABEL, type DataGap, type DataGapReport } from '@/utils/deal-data-gaps';

export default function MissingDataBar({ report, gap, onGapChange }: {
  report: DataGapReport;
  gap: DataGap | 'all';
  onGapChange: (gap: DataGap | 'all') => void;
}) {
  const chip = (value: DataGap | 'all', label: string, count: number) => (
    <button
      key={value}
      type="button"
      aria-pressed={gap === value}
      onClick={() => onGapChange(value)}
      className={clsx(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-xs transition-colors',
        gap === value
          ? 'border-clay-lavender/60 bg-clay-lavender/20 text-clay-ink'
          : 'border-clay-hairline text-clay-body hover:border-clay-ink/30 hover:text-clay-ink',
      )}
    >
      {label} <span className="text-clay-muted">{count}</span>
    </button>
  );

  return (
    <section aria-label="Missing data" data-testid="missing-data-bar"
      className="mb-3 rounded-xl border border-clay-hairline bg-white px-3.5 py-2.5 text-sm dark:bg-clay-card">
      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Which data is missing">
        {chip('all', 'Any gap', report.total)}
        {DATA_GAPS.map(value => chip(value, DATA_GAP_LABEL[value], report.counts[value]))}
      </div>
      <p className="mt-1.5 text-[11px] text-clay-muted">
        {gap === 'all' ? 'Open deals missing a field the grade or the forecast reads. Pick one to work through it.' : DATA_GAP_FIX[gap]}
      </p>
    </section>
  );
}
