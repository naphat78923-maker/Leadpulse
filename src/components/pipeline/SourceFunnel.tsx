'use client';

import clsx from 'clsx';
import { X } from 'lucide-react';
import { FUNNEL_STEPS, FUNNEL_STEP_LABELS, SOURCE_FILTER_OPTIONS, type SourceFilter, type SourceFunnel as Funnel } from '@/utils/acquisition-source';

/** The acquisition source menu. Sits beside the view tabs because it narrows every view. */
export function SourceSelect({ value, onChange }: { value: SourceFilter; onChange: (value: SourceFilter) => void }) {
  return (
    <label className="shrink-0">
      <span className="sr-only">Filter by source</span>
      <select
        aria-label="Filter by source"
        value={value}
        onChange={event => onChange(event.target.value as SourceFilter)}
        className={clsx(
          'h-8 rounded-lg border px-2 text-base focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 md:text-xs',
          value === 'all'
            ? 'border-clay-hairline bg-white text-clay-body dark:bg-clay-card'
            : 'border-clay-lavender/60 bg-clay-lavender/20 text-clay-ink',
        )}
      >
        {SOURCE_FILTER_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}

/** One quiet line: how far the selected source's deals got, step by step. */
export function SourceFunnelLine({ filter, funnel, onClear }: { filter: SourceFilter; funnel: Funnel; onClear: () => void }) {
  const label = SOURCE_FILTER_OPTIONS.find(option => option.value === filter)?.label ?? filter;
  return (
    <section
      aria-label="Source funnel"
      data-testid="source-funnel"
      className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-clay-surface px-3 py-2 text-xs text-clay-muted"
    >
      <span className="font-medium text-clay-ink">{label}</span>
      {funnel.total === 0 ? (
        <span>No deals yet</span>
      ) : (
        <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {FUNNEL_STEPS.map((step, index) => (
            <li key={step} className="inline-flex items-center gap-1.5">
              {index > 0 && <span aria-hidden="true">→</span>}
              <span>
                {FUNNEL_STEP_LABELS[step]} <span className="font-semibold text-clay-ink">{funnel.reached[step]}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
      {(funnel.lost > 0 || funnel.parked > 0) && (
        <span>
          {[funnel.lost > 0 && `${funnel.lost} lost`, funnel.parked > 0 && `${funnel.parked} parked`].filter(Boolean).join(' · ')}
        </span>
      )}
      <button onClick={onClear} className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-clay-card hover:text-clay-ink">
        <X className="h-3 w-3" aria-hidden="true" /> Any source
      </button>
    </section>
  );
}
