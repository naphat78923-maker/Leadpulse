// LeadPulse — Phase 1 "Buying signals" card (collapsed, max 5).
//
// PLACEMENT (apply manually into src/app/page.tsx — NOT auto-applied):
//   1. import ReorderSignalsCard from '@/components/ReorderSignalsCard';
//   2. Render <ReorderSignalsCard /> just BELOW the Action queue section
//      (after the {...actionQueue...} block, before any loading/empty guard).
// It reads from the `reorder_signals` view via src/lib/historical.ts and never
// adds rows to the existing Action queue, so today's workflow stays primary.
//
// WIRING SNIPPET (paste into page.tsx):
//   <ReorderSignalsCard />
//
// Persisted via localStorage so Dismiss (permanent) / Snooze (30d) survive reloads.

'use client';

import { useEffect, useMemo, useState } from 'react';
import { useCrm } from '@/components/CrmProvider';
import MascotSprite from '@/components/MascotSprite';
import { ChevronDown, ChevronRight, X, Clock } from 'lucide-react';
import {
  fetchReorderSignalRows,
  getReorderSignals,
  type ReorderSignal,
} from '@/lib/historical';

const DISMISS_KEY = 'lp_reorder_signal_dismiss';

function loadDismissed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}
function saveDismissed(d: Record<string, number>) {
  localStorage.setItem(DISMISS_KEY, JSON.stringify(d));
}

const SNOOZE_MS = 30 * 86400000;

export default function ReorderSignalsCard() {
  const { meetings, deals } = useCrm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);
  // SSR-safe: localStorage is unavailable during server render, so seed empty
  // and hydrate from the browser in an effect.
  const [dismissed, setDismissed] = useState<Record<string, number>>({});

  useEffect(() => {
    setDismissed(loadDismissed());
  }, []);

  useEffect(() => {
    let active = true;
    fetchReorderSignalRows()
      .then((r) => {
        if (active) {
          setRows(r);
          setLoading(false);
        }
      })
      .catch(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const signals = useMemo(
    () => getReorderSignals(rows, meetings as any[], deals as any[], dismissed),
    [rows, meetings, deals, dismissed],
  );

  function dismiss(id: string, snooze: boolean) {
    const next = {
      ...dismissed,
      [id]: snooze ? Date.now() + SNOOZE_MS : Number.MAX_SAFE_INTEGER,
    };
    setDismissed(next);
    saveDismissed(next);
  }

  // Quiet: show nothing while loading or when there's genuinely nothing to say.
  if (loading || signals.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-clay-lavender/30 bg-clay-lavender/5 p-4">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-2 text-left group"
        aria-expanded={expanded}
      >
        <MascotSprite
          src="/assets/mascots/mascot-followup.png"
          size={28}
          alt="Reorder signal mascot"
        />
        <div>
          <h2 className="zams-display text-base leading-tight group-hover:text-clay-lavender transition-colors">
            Buying signals
          </h2>
          <p className="text-xs text-clay-muted">
            {signals.length} account{signals.length === 1 ? '' : 's'} may be due for a reorder
          </p>
        </div>
        <span className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-clay-lavender/20 text-clay-lavender">
          {signals.length}
        </span>
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-clay-muted shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-clay-muted shrink-0" />
        )}
      </button>

      {expanded && (
        <ul className="mt-3 space-y-3">
          {signals.map((s: ReorderSignal) => (
            <li
              key={s.customerId}
              className="rounded-xl bg-white dark:bg-clay-card border border-clay-hairline p-3"
            >
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-clay-ink truncate">{s.name}</p>
                  <p className="text-xs text-clay-muted mt-0.5">{s.evidence}</p>
                  <p className="text-xs font-semibold text-clay-body mt-1">
                    {s.suggestedAction}
                  </p>
                </div>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => dismiss(s.customerId, false)}
                    aria-label="Dismiss"
                    className="w-8 h-8 rounded-lg border border-clay-hairline flex items-center justify-center text-clay-muted hover:text-clay-error transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => dismiss(s.customerId, true)}
                    aria-label="Snooze 30 days"
                    className="w-8 h-8 rounded-lg border border-clay-hairline flex items-center justify-center text-clay-muted hover:text-clay-ochre transition-colors"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
