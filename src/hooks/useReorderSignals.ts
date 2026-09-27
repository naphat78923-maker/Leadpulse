'use client';

// LeadPulse — shared reorder-signal state for both surfaces that show signals:
// This week's check-ins (CRM-linked only) and /signals (full list).
//
// Before this hook both components duplicated the same four effects (rows fetch,
// dismissal fetch, SSR-safe guards, legacy-key migration) — and the legacy
// migration existed on the page but not the teaser, so a stale localStorage key
// would migrate on one surface only.
//
// The undo closure lives here (and in a ref) so the toast can actually call it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useCrm } from '@/components/CrmProvider';
import {
  fetchReorderSignalRows,
  rankSignals,
  type ReorderSignal,
  type ReorderSignalRow,
} from '@/lib/historical';
import {
  fetchSignalDismissals,
  saveSignalDismissal,
  restoreSignalDismissal,
  PERMANENT_DISMISS,
  type DismissalMap,
} from '@/lib/signal-dismissals';

// Legacy key from the pre-Supabase era — read once for migration, then removed.
const DISMISS_KEY = 'lp_reorder_signal_dismiss';
const SNOOZE_MS = 30 * 86400000;
export const UNDO_WINDOW_MS = 5000;

function loadLegacyDismissed(): DismissalMap {
  try {
    return JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
  } catch {
    return {};
  }
}

/** Raw signal data: view rows + dismissals, hydrated from Supabase. */
export function useReorderSignalData() {
  const [rows, setRows] = useState<ReorderSignalRow[]>([]);
  const [loading, setLoading] = useState(true);
  // SSR-safe: seed empty, then hydrate from Supabase in an effect.
  const [dismissed, setDismissed] = useState<DismissalMap>({});

  useEffect(() => {
    let active = true;
    (async () => {
      const remote = await fetchSignalDismissals();
      if (!active) return;
      // One-time migration: pull any pre-Supabase localStorage entries up.
      // Only fills gaps — never clobbers a newer server value. Removes the
      // legacy key afterwards so this runs once per browser.
      const legacy = loadLegacyDismissed();
      const legacyKeys = Object.keys(legacy);
      if (legacyKeys.length > 0) {
        const merged = { ...remote };
        for (const id of legacyKeys) {
          if (!(id in merged)) merged[id] = legacy[id];
        }
        setDismissed(merged);
        await Promise.all(
          legacyKeys
            .filter((id) => !(id in remote))
            .map((id) => saveSignalDismissal(id, legacy[id])),
        );
        try {
          localStorage.removeItem(DISMISS_KEY);
        } catch {}
      } else {
        setDismissed(remote);
      }
    })();
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

  return { rows, loading, dismissed, setDismissed };
}

export interface SignalToastState {
  signal: ReorderSignal;
  snooze: boolean;
}

/**
 * Ranked signals + dismiss/snooze with a working undo window.
 * `includeUnlinked` is passed straight to rankSignals (Home stays gated).
 */
export function useReorderSignals(options: { includeUnlinked?: boolean } = {}) {
  const { meetings, deals } = useCrm();
  const { rows, loading, dismissed, setDismissed } = useReorderSignalData();
  const [toast, setToast] = useState<SignalToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The undo closure for the CURRENT toast — set when hiding, called by undo().
  const undoRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const signals = useMemo(
    () =>
      rankSignals(
        rows,
        meetings as unknown as Parameters<typeof rankSignals>[1],
        deals as unknown as Parameters<typeof rankSignals>[2],
        dismissed,
        { includeUnlinked: options.includeUnlinked },
      ),
    [rows, meetings, deals, dismissed, options.includeUnlinked],
  );

  const hide = useCallback(
    (signal: ReorderSignal, snooze: boolean) => {
      // Optimistic update first (UI reacts instantly), then persist.
      const prevEntry = dismissed[signal.customerId];
      const hiddenUntil = snooze ? Date.now() + SNOOZE_MS : PERMANENT_DISMISS;

      setDismissed((current) => ({ ...current, [signal.customerId]: hiddenUntil }));
      saveSignalDismissal(signal.customerId, hiddenUntil);

      undoRef.current = async () => {
        // restore previous value (or delete the row when there was none)
        await restoreSignalDismissal(signal.customerId, prevEntry);
        setDismissed((current) => {
          // Drop our entry only if nothing newer replaced it meanwhile.
          if (current[signal.customerId] !== hiddenUntil) return current;
          const restored = { ...current };
          if (prevEntry === undefined) delete restored[signal.customerId];
          else restored[signal.customerId] = prevEntry;
          return restored;
        });
      };

      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast({ signal, snooze });
      toastTimer.current = setTimeout(() => {
        setToast(null);
        undoRef.current = null;
      }, UNDO_WINDOW_MS);
    },
    [dismissed, setDismissed],
  );

  const undo = useCallback(async () => {
    const runUndo = undoRef.current;
    undoRef.current = null;
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    await runUndo?.();
  }, []);

  return { signals, loading, toast, hide, undo };
}
