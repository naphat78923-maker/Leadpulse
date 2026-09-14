import { AlertCircle, GripVertical, Package } from 'lucide-react';
import clsx from 'clsx';
import type { Deal, NudgeStage } from '@/types/crm';
import { STAGE_LABELS } from '@/types/crm';
import type { DealCardPresentation } from '@/utils/deal-card';
import { nudgeColorClass, SEND_LADDER_RUNGS } from '@/utils/deal-workflow';
import { isConcreteNextAction, nudgeChipLabel } from '@/utils/deal-card';
import CompanyLogo from '@/components/CompanyLogo';
import NudgeLadderRail from '@/components/NudgeLadderRail';
import EntityAvatar from '@/components/EntityAvatar';

interface DealCardContentProps {
  deal: Deal;
  presentation: DealCardPresentation;
  whyNow: string | null;
  reviewLabels: string[];
  nudge: string | null;
  nudgeStage?: NudgeStage | null;
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
  nudgeStage = null,
  compact = false,
  showGrip = false,
}: DealCardContentProps) {
  const { contact, companyName, companyLogoUrl, product, nextAction, timing } = presentation;
  const hasConcreteNextAction = isConcreteNextAction(deal.next_action);
  const nudgeText = nudgeChipLabel(nudge);

  const nudgeChip = nudge ? (
    <span
      data-nudge-badge
      title={nudge}
      className={clsx(
        'inline-flex max-w-full items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-tight [overflow-wrap:anywhere]',
        compact ? 'line-clamp-2' : 'whitespace-nowrap',
        nudgeColorClass(nudgeStage)
      )}
    >
      {nudgeText}
    </span>
  ) : null;

  return (
    <>
      <div className={clsx('min-w-0 space-y-2', !compact && 'pb-2.5')}>
        {/* Identity and timing use separate rows so narrow lanes cannot squeeze the client away. */}
        <div className="flex flex-wrap items-center gap-2.5 min-w-0">
          {contact.missing && companyLogoUrl ? (
            <CompanyLogo src={companyLogoUrl} name={companyName} size={36} className="shrink-0" />
          ) : (
            <EntityAvatar
              kind="person"
              name={contact.name}
              initials={contact.initials}
              size={36}
              className="shrink-0"
              interactive={false}
            />
          )}
          <div className="min-w-[min(100%,5rem)] flex-1">
            {contact.missing ? (
              <>
                <p data-card-contact-warning className="mb-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-clay-lavender/85">
                  Contact not identified
                </p>
                <h3
                  title={companyName}
                  className="line-clamp-2 text-sm font-semibold leading-snug text-clay-ink [overflow-wrap:anywhere]"
                >
                  {companyName}
                </h3>
              </>
            ) : (
              <h3
                title={`${contact.name}${contact.additionalCount > 0 ? ` +${contact.additionalCount}` : ''}`}
                className={clsx(
                  'text-sm font-semibold leading-snug [overflow-wrap:anywhere]',
                  'text-clay-ink',
                  // Compact still allows 2 lines — single-line truncate was too aggressive in narrow lanes.
                  'line-clamp-2',
                  !compact && 'min-h-[2.75em]'
                )}
              >
                {contact.name}{contact.additionalCount > 0 ? ` +${contact.additionalCount}` : ''}
              </h3>
            )}
          </div>
        </div>

        <div className="min-w-0 space-y-0.5 text-[11px] leading-snug text-clay-muted">
          {!contact.missing && (
            <p
              data-card-company
              title={companyName}
              className="line-clamp-2 [overflow-wrap:anywhere]"
            >
              {companyName}
            </p>
          )}
          {contact.role && (
            <p title={contact.role} className="line-clamp-2 [overflow-wrap:anywhere]">
              {contact.role}
            </p>
          )}
        </div>

        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
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
            {timing.date && <span className="whitespace-nowrap text-[10px] font-medium text-clay-muted">{timing.date}</span>}
            {compact && nudgeChip}
            {compact && nudgeStage && (
              <NudgeLadderRail
                stage={nudgeStage}
                rungs={SEND_LADDER_RUNGS}
                variant="mini"
                className="mt-0.5 basis-full max-w-[6.5rem]"
              />
            )}
          </div>
          {showGrip && <GripVertical className="h-3.5 w-3.5 shrink-0 text-clay-muted-soft" />}
        </div>

        {/* The concrete next action leads in EVERY card variant, with why-now beneath it. */}
        <div className="min-w-0 space-y-1" data-card-next-action>
          <p className="zams-eyebrow">Next action</p>
          <p
            className={clsx(
              'text-xs leading-relaxed',
              compact ? 'line-clamp-2' : 'line-clamp-3',
              hasConcreteNextAction ? 'font-medium text-clay-body-strong' : 'font-normal italic text-clay-muted'
            )}
          >
            {hasConcreteNextAction ? nextAction : 'No next action set yet'}
          </p>
          {whyNow && (
            <p
              className={clsx(
                'text-[10px] font-medium leading-snug',
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
      </div>

      {!compact && (
        <>
          <div className="flex items-center gap-2 border-t border-clay-hairline/70 py-2 text-[11px] text-clay-muted">
            <Package className="h-3.5 w-3.5 shrink-0 text-clay-muted-soft" aria-hidden="true" />
            <span className="line-clamp-2 [overflow-wrap:anywhere]">{product}</span>
          </div>

          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t border-clay-hairline/70 pt-2 text-[10px] text-clay-muted">
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
            {nudgeChip}
          </div>
          {nudgeStage && (
            <div className="mt-2 pt-2 border-t border-clay-hairline/50">
              <NudgeLadderRail stage={nudgeStage} rungs={SEND_LADDER_RUNGS} variant="full" />
            </div>
          )}
        </>
      )}
    </>
  );
}
