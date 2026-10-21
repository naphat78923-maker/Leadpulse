'use client';

import { useMemo, useRef, useState } from 'react';
import { FileUp, Loader2, X } from 'lucide-react';
import { useCrm } from '@/components/CrmProvider';
import { useToast } from '@/components/ToastProvider';
import * as sales from '@/lib/sales';
import { parseFlowAccountSales } from '@/utils/flowaccount';
import { planImport, rowsToSave, type ImportPlan } from '@/utils/sales-import';
import { formatBaht } from '@/utils/format';

/** Drop in FlowAccount's sales report CSV; see what it adds; save. */
export default function SalesImport({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { companies, refresh } = useCrm();
  const { addToast } = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [plan, setPlan] = useState<ImportPlan | null>(null);
  const [links, setLinks] = useState<Record<string, string | null>>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<'reading' | 'saving' | null>(null);

  const accounts = useMemo(
    () => companies.map((c) => ({ id: c.id, name: c.name })).sort((a, b) => a.name.localeCompare(b.name)),
    [companies],
  );

  const readFile = async (file: File) => {
    setFileName(file.name);
    setPlan(null);
    setError(null);
    const parsed = parseFlowAccountSales(await file.text());
    if (!parsed.ok) { setError(parsed.error); return; }
    setBusy('reading');
    try {
      const next = planImport(parsed.rows, await sales.previewInvoiceImport(parsed.rows), accounts);
      setPlan(next);
      setLinks(Object.fromEntries(next.toMatch.map((m) => [m.name, m.suggestedCompanyId])));
    } catch (err) {
      setError(`Couldn’t check the file against LeadPulse: ${err instanceof Error ? err.message : 'unknown error'}`);
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!plan) return;
    setBusy('saving');
    setError(null);
    try {
      const result = await sales.importInvoices(rowsToSave(plan, links));
      addToast(`Added ${result.added} invoice${result.added === 1 ? '' : 's'}`);
      await refresh();
      onSaved();
    } catch (err) {
      setError(`Couldn’t save: ${err instanceof Error ? err.message : 'unknown error'}`);
      setBusy(null);
    }
  };

  return (
    <div className="mb-5 rounded-xl border border-clay-hairline bg-white p-4 dark:bg-clay-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-clay-ink">Import from FlowAccount</h2>
        <button type="button" onClick={onClose} aria-label="Close import" className="rounded-lg p-1 text-clay-muted active:bg-clay-surface">
          <X className="h-4 w-4" />
        </button>
      </div>

      <input
        ref={fileInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void readFile(f); e.target.value = ''; }}
      />
      <button
        type="button"
        onClick={() => fileInput.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-clay-hairline bg-clay-surface px-3 py-4 text-sm text-clay-ink active:bg-clay-card"
      >
        {busy === 'reading' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
        {fileName ?? 'Choose the sales report CSV'}
      </button>
      {!plan && !error && (
        <p className="mt-2 text-xs text-clay-muted">In FlowAccount, export the sales report (รายงานยอดขาย) as CSV. The whole year is fine: invoices already here are skipped, and orders you logged in LeadPulse are covered by their invoices.</p>
      )}
      {error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {plan && (
        <div className="mt-4 space-y-4">
          <p className="text-sm text-clay-ink">
            {plan.newRows.length ? (
              <><span className="font-semibold">{plan.newRows.length} new invoice{plan.newRows.length === 1 ? '' : 's'}</span> · {formatBaht(plan.total)}</>
            ) : 'Nothing new in this file'}
            {plan.alreadyIn > 0 && <span className="text-clay-muted"> · {plan.alreadyIn} already in</span>}
          </p>

          {plan.toMatch.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-clay-ink">Which account is this?</h3>
              <div className="mt-1 divide-y divide-clay-hairline">
                {plan.toMatch.map((m) => (
                  <label key={m.name} className="flex flex-col gap-1.5 py-2 sm:flex-row sm:items-center sm:justify-between">
                    <span className="min-w-0 text-sm text-clay-ink">
                      {m.name}
                      <span className="ml-1.5 text-xs text-clay-muted">{m.invoices} invoice{m.invoices === 1 ? '' : 's'}{m.known ? '' : ' · new customer'}</span>
                    </span>
                    <select
                      value={links[m.name] ?? ''}
                      onChange={(e) => setLinks((prev) => ({ ...prev, [m.name]: e.target.value || null }))}
                      className="w-full rounded-lg border border-clay-hairline bg-white px-2 py-1.5 text-base sm:w-56 sm:text-sm dark:bg-clay-card"
                    >
                      <option value="">Not in LeadPulse</option>
                      {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
            </div>
          )}


          {plan.newRows.length > 0 && (
            <button
              type="button"
              onClick={save}
              disabled={busy === 'saving'}
              className="flex items-center gap-2 rounded-lg bg-clay-ink px-4 py-2 text-sm font-medium text-clay-canvas motion-press disabled:opacity-60"
            >
              {busy === 'saving' && <Loader2 className="h-4 w-4 animate-spin" />}
              Add {plan.newRows.length} invoice{plan.newRows.length === 1 ? '' : 's'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
