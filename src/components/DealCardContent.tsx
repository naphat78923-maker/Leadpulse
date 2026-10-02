import { AlertCircle, GripVertical } from 'lucide-react';
import clsx from 'clsx';
import type { Deal, NudgeStage } from '@/types/crm';
import type { DealCardPresentation } from '@/utils/deal-card';
import { nudgeColorClass } from '@/utils/deal-workflow';
import { isConcreteNextAction, nudgeChipLabel } from '@/utils/deal-card';
import { formatBaht } from '@/utils/format';
import CompanyLogo from '@/components/CompanyLogo';
import LayaGradeChip from '@/components/LayaGradeChip';
import type { DealGrade } from '@/utils/grade';
import { kilogramsStated, quantityTier, type QuantityTier } from '@/utils/order-quantity';

interface DealCardContentProps {
  deal: Deal;
  presentation: DealCardPresentation;
  whyNow: string | null;
  reviewLabels: string[];
  nudge: string | null;
  nudgeStage?: NudgeStage | null;
  compact?: boolean;
  showGrip?: boolean;
  /** Laya's grade for this deal, when it has a reply to grade */
  layaGrade?: DealGrade;
  /**
   * Unanswered chases since the buyer's last reply — only when the buyer has replied and
   * this differs from the badge's lifetime count; null otherwise.
   */
  chasesSinceReply?: number | null;
  /** how long since the last contact, shown while the board is sorted quietest-first */
  quietNote?: string | null;
}

const QUANTITY_TIER_LABEL: Record<Exclude<QuantityTier, 'none'>, string> = {
  small: 'small — under 5 kg',
  moderate: 'moderate — 5 to 15 kg',
  large: 'large — over 15 kg',
};

/** "40 kg", "0.5 kg", "12.5 kg" — no trailing zeros. */
function formatKg(kg: number): string {
  return `${Number(kg.toFixed(2))} kg`;
}

export default function DealCardContent({
  deal,
  presentation,
  whyNow,
  reviewLabels,
  nudge,
  nudgeStage = null,
  compact = false,
  showGrip = false,
  layaGrade,
  chasesSinceReply = null,
  quietNote = null,
}: DealCardContentProps) {
  const { contact, companyName, companyLogoUrl, product, nextAction, timing } = presentation;
  const hasConcreteNextAction = isConcreteNextAction(deal.next_action);
  const nudgeText = nudgeChipLabel(nudge);
  // The order size the buyer stated in their own words, read by a code rule. A suggestion
  // on the card only — it is never written to the deal's value.
  const statedKg = kilogramsStated(deal.buyer_reply);
  const statedTier = quantityTier(statedKg);

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <CompanyLogo src={companyLogoUrl} name={companyName} id={deal.company_id} size={30} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 title={companyName} className="line-clamp-2 text-[13px] font-semibold leading-snug text-clay-ink [overflow-wrap:anywhere]">
            {companyName}
          </h3>
          {/* Only a known person is worth a line; "not identified" on most cards is noise. */}
          {!contact.missing && (
            <p className="mt-0.5 truncate text-[11px] text-clay-muted" title={`${contact.name}${contact.role ? ` · ${contact.role}` : ''}`}>
              {contact.name}{contact.additionalCount > 0 ? ` +${contact.additionalCount}` : ''}{!compact && contact.role ? ` · ${contact.role}` : ''}
            </p>
          )}
        </div>
        {showGrip && <GripVertical className="h-3.5 w-3.5 shrink-0 text-clay-muted" aria-hidden="true" />}
      </div>

      <p className="truncate text-[11px] font-medium text-clay-teal dark:text-clay-mint" title={`${deal.title} · ${product}`}>
        {product}
      </p>
      <p
        data-card-next-action
        title={nextAction}
        className={clsx(
          'text-xs leading-snug',
          compact ? 'line-clamp-2' : 'line-clamp-3',
          hasConcreteNextAction ? 'font-medium text-clay-body-strong' : 'italic text-clay-muted'
        )}
      >
        {hasConcreteNextAction ? nextAction : 'No next action set yet'}
      </p>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-clay-hairline/70 pt-2 text-[11px]">
        <span
          title={whyNow || undefined}
          className={clsx(
            'inline-flex items-center rounded px-1.5 py-0.5 font-medium',
            timing.tone === 'overdue' && 'bg-clay-error/20 text-clay-error-strong dark:bg-clay-error/10 dark:text-clay-error',
            timing.tone === 'today' && 'bg-clay-ochre/20 text-clay-warning-strong dark:bg-clay-ochre/10 dark:text-clay-ochre',
            timing.tone === 'scheduled' && 'bg-clay-card text-clay-body',
            timing.tone === 'none' && 'bg-clay-card text-clay-muted'
          )}
        >
          {timing.label}{timing.date ? ` · ${timing.date}` : ''}
        </span>
        {deal.priority === 'high' && (
          <span className="rounded bg-clay-coral/15 px-1.5 py-0.5 text-[10px] font-semibold text-clay-coral">High</span>
        )}
        {deal.value != null && (
          <span className="ml-auto font-semibold text-clay-ink" title="Deal value">{formatBaht(deal.value)}</span>
        )}
        {statedKg !== null && statedTier !== 'none' && (
          <span
            data-order-size={statedTier}
            title={`Order size the buyer stated: ${QUANTITY_TIER_LABEL[statedTier]}. Read from their reply; not saved to the deal.`}
            className="rounded border border-clay-hairline px-1.5 py-0.5 text-[10px] font-medium text-clay-body"
          >
            {formatKg(statedKg)}
          </span>
        )}
        {nudgeText && (
          <span data-nudge-badge title={nudge || undefined} className={clsx('rounded border px-1.5 py-0.5 text-[11px] font-semibold', nudgeColorClass(nudgeStage))}>
            {nudgeText}
          </span>
        )}
        {nudgeText && chasesSinceReply !== null && (
          <span
            data-since-reply
            title="The badge counts every chase on this deal. This counts only the chases since the buyer last replied — the number Laya's grade uses."
            className="text-[10px] text-clay-muted"
          >
            {chasesSinceReply === 0 ? 'none since reply' : `${chasesSinceReply} since reply`}
          </span>
        )}
        {quietNote && (
          <span data-quiet-note title="Time since the last logged contact with the buyer, in either direction." className="text-[10px] text-clay-muted">
            {quietNote}
          </span>
        )}
        <LayaGradeChip grade={layaGrade} />
        {reviewLabels.length > 0 && (
          <span title={reviewLabels.join(' · ')} className="inline-flex items-center gap-1 rounded bg-clay-lavender/20 px-1.5 py-0.5 text-[10px] font-medium text-clay-ink">
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> Needs review
          </span>
        )}
      </div>
    </div>
  );
}
