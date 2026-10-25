'use client';

import { useEffect, useRef, useState } from 'react';
import clsx from 'clsx';
import { Check } from 'lucide-react';
import type { Company } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import { useToast } from '@/components/ToastProvider';
import * as crm from '@/lib/crm';
import { MARKET_LABELS, marketLabel, type Market, type MarketCall } from '@/utils/account-market';

const CHIP: Record<Market | 'unsure', string> = {
  local: 'bg-clay-card text-clay-body dark:bg-white/[0.06]',
  export: 'bg-clay-teal/15 text-clay-ink dark:bg-clay-teal/25',
  unsure: 'border border-dashed border-clay-muted/50 text-clay-muted',
};

/** The Local / Export chip on an Accounts row. One tap opens Local / Export; Pat's choice is
 *  saved on the account (companies.market) with Undo, and wins over the rules from then on. */
export default function AccountMarketChip({ company, call }: { company: Company; call: MarketCall }) {
  const { refresh, logActivity, undoActivity } = useCrm();
  const { addToast } = useToast();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const choose = async (market: Market | null) => {
    setOpen(false);
    const before = company.market ?? null;
    if (market === before) return;
    setSaving(true);
    try {
      await crm.updateCompany(company.id, { market });
      const label = market ? MARKET_LABELS[market] : 'From details';
      const id = logActivity({
        type: 'edit',
        entity: 'company',
        entityId: company.id,
        label: `${company.name} · ${label}`,
        undoPayload: { market: before },
      });
      await refresh();
      addToast(`${company.name}: ${label}`, 'success', { label: 'Undo', onClick: () => { void undoActivity(id); } });
    } catch (err) {
      addToast('Could not save: ' + (err instanceof Error ? err.message : 'error'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const label = marketLabel(call);
  const tone = call.market ?? 'unsure';
  return (
    <div ref={ref} className="pointer-events-auto relative z-10 justify-self-start">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${label}. Set Local or Export for ${company.name}`}
        disabled={saving}
        className={clsx('whitespace-nowrap rounded-md px-1.5 py-0.5 text-[11px] font-medium', CHIP[tone])}
      >
        {call.market ? label : 'Not sure · set'}
      </button>
      {open && (
        <div role="menu" className="absolute left-0 top-7 z-30 w-40 rounded-xl border border-clay-hairline bg-white p-1 shadow-lg dark:bg-clay-card">
          {(['local', 'export'] as Market[]).map((market) => {
            const chosen = company.market === market;
            return (
              <button
                key={market}
                type="button"
                role="menuitemradio"
                aria-checked={chosen}
                onClick={(e) => { e.stopPropagation(); void choose(market); }}
                className={clsx(
                  'flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-sm text-clay-ink',
                  chosen ? 'bg-clay-lavender/20' : 'hover:bg-clay-surface',
                )}
              >
                {market === 'local' ? 'Local (Thailand)' : 'Export'}
                {chosen && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            );
          })}
          {company.market && (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => { e.stopPropagation(); void choose(null); }}
              className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-clay-muted hover:bg-clay-surface"
            >
              Go by its details
            </button>
          )}
        </div>
      )}
    </div>
  );
}
