// ─── Laya's mark: a small four-point spark ───
// Still when idle, a slow breathe while working (grading, waiting on the worker), and a
// warning tint when stalled. Animation is CSS (globals.css .laya-spark-*) and switches
// off under prefers-reduced-motion.

import clsx from 'clsx';

export type SparkState = 'idle' | 'working' | 'ok' | 'alert';

const TONE: Record<SparkState, string> = {
  idle: 'text-clay-muted',
  working: 'text-clay-ochre',
  ok: 'text-clay-success',
  alert: 'text-clay-error',
};

export default function LayaSpark({ state = 'idle', className }: { state?: SparkState; className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-spark={state}
      className={clsx('inline-block h-3 w-3 shrink-0 align-middle', TONE[state], state === 'working' && 'laya-spark-working', state === 'ok' && 'laya-spark-settle', className)}
    >
      <path fill="currentColor" d="M8 0c.5 3.9 1.6 6 8 8-6.4 2-7.5 4.1-8 8-.5-3.9-1.6-6-8-8 6.4-2 7.5-4.1 8-8Z" />
    </svg>
  );
}
