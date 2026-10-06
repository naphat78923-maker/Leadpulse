import { AlertCircle, Banknote, CalendarDays, GripVertical, Hourglass, Mail, MessageCircle, Package, Phone, User, Users, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import type { Deal, NudgeStage } from '@/types/crm';
import type { DealCardPresentation } from '@/utils/deal-card';
import { nudgeColorClass } from '@/utils/deal-workflow';
import { isConcreteNextAction, nudgeChipLabel } from '@/utils/deal-card';
import { formatBaht } from '@/utils/format';
import { actionChannel, type ActionChannel } from '@/utils/action-channel';
import CompanyLogo from '@/components/CompanyLogo';
import LayaGradeChip from '@/components/LayaGradeChip';
import type { DealGrade } from '@/utils/grade';

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
  /** how long since the last contact, shown while the board is sorted quietest-first */
  quietNote?: string | null;
  /** days in the current lane; only a stalled deal shows it on the card */
  laneTime?: { days: number; stalled: boolean } | null;
}

const CHANNEL_ICON: Record<ActionChannel, LucideIcon> = { call: Phone, email: Mail, message: MessageCircle, meeting: Users };

// Every fact on the card leads with a small grey line icon.
const factIcon = 'h-3.5 w-3.5 shrink-0 text-clay-muted-soft';

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
  quietNote = null,
  laneTime = null,
}: DealCardContentProps) {
  const { contact, companyName, companyLogoUrl, product, nextAction, timing } = presentation;
  const hasConcreteNextAction = isConcreteNextAction(deal.next_action);
  const nudgeText = nudgeChipLabel(nudge);
  const hasLayaChip = !!layaGrade && layaGrade.status !== 'not_graded';
  const channel = hasConcreteNextAction ? actionChannel(nextAction) : null;
  const ChannelIcon = channel ? CHANNEL_ICON[channel] : null;

  return (
    <div className="min-w-0 space-y-2.5">
      <div className="flex min-w-0 items-start gap-2.5">
        <CompanyLogo src={companyLogoUrl} name={companyName} id={deal.company_id} size={30} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <h3 title={companyName} className="line-clamp-2 text-[13px] font-semibold leading-snug text-clay-ink [overflow-wrap:anywhere]">
            {companyName}
          </h3>
        </div>
        {showGrip && <GripVertical className="h-3.5 w-3.5 shrink-0 text-clay-muted" aria-hidden="true" />}
      </div>

      <div className="space-y-1.5">
        {/* Only a known person is worth a line; "not identified" on most cards is noise. */}
        {!contact.missing && (
          <div className="flex min-w-0 items-center gap-1.5">
            <User className={factIcon} aria-hidden="true" />
            <p className="truncate text-[11px] text-clay-muted" title={`${contact.name}${contact.role ? ` · ${contact.role}` : ''}`}>
              {contact.name}{contact.additionalCount > 0 ? ` +${contact.additionalCount}` : ''}{!compact && contact.role ? ` · ${contact.role}` : ''}
            </p>
          </div>
        )}
        <div className="flex min-w-0 items-center gap-1.5">
          <Package className={factIcon} aria-hidden="true" />
          <p className="truncate text-[11px] font-medium text-clay-teal dark:text-clay-mint" title={`${deal.title} · ${product}`}>
            {product}
          </p>
        </div>
      </div>
      <div className="flex min-w-0 items-start gap-1.5">
        {ChannelIcon && <ChannelIcon data-channel={channel} className={clsx(factIcon, 'mt-px')} aria-hidden="true" />}
        <p
          data-card-next-action
          title={nextAction}
          className={clsx(
            'min-w-0 text-xs leading-snug',
            compact ? 'line-clamp-2' : 'line-clamp-3',
            hasConcreteNextAction ? 'font-medium text-clay-body-strong' : 'italic text-clay-muted'
          )}
        >
          {hasConcreteNextAction ? nextAction : 'No next action set yet'}
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t border-clay-hairline/70 pt-2 text-[11px]">
        <span
          title={whyNow || undefined}
          className={clsx(
            'inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium',
            timing.tone === 'overdue' && 'bg-clay-error/20 text-clay-error-strong dark:bg-clay-error/10 dark:text-clay-error',
            timing.tone === 'today' && 'bg-clay-ochre/20 text-clay-warning-strong dark:bg-clay-ochre/10 dark:text-clay-ochre',
            timing.tone === 'scheduled' && 'bg-clay-card text-clay-body',
            timing.tone === 'none' && 'bg-clay-card text-clay-muted'
          )}
        >
          {(timing.tone === 'overdue' || timing.tone === 'today') && (
            <span className={clsx('h-1.5 w-1.5 shrink-0 rounded-full', timing.tone === 'overdue' ? 'bg-clay-error' : 'bg-clay-ochre')} aria-hidden="true" />
          )}
          {timing.tone === 'scheduled' && <CalendarDays className="h-3 w-3 shrink-0" aria-hidden="true" />}
          {timing.label}{timing.date ? ` · ${timing.date}` : ''}
        </span>
        {deal.value != null && (
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-clay-ink" title="Deal value"><Banknote className={factIcon} aria-hidden="true" />{formatBaht(deal.value)}</span>
        )}
        {nudgeText && (
          <span data-nudge-badge title={nudge || undefined} className={clsx('rounded border px-1.5 py-0.5 text-[11px] font-semibold', nudgeColorClass(nudgeStage))}>
            {nudgeText}
          </span>
        )}
        {quietNote && (
          <span data-quiet-note title="Time since the last logged contact with the buyer, in either direction." className="text-[10px] text-clay-muted">
            {quietNote}
          </span>
        )}
        {/* One status only, the most pressing: Laya's grade, then stalled, then a lane gap, then priority.
            Everything else (order size, chases since reply, days in lane) lives in the deal panel. */}
        {hasLayaChip ? (
          <LayaGradeChip grade={layaGrade} />
        ) : laneTime?.stalled ? (
          <span
            data-lane-days="stalled"
            title="Stalled: in this lane past its limit (14 days, or 1.2× what won deals took once three have passed through)."
            className="inline-flex items-center gap-1 text-[10px] font-semibold text-clay-ochre"
          >
            <Hourglass className="h-3 w-3" aria-hidden="true" />
            stalled · {laneTime.days}d
          </span>
        ) : reviewLabels.length > 0 ? (
          <span title={reviewLabels.join(' · ')} className="inline-flex items-center gap-1 rounded bg-clay-lavender/20 px-1.5 py-0.5 text-[10px] font-medium text-clay-ink">
            <AlertCircle className="h-3 w-3" aria-hidden="true" /> Needs review
          </span>
        ) : deal.priority === 'high' ? (
          <span className="rounded bg-clay-coral/15 px-1.5 py-0.5 text-[10px] font-semibold text-clay-coral">High</span>
        ) : null}
      </div>
    </div>
  );
}
