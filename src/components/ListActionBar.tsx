'use client';

import type { ReactNode } from 'react';
import { Search, Plus } from 'lucide-react';

interface ListActionBarProps {
  /** Section name shown as an eyebrow, e.g. "Contacts". */
  label: string;
  /** Total records in the dataset (unfiltered). */
  total: number;
  /** Records after filters are applied. */
  filtered: number;
  searchValue: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  /** Extra filter control(s) shown left of the view toggle (e.g. company select). */
  leading?: ReactNode;
  /** View toggle / sort control shown right of filters (e.g. All/Status/Company). */
  trailing?: ReactNode;
  /** Optional primary action on the far right (e.g. New contact). */
  onAdd?: () => void;
  addLabel?: string;
}

/**
 * Unified sticky action bar — the adapted inspiration layout.
 * Left: live data count (filtered / total). Right: search + filter + view + new.
 * Reusable across Contacts, Deals, Pipeline. Clay-themed; mobile-first.
 */
export default function ListActionBar({
  label,
  total,
  filtered,
  searchValue,
  onSearchChange,
  searchPlaceholder = 'Search…',
  leading,
  trailing,
  onAdd,
  addLabel = 'New',
}: ListActionBarProps) {
  return (
    <div className="sticky top-14 lg:top-0 z-30 -mx-4 md:-mx-6 px-4 md:px-6 py-2.5 bg-clay-canvas/95 dark:bg-clay-canvas/95 backdrop-blur-sm border-b border-clay-hairline flex flex-wrap items-center gap-2">
      {/* Live count — the data at a glance */}
      <div className="flex items-baseline gap-2 shrink-0">
        <span className="zams-eyebrow hidden sm:inline">{label}</span>
        <span className="text-sm font-semibold text-clay-ink tabular-nums">
          {filtered}
          <span className="text-clay-muted font-normal"> / {total}</span>
        </span>
      </div>

      {/* Search — grows on mobile, fixed on desktop */}
      <div className="relative flex-1 md:flex-none md:w-64 min-w-[140px]">
        <Search className="w-4 h-4 text-clay-muted absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full pl-9 pr-3 py-2 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-zams-violet/40"
        />
      </div>

      {leading}

      {trailing}

      {onAdd && (
        <button onClick={onAdd} className="zams-btn-primary shrink-0">
          <Plus className="w-4 h-4" /> <span className="hidden sm:inline">{addLabel}</span>
        </button>
      )}
    </div>
  );
}
