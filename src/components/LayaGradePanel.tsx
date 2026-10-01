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
import type { LayaJudgmentRow } from '@/lib/crm';
import { gradeDeal, type DealGrade } from '@/utils/grade';
import { toSavedJudgment } from '@/utils/laya-review';
import { chasesSinceLastReply } from '@/utils/interaction-event';
import { dealInputSha256 } from '@/utils/laya-freshness';
import { TIER_LABELS } from '@/utils/lead-scoring';

type Loaded =
  | { state: 'loading' }
  | { state: 'error'; key: string }
  | { state: 'ready'; key: string; row: LayaJudgmentRow | null; currentSha: string | null };

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
    Promise.all([Promise.resolve().then(() => crm.getLatestDealJudgment(deal.id)), dealInputSha256(deal)])
      .then(([row, currentSha]) => { if (!cancelled) setResult({ state: 'ready', key, row, currentSha }); })
      .catch(() => { if (!cancelled) setResult({ state: 'error', key }); });
    return () => { cancelled = true; };
    // `key` covers the deal fields the request is built from.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const chases = useMemo(() => chasesSinceLastReply(meetings, deal.id), [meetings, deal.id]);

  const grade = useMemo<DealGrade | null>(() => {
    if (loaded.state !== 'ready') return null;
    return gradeDeal({ deal, judgment: toSavedJudgment(loaded.row, loaded.currentSha), chasesSinceReply: chases });
  }, [loaded, deal, chases]);

  const title = loaded.state === 'ready' && grade
    ? `Laya grade · ${STATUS_LABEL[grade.status]}`
    : loaded.state === 'error' ? 'Laya grade · unavailable' : 'Laya grade';

  return (
    <details className="group border-b border-clay-hairline" open={grade?.status === 'needs_review' || undefined}>
      <summary className="flex cursor-pointer list-none items-center justify-between py-3 text-sm text-clay-ink marker:hidden">
        <span className={clsx(grade?.status === 'needs_review' && 'font-medium text-clay-ochre')}>{title}</span>
        <ChevronRight className="h-4 w-4 text-clay-muted transition-transform group-open:rotate-90" aria-hidden="true" />
      </summary>
      <div className="space-y-3 pb-4 text-sm" data-testid="laya-grade-panel">
        {loaded.state === 'loading' && <p className="text-xs text-clay-muted">Reading saved judgment…</p>}
        {loaded.state === 'error' && (
          <p className="text-xs text-clay-muted">Could not read saved Laya judgments. The deterministic tier is unaffected.</p>
        )}
        {grade && <GradeBody grade={grade} />}
      </div>
    </details>
  );
}

function GradeBody({ grade }: { grade: DealGrade }) {
  const shifted = grade.tier !== grade.baseTier;
  const quantity = QUANTITY_LABEL[grade.quantity];
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
        {grade.momentum !== null && <span className="text-clay-muted">momentum {grade.momentum > 0 ? '+' : ''}{grade.momentum.toFixed(2)}</span>}
        {quantity && <span className="text-clay-muted">order size {quantity}</span>}
      </div>

      {grade.review.length > 0 && (
        <ul className="space-y-1 text-xs">
          {grade.review.map(reason => (
            <li key={reason} className={grade.status === 'needs_review' ? 'text-clay-ochre' : 'text-clay-muted'}>· {reason}</li>
          ))}
        </ul>
      )}

      {grade.reasons.length > 0 && (
        <ul className="space-y-0.5 text-xs text-clay-body" aria-label="Why">
          {grade.reasons.slice(0, 6).map(reason => (
            <li key={reason.label} className="flex justify-between gap-3">
              <span>{reason.label}</span>
              <span className={clsx('tabular-nums', reason.effect > 0 ? 'text-clay-success' : reason.effect < 0 ? 'text-clay-error' : 'text-clay-muted')}>
                {reason.effect === 0 ? '—' : `${reason.effect > 0 ? '+' : ''}${reason.effect.toFixed(2)}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[10px] uppercase tracking-wide text-clay-muted">
        model-assisted review, not a decision · weights not yet calibrated
      </p>
    </>
  );
}
