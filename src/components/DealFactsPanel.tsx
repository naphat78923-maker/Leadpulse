'use client';

// ─── Deal panel: order size and the call checklist ───
// Facts Pat confirms or asks for, saved on the deal and read by the grade (grade.ts
// orderKg). Each save is version-checked like any deal edit and can be undone from
// Recent changes.

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import type { CallChecklist, Deal } from '@/types/crm';
import * as crm from '@/lib/crm';
import { useCrm } from '@/components/CrmProvider';
import ActionButton from '@/components/ActionButton';
import { kilogramsStated } from '@/utils/order-quantity';

const input = 'h-8 rounded-lg border border-clay-hairline bg-transparent px-2.5 text-xs text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-ink/10';
const button = 'inline-flex h-8 items-center rounded-lg border border-clay-hairline px-3 text-xs font-medium text-clay-ink hover:border-clay-ink/30 disabled:opacity-50';

const kg = (n: number) => `${Number(n.toFixed(2))} kg`;

/** A positive number from typed text, or null. */
function parseKg(text: string): number | null {
  const n = Number(text.replace(/,/g, '').trim());
  return text.trim() !== '' && Number.isFinite(n) && n > 0 ? n : null;
}

export default function DealFactsPanel({ deal }: { deal: Deal }) {
  const { refresh, logActivity } = useCrm();
  const [kgDraft, setKgDraft] = useState('');
  const [checklist, setChecklist] = useState<{ decision_maker: string; monthly_volume_kg: string; current_product: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fromReply = kilogramsStated(deal.buyer_reply);
  const saved = deal.stated_order_kg ?? null;
  const answers = deal.call_checklist ?? {};
  const answered = [answers.decision_maker, answers.monthly_volume_kg, answers.current_product].filter(v => v !== undefined && v !== '').length;

  const write = async (updates: Partial<Deal>, before: Partial<Deal>, label: string, description: string) => {
    setSaving(true);
    setError(null);
    try {
      await crm.updateDealIfUnchanged(deal.id, deal.updated_at, updates);
      logActivity({ type: 'edit', entity: 'deal', entityId: deal.id, label, description, undoPayload: before });
      await refresh();
      return true;
    } catch {
      setError('Could not save. The deal may have changed; reopen it and try again.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const saveKg = async (value: number | null) => {
    const ok = await write(
      { stated_order_kg: value },
      { stated_order_kg: saved },
      value === null ? 'Order size cleared' : 'Order size saved',
      value === null ? `${deal.client} order size cleared` : `${deal.client} order size ${kg(value)}`,
    );
    if (ok) setKgDraft('');
  };

  const saveChecklist = async () => {
    if (!checklist) return;
    const volume = parseKg(checklist.monthly_volume_kg);
    if (checklist.monthly_volume_kg.trim() !== '' && volume === null) { setError('Monthly volume must be a number of kg.'); return; }
    const next: CallChecklist = {};
    if (checklist.decision_maker.trim()) next.decision_maker = checklist.decision_maker.trim();
    if (volume !== null) next.monthly_volume_kg = volume;
    if (checklist.current_product.trim()) next.current_product = checklist.current_product.trim();
    const ok = await write(
      { call_checklist: Object.keys(next).length > 0 ? next : null },
      { call_checklist: deal.call_checklist ?? null },
      'Call checklist saved',
      `${deal.client} call checklist updated`,
    );
    if (ok) setChecklist(null);
  };

  const typedKg = parseKg(kgDraft);

  return (
    <details className="group border-b border-clay-hairline" data-testid="deal-facts-panel">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-clay-ink marker:hidden">
        <span>Order size and call checklist · {saved !== null ? kg(saved) : 'no size saved'} · {answered}/3 answered</span>
        <ChevronRight className="h-4 w-4 text-clay-muted transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="space-y-4 pb-4 text-sm">
        <div>
          <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-clay-muted">Order size the buyer stated</h4>
          <div className="flex flex-wrap items-center gap-2 text-xs text-clay-body">
            {saved !== null && (
              <>
                <span data-testid="saved-kg">Saved: <span className="font-semibold text-clay-ink">{kg(saved)}</span></span>
                <button type="button" className={button} disabled={saving} onClick={() => saveKg(null)}>Clear</button>
              </>
            )}
            {fromReply !== null && fromReply !== saved && (
              <button type="button" className={button} disabled={saving} onClick={() => saveKg(fromReply)}>
                Save {kg(fromReply)} from the reply
              </button>
            )}
            <input
              inputMode="decimal"
              value={kgDraft}
              onChange={event => setKgDraft(event.target.value)}
              aria-label="Order size in kg"
              placeholder="kg"
              className={`${input} w-20`}
            />
            <button type="button" className={button} disabled={saving || typedKg === null} onClick={() => typedKg !== null && saveKg(typedKg)}>
              Save size
            </button>
          </div>
        </div>

        <div>
          <h4 className="mb-1 text-[10px] font-medium uppercase tracking-wide text-clay-muted">Call checklist</h4>
          {checklist === null ? (
            <div className="space-y-1 text-xs text-clay-body">
              <p>Who decides: <span className="text-clay-ink">{answers.decision_maker || '—'}</span></p>
              <p>Monthly volume: <span className="text-clay-ink">{answers.monthly_volume_kg !== undefined ? kg(answers.monthly_volume_kg) : '—'}</span></p>
              <p>Uses today: <span className="text-clay-ink">{answers.current_product || '—'}</span></p>
              <button type="button" className={`${button} mt-1`} onClick={() => setChecklist({
                decision_maker: answers.decision_maker ?? '',
                monthly_volume_kg: answers.monthly_volume_kg !== undefined ? String(answers.monthly_volume_kg) : '',
                current_product: answers.current_product ?? '',
              })}>
                {answered === 0 ? 'Fill in' : 'Edit'}
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <label className="block text-xs text-clay-muted">Who decides on the purchase?
                <input value={checklist.decision_maker} onChange={e => setChecklist({ ...checklist, decision_maker: e.target.value })} className={`${input} mt-0.5 w-full`} />
              </label>
              <label className="block text-xs text-clay-muted">How many kg a month do they use?
                <input inputMode="decimal" value={checklist.monthly_volume_kg} onChange={e => setChecklist({ ...checklist, monthly_volume_kg: e.target.value })} className={`${input} mt-0.5 w-full`} />
              </label>
              <label className="block text-xs text-clay-muted">What do they use today?
                <input value={checklist.current_product} onChange={e => setChecklist({ ...checklist, current_product: e.target.value })} className={`${input} mt-0.5 w-full`} />
              </label>
              <div className="flex gap-2">
                <ActionButton busy={saving} onClick={saveChecklist}>Save checklist</ActionButton>
                <button type="button" className={button} disabled={saving} onClick={() => { setChecklist(null); setError(null); }}>Cancel</button>
              </div>
            </div>
          )}
        </div>

        {error && <p role="alert" className="text-xs text-clay-error">{error}</p>}
        <p className="text-[11px] text-clay-muted">The grade reads the saved order size first, then the reply, then the monthly volume.</p>
      </div>
    </details>
  );
}
