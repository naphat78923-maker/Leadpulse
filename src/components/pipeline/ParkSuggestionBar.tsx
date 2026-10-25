'use client';

// ─── "Park this deal?" ───
// Shown on the Park this deal? filter: each deal at the nudge limit with no reply, with a
// Park button that opens the usual park form. A suggestion only: nothing parks on its own.

import type { Deal } from '@/types/crm';
import { parkSuggestionLabel, type ParkSuggestion } from '@/utils/park-suggestion';

export default function ParkSuggestionBar({ items, onPark }: { items: ParkSuggestion[]; onPark: (deal: Deal) => void }) {
  if (items.length === 0) return null;
  return (
    <section aria-label="Park this deal?" data-testid="park-suggestion-bar"
      className="mb-3 rounded-xl border border-clay-hairline bg-white px-3.5 py-2.5 text-sm dark:bg-clay-card">
      <p className="font-medium text-clay-ink">Park this deal?</p>
      <ul className="mt-1 divide-y divide-clay-hairline">
        {items.map(item => (
          <li key={item.deal.id} className="flex items-center gap-2 py-1.5">
            <span className="min-w-0 truncate text-clay-body">{item.deal.client}</span>
            <span className="shrink-0 text-xs text-clay-muted">{parkSuggestionLabel(item)}</span>
            <button
              type="button"
              onClick={() => onPark(item.deal)}
              aria-label={`Park ${item.deal.client}`}
              className="ml-auto inline-flex h-8 shrink-0 items-center rounded-lg border border-clay-hairline px-3 text-xs font-medium text-clay-ink transition-colors hover:border-clay-ink/30"
            >
              Park…
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
