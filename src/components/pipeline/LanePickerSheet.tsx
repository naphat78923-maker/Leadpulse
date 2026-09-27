'use client';

import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import type { Deal, DealWorkflowAction } from '@/types/crm';
import { WORKFLOW_LANES } from '@/utils/deal-workflow';
import { LANE_CRITERIA } from './board-view';

/* ─── Mobile lane picker: tap Move, choose the lane, then the gate opens ─── */
export default function LanePickerSheet({
  deal, currentLane, counts, onPick, onExit, onClose,
}: {
  deal: Deal;
  currentLane: DealWorkflowAction;
  counts: Record<string, Deal[]>;
  onPick: (target: DealWorkflowAction) => void;
  onExit: (kind: 'won' | 'lost' | 'park') => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[65] md:hidden flex items-end">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white dark:bg-clay-card w-full rounded-t-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-clay-card border-b border-clay-hairline px-5 py-4 z-10 flex items-start justify-between gap-3">
          <div>
            <p className="zams-eyebrow mb-0.5">Move deal</p>
            <h2 className="text-sm font-semibold text-clay-ink truncate">{deal.client}</h2>
          </div>
          <button onClick={onClose} className="p-2 text-clay-muted active:bg-clay-surface rounded-lg shrink-0">
            <ArrowRight className="w-5 h-5 -rotate-90" />
          </button>
        </div>
        <div className="p-3 space-y-1.5">
          <p className="zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted px-1">Journey</p>
          {WORKFLOW_LANES.map(lane => (
            <button
              key={lane.id}
              onClick={() => onPick(lane.id)}
              className={clsx(
                'w-full flex items-center gap-3 px-3 py-3 rounded-lg border text-left transition-colors',
                currentLane === lane.id
                  ? 'border-clay-lavender bg-clay-lavender/20'
                  : 'border-clay-hairline bg-white dark:bg-clay-card active:bg-clay-surface'
              )}
            >
              <span className="text-lg shrink-0">{lane.icon}</span>
              <span className="flex-1 min-w-0">
                <span className="block text-sm font-medium text-clay-ink truncate">{lane.label}</span>
                <span className="block zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted-soft mt-0.5">{LANE_CRITERIA[lane.id]}</span>
              </span>
              <span className="text-xs text-clay-muted-soft shrink-0">{counts[lane.id]?.length ?? 0}</span>
            </button>
          ))}
          <p className="zams-mono text-[9px] uppercase tracking-[0.14px] text-clay-muted px-1 pt-2">Exits (not columns)</p>
          {([
            ['won', '🎉 Mark won'],
            ['lost', '📉 Mark lost'],
            ['park', '⏸ Park'],
          ] as const).map(([kind, label]) => (
            <button
              key={kind}
              onClick={() => onExit(kind)}
              className="w-full flex items-center gap-3 px-3 py-3 rounded-lg border border-clay-hairline bg-white dark:bg-clay-card text-left active:bg-clay-surface"
            >
              <span className="text-sm font-medium text-clay-ink">{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
