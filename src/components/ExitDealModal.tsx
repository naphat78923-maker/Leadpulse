'use client';

import { useState } from 'react';
import { Deal } from '@/types/crm';
import { LOST_REASON_OPTIONS, type LostReason } from './exit-deal-helpers';
import { X, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { businessDateKey } from '@/utils/business-time';
import { WON_IS_NOT_CASH_COPY, type CloseActionPlan, type CloseActionResolution } from '@/utils/deal-close';

// Re-export helpers that live next to this file for cleaner imports elsewhere.
export type { LostReason };
export { LOST_REASON_OPTIONS };

export type ExitKind = 'won' | 'lost' | 'park';

export interface ExitDealPayload {
  kind: ExitKind;
  close_date?: string | null;
  won_note?: string | null;
  value?: number | null;
  lost_reason?: LostReason | null;
  followup_date?: string | null;
  park_reason?: string | null;
  /** How this close resolves the deal's current sales action (Won only). */
  action?: CloseActionPlan | null;
}

interface ExitDealModalProps {
  deal: Deal;
  kind: ExitKind;
  onCancel: () => void;
  onConfirm: (payload: ExitDealPayload) => Promise<void>;
}

function todayKey() {
  return businessDateKey();
}

const ACTION_RESOLUTION_OPTIONS: Array<{ value: CloseActionResolution; label: string; hint: string }> = [
  {
    value: 'complete',
    label: 'Mark the current action done',
    hint: 'Archives it in the outcome history and clears it from the deal.',
  },
  {
    value: 'replace',
    label: 'Replace it with a post-sale action',
    hint: 'Only what you type here — no fulfilment, invoice, or outreach is created for you.',
  },
  {
    value: 'keep',
    label: 'Keep it as it is',
    hint: 'Use this when there is still something you intend to do on this deal.',
  },
];

export default function ExitDealModal({ deal, kind, onCancel, onConfirm }: ExitDealModalProps) {
  const [closeDate, setCloseDate] = useState(deal.close_date || todayKey());
  const [wonNote, setWonNote] = useState(deal.won_note || '');
  const [value, setValue] = useState(deal.value != null ? String(deal.value) : '');
  const [lostReason, setLostReason] = useState<LostReason | ''>('');
  const [revisitDate, setRevisitDate] = useState(deal.followup_date || '');
  const [parkWhy, setParkWhy] = useState(deal.park_reason || '');
  const [actionResolution, setActionResolution] = useState<CloseActionResolution>('complete');
  const [postSaleAction, setPostSaleAction] = useState('');
  const [postSaleDate, setPostSaleDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title =
    kind === 'won' ? 'Mark won' : kind === 'lost' ? 'Mark lost' : 'Park deal';
  const eyebrow =
    kind === 'won' ? 'Exit · Won' : kind === 'lost' ? 'Exit · Lost' : 'Exit · Park';

  const validate = (): string | null => {
    if (kind === 'lost' && !lostReason) return 'Pick a lost reason.';
    if (kind === 'park' && !revisitDate) return 'Parked deals need a revisit date.';
    if (kind === 'park' && !parkWhy.trim()) return 'Add a short why for parking.';
    if (kind === 'won' && actionResolution === 'replace' && !postSaleAction.trim()) {
      return 'Name the post-sale action, or keep the current one.';
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const parsed = parseFloat(value);
      await onConfirm({
        kind,
        close_date: kind === 'won' ? closeDate || null : null,
        won_note: kind === 'won' ? (wonNote.trim() || null) : null,
        value: kind === 'won' && value.trim() !== '' && Number.isFinite(parsed) ? parsed : null,
        lost_reason: kind === 'lost' ? (lostReason as LostReason) : null,
        followup_date: kind === 'park' ? revisitDate : null,
        park_reason: kind === 'park' ? parkWhy.trim() : null,
        action:
          kind === 'won'
            ? {
                resolution: actionResolution,
                action: actionResolution === 'replace' ? postSaleAction.trim() : null,
                date: actionResolution === 'replace' ? postSaleDate || null : null,
              }
            : null,
      });
    } catch (e: any) {
      setError('Could not save: ' + (e.message || 'Unknown error'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white dark:bg-clay-card w-full sm:max-w-md rounded-t-2xl sm:rounded-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-clay-card border-b border-clay-hairline px-5 py-4 z-10 flex items-start justify-between gap-3">
          <div>
            <p className="zams-eyebrow mb-0.5">{eyebrow}</p>
            <h2 className="text-sm font-semibold text-clay-ink">{title} · {deal.client}</h2>
          </div>
          <button onClick={onCancel} className="p-2 text-clay-muted hover:bg-clay-surface rounded-lg shrink-0" aria-label="Cancel">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          {kind === 'won' && (
            <>
              <p className="text-xs text-clay-muted bg-clay-mint/15 border border-clay-mint/30 rounded-lg px-3 py-2">
                Won is an exit — not a board column. {WON_IS_NOT_CASH_COPY}
              </p>
              <label className="block text-xs text-clay-body">
                Won date
                <input
                  type="date"
                  value={closeDate}
                  onChange={e => setCloseDate(e.target.value)}
                  className="w-full mt-1 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink"
                />
              </label>
              <label className="block text-xs text-clay-body">
                First SKU / order note
                <input
                  type="text"
                  value={wonNote}
                  onChange={e => setWonNote(e.target.value)}
                  placeholder="e.g. 10kg Butter trial PO #…"
                  className="w-full mt-1 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink"
                />
              </label>
              <label className="block text-xs text-clay-body">
                Order value if an order was placed (฿)
                <input
                  type="text"
                  inputMode="decimal"
                  value={value}
                  onChange={e => setValue(e.target.value)}
                  placeholder="e.g. 50000"
                  className="w-full mt-1 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink"
                />
                <span className="mt-1 block text-[11px] text-clay-muted">
                  Leave it blank if you do not know it yet — blank stays unknown and records no sale.
                </span>
              </label>

              <div className="space-y-2 rounded-lg border border-clay-hairline bg-clay-surface p-3">
                <div>
                  <p className="text-xs font-medium text-clay-ink">This deal&apos;s current action</p>
                  <p data-close-current-action className="mt-0.5 text-[11px] text-clay-muted">
                    {deal.next_action?.trim() ? deal.next_action.trim() : 'No action set'}
                    {deal.followup_date ? ` · ${deal.followup_date}` : ''}
                  </p>
                </div>
                <div className="grid gap-2" role="radiogroup" aria-label="Resolve the current action">
                  {ACTION_RESOLUTION_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      role="radio"
                      aria-checked={actionResolution === option.value}
                      onClick={() => setActionResolution(option.value)}
                      className={clsx(
                        'min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors',
                        actionResolution === option.value
                          ? 'border-clay-mint bg-clay-mint/15 text-clay-ink'
                          : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                      )}
                    >
                      <span className="block text-xs font-semibold">{option.label}</span>
                      <span className="block text-[10px] mt-0.5 opacity-75">{option.hint}</span>
                    </button>
                  ))}
                </div>

                {actionResolution === 'replace' && (
                  <div className="space-y-2">
                    <label className="block text-xs text-clay-body">
                      Post-sale action <span className="text-clay-ochre">*</span>
                      <input
                        type="text"
                        value={postSaleAction}
                        onChange={e => setPostSaleAction(e.target.value)}
                        placeholder="e.g. Confirm the first delivery window"
                        className="w-full mt-1 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink"
                      />
                    </label>
                    <label className="block text-xs text-clay-body">
                      Post-sale date
                      <input
                        type="date"
                        value={postSaleDate}
                        onChange={e => setPostSaleDate(e.target.value)}
                        className="w-full mt-1 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink"
                      />
                    </label>
                  </div>
                )}
              </div>
            </>
          )}

          {kind === 'lost' && (
            <>
              <p className="text-xs text-clay-muted bg-clay-error/10 border border-clay-error/20 rounded-lg px-3 py-2">
                Lost removes the deal from the journey board. Pick one reason.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {LOST_REASON_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setLostReason(opt.value)}
                    className={clsx(
                      'px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                      lostReason === opt.value
                        ? 'border-clay-error bg-clay-error/10 text-clay-error'
                        : 'border-clay-hairline text-clay-muted hover:border-clay-muted-soft'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </>
          )}

          {kind === 'park' && (
            <>
              <p className="text-xs text-clay-muted bg-clay-surface border border-clay-hairline rounded-lg px-3 py-2">
                Park is an exit queue — not a journey column. Set a revisit date and why.
              </p>
              <label className="block text-xs text-clay-body">
                Revisit date <span className="text-clay-ochre">*</span>
                <input
                  type="date"
                  value={revisitDate}
                  onChange={e => setRevisitDate(e.target.value)}
                  className="w-full mt-1 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink"
                />
              </label>
              <label className="block text-xs text-clay-body">
                Why park <span className="text-clay-ochre">*</span>
                <textarea
                  value={parkWhy}
                  onChange={e => setParkWhy(e.target.value)}
                  rows={2}
                  placeholder="e.g. Budget freeze until Q4"
                  className="w-full mt-1 px-3 py-2.5 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink resize-none"
                />
              </label>
            </>
          )}

          {error && (
            <p className="text-xs font-medium text-clay-error bg-clay-error/10 border border-clay-error/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-clay-card border-t border-clay-hairline px-5 py-3 flex items-center justify-end gap-2 z-10">
          <button onClick={onCancel} className="clay-btn-outline">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="clay-btn-primary min-w-[110px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : title}
          </button>
        </div>
      </div>
    </div>
  );
}
