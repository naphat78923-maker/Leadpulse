'use client';

import { useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import clsx from 'clsx';
import { businessDaysBetween } from '@/utils/business-time';
import { formatScheduleDate } from '@/utils/deal-schedule';
import type { HealthTier } from '@/utils/accountHealth';
import type { AttentionCandidate } from '@/utils/followup-policy';
import type { CheckInRow, ThisWeekQueue as Queue } from '@/utils/this-week-queue';

interface ThisWeekQueueProps {
  queue: Queue;
  today: string;
  loading: boolean;
  sourceError: boolean;
  accountEventsUnavailable: boolean;
  onRetry: () => void;
  onLogDeal: (dealId: string) => void;
  onLogCompany: (companyId: string) => void;
}

const CHECK_IN_PREVIEW = 8;

const TIER_LABEL: Record<HealthTier, string> = {
  healthy: 'Healthy',
  watch: 'Watch',
  at_risk: 'At-risk',
  dormant: 'Dormant',
};

const focusRing = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender';

function whenLabel(dueDate: string | null, today: string): string | null {
  if (!dueDate) return null;
  const days = businessDaysBetween(today, dueDate);
  if (days === 0) return 'Today';
  if (days < 0) return `${-days} day${days === -1 ? '' : 's'} overdue`;
  return formatScheduleDate(dueDate);
}

function LogButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={clsx(
        'shrink-0 self-center rounded-lg border border-clay-hairline px-3 text-xs font-semibold text-clay-ink hover:border-clay-lavender min-h-11',
        focusRing,
      )}
    >
      Log
    </button>
  );
}

function Row({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <li className="flex items-start gap-3 min-w-0 px-3 py-2.5 sm:px-4">
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </li>
  );
}

function RecordLink({ href, label, children }: { href: string; label: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      aria-label={label}
      className={clsx('flex items-center w-fit max-w-full text-sm font-semibold text-clay-ink hover:text-clay-lavender break-words rounded-sm', focusRing)}
    >
      {children}
    </Link>
  );
}

function DealRow({
  item,
  today,
  tone,
  onLogDeal,
}: {
  item: AttentionCandidate;
  today: string;
  tone: 'overdue' | 'due' | 'review' | 'plain';
  onLogDeal: (dealId: string) => void;
}) {
  const title = item.dealTitle || item.companyName || 'Deal';
  const when = whenLabel(item.dueDate, today);
  const canLog = Boolean(item.dealId) && item.action === 'honor_saved_followup' && item.holds.length === 0;
  const detail = tone === 'review' ? item.reason : item.nextAction;

  return (
    <Row action={canLog ? <LogButton label={`Log interaction for ${title}`} onClick={() => onLogDeal(item.dealId!)} /> : undefined}>
      {item.dealId ? (
        <RecordLink href={`/deals?deal=${encodeURIComponent(item.dealId)}`} label={`Open deal: ${title}`}>{title}</RecordLink>
      ) : (
        <p className="text-sm font-semibold text-clay-ink break-words">{title}</p>
      )}
      {(when || item.priority === 'high') && (
        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
          {when && <span className={tone === 'overdue' ? 'font-semibold text-clay-error' : 'text-clay-muted'}>{when}</span>}
          {item.priority === 'high' && (
            <span className="rounded bg-clay-coral/15 px-1.5 py-0.5 text-[10px] font-semibold text-clay-coral">High</span>
          )}
        </div>
      )}
      {detail && <p className="mt-0.5 text-sm text-clay-body break-words line-clamp-2">{detail}</p>}
      {item.holds.length > 0 && (
        <p className="mt-1 inline-flex rounded-md border border-clay-error/40 bg-clay-error/5 px-2 py-0.5 text-xs font-semibold text-clay-error">
          On hold — check before contacting
        </p>
      )}
    </Row>
  );
}

function CheckInItem({ row, today, onLogCompany }: { row: CheckInRow; today: string; onLogCompany: (id: string) => void }) {
  const when = whenLabel(row.dueDate, today);
  const status = [row.tier ? TIER_LABEL[row.tier] : null, when ? `check-in ${when === 'Today' ? 'due today' : when}` : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Row action={<LogButton label={`Log interaction for ${row.companyName}`} onClick={() => onLogCompany(row.companyId)} />}>
      <RecordLink href={`/companies?company=${encodeURIComponent(row.companyId)}`} label={`Open company: ${row.companyName}`}>
        {row.companyName}
      </RecordLink>
      {status && <p className="mt-0.5 text-xs text-clay-muted">{status}</p>}
      {row.reorder && <p className="mt-0.5 text-sm text-clay-body break-words">{row.reorder.evidence}</p>}
    </Row>
  );
}

function Section({ id, title, count, children }: { id: string; title: string; count: number; children: ReactNode }) {
  if (count === 0) return null;
  return (
    <section aria-labelledby={`this-week-${id}`} className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <h2 id={`this-week-${id}`} className="text-sm font-semibold text-clay-ink">{title}</h2>
        <span className="shrink-0 rounded-full bg-clay-surface px-2 py-0.5 text-xs font-semibold text-clay-muted">{count}</span>
      </div>
      <ul className="divide-y divide-clay-hairline rounded-xl border border-clay-hairline bg-white dark:bg-clay-card">
        {children}
      </ul>
    </section>
  );
}

export default function ThisWeekQueue({
  queue,
  today,
  loading,
  sourceError,
  accountEventsUnavailable,
  onRetry,
  onLogDeal,
  onLogCompany,
}: ThisWeekQueueProps) {
  const [showAllCheckIns, setShowAllCheckIns] = useState(false);
  const { needsReview, overdue, dueThisWeek, checkIns, needsDate } = queue;
  const isEmpty = needsReview.length + overdue.length + dueThisWeek.length + checkIns.length + needsDate.length === 0;
  const visibleCheckIns = showAllCheckIns ? checkIns : checkIns.slice(0, CHECK_IN_PREVIEW);

  return (
    <div data-testid="this-week-queue" className="mb-6 min-w-0 space-y-5">
      {!loading && (
        <p className="text-sm text-clay-muted" aria-live="polite">
          {overdue.length} overdue · {dueThisWeek.length} due this week · {checkIns.length} customer check-in{checkIns.length === 1 ? '' : 's'}
        </p>
      )}

      {sourceError && (
        <div role="alert" className="rounded-lg border border-clay-error/40 bg-clay-error/5 px-3 py-3 text-sm text-clay-ink">
          <p>CRM data could not be loaded. This list may be incomplete.</p>
          <button
            type="button"
            onClick={onRetry}
            className={clsx('mt-2 min-h-11 rounded-md border border-clay-hairline px-3 py-2 text-xs font-semibold hover:border-clay-lavender', focusRing)}
          >
            Retry loading
          </button>
        </div>
      )}

      {accountEventsUnavailable && (
        <p role="status" className="rounded-lg border border-clay-ochre/40 bg-clay-ochre/5 px-3 py-2 text-xs text-clay-ink">
          Sales history didn’t load, so customer check-ins may be incomplete.
        </p>
      )}

      {loading ? (
        <div role="status" aria-live="polite" className="rounded-xl border border-clay-hairline bg-white dark:bg-clay-card p-5 text-sm text-clay-muted">
          Loading this week…
        </div>
      ) : isEmpty ? (
        !sourceError && (
          <div className="rounded-xl border border-clay-hairline bg-white dark:bg-clay-card p-5 text-sm text-clay-muted">
            <p>Nothing due this week.</p>
            <Link href="/deals" className={clsx('mt-3 inline-flex min-h-11 items-center font-medium text-clay-lavender underline underline-offset-2', focusRing)}>
              Open the pipeline
            </Link>
          </div>
        )
      ) : (
        <>
          <Section id="review" title="Needs a decision" count={needsReview.length}>
            {needsReview.map((item) => <DealRow key={item.id} item={item} today={today} tone="review" onLogDeal={onLogDeal} />)}
          </Section>
          <Section id="overdue" title="Overdue" count={overdue.length}>
            {overdue.map((item) => <DealRow key={item.id} item={item} today={today} tone="overdue" onLogDeal={onLogDeal} />)}
          </Section>
          <Section id="due" title="Due this week" count={dueThisWeek.length}>
            {dueThisWeek.map((item) => <DealRow key={item.id} item={item} today={today} tone="due" onLogDeal={onLogDeal} />)}
          </Section>
          <Section id="check-ins" title="Customers to check in with" count={checkIns.length}>
            {visibleCheckIns.map((row) => <CheckInItem key={row.companyId} row={row} today={today} onLogCompany={onLogCompany} />)}
            {checkIns.length > CHECK_IN_PREVIEW && (
              <li className="px-3 py-1 sm:px-4">
                <button
                  type="button"
                  onClick={() => setShowAllCheckIns((v) => !v)}
                  className={clsx('min-h-11 text-xs font-semibold text-clay-lavender rounded-sm', focusRing)}
                >
                  {showAllCheckIns ? 'Show fewer' : `Show all ${checkIns.length}`}
                </button>
              </li>
            )}
          </Section>
          {needsDate.length > 0 && (
            <details className="group min-w-0">
              <summary className={clsx('flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl border border-dashed border-clay-hairline px-4 text-sm text-clay-muted hover:text-clay-ink', focusRing)}>
                <span>Open deals with no follow-up date — set one or park them</span>
                <span className="shrink-0 rounded-full bg-clay-surface px-2 py-0.5 text-xs font-semibold">{needsDate.length}</span>
              </summary>
              <ul className="mt-2 divide-y divide-clay-hairline rounded-xl border border-clay-hairline bg-white dark:bg-clay-card">
                {needsDate.map((item) => <DealRow key={item.id} item={item} today={today} tone="plain" onLogDeal={onLogDeal} />)}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  );
}
