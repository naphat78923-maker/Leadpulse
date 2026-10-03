'use client';

// ─── Laya's mark: a small four-point spark ───
// Still when idle, a slow breathe while working (grading, waiting on the worker), a
// warning tint when alert. When work finishes (working → ok) the spark morphs into a
// tick, holds, and morphs back: both shapes are eight-point polygons, so the outline
// itself moves from one to the other. All motion is off under prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import clsx from 'clsx';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export type SparkState = 'idle' | 'working' | 'ok' | 'alert';

const TONE: Record<SparkState, string> = {
  idle: 'text-clay-muted',
  working: 'text-clay-ochre',
  ok: 'text-clay-success',
  alert: 'text-clay-error',
};

// Eight vertices each, clockwise from the top, so framer-motion can interpolate `d`.
export const SPARK_PATH = 'M8 0 L10 6 L16 8 L10 10 L8 16 L6 10 L0 8 L6 6 Z';
export const TICK_PATH = 'M13.6 3.4 L15 4.8 L6.5 13.3 L6.5 13.3 L1.6 8.4 L3 7 L6.5 10.5 L6.5 10.5 Z';

export default function LayaSpark({ state = 'idle', className }: { state?: SparkState; className?: string }) {
  const reduce = usePrefersReducedMotion();
  const previous = useRef(state);
  /** bumps each time work finishes, which replays the morph */
  const [finished, setFinished] = useState(0);

  useEffect(() => {
    // Only a real finish morphs: a spark that mounts already "ok" stays a spark.
    if (previous.current === 'working' && state === 'ok') setFinished(n => n + 1);
    previous.current = state;
  }, [state]);

  const morph = finished > 0 && state === 'ok' && !reduce;

  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      data-spark={state}
      data-morph={morph || undefined}
      className={clsx('inline-block h-3 w-3 shrink-0 align-middle', TONE[state], state === 'working' && 'laya-spark-working', className)}
    >
      {morph ? (
        <motion.path
          key={finished}
          fill="currentColor"
          initial={{ d: SPARK_PATH }}
          animate={{ d: [SPARK_PATH, TICK_PATH, TICK_PATH, SPARK_PATH] }}
          transition={{ duration: 2.2, times: [0, 0.18, 0.82, 1], ease: [0.22, 1, 0.36, 1] }}
        />
      ) : (
        <path fill="currentColor" d={SPARK_PATH} />
      )}
    </svg>
  );
}
