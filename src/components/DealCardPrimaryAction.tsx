'use client';

import { ArrowRight, PenLine } from 'lucide-react';
import clsx from 'clsx';
import { primaryCardAction } from '@/utils/deal-card';
import type { Deal } from '@/types/crm';

interface DealCardPrimaryActionProps {
  deal: Deal;
  onSelect: (deal: Deal, action: ReturnType<typeof primaryCardAction>) => void;
  className?: string;
}

/**
 * The card's ONE contextual action, rendered as a SIBLING of the card button rather than inside
 * it: a button nested in a button is invalid, and a nested control makes the card's own click
 * ambiguous. It opens the appropriate form — it never sends a message.
 */
export default function DealCardPrimaryAction({ deal, onSelect, className }: DealCardPrimaryActionProps) {
  const action = primaryCardAction(deal);

  return (
    <button
      type="button"
      data-card-primary-action={action.id}
      title={action.hint}
      onClick={event => {
        event.stopPropagation();
        onSelect(deal, action);
      }}
      className={clsx(
        'inline-flex min-h-[32px] items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition-colors',
        action.opensLogForm
          ? 'border-clay-mint/50 bg-clay-mint/15 text-clay-teal active:opacity-80'
          : 'border-clay-hairline bg-clay-surface text-clay-body active:opacity-80',
        className
      )}
    >
      {action.opensLogForm ? <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" /> : <PenLine className="h-3.5 w-3.5" aria-hidden="true" />}
      {action.label}
    </button>
  );
}
