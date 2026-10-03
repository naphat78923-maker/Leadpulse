'use client';

// ─── A button that shows what it is doing ───
// Idle: its label. Busy: three dots in a wave. Done: a tick that draws itself, for a
// moment, then the label again. The label keeps the button's width so nothing jumps.
// The busy and done states are announced to screen readers; motion is CSS and switches
// off under prefers-reduced-motion.

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

const VARIANT = {
  primary: 'bg-clay-ink text-clay-canvas hover:opacity-90',
  quiet: 'border border-clay-hairline text-clay-ink hover:border-clay-ink/30',
} as const;

/** How long the tick stays before the label returns. */
export const DONE_MS = 1400;

export default function ActionButton({ busy, onClick, disabled, variant = 'primary', children, className }: {
  busy: boolean;
  onClick: () => void;
  disabled?: boolean;
  variant?: keyof typeof VARIANT;
  children: React.ReactNode;
  className?: string;
}) {
  const wasBusy = useRef(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (wasBusy.current && !busy) {
      setDone(true);
      const timer = setTimeout(() => setDone(false), DONE_MS);
      wasBusy.current = busy;
      return () => clearTimeout(timer);
    }
    wasBusy.current = busy;
  }, [busy]);

  const phase = busy ? 'busy' : done ? 'done' : 'idle';

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || busy}
      data-phase={phase}
      className={clsx('relative inline-flex h-8 items-center justify-center rounded-lg px-3 text-xs font-medium transition-opacity disabled:opacity-50', VARIANT[variant], className)}
    >
      <span className={clsx('transition-opacity duration-150', phase !== 'idle' && 'opacity-0')}>{children}</span>
      {phase === 'busy' && (
        <span className="absolute inset-0 flex items-center justify-center gap-1" role="status" aria-label="Working">
          {[0, 1, 2].map(i => <span key={i} className="lp-dot h-1 w-1 rounded-full bg-current" style={{ animationDelay: `${i * 120}ms` }} />)}
        </span>
      )}
      {phase === 'done' && (
        <span className="absolute inset-0 flex items-center justify-center" role="status" aria-label="Done">
          <svg viewBox="0 0 16 16" className="lp-check h-4 w-4" aria-hidden="true">
            <path d="M3 8.5l3.2 3.2L13 5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      )}
    </button>
  );
}
