'use client';

import clsx from 'clsx';
import type { NudgeStage } from '@/types/crm';
import {
  NUDGE_LADDER_RUNGS,
  nudgeLadderIndex,
} from '@/utils/deal-workflow';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type NudgeLadderVariant = 'full' | 'mini';

interface LadderRung {
  stage: NudgeStage;
  label: string;
  shortLabel: string;
  code: string;
  color: string;
  track: string;
}

export interface NudgeLadderRailProps {
  /** Current rung — head position. Null hides the rail. */
  stage: NudgeStage | null | undefined;
  /** Rung definitions. Defaults to the day-based ladder (retention cadence);
   *  deal cards pass SEND_LADDER_RUNGS so the head advances per outbound send. */
  rungs?: readonly LadderRung[];
  variant?: NudgeLadderVariant;
  className?: string;
  /** Show rung labels under the full rail (default true for full). */
  showLabels?: boolean;
}

/**
 * Shared Nudge ladder rail.
 * Deal gauge: 1st → 2nd → 3rd → 4th send (then park) — head advances per send.
 * Retention rail: Warm 3d → Remind 7d → Firm 14d → Parking 21d (silence days).
 * Motion = head position on the ladder. Presentation only.
 */
export default function NudgeLadderRail({
  stage,
  rungs = NUDGE_LADDER_RUNGS,
  variant = 'full',
  className,
  showLabels,
}: NudgeLadderRailProps) {
  const reduceMotion = usePrefersReducedMotion();
  if (!stage) return null;

  const idx = nudgeLadderIndex(stage);
  if (idx < 0) return null;

  const active = rungs[idx];
  if (!active) return null;

  const labels = showLabels ?? variant === 'full';
  const isMini = variant === 'mini';
  const transition = reduceMotion ? 'none' : 'width 420ms cubic-bezier(0.22, 1, 0.36, 1), left 420ms cubic-bezier(0.22, 1, 0.36, 1), background-color 280ms ease';

  if (isMini) {
    return (
      <div
        data-nudge-ladder="mini"
        role="img"
        aria-label={`Nudge ladder: ${active.shortLabel} (${active.code})`}
        className={clsx('flex items-center gap-0.5 w-full max-w-[7.5rem]', className)}
        title={`${active.label} · ${active.code}`}
      >
        {rungs.map((rung, i) => {
          const on = i <= idx;
          const isHead = i === idx;
          return (
            <span
              key={rung.stage}
              className="h-1.5 flex-1 rounded-full"
              style={{
                backgroundColor: on ? rung.color : rung.track,
                opacity: on ? (isHead ? 1 : 0.85) : 1,
                transform: isHead && !reduceMotion ? 'scaleY(1.35)' : undefined,
                transition: reduceMotion ? 'none' : 'transform 280ms ease, background-color 280ms ease',
                boxShadow: isHead ? `0 0 0 1.5px ${rung.color}` : undefined,
              }}
            />
          );
        })}
      </div>
    );
  }

  // Full: segmented track + fill through current rung + head + labels
  const headPct = ((idx + 0.5) / rungs.length) * 100;

  return (
    <div
      data-nudge-ladder="full"
      className={clsx('w-full min-w-0', className)}
      role="img"
      aria-label={`Nudge ladder at ${active.label} (${active.code})`}
    >
      <div className="relative h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(168,152,128,0.18)' }}>
        {/* Segmented color wash under the fill */}
        <div className="absolute inset-0 flex" aria-hidden>
          {rungs.map(rung => (
            <span key={rung.stage} className="flex-1 h-full" style={{ backgroundColor: rung.track }} />
          ))}
        </div>
        {/* Fill through current rung */}
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${Math.round(((idx + 1) / rungs.length) * 1000) / 10}%`,
            background: `linear-gradient(90deg, ${rungs.slice(0, idx + 1).map(r => r.color).join(', ')})`,
            transition,
          }}
        />
        {/* Segment dividers */}
        <div className="absolute inset-0 flex pointer-events-none" aria-hidden>
          {rungs.map((rung, i) =>
            i === 0 ? (
              <span key={rung.stage} className="flex-1" />
            ) : (
              <span key={rung.stage} className="flex-1 relative">
                <span className="absolute left-0 top-0 bottom-0 w-px bg-clay-canvas/70 dark:bg-clay-ink/20" />
              </span>
            )
          )}
        </div>
        {/* Head — motion = position on the ladder */}
        <span
          aria-hidden
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3.5 w-3.5 rounded-full border-2 border-clay-canvas dark:border-clay-card shadow-sm"
          style={{
            left: `${headPct}%`,
            backgroundColor: active.color,
            transition: reduceMotion ? 'none' : 'left 420ms cubic-bezier(0.22, 1, 0.36, 1), background-color 280ms ease',
          }}
        />
      </div>

      {labels && (
        <div className="mt-1.5 flex justify-between gap-1">
          {rungs.map((rung, i) => (
            <span
              key={rung.stage}
              className={clsx(
                'flex-1 text-center text-[9px] font-medium leading-tight tracking-tight',
                i === idx ? 'text-clay-ink' : 'text-clay-muted-soft'
              )}
              style={i === idx ? { color: rung.color } : undefined}
            >
              {rung.label}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
