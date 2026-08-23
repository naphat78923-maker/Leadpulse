'use client';

// LeadPulse — Signals page (full ranked list of historical reorder signals).
// Companion to the Home teaser card. Every dismiss/snooze shows an undo toast
// so the action is always visible; state persists via lp_reorder_signal_dismiss.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useCrm } from '@/components/CrmProvider';
import CompanyDetail from '@/components/CompanyDetail';
import MascotSprite from '@/components/MascotSprite';
import { X, Clock, Loader2, Radar, Undo2 } from 'lucide-react';
import {
  fetchReorderSignalRows,
  rankSignals,
  type ReorderSignal,
} from '@/lib/historical';
import type { Contact } from '@/types/crm';

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
const UNDO_WINDOW_MS = 5000;

const fmtBaht = (n: number) => '฿' + Math.round(n).toLocaleString('en-US');

export default function SignalsPage() {
  const { meetings, deals, companies, contacts } = useCrm();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // SSR-safe: localStorage unavailable during server render — hydrate in effect.
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ signal: ReorderSignal; snooze: boolean } | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const signals = useMemo(
    () => rankSignals(rows, meetings as any[], deals as any[], dismissed),
    [rows, meetings, deals, dismissed],
  );

  const valueAtStake = useMemo(
    () => signals.reduce((sum, s) => sum + s.typicalValue, 0),
    [signals],
  );

  function hideSignal(signal: ReorderSignal, snooze: boolean) {
    // Snapshot for undo: drop this signal's entry on undo, not the whole map.
    const prevEntry = dismissed[signal.customerId];
    const next = {
      ...dismissed,
      [signal.customerId]: snooze ? Date.now() + SNOOZE_MS : Number.MAX_SAFE_INTEGER,
    };
    setDismissed(next);
    saveDismissed(next);

    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ signal, snooze });
    toastTimer.current = setTimeout(() => setToast(null), UNDO_WINDOW_MS);

    return () => {
      // undo closure
      const restored = { ...next };
      if (prevEntry === undefined) delete restored[signal.customerId];
      else restored[signal.customerId] = prevEntry;
      setDismissed(restored);
      saveDismissed(restored);
      if (toastTimer.current) clearTimeout(toastTimer.current);
      setToast(null);
    };
  }

  const activeCompany = useMemo(
    () => companies.find((c: any) => c.id === selectedCompanyId) || null,
    [companies, selectedCompanyId],
  );
  const companyContacts = useMemo(
    () =>
      selectedCompanyId
        ? (contacts as Contact[]).filter((c) => c.company_id === selectedCompanyId)
        : [],
    [contacts, selectedCompanyId],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 text-clay-ink animate-spin" />
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-6xl pb-24 lg:pb-6">
      {/* Header */}
      <div className="mb-5 md:mb-6 flex items-center gap-3">
        <MascotSprite src="/assets/mascots/mascot-followup.png" size={44} alt="Buying signals mascot" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink tracking-tight flex items-center gap-2">
            <Radar className="w-6 h-6 text-clay-lavender" /> Buying signals
          </h1>
          <p className="text-sm text-clay-muted mt-0.5">Historical buyers going quiet — worth a revisit</p>
        </div>
      </div>

      {/* KPI strip */}
      {!loading && (
        <div className="grid grid-cols-2 gap-3 mb-5">
          <div className="bg-clay-card border border-clay-hairline rounded-xl p-4 clay-card">
            <div className="flex items-center gap-1.5 mb-2 text-clay-lavender">
              <Radar className="w-4 h-4" />
              <span className="text-xs font-medium">Due for revisit</span>
            </div>
            <p className="text-xl font-bold text-clay-ink tracking-tight">{signals.length}</p>
            <p className="text-[11px] text-clay-muted-soft mt-0.5">accounts past their usual cycle</p>
          </div>
          <div className="bg-clay-card border border-clay-hairline rounded-xl p-4 clay-card">
            <div className="flex items-center gap-1.5 mb-2 text-clay-mint">
              <Clock className="w-4 h-4" />
              <span className="text-xs font-medium">Typical value</span>
            </div>
            <p className="text-xl font-bold text-clay-ink tracking-tight">{fmtBaht(valueAtStake)}</p>
            <p className="text-[11px] text-clay-muted-soft mt-0.5">combined order value at stake</p>
          </div>
        </div>
      )}

      {/* Signal list */}
      {signals.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
          <div className="relative mx-auto mb-4 w-24 h-24">
            <div className="absolute inset-0 rounded-full bg-clay-lavender/15" />
            <MascotSprite
              src="/assets/mascots/mascot-followup.png"
              size={96}
              alt="No signals mascot"
            />
          </div>
          <p className="text-sm font-medium text-clay-ink mb-1">No signals right now</p>
          <p className="text-xs text-clay-muted px-8">
            When a historical buyer goes quiet past their usual cycle, they&apos;ll surface here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {signals.map((s) => (
            <li
              key={s.customerId}
              className="rounded-xl bg-white dark:bg-clay-card border border-clay-hairline p-3.5"
            >
              <div className="flex items-start gap-2">
                <button
                  onClick={() => s.crmCompanyId && setSelectedCompanyId(s.crmCompanyId)}
                  className="flex-1 min-w-0 text-left active:opacity-70"
                >
                  <p className="text-sm font-medium text-clay-ink truncate">{s.name}</p>
                  <p className="text-xs text-clay-muted mt-0.5">{s.evidence}</p>
                  <p className="text-xs font-semibold text-clay-body mt-1">{s.suggestedAction}</p>
                </button>
                <div className="flex flex-col gap-1 shrink-0">
                  <button
                    onClick={() => hideSignal(s, false)}
                    aria-label={`Dismiss ${s.name}`}
                    className="w-9 h-9 rounded-lg border border-clay-hairline flex items-center justify-center text-clay-muted hover:text-clay-error transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => hideSignal(s, true)}
                    aria-label={`Snooze ${s.name} for 30 days`}
                    className="w-9 h-9 rounded-lg border border-clay-hairline flex items-center justify-center text-clay-muted hover:text-clay-ochre transition-colors"
                  >
                    <Clock className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Company detail panel */}
      {activeCompany && (
        <CompanyDetail
          company={activeCompany}
          onClose={() => setSelectedCompanyId(null)}
          onSaved={() => {}}
          contacts={contacts as any}
          companyContacts={companyContacts as any}
        />
      )}

      {/* Undo toast */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
          <div className="bg-clay-ink text-clay-canvas rounded-full pl-4 pr-2 py-2 shadow-lg flex items-center gap-2">
            <span className="text-xs font-medium flex-1 truncate">
              {toast.snooze ? 'Snoozed 30 days' : 'Dismissed'} · {toast.signal.name}
            </span>
            <button
              onClick={() => hideSignal(toast.signal, toast.snooze)()}
              className="flex items-center gap-1 text-xs font-semibold px-3 py-1.5 rounded-full bg-clay-canvas/10 hover:bg-clay-canvas/20 transition-colors min-h-[36px]"
            >
              <Undo2 className="w-3.5 h-3.5" /> Undo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
