'use client';

// ─── Deal panel: the thread ───
// Everything that happened on the deal, newest first: their replies, your outreach,
// notes and lane moves (deal-timeline.ts). Read-only.

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { ArrowDownLeft, ArrowUpRight, MoveRight, Plus, StickyNote } from 'lucide-react';
import type { Deal } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { buildDealTimeline, type TimelineKind } from '@/utils/deal-timeline';
import { WORKFLOW_BY_ID, getWorkflowAction } from '@/utils/deal-workflow';
import { daysInLane, laneTimeline } from '@/utils/lane-time';

const PREVIEW = 6;

const ICON: Record<TimelineKind, typeof ArrowUpRight> = {
  theirs: ArrowDownLeft, ours: ArrowUpRight, note: StickyNote, lane: MoveRight, created: Plus,
};

const TONE: Record<TimelineKind, string> = {
  theirs: 'bg-clay-teal/15 text-clay-teal dark:text-clay-mint',
  ours: 'bg-clay-surface text-clay-body',
  note: 'bg-clay-surface text-clay-muted',
  lane: 'bg-clay-lavender/20 text-clay-ink',
  created: 'bg-clay-surface text-clay-muted',
};

function shortDate(key: string): string {
  return new Date(`${key}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export default function DealTimeline({ deal }: { deal: Deal }) {
  const { meetings = [], activities = [] } = useCrm();
  const [now] = useState(() => Date.now());
  const [showAll, setShowAll] = useState(false);
  const lane = useMemo(() => laneTimeline(deal, activities), [deal, activities]);
  const entries = useMemo(() => buildDealTimeline(deal, meetings, lane), [deal, meetings, lane]);
  const shown = showAll ? entries : entries.slice(0, PREVIEW);
  const days = daysInLane(lane, now);

  return (
    <section aria-label="Deal timeline" data-testid="deal-timeline">
      <p className="mb-2 text-xs text-clay-muted">
        In <span className="font-medium text-clay-ink">{WORKFLOW_BY_ID[getWorkflowAction(deal)]?.shortLabel}</span>
        {' '}for {days} {days === 1 ? 'day' : 'days'}
      </p>
      <ol className="relative space-y-3 before:absolute before:bottom-2 before:left-[11px] before:top-2 before:w-px before:bg-clay-hairline">
        {shown.map((entry, index) => {
          const Icon = ICON[entry.kind];
          return (
            <li key={entry.id} data-kind={entry.kind} className="lp-rise relative flex gap-3" style={{ animationDelay: `${Math.min(index, 8) * 35}ms` }}>
              <span className={clsx('relative z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', TONE[entry.kind])}>
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1 pb-0.5">
                <p className="flex items-baseline justify-between gap-2 text-xs">
                  <span className="font-medium text-clay-ink">{entry.title}</span>
                  <span className="shrink-0 text-[11px] text-clay-muted">{shortDate(entry.date)}</span>
                </p>
                {entry.detail && <p className="text-xs text-clay-body [overflow-wrap:anywhere]">{entry.detail}</p>}
                {entry.quote && (
                  <blockquote className="mt-1 whitespace-pre-wrap rounded-lg border-l-2 border-clay-teal bg-clay-surface px-2.5 py-1.5 text-xs leading-relaxed text-clay-ink">
                    {entry.quote}
                  </blockquote>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {entries.length > PREVIEW && (
        <button type="button" onClick={() => setShowAll(value => !value)} className="mt-2 h-8 text-xs font-medium text-clay-lavender">
          {showAll ? 'Show fewer' : `Show all ${entries.length}`}
        </button>
      )}
    </section>
  );
}
