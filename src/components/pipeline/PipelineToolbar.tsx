'use client';

import clsx from 'clsx';
import { Search, X } from 'lucide-react';
import type { Deal } from '@/types/crm';
import type { BoardAttentionFilter, BoardSort } from '@/utils/deal-board';
import { formatBaht } from '@/utils/format';

interface PipelineToolbarProps {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  attentionFilter: BoardAttentionFilter;
  onAttentionChange: (value: BoardAttentionFilter) => void;
  counts: { all: number; overdue: number; today: number; needsReview: number; layaReview: number; missingData?: number; waitingOnYou?: number };
  productFilter: string;
  onProductChange: (value: string) => void;
  productOptions: readonly string[];
  priorityFilter: Deal['priority'] | 'all';
  onPriorityChange: (value: Deal['priority'] | 'all') => void;
  sort: BoardSort;
  onSortChange: (value: BoardSort) => void;
  filtersActive: boolean;
  onClear: () => void;
  visibleCount: number;
  totalCount: number;
  openPipelineValue: number;
  weightedForecast: number;
  sourceRows: { source: string; won: number; total: number; rate: number }[];
  compact: boolean;
  onToggleCompact: () => void;
}

export default function PipelineToolbar({
  searchQuery,
  onSearchChange,
  attentionFilter,
  onAttentionChange,
  counts,
  productFilter,
  onProductChange,
  productOptions,
  priorityFilter,
  onPriorityChange,
  sort,
  onSortChange,
  filtersActive,
  onClear,
  visibleCount,
  totalCount,
  openPipelineValue,
  weightedForecast,
  sourceRows,
  compact,
  onToggleCompact,
}: PipelineToolbarProps) {
  return (
    <>
    {/* One toolbar: search, quick filters, product and priority, then a live count. */}
    <section className="mb-2 flex flex-wrap items-center gap-2" aria-label="Do now filters">
      <label className="relative w-full sm:w-60">
        <span className="sr-only">Search by client or deal name</span>
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-clay-muted" />
        <input
          type="search"
          value={searchQuery}
          onChange={event => onSearchChange(event.target.value)}
          placeholder="Search deals"
          className="h-9 w-full rounded-lg border border-clay-hairline bg-white pl-8 pr-3 text-base text-clay-ink placeholder:text-clay-muted focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 dark:bg-clay-card md:text-sm"
        />
      </label>

      <div className="-mx-4 flex gap-1.5 overflow-x-auto no-scrollbar px-4 sm:mx-0 sm:px-0" role="group" aria-label="Attention filter">
        {([
          ['all', 'All', counts.all],
          ['overdue', 'Overdue', counts.overdue],
          ['today', 'Due today', counts.today],
          ['needs-review', 'Needs review', counts.needsReview],
          // The buyer spoke last: only shown when a deal is waiting (or it is selected).
          ...((counts.waitingOnYou ?? 0) > 0 || attentionFilter === 'waiting-on-you'
            ? [['waiting-on-you', 'Waiting on you', counts.waitingOnYou ?? 0] as [BoardAttentionFilter, string, number]]
            : []),
          // Laya's review queue: only shown when something is waiting (or it is selected).
          ...(counts.layaReview > 0 || attentionFilter === 'laya-review'
            ? [['laya-review', 'Laya review', counts.layaReview] as [BoardAttentionFilter, string, number]]
            : []),
          // Data gaps: same rule — hidden when every open deal is complete.
          ...((counts.missingData ?? 0) > 0 || attentionFilter === 'missing-data'
            ? [['missing-data', 'Missing data', counts.missingData ?? 0] as [BoardAttentionFilter, string, number]]
            : []),
        ] as Array<[BoardAttentionFilter, string, number]>).map(([value, label, count]) => (
          <button
            key={value}
            onClick={() => onAttentionChange(value)}
            aria-pressed={attentionFilter === value}
            className={clsx(
              'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
              attentionFilter === value
                ? 'border-clay-lavender/60 bg-clay-lavender/20 text-clay-ink'
                : 'border-clay-hairline text-clay-body hover:border-clay-ink/30 hover:text-clay-ink',
            )}
          >
            {label}
            <span className={clsx('text-xs',
              value === 'overdue' && count > 0 ? 'font-semibold text-clay-error'
                : (value === 'laya-review' || value === 'waiting-on-you') && count > 0 ? 'font-semibold text-clay-ochre' : 'text-clay-muted')}>{count}</span>
          </button>
        ))}
      </div>

      <label>
        <span className="sr-only">Filter by product</span>
        <select
          value={productFilter}
          onChange={event => onProductChange(event.target.value)}
          className="h-9 rounded-lg border border-clay-hairline bg-white px-2.5 text-base text-clay-body focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 dark:bg-clay-card md:text-sm"
        >
          <option value="all">All products</option>
          {productOptions.map(product => <option key={product} value={product}>{product}</option>)}
        </select>
      </label>

      <label>
        <span className="sr-only">Filter by priority</span>
        <select
          value={priorityFilter}
          onChange={event => onPriorityChange(event.target.value as Deal['priority'] | 'all')}
          className="h-9 rounded-lg border border-clay-hairline bg-white px-2.5 text-base text-clay-body focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 dark:bg-clay-card md:text-sm"
        >
          <option value="all">Any priority</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </label>

      <label>
        <span className="sr-only">Sort cards in each lane</span>
        <select
          value={sort}
          onChange={event => onSortChange(event.target.value as BoardSort)}
          title="Do now: overdue first, then by due date. Hottest: highest tier first (Laya's tier where graded)."
          className="h-9 rounded-lg border border-clay-hairline bg-white px-2.5 text-base text-clay-body focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 dark:bg-clay-card md:text-sm"
        >
          <option value="do-now">Sort: Do now</option>
          <option value="hottest">Sort: Hottest</option>
        </select>
      </label>

      {filtersActive && (
        <button
          onClick={onClear}
          className="inline-flex h-9 items-center gap-1 rounded-lg px-2 text-sm text-clay-muted hover:bg-clay-surface hover:text-clay-ink"
        >
          <X className="h-3.5 w-3.5" /> Clear
        </button>
      )}
    </section>

    {/* One quiet line: what the board holds, how it works, and card density. */}
    <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-clay-muted">
      <span>{visibleCount} of {totalCount} deals</span>
      <details className="open:basis-full" aria-label="Pipeline insights">
        <summary className="cursor-pointer list-none marker:hidden hover:text-clay-ink">
          Open pipeline <span className="font-semibold text-clay-ink">{formatBaht(openPipelineValue)}</span> <span aria-hidden="true">⌄</span>
        </summary>
        <div className="mt-2 space-y-1">
          <p>Weighted forecast · <span className="font-semibold text-clay-ink">{formatBaht(weightedForecast)}</span></p>
          {sourceRows.length > 0 && (
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {sourceRows.map(s => (
                <span key={s.source}><span className="font-medium text-clay-body">{s.source}</span> {s.won}/{s.total} won · {s.rate.toFixed(0)}%</span>
              ))}
            </div>
          )}
        </div>
      </details>
      <details className="open:basis-full">
        <summary className="cursor-pointer list-none marker:hidden hover:text-clay-ink">How this board works <span aria-hidden="true">⌄</span></summary>
        <p className="mt-1 max-w-xl leading-relaxed">Drag along the five journey stages. Waiting on reply requires logged outreach; Sample requires an address and send intent; Testing needs delivery and a date; Follow-up needs a date. Won / Lost / Park are exits, never columns. Four outbound nudges maximum, then park.</p>
      </details>
      <button onClick={onToggleCompact} className="ml-auto rounded-md px-2 py-1 hover:bg-clay-surface hover:text-clay-ink">
        {compact ? 'Show more detail' : 'Compact cards'}
      </button>
    </div>
    </>
  );
}
