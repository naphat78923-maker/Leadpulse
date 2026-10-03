'use client';

// ─── Laya grade in the deal panel ───
// Reads the newest saved judgment for this deal (written by the Mac worker), checks
// it was made for the deal's CURRENT reply, and shows gradeDeal's result: status,
// tier and the reasons behind it. Review-only: nothing here changes the deal.

import { useEffect, useMemo, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { Deal } from '@/types/crm';
import { useCrm } from '@/components/CrmProvider';
import * as crm from '@/lib/crm';
import type { LayaJudgmentRow, ReviewDecisionRow } from '@/lib/crm';
import { DECISION_EVENT, decisionFor, decisionRow, withDecision } from '@/utils/laya-decisions';
import { gradeDeal, type DealGrade, type GradeReason, type ReasonGroup } from '@/utils/grade';
import { withTrend } from '@/utils/laya-trend';
import LayaSpark from '@/components/LayaSpark';
import ActionButton from '@/components/ActionButton';
import { toSavedJudgment } from '@/utils/laya-review';
import { chasesSinceLastReply } from '@/utils/interaction-event';
import { dealInputSha256 } from '@/utils/laya-freshness';
import { TIER_LABELS } from '@/utils/lead-scoring';

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; key: string }
  | { state: 'ready'; key: string; row: LayaJudgmentRow | null; history: LayaJudgmentRow[]; decisions: ReviewDecisionRow[]; currentSha: string | null };

const STATUS_LABEL: Record<DealGrade['status'], string> = {
  graded: 'graded',
  needs_review: 'needs your review',
  not_graded: 'not graded',
};

const QUANTITY_LABEL: Record<DealGrade['quantity'], string | null> = {
  none: null,
  small: 'under 5 kg',
  moderate: '5–15 kg',
  large: 'over 15 kg',
};

export default function LayaGradePanel({ deal }: { deal: Deal }) {
  const { meetings = [] } = useCrm();
  const [result, setResult] = useState<Loaded>({ state: 'loading' });
  // A result belongs to one deal and reply; anything else reads as loading, so a stale
  // answer never shows against a changed reply.
  const key = JSON.stringify([deal.id, deal.buyer_reply ?? null, deal.product ?? null]);
  const loaded = useMemo<Loaded>(
    () => (result.state !== 'loading' && result.key === key ? result : { state: 'loading' }),
    [result, key],
  );

  useEffect(() => {
    let cancelled = false;
    // Promise.resolve().then: a missing or throwing reader becomes "unavailable", never a crash.
    Promise.all([
      Promise.resolve().then(() => crm.getLatestDealJudgment(deal.id)),
      dealInputSha256(deal),
      // The trend is an extra: without the history the grade simply shows none.
      Promise.resolve().then(() => crm.getDealJudgmentHistory(deal.id)).catch(() => [] as LayaJudgmentRow[]),
      Promise.resolve().then(() => crm.getReviewDecisions(deal.id)).catch(() => [] as ReviewDecisionRow[]),
    ])
      .then(([row, currentSha, history, decisions]) => { if (!cancelled) setResult({ state: 'ready', key, row, history, decisions, currentSha }); })
      .catch(() => { if (!cancelled) setResult({ state: 'error', key }); });
    return () => { cancelled = true; };
    // `key` covers the deal fields the request is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const chases = useMemo(() => chasesSinceLastReply(meetings, deal.id), [meetings, deal.id]);

  const rawGrade = useMemo<DealGrade | null>(() => {
    if (loaded.state !== 'ready') return null;
    return gradeDeal({ deal, judgment: toSavedJudgment(loaded.row, loaded.currentSha), chasesSinceReply: chases });
  }, [loaded, deal, chases]);

  // The same grade with Pat's decision for this reply and the trend applied.
  const grade = useMemo<DealGrade | null>(() => {
    if (!rawGrade || loaded.state !== 'ready') return null;
    const decided = withDecision(rawGrade, decisionFor(loaded.decisions, deal.id, loaded.currentSha));
    return withTrend(decided, loaded.row, loaded.history, loaded.currentSha);
  }, [rawGrade, loaded, deal.id]);

  const [deciding, setDeciding] = useState<'confirm' | 'reject' | null>(null);
  const [decideError, setDecideError] = useState(false);
  const decide = async (decision: 'confirm' | 'reject') => {
    if (!rawGrade || loaded.state !== 'ready' || deciding) return;
    setDeciding(decision);
    setDecideError(false);
    try {
      const saved = await crm.addReviewDecision(decisionRow(deal.id, loaded.currentSha, rawGrade, decision));
      setResult({ ...loaded, decisions: [saved, ...loaded.decisions] });
      window.dispatchEvent(new Event(DECISION_EVENT));
    } catch {
      setDecideError(true);
    } finally {
      setDeciding(null);
    }
  };

  const title = loaded.state === 'ready' && grade
    ? `Laya grade · ${STATUS_LABEL[grade.status]}`
    : loaded.state === 'error' ? 'Laya grade · unavailable' : 'Laya grade';

  return (
    <details className="group border-b border-clay-hairline" open={grade?.status === 'needs_review' || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-clay-ink marker:hidden">
        <span className={clsx('inline-flex items-center gap-1.5', grade?.status === 'needs_review' && 'font-medium text-clay-ochre')}>
          <LayaSpark state={loaded.state === 'loading' ? 'working' : grade?.status === 'graded' ? 'ok' : grade?.status === 'needs_review' ? 'alert' : 'idle'} />
          {title}
        </span>
        <ChevronRight className="h-4 w-4 text-clay-muted transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="space-y-3 pb-4 text-sm" data-testid="laya-grade-panel">
        {loaded.state === 'loading' && <p className="text-xs text-clay-muted">Reading saved judgment…</p>}
        {loaded.state === 'error' && (
          <p className="text-xs text-clay-muted">Could not read saved Laya judgments. The deterministic tier is unaffected.</p>
        )}
        {grade && <GradeBody grade={grade} />}
        {grade?.status === 'needs_review' && loaded.state === 'ready' && loaded.currentSha && (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Your decision">
            <ActionButton busy={deciding === 'confirm'} disabled={deciding !== null} onClick={() => decide('confirm')}>
              {grade.suggestedTier && grade.suggestedTier !== grade.baseTier ? `Agree: ${TIER_LABELS[grade.suggestedTier]}` : 'Agree with Laya'}
            </ActionButton>
            <ActionButton variant="quiet" busy={deciding === 'reject'} disabled={deciding !== null} onClick={() => decide('reject')}>
              Disagree: keep {TIER_LABELS[grade.baseTier]}
            </ActionButton>
            {decideError && <span role="alert" className="text-xs text-clay-error">Could not save your decision.</span>}
          </div>
        )}
        {grade?.decision && (
          <p data-testid="laya-decision" className="text-xs text-clay-muted">
            You {grade.decision === 'confirm' ? 'agreed with' : 'disagreed with'} Laya on this reply.
          </p>
        )}
      </div>
    </details>
  );
}

const GROUPS: Array<{ id: ReasonGroup; title: string }> = [
  { id: 'buyer', title: 'What the buyer said' },
  { id: 'followup', title: 'Follow-up' },
  { id: 'order', title: 'Order size' },
];

/** Shown without the numbers: facts, and weighted answers Laya leans towards. */
const LEANING = 0.5;
const isPlain = (reason: GradeReason) =>
  reason.effect !== 0 && (reason.strength === undefined || reason.strength >= LEANING);
const plainLabel = (label: string) => label.replace(/\s*\(P [^)]*\)$/, '');

function GradeBody({ grade }: { grade: DealGrade }) {
  const [numbers, setNumbers] = useState(false);
  const shifted = grade.tier !== grade.baseTier;
  const quantity = QUANTITY_LABEL[grade.quantity];
  const trend = grade.trend;
  const shown = grade.reasons.filter(reason => numbers || isPlain(reason));
  return (
    <>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded border border-clay-hairline px-2 py-0.5 text-clay-body">CRM tier {TIER_LABELS[grade.baseTier]}</span>
        {grade.status === 'graded' && (
          <span className={clsx('rounded border px-2 py-0.5 font-medium',
            shifted ? 'border-clay-lavender/40 bg-clay-lavender/10 text-clay-ink' : 'border-clay-hairline text-clay-body')}>
            {shifted ? `Laya → ${TIER_LABELS[grade.tier]}` : 'Laya keeps the tier'}
          </span>
        )}
        {grade.status === 'needs_review' && grade.suggestedTier && (
          <span className="rounded border border-clay-ochre/30 bg-clay-ochre/10 px-2 py-0.5 text-clay-ochre">
            would be {TIER_LABELS[grade.suggestedTier]} if you confirm
          </span>
        )}
        {trend && (
          <span data-testid="laya-trend" data-trend={trend.direction}
            className={clsx(trend.direction === 'up' ? 'text-clay-success' : trend.direction === 'down' ? 'text-clay-error' : 'text-clay-muted')}>
            <span aria-hidden="true" className={clsx('mr-1', trend.direction === 'up' && 'lp-nudge-up', trend.direction === 'down' && 'lp-nudge-down')}>
              {trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→'}
            </span>
            {trend.direction === 'up' ? 'warmer than' : trend.direction === 'down' ? 'cooler than' : 'same as'} the previous reply
            {numbers && ` (${trend.delta > 0 ? '+' : ''}${trend.delta.toFixed(2)})`}
          </span>
        )}
        {numbers && grade.momentum !== null && <span className="text-clay-muted">momentum {grade.momentum > 0 ? '+' : ''}{grade.momentum.toFixed(2)}</span>}
        {quantity && <span className="text-clay-muted">order size {quantity}</span>}
      </div>

      {grade.review.length > 0 && (
        <ul className="space-y-1 text-xs">
          {grade.review.map(reason => (
            <li key={reason} className={grade.status === 'needs_review' ? 'text-clay-ochre' : 'text-clay-muted'}>· {reason}</li>
          ))}
        </ul>
      )}

      {GROUPS.map(group => {
        const reasons = shown.filter(reason => (reason.group ?? 'buyer') === group.id);
        if (reasons.length === 0) return null;
        return (
          <div key={group.id} data-reason-group={group.id}>
            <h4 className="mb-0.5 text-[10px] font-medium uppercase tracking-wide text-clay-muted">{group.title}</h4>
            <ul className="space-y-0.5 text-xs text-clay-body">
              {reasons.map(reason => (
                <li key={reason.label} className="flex justify-between gap-3">
                  <span>
                    <span aria-hidden="true" className={clsx('mr-1.5 inline-block w-3 text-center',
                      reason.effect > 0 ? 'text-clay-success' : reason.effect < 0 ? 'text-clay-error' : 'text-clay-muted')}>
                      {reason.effect > 0 ? '↑' : reason.effect < 0 ? '↓' : '·'}
                    </span>
                    <span className="sr-only">{reason.effect > 0 ? 'Raises the grade: ' : reason.effect < 0 ? 'Lowers the grade: ' : ''}</span>
                    {numbers ? reason.label : plainLabel(reason.label)}
                  </span>
                  {numbers && (
                    <span className={clsx('tabular-nums', reason.effect > 0 ? 'text-clay-success' : reason.effect < 0 ? 'text-clay-error' : 'text-clay-muted')}>
                      {reason.effect === 0 ? '—' : `${reason.effect > 0 ? '+' : ''}${reason.effect.toFixed(2)}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        );
      })}

      {grade.reasons.length > 0 && (
        <button type="button" onClick={() => setNumbers(value => !value)} aria-pressed={numbers}
          className="text-[11px] text-clay-muted underline decoration-clay-hairline underline-offset-2 hover:text-clay-ink">
          {numbers ? 'Hide the numbers' : 'Show the numbers'}
        </button>
      )}

      <p className="text-[10px] uppercase tracking-wide text-clay-muted">
        model-assisted review, not a decision · weights not yet calibrated
      </p>
    </>
  );
}
