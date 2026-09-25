'use client';

// LeadPulse — Signals page (full ranked list of historical reorder signals).
// Companion to the Home teaser card. Unlike Home this list is NOT CRM-gated:
// historical buyers that aren't in the CRM yet are exactly what this page is
// for (they're invisible everywhere else). Dismiss/Snooze always carry a
// working undo window; state persists via signal_dismissals.

import { useMemo, useState } from 'react';
import { useCrm } from '@/components/CrmProvider';
import CompanyDetail from '@/components/CompanyDetail';
import { Blob } from '@/components/blob';
import { X, Clock, Loader2, Radar, Undo2 } from 'lucide-react';
import { useReorderSignals } from '@/hooks/useReorderSignals';
import type { Contact } from '@/types/crm';

const fmtBaht = (n: number) => '฿' + Math.round(n).toLocaleString('en-US');

/** Median of a numeric list (0 when empty). Even counts average the middle two. */
function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export default function SignalsPage() {
  const { companies, contacts } = useCrm();
  const { signals, loading, toast, hide, undo } = useReorderSignals({ includeUnlinked: true });
  const [selectedCompanyId, setSelectedCompanyId] = useState<string | null>(null);

  const unlinkedCount = useMemo(() => signals.filter((s) => !s.inCrm).length, [signals]);
  const medianValue = useMemo(() => median(signals.map((s) => s.typicalValue)), [signals]);

  const activeCompany = useMemo(
    () => companies.find((c) => c.id === selectedCompanyId) || null,
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
        <Blob state="nudge" size={44} aria-label="Buying signals mascot" />
        <div>
          <h1 className="text-xl md:text-2xl font-semibold text-clay-ink tracking-tight flex items-center gap-2">
            <Radar className="w-6 h-6 text-clay-lavender" /> Buying signals
          </h1>
          <p className="text-sm text-clay-muted mt-0.5">Historical buyers going quiet — worth a revisit</p>
        </div>
      </div>

      {/* KPI strip — both numbers describe the list below, nothing inferred */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="bg-clay-card border border-clay-hairline rounded-xl p-4 clay-card">
          <div className="flex items-center gap-1.5 mb-2 text-clay-lavender">
            <Radar className="w-4 h-4" />
            <span className="text-xs font-medium">Waiting on you</span>
          </div>
          <p className="text-xl font-bold text-clay-ink tracking-tight">{signals.length}</p>
          <p className="text-[11px] text-clay-muted-soft mt-0.5">
            {unlinkedCount > 0 ? `${unlinkedCount} not in the CRM yet` : 'not dismissed or snoozed'}
          </p>
        </div>
        <div className="bg-clay-card border border-clay-hairline rounded-xl p-4 clay-card">
          <div className="flex items-center gap-1.5 mb-2 text-clay-mint">
            <Clock className="w-4 h-4" />
            <span className="text-xs font-medium">Median order value</span>
          </div>
          <p className="text-xl font-bold text-clay-ink tracking-tight">{fmtBaht(medianValue)}</p>
          <p className="text-[11px] text-clay-muted-soft mt-0.5">per order, across these accounts</p>
        </div>
      </div>


      {/* Signal list */}
      {signals.length === 0 ? (
        <div className="text-center py-16 bg-white dark:bg-clay-card rounded-xl border border-clay-hairline">
          <div className="relative mx-auto mb-4 w-24 h-24">
            <div className="absolute inset-0 rounded-full bg-clay-lavender/15" />
            <Blob state="sleep" size={88} aria-label="No signals mascot" />
          </div>
          <p className="text-sm font-medium text-clay-ink mb-1">No signals right now</p>
          <p className="text-xs text-clay-muted px-8">
            When a historical buyer goes quiet past their usual cycle, they&apos;ll surface here.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {signals.map((s) => {
            const body = (
              <>
                <div className="flex items-center gap-2 min-w-0">
                  <p className="text-sm font-medium text-clay-ink truncate">{s.name}</p>
                  {!s.inCrm && (
                    <span className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded bg-clay-ochre/15 text-clay-ochre">
                      Not in CRM
                    </span>
                  )}
                  {s.severityDays > 0 && (
                    <span className="shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-clay-coral/15 text-clay-coral">
                      {s.severityDays}d past cycle
                    </span>
                  )}
                </div>
                <p className="text-xs text-clay-muted mt-0.5">{s.evidence}</p>
                <p className="text-xs font-semibold text-clay-body mt-1">{s.suggestedAction}</p>
              </>
            );
            return (
              <li
                key={s.customerId}
                className="rounded-xl bg-white dark:bg-clay-card border border-clay-hairline p-3.5"
              >
                <div className="flex items-start gap-2">
                  {s.crmCompanyId ? (
                    <button
                      onClick={() => setSelectedCompanyId(s.crmCompanyId)}
                      className="flex-1 min-w-0 text-left active:opacity-70"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex-1 min-w-0">{body}</div>
                  )}
                  <div className="flex flex-col gap-1 shrink-0">
                    <button
                      onClick={() => hide(s, false)}
                      aria-label={`Dismiss ${s.name}`}
                      className="w-9 h-9 rounded-lg border border-clay-hairline flex items-center justify-center text-clay-muted hover:text-clay-error transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => hide(s, true)}
                      aria-label={`Snooze ${s.name} for 30 days`}
                      className="w-9 h-9 rounded-lg border border-clay-hairline flex items-center justify-center text-clay-muted hover:text-clay-ochre transition-colors"
                    >
                      <Clock className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}


      {/* Company detail panel */}
      {activeCompany && (
        <CompanyDetail
          company={activeCompany}
          onClose={() => setSelectedCompanyId(null)}
          onSaved={() => {}}
          contacts={contacts as unknown as Contact[]}
          companyContacts={companyContacts}
        />
      )}

      {/* Undo toast — the button calls the undo closure captured by the hook */}
      {toast && (
        <div className="fixed bottom-20 lg:bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
          <div className="bg-clay-ink text-clay-canvas rounded-full pl-4 pr-2 py-2 shadow-lg flex items-center gap-2">
            <span className="text-xs font-medium flex-1 truncate">
              {toast.snooze ? 'Snoozed 30 days' : 'Dismissed'} · {toast.signal.name}
            </span>
            <button
              onClick={undo}
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
