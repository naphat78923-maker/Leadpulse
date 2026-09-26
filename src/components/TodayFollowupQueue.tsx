'use client';

import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import Link from 'next/link';
import { businessDaysBetween, isCalendarDateKey } from '@/utils/business-time';
import { formatScheduleDate } from '@/utils/deal-schedule';
import { buildDailyFollowupQueue } from '@/utils/daily-followup-queue';
import type {
  CustomerEvidenceFact,
  CustomerEvidenceFacts,
  CustomerEvidenceFolder,
  OrderRecordOrigin,
} from '@/utils/customer-evidence';
import type { AttentionCandidate } from '@/utils/followup-policy';

interface TodayFollowupQueueProps {
  candidates: readonly AttentionCandidate[];
  today: string;
  loading: boolean;
  sourceError: boolean;
  accountEventsUnavailable: boolean;
  signalsEnabled?: boolean;
  onRetry: () => void;
  onLogDeal?: (dealId: string) => void;
  onInspectEvidence?: (dealId: string) => CustomerEvidenceFolder;
}

const ACTION_LABELS: Record<AttentionCandidate['action'], string> = {
  review_contact_hold: 'Review contact hold',
  resolve_customer_problem: 'Resolve customer problem',
  answer_customer: 'Answer customer',
  honor_saved_followup: 'Saved follow-up',
  review_sample_followup: 'Review sample follow-up',
  review_retention_due: 'Retention review',
  set_date_or_park: 'Date or park',
};

function dueLabel(candidate: AttentionCandidate, today: string): string {
  if (!candidate.originalDueDate) return 'No saved date';
  if (!candidate.dueDate || !isCalendarDateKey(candidate.dueDate)) {
    return `Saved date needs review: ${candidate.originalDueDate}`;
  }
  const daysUntil = businessDaysBetween(today, candidate.dueDate);
  if (daysUntil === 0) return `Due today · ${formatScheduleDate(candidate.dueDate)}`;
  if (daysUntil < 0) {
    const overdue = Math.abs(businessDaysBetween(candidate.dueDate, today));
    return `${overdue} day${overdue === 1 ? '' : 's'} overdue · ${formatScheduleDate(candidate.dueDate)}`;
  }
  return `Due in ${daysUntil} day${daysUntil === 1 ? '' : 's'} · ${formatScheduleDate(candidate.dueDate)}`;
}

function sourceLabel(candidate: AttentionCandidate): string {
  if (candidate.dueDateSource) return candidate.dueDateSource;
  return 'No saved schedule date';
}

function recordHref(candidate: AttentionCandidate): string | null {
  if (candidate.dealId) return `/deals?deal=${encodeURIComponent(candidate.dealId)}`;
  if (candidate.companyId) return `/companies?company=${encodeURIComponent(candidate.companyId)}`;
  return null;
}

function packetReason(reason: string): string {
  if (reason === 'buyer_evidence_order_unknown') return 'Buyer-message order is uncertain; manual review is required.';
  if (reason === 'duplicate_source_ref') return 'Evidence source identities conflict; manual review is required.';
  if (reason === 'source_identity_mismatch') return 'Evidence source identity does not match this deal; manual review is required.';
  if (reason === 'input_too_long') return 'Evidence exceeded the checked input limit; it was not truncated or assessed.';
  if (reason === 'invalid_input_limit') return 'No valid input limit was available; evidence was not assessed.';
  if (reason === 'source_loading') return 'Deal evidence is still loading; no judgment was attempted.';
  if (reason === 'source_unavailable') return 'Deal evidence could not be loaded; no judgment was attempted.';
  if (reason === 'deal_not_found') return 'This deal was not found in the loaded CRM rows; no judgment was attempted.';
  if (reason === 'buyer_reply_field_unavailable') return 'The buyer-reply field was not supplied; no judgment was attempted.';
  return 'No attributed verbatim buyer text is available. This does not prove there was no contact.';
}

function EvidenceFactRow<T>({
  label,
  fact,
  renderValue,
}: {
  label: string;
  fact: CustomerEvidenceFact<T>;
  renderValue: (value: T) => ReactNode;
}) {
  if (fact.status === 'recorded') {
    return (
      <p className="break-words">
        <strong>{label}:</strong> {renderValue(fact.value)}
        {fact.caveat && <span className="text-clay-muted"> · {fact.caveat}</span>}
      </p>
    );
  }

  const state = fact.status === 'not_recorded'
    ? 'Not recorded'
    : fact.status === 'needs_review'
      ? 'Review required'
      : 'Unknown';
  const possibleValue = fact.status === 'needs_review' && fact.value !== undefined
    ? <> · Possible record: {renderValue(fact.value)}</>
    : null;
  return (
    <p className="break-words">
      <strong>{label}:</strong> {state} · {fact.message}{possibleValue}
    </p>
  );
}

const ORDER_ORIGIN_LABEL: Record<OrderRecordOrigin, string> = {
  manual_sale_entry: 'manually logged sale',
  explicit_closed_won_order_entry: 'explicit order entry at close',
  historical_invoice_import: 'historical invoice import',
  imported_sales_history: 'imported sales history',
  multiple_sources: 'multiple sources on that date',
  unknown: 'source unknown',
};

function CustomerEvidenceFactsPanel({ facts }: { facts: CustomerEvidenceFacts }) {
  return (
    <section aria-label="Collected customer facts" className="space-y-2 border-b border-clay-hairline pb-3">
      <h3 className="font-semibold text-clay-ink">Collected facts · separate from model input</h3>
      <EvidenceFactRow
        label="Stored buyer text"
        fact={facts.customerReply}
        renderValue={(value) => <>{value.text} · Message date: {value.observedAt ?? 'unknown'}</>}
      />
      <EvidenceFactRow
        label="Logged interaction history"
        fact={facts.activityHistory}
        renderValue={(value) => {
          const counts = Object.entries(value.byDirection)
            .filter(([, count]) => count > 0)
            .map(([direction, count]) => `${direction} ${count}`)
            .join(', ');
          return `${value.total} row(s)${counts ? ` · ${counts}` : ''}`;
        }}
      />
      <EvidenceFactRow
        label="Last recorded order"
        fact={facts.lastRecordedOrder}
        renderValue={(value) => {
          const products = value.productLines.length > 0 ? ` · ${value.productLines.join(', ')}` : '';
          return `${value.eventDate} · ${ORDER_ORIGIN_LABEL[value.origin]}${products} · order reference ${value.orderReference}`;
        }}
      />
      <EvidenceFactRow label="Open promise" fact={facts.openPromise} renderValue={() => 'Not assessed'} />
      <EvidenceFactRow label="Saved next action" fact={facts.savedNextAction} renderValue={(value) => value} />
      <EvidenceFactRow label="Saved follow-up date" fact={facts.savedFollowupDate} renderValue={(value) => value} />
      <EvidenceFactRow
        label="Pipeline context (not an order record)"
        fact={facts.pipelineContext}
        renderValue={(value) => `Stage ${value.stage} · value type ${value.valueType} · not order evidence`}
      />
    </section>
  );
}

function CustomerEvidenceDisclosure({ buildFolder }: { buildFolder: () => CustomerEvidenceFolder }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const folder = open ? buildFolder() : null;
  const packet = folder?.judgmentPacket ?? null;

  return (
    <div className="mt-2 text-xs text-clay-muted">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="min-h-11 rounded-sm text-left underline decoration-clay-hairline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender"
      >
        {open ? 'Hide customer evidence' : 'Inspect customer evidence (not interpreted)'}
      </button>
      {open && (
        <div id={panelId} className="mt-2 space-y-3 rounded-lg border border-clay-hairline bg-clay-surface/60 p-3">
          <p>This local preview is not sent to Laya; no model judgment was requested.</p>
          {!packet ? (
            <p>No evidence packet is available for this deal.</p>
          ) : (
            <>
              {folder && <CustomerEvidenceFactsPanel facts={folder.facts} />}
              {packet.status === 'ready' && packet.requiresReview && (
                <p className="font-semibold">Undated buyer evidence requires manual timing review; do not assume it is current.</p>
              )}
              {packet.status !== 'ready' && <p className="font-semibold">{packetReason(packet.reason)}</p>}
              {packet.evidence.length === 0 ? (
                <p>No customer-evidence text is loaded. This is not proof of no prior contact.</p>
              ) : packet.evidence.map((item) => (
                <article key={item.sourceRef} className="min-w-0 border-t border-clay-hairline pt-2 first:border-0 first:pt-0">
                  <p className="break-words">
                    <strong>Source:</strong> <code className="break-all">{item.sourceRef}</code>
                  </p>
                  <p className="break-words">
                    <strong>Type:</strong> {item.provenance} · {item.direction} · {item.sourceKind}
                  </p>
                  <p className="break-words">
                    <strong>Observed time:</strong> {item.observedAt ?? 'unknown'}
                    {item.observedAt ? '' : ' (record-update time is not substituted)'}
                  </p>
                  <p className="mt-1 font-medium">
                    {item.eligibleForCustomerJudgment
                      ? 'Buyer-attributed source; no model was called.'
                      : `Excluded from customer judgments: ${item.exclusionReason ?? 'source is not verified verbatim buyer text'}.`}
                  </p>
                  <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 border-clay-lavender/50 pl-2 text-clay-body">
                    {item.text}
                  </blockquote>
                </article>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

function QueueItem({
  candidate,
  today,
  onLogDeal,
  onInspectEvidence,
}: {
  candidate: AttentionCandidate;
  today: string;
  onLogDeal?: (dealId: string) => void;
  onInspectEvidence?: (dealId: string) => CustomerEvidenceFolder;
}) {
  const title = candidate.dealTitle || candidate.companyName || 'Scheduled work';
  const href = recordHref(candidate);

  return (
    <li data-testid="followup-queue-item" className="rounded-xl border border-clay-hairline bg-white dark:bg-clay-card p-3 sm:p-4 min-w-0">
      <div className="flex items-start gap-3 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 mb-1">
            <span className="text-[10px] font-semibold uppercase tracking-wide text-clay-lavender">
              {ACTION_LABELS[candidate.action]}
            </span>
            <span className="text-[10px] font-medium text-clay-muted">Priority · {candidate.priority}</span>
          </div>
          {href ? (
            <Link
              href={href}
              aria-label={candidate.dealId ? `Open deal: ${title}` : `Open company: ${title}`}
              className="block w-fit max-w-full text-sm font-semibold text-clay-ink underline decoration-clay-hairline underline-offset-2 hover:decoration-clay-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender break-words"
            >
              {title}
            </Link>
          ) : (
            <p className="text-sm font-semibold text-clay-ink break-words">{title}</p>
          )}
          {candidate.companyName && candidate.dealTitle && candidate.companyName !== candidate.dealTitle && (
            <p className="mt-0.5 text-xs text-clay-muted break-words">{candidate.companyName}</p>
          )}
          <p className="mt-2 text-sm text-clay-body break-words whitespace-pre-wrap">{candidate.reason}</p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-clay-muted">
            <span>{dueLabel(candidate, today)}</span>
            <span>Source · <code className="break-all">{sourceLabel(candidate)}</code></span>
          </div>
          {candidate.holds.length > 0 && (
            <p className="mt-2 inline-flex items-center rounded-md border border-clay-error/40 bg-clay-error/5 px-2 py-1 text-xs font-semibold text-clay-error">
              Contact hold · internal review only
            </p>
          )}
          <details className="mt-2 text-xs text-clay-muted">
            <summary className="w-fit cursor-pointer rounded-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender">
              Inspect source references
            </summary>
            <ul className="mt-1 space-y-1 break-all font-mono">
              {candidate.sourceRefs.map((sourceRef) => <li key={sourceRef}>{sourceRef}</li>)}
            </ul>
          </details>
          {candidate.dealId && onInspectEvidence && (
            <CustomerEvidenceDisclosure buildFolder={() => onInspectEvidence(candidate.dealId!)} />
          )}
        </div>
        {candidate.dealId && candidate.action === 'honor_saved_followup' && onLogDeal && (
          <button
            type="button"
            onClick={() => onLogDeal(candidate.dealId!)}
            className="shrink-0 self-start rounded-lg border border-clay-hairline px-3 py-2 text-xs font-semibold text-clay-ink hover:border-clay-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender min-h-11"
            aria-label={`Log interaction for ${title}`}
          >
            Log
          </button>
        )}
      </div>
    </li>
  );
}

export default function TodayFollowupQueue({
  candidates,
  today,
  loading,
  sourceError,
  accountEventsUnavailable,
  signalsEnabled = false,
  onRetry,
  onLogDeal,
  onInspectEvidence,
}: TodayFollowupQueueProps) {
  const queue = buildDailyFollowupQueue(candidates, today);

  return (
    <section data-testid="today-followup-queue" aria-labelledby="today-followup-title" className="mb-6 min-w-0">
      <header className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 id="today-followup-title" className="zams-display text-xl leading-tight">Today’s work</h2>
          <p className="mt-1 text-xs text-clay-muted" aria-live="polite">
            {queue.totalCount} item{queue.totalCount === 1 ? '' : 's'} · all shown
          </p>
        </div>
      </header>

      <div role="group" aria-label="Queue counts" className="mb-3 flex flex-wrap gap-1.5">
        {queue.sections.map((section) => (
          <span key={section.id} className="rounded-full border border-clay-hairline bg-clay-surface px-2 py-1 text-[11px] text-clay-muted">
            {section.label} · {section.count}
          </span>
        ))}
      </div>

      <p className="mb-3 rounded-lg border border-clay-hairline bg-clay-surface/70 px-3 py-2 text-xs leading-relaxed text-clay-muted">
        This queue is advisory. Unknown contact permission is not clearance to contact, and no message is sent here.
      </p>

      {!signalsEnabled && (
        <p className="mb-3 rounded-lg border border-clay-lavender/30 bg-clay-lavender/5 px-3 py-2 text-xs leading-relaxed text-clay-muted">
          Local customer-message judgments are not enabled in this build. No mock AI results are shown; saved schedules remain deterministic.
        </p>
      )}

      {sourceError && (
        <div role="alert" className="mb-3 rounded-lg border border-clay-error/40 bg-clay-error/5 px-3 py-3 text-sm text-clay-ink">
          <p>CRM data could not be loaded. This queue may be incomplete.</p>
          <button
            type="button"
            onClick={onRetry}
            className="mt-2 min-h-11 rounded-md border border-clay-hairline px-3 py-2 text-xs font-semibold hover:border-clay-lavender focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender"
          >
            Retry loading
          </button>
        </div>
      )}

      {accountEventsUnavailable && (
        <p role="status" className="mb-3 rounded-lg border border-clay-ochre/40 bg-clay-ochre/5 px-3 py-2 text-xs leading-relaxed text-clay-ink">
          Sales history is unavailable. Retention timing may be incomplete; missing history is not evidence of no orders or inactivity.
        </p>
      )}

      {loading ? (
        <div role="status" aria-live="polite" className="rounded-xl border border-clay-hairline bg-white dark:bg-clay-card p-5 text-sm text-clay-muted">
          Loading schedules and retention signals…
        </div>
      ) : queue.totalCount === 0 ? (
        sourceError || accountEventsUnavailable ? (
          <div className="rounded-xl border border-clay-hairline bg-white dark:bg-clay-card p-4 text-sm text-clay-muted">
            No known items from the sources that loaded. Verify manually while source coverage is incomplete.
          </div>
        ) : (
          <div className="rounded-xl border border-clay-hairline bg-white dark:bg-clay-card p-5 text-sm text-clay-muted">
            <p>Nothing due, overdue, or unscheduled for review today.</p>
            <Link href="/prospects" className="mt-3 inline-flex min-h-11 items-center font-medium text-clay-lavender underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-clay-lavender">
              Continue prospecting
            </Link>
          </div>
        )
      ) : (
        <div className="space-y-4">
          {queue.sections.filter((section) => section.count > 0).map((section) => (
            <section key={section.id} aria-labelledby={`today-section-${section.id}`} className="min-w-0">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 id={`today-section-${section.id}`} className="text-sm font-semibold text-clay-ink">{section.label}</h3>
                <span className="shrink-0 rounded-full bg-clay-surface px-2 py-0.5 text-xs font-semibold text-clay-muted">
                  {section.count}
                </span>
              </div>
              <div className="space-y-3">
                {section.groups.map((group) => (
                  <div key={group.key} className="min-w-0">
                    {group.items.length > 1 && group.companyName && (
                      <h4 className="mb-1.5 px-1 text-xs font-semibold text-clay-muted break-words">{group.companyName}</h4>
                    )}
                    <ul className="space-y-2">
                      {group.items.map((item) => (
                        <QueueItem
                        key={item.id}
                        candidate={item}
                        today={today}
                        onLogDeal={onLogDeal}
                        onInspectEvidence={onInspectEvidence}
                      />
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
