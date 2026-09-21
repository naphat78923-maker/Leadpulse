// LeadPulse — Home "Buying signals" TEASER.
//
// Full list lives at /signals (own page, undo-toast actions, company panel).
// The teaser shows count + top 2 signals and links there — no inline expansion,
// no dismiss buttons on Home (that was the invisible-refill trap: the pool is
// deeper than the cap, so acting on a card row just pulled the next one up).
//
// Persisted via Supabase (signal_dismissals) so Dismiss/Snooze made on /signals
// survive reloads AND sync across devices.

'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useCrm } from '@/components/CrmProvider';
import { Blob } from '@/components/blob';
import { ArrowRight } from 'lucide-react';
import {
  fetchReorderSignalRows,
  getReorderSignals,
  type ReorderSignal,
} from '@/lib/historical';
import { fetchSignalDismissals, type DismissalMap } from '@/lib/signal-dismissals';

export default function ReorderSignalsCard() {
  const { meetings, deals } = useCrm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // SSR-safe: seed empty, then hydrate from Supabase in an effect.
  const [dismissed, setDismissed] = useState<DismissalMap>({});

  useEffect(() => {
    let active = true;
    fetchSignalDismissals().then((map) => {
      if (active) setDismissed(map);
    });
    return () => {
      active = false;
    };
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

  // Quiet: show nothing while loading or when there's genuinely nothing to say.
  if (loading || signals.length === 0) return null;

  return (
    <section className="mb-6 rounded-2xl border border-clay-lavender/30 bg-clay-lavender/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Blob
          state="nudge"
          size={28}
          aria-label="Reorder signal mascot"
        />
        <div>
          <h2 className="zams-display text-base leading-tight">Buying signals</h2>
          <p className="text-xs text-clay-muted">
            {signals.length} account{signals.length === 1 ? '' : 's'} may be due for a reorder
          </p>
        </div>
        <span className="ml-auto text-[11px] font-semibold px-1.5 py-0.5 rounded-full bg-clay-lavender/20 text-clay-lavender">
          {signals.length}
        </span>
      </div>

      <ul className="space-y-2">
        {signals.slice(0, 2).map((s: ReorderSignal) => (
          <li key={s.customerId}>
            <Link
              href="/signals"
              className="block rounded-xl bg-white dark:bg-clay-card border border-clay-hairline p-3 active:opacity-70"
            >
              <p className="text-sm font-medium text-clay-ink truncate">{s.name}</p>
              <p className="text-xs text-clay-muted mt-0.5">{s.evidence}</p>
            </Link>
          </li>
        ))}
      </ul>

      <Link
        href="/signals"
        className="mt-3 flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg border border-clay-lavender/40 text-sm font-semibold text-clay-lavender active:opacity-80"
      >
        View all signals <ArrowRight className="w-4 h-4" />
      </Link>
    </section>
  );
}
