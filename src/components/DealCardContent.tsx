import { AlertCircle, GripVertical, Package } from 'lucide-react';
import clsx from 'clsx';
import type { Deal } from '@/types/crm';
import { STAGE_LABELS } from '@/types/crm';
import type { DealCardPresentation } from '@/utils/deal-card';
import CompanyLogo from '@/components/CompanyLogo';

interface DealCardContentProps {
  deal: Deal;
  presentation: DealCardPresentation;
  whyNow: string | null;
  reviewLabels: string[];
  nudge: string | null;
  compact?: boolean;
  showGrip?: boolean;
}

const PRIORITY_TONE: Record<Deal['priority'], string> = {
  high: 'bg-clay-error',
  medium: 'bg-clay-ochre',
  low: 'bg-clay-muted-soft',
};

const PRIORITY_COPY: Record<Deal['priority'], string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export default function DealCardContent({
  deal,
  presentation,
  whyNow,
  reviewLabels,
  nudge,
  compact = false,
  showGrip = false,
}: DealCardContentProps) {
  const { contact, companyName, companyLogoUrl, product, nextAction, timing } = presentation;

  return (
    <>
      <div className={clsx('flex items-start justify-between gap-2', !compact && 'pb-2.5')}>
        <div className="flex items-start gap-2.5 min-w-0">
          {contact.missing && companyLogoUrl ? (
            <CompanyLogo src={companyLogoUrl} name={companyName} size={36} className="shrink-0" />
          ) : (
            <span
              aria-hidden="true"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[#4a4037] bg-[#2b211a] text-[11px] font-semibold tracking-wide text-[#fdf6e9] dark:bg-[#332b24] dark:text-[#f6f3ea]"
            >
              {contact.initials}
            </span>
          )}
          <div className="min-w-0 pt-0.5">
            <h3
              className={clsx(
                'text-sm font-semibold leading-snug',
                contact.missing ? 'text-clay-lavender' : 'text-clay-ink',
                compact && 'truncate'
              )}
            >
              {contact.name}{contact.additionalCount > 0 ? ` +${contact.additionalCount}` : ''}
            </h3>
            <p className={clsx('mt-0.5 text-[11px] leading-snug text-clay-muted', compact ? 'truncate' : 'line-clamp-2')}>
              {contact.role ? `${contact.role} · ${companyName}` : companyName}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-1.5">
          <div className="flex flex-col items-end gap-0.5">
            <span
              className={clsx(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap',
                timing.tone === 'overdue' && 'bg-clay-error/10 text-clay-error',
                timing.tone === 'today' && 'bg-clay-ochre/15 text-clay-ochre',
                timing.tone === 'scheduled' && 'bg-clay-lavender/12 text-clay-lavender',
                timing.tone === 'none' && 'bg-clay-card text-clay-muted-soft'
              )}
            >
              {timing.tone === 'overdue' || timing.tone === 'today' ? (
                <span
                  className={clsx(
                    'h-1.5 w-1.5 rounded-full animate-pulse-dot',
                    timing.tone === 'overdue' ? 'bg-clay-error' : 'bg-clay-ochre'
                  )}
                />
              ) : null}
              {timing.label}
            </span>
            {timing.date && <span className="text-[10px] font-medium text-clay-muted">{timing.date}</span>}
          </div>
          {showGrip && <GripVertical className="mt-0.5 h-3.5 w-3.5 text-clay-muted-soft" />}
        </div>
      </div>

      {!compact && (
        <>
          <div className="flex items-center gap-2 border-t border-clay-hairline/70 py-2 text-[11px] text-clay-muted">
            <Package className="h-3.5 w-3.5 shrink-0 text-clay-muted-soft" aria-hidden="true" />
            <span className="truncate">{product}</span>
          </div>

          <div className="border-t border-clay-hairline/70 py-2.5">
            <p className="zams-eyebrow mb-1">Next action</p>
            <p
              className={clsx(
                'text-xs leading-relaxed line-clamp-3',
                deal.next_action?.trim() ? 'font-medium text-clay-body-strong' : 'italic text-clay-muted'
              )}
            >
              {nextAction}
            </p>
            {whyNow && (
              <p
                className={clsx(
                  'mt-1.5 text-[10px] font-medium leading-snug',
                  timing.tone === 'overdue'
                    ? 'text-clay-error/90'
                    : timing.tone === 'today'
                      ? 'text-clay-ochre'
                      : 'text-clay-muted'
                )}
              >
                Why now · {whyNow}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 border-t border-clay-hairline/70 pt-2 text-[10px] text-clay-muted">
            <span className="inline-flex items-center gap-1">
              <span className={clsx('h-1.5 w-1.5 rounded-full', PRIORITY_TONE[deal.priority])} aria-hidden="true" />
              {PRIORITY_COPY[deal.priority]}
            </span>
            <span>{STAGE_LABELS[deal.stage]}</span>
            {reviewLabels.length > 0 && (
              <span
                className="inline-flex items-center gap-1 rounded bg-clay-lavender/15 px-1.5 py-0.5 font-medium text-clay-lavender"
                title={reviewLabels.join(' · ')}
              >
                <AlertCircle className="h-3 w-3" aria-hidden="true" />
                Needs review
              </span>
            )}
            {deal.sample_status && <span>{deal.sample_status === 'sent' ? 'Sample sent' : 'Sample received'}</span>}
            {nudge && <span>{nudge}</span>}
          </div>
        </>
      )}
    </>
  );
}
