'use client';

// ─── LeadPulse Intelligence — Prospect Review: saved decision panel ───
//
// The only interactive part of the Prospect Review screen. It writes a review row and,
// when the review carries a due date, one `followup_date` field on an existing deal so
// the action shows up on the board.
//
// Three deliberate properties, each with an acceptance criterion:
//   * nothing writes on field change — explicit Save only, with spinner, saved state,
//     success ring and a 5-second undo
//   * a rejection cannot be saved without a reason from the closed vocabulary, and the
//     note is required for the codes that need one
//   * the panel names the deal it is about to change BEFORE the save, and states plainly
//     when it will change nothing

import { useMemo, useState } from 'react';
import clsx from 'clsx';
import { AlertTriangle, CalendarClock, Check, Loader2, Save, Trash2 } from 'lucide-react';
import { useToast } from '@/components/ToastProvider';
import {
  clearProspectReview,
  restoreProspectReview,
  saveProspectReview,
  setDealFollowupDate,
  type ProspectReviewRow,
} from '@/lib/prospectReviews';
import {
  DECISION_SCOPE_NOTE,
  NO_REVIEWER_NOTE,
  REVIEW_DECISIONS,
  buildReviewRowPayload,
  criterionOptions,
  decisionSpec,
  draftFromReview,
  emptyDraft,
  followupTargetFor,
  formatReviewDate,
  isOverdue,
  parseCriterionRef,
  planFollowupWrite,
  reasonCodesFor,
  reasonSpec,
  validateReviewDraft,
  type FollowupDeal,
  type ReviewDecision,
  type ReviewDraft,
  type ReviewReasonCode,
} from '@/utils/prospectReviewDecision';

interface Props {
  companyId: string;
  companyName: string;
  archetypeId: string;
  /** every deal linked to this company; the open ones are derived here */
  deals: FollowupDeal[];
  review: ProspectReviewRow | null;
  /** reload reviews (and the CRM when a deal follow-up moved) */
  onChanged: () => Promise<void> | void;
}

interface DealChange {
  dealId: string;
  previous: string | null;
}

const FIELD = 'w-full rounded-lg border border-clay-hairline bg-clay-canvas px-2.5 py-1.5 text-xs text-clay-ink placeholder:text-clay-muted focus:outline-none focus:ring-1 focus:ring-clay-lavender';
const LABEL = 'block text-[11px] font-semibold uppercase tracking-wide text-clay-muted';

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-[11px] text-clay-error">{message}</p>;
}

export default function ProspectReviewPanel({ companyId, companyName, archetypeId, deals, review, onChanged }: Props) {
  const { addToast } = useToast();
  const [draft, setDraft] = useState<ReviewDraft>(() => (review ? draftFromReview(review) : emptyDraft(companyId)));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);

  const set = <K extends keyof ReviewDraft>(key: K, value: ReviewDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const reasons = draft.decision ? reasonCodesFor(draft.decision) : [];
  const selectedReason = draft.reasonCode ? reasonSpec(draft.reasonCode as ReviewReasonCode) : null;
  const criteria = useMemo(() => criterionOptions(archetypeId), [archetypeId]);
  const cited = parseCriterionRef(draft.criterionRef);
  const multiDeal = followupTargetFor(deals, companyId, draft.followupDealId);
  const plan = useMemo(
    () => planFollowupWrite({ draft, deals, previousReview: review }),
    [draft, deals, review]
  );

  async function writeDealFollowup(planPatch: { followup_date: string | null } | null, dealId: string): Promise<DealChange | null> {
    if (!planPatch || !dealId) return null;
    const deal = deals.find((d) => d.id === dealId);
    const previous = deal?.followup_date ?? null;
    await setDealFollowupDate(dealId, planPatch.followup_date);
    return { dealId, previous };
  }

  async function revert(previous: ProspectReviewRow | null, dealChange: DealChange | null) {
    try {
      if (previous) await restoreProspectReview(previous);
      else await clearProspectReview(companyId);
      if (dealChange) await setDealFollowupDate(dealChange.dealId, dealChange.previous);
      await onChanged();
      addToast('Review reverted');
    } catch (e) {
      addToast(`Revert failed: ${(e as Error).message}`, 'error');
    }
  }

  async function handleSave() {
    const validation = validateReviewDraft(draft);
    setErrors(validation.errors);
    if (!validation.ok) {
      setSaveError('Fix the highlighted fields before saving. Nothing was written.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    const previous = review;
    try {
      await saveProspectReview(buildReviewRowPayload(draft, new Date()));
      const dealChange = await writeDealFollowup(plan.patch, plan.dealId);
      addToast(dealChange ? 'Review saved · deal follow-up updated' : 'Review saved', 'success', {
        label: 'Undo',
        onClick: () => {
          void revert(previous, dealChange);
        },
      });
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
      await onChanged();
    } catch (e) {
      setSaveError((e as Error).message || 'The review could not be saved.');
    } finally {
      setSaving(false);
    }
  }

  async function handleClear() {
    if (!review) return;
    setSaving(true);
    setSaveError(null);
    const previous = review;
    try {
      const clearPlan = planFollowupWrite({ draft: emptyDraft(companyId), deals, previousReview: previous });
      const dealChange = await writeDealFollowup(clearPlan.patch, clearPlan.dealId);
      await clearProspectReview(companyId);
      setDraft(emptyDraft(companyId));
      setErrors({});
      addToast('Review cleared', 'success', {
        label: 'Undo',
        onClick: () => {
          void revert(previous, dealChange);
        },
      });
      await onChanged();
    } catch (e) {
      setSaveError((e as Error).message || 'The review could not be cleared.');
    } finally {
      setSaving(false);
    }
  }

  const overdue = isOverdue(draft.nextActionDue, new Date());

  return (
    <section
      aria-label={`Saved review for ${companyName}`}
      className={clsx(
        'mt-4 rounded-xl border bg-clay-card p-3 transition-shadow',
        justSaved ? 'border-clay-lavender ring-2 ring-clay-lavender/40' : 'border-clay-hairline'
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-clay-muted">Saved review</h3>
        <div className="flex flex-wrap items-center gap-2">
          {review?.needs_data_review && (
            <span className="rounded-md bg-clay-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-clay-body">
              flagged for data review
            </span>
          )}
          <span className="text-[11px] text-clay-muted">
            {review ? `last reviewed ${formatReviewDate(review.reviewed_at)}` : 'not reviewed yet'}
          </span>
        </div>
      </div>

      <p className="mt-1 text-[11px] leading-snug text-clay-body/80">{DECISION_SCOPE_NOTE}</p>

      {/* Decision */}
      <div className="mt-3">
        <span className={LABEL}>Decision</span>
        <div className="mt-1 flex flex-wrap gap-2">
          {REVIEW_DECISIONS.map((d) => {
            const active = draft.decision === d.id;
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                onClick={() => setDraft((cur) => ({ ...cur, decision: d.id as ReviewDecision, reasonCode: '' }))}
                className={clsx(
                  'rounded-lg border px-3 py-1.5 text-xs font-semibold motion-press',
                  active
                    ? 'border-clay-lavender bg-clay-lavender/10 text-clay-ink'
                    : 'border-clay-hairline bg-clay-canvas text-clay-body hover:text-clay-ink'
                )}
              >
                {d.label}
              </button>
            );
          })}
        </div>
        {draft.decision && (
          <p className="mt-1 text-[11px] leading-snug text-clay-body">{decisionSpec(draft.decision as ReviewDecision).blurb}</p>
        )}
        <FieldError message={errors.decision} />
      </div>

      {/* Reason */}
      {draft.decision && (
        <div className="mt-3 grid gap-3 lg:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor={`reason-${companyId}`}>
              Reason
            </label>
            <select
              id={`reason-${companyId}`}
              value={draft.reasonCode}
              onChange={(e) => set('reasonCode', e.target.value as ReviewReasonCode | '')}
              className={clsx(FIELD, 'mt-1')}
            >
              <option value="">Choose a reason…</option>
              {reasons.map((r) => (
                <option key={r.code} value={r.code}>
                  {r.label}
                </option>
              ))}
            </select>
            {selectedReason && <p className="mt-1 text-[11px] leading-snug text-clay-muted">{selectedReason.hint}</p>}
            <FieldError message={errors.reasonCode} />
          </div>

          <div>
            <label className={LABEL} htmlFor={`note-${companyId}`}>
              Note {selectedReason?.requiresNote ? '(required for this reason)' : '(optional)'}
            </label>
            <textarea
              id={`note-${companyId}`}
              value={draft.reasonNote}
              onChange={(e) => set('reasonNote', e.target.value)}
              rows={2}
              className={clsx(FIELD, 'mt-1 resize-y')}
              placeholder="What you saw, and where you saw it"
            />
            <FieldError message={errors.reasonNote} />
          </div>
        </div>
      )}

      {/* Committed criterion */}
      {draft.decision && criteria.length > 0 && (
        <div className="mt-3">
          <label className={LABEL} htmlFor={`criterion-${companyId}`}>
            Committed criterion contradicted (optional)
          </label>
          <select
            id={`criterion-${companyId}`}
            value={draft.criterionRef}
            onChange={(e) => set('criterionRef', e.target.value)}
            className={clsx(FIELD, 'mt-1')}
          >
            <option value="">None cited</option>
            {criteria.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-[11px] leading-snug text-clay-muted">
            {cited
              ? `Cited: ${cited.text}`
              : 'Only the published criteria can be cited. A requirement that is not on this list cannot rule an account out.'}
          </p>
          <FieldError message={errors.criterionRef} />
        </div>
      )}

      {/* Data-review flag */}
      <label className="mt-3 flex items-start gap-2 text-[11px] text-clay-body">
        <input
          type="checkbox"
          checked={draft.needsDataReview}
          onChange={(e) => set('needsDataReview', e.target.checked)}
          className="mt-0.5"
        />
        <span>
          Flag this record for a data check (duplicate, wrong entity, wrong sector). The flag is a note — it does not
          change the match, the score, or the account.
        </span>
      </label>

      {/* Next action */}
      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <label className={LABEL} htmlFor={`action-${companyId}`}>
            Next action
          </label>
          <input
            id={`action-${companyId}`}
            value={draft.nextAction}
            onChange={(e) => set('nextAction', e.target.value)}
            className={clsx(FIELD, 'mt-1')}
            placeholder="The single next step for this account"
          />
          <FieldError message={errors.nextAction} />
        </div>
        <div>
          <label className={LABEL} htmlFor={`owner-${companyId}`}>
            Owner
          </label>
          <input
            id={`owner-${companyId}`}
            value={draft.nextActionOwner}
            onChange={(e) => set('nextActionOwner', e.target.value)}
            className={clsx(FIELD, 'mt-1')}
            placeholder="Who acts"
          />
          <FieldError message={errors.nextActionOwner} />
        </div>
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-3">
        <div>
          <label className={LABEL} htmlFor={`due-${companyId}`}>
            Due date (optional)
          </label>
          <input
            id={`due-${companyId}`}
            type="date"
            value={draft.nextActionDue}
            onChange={(e) => set('nextActionDue', e.target.value)}
            className={clsx(FIELD, 'mt-1')}
          />
          <FieldError message={errors.nextActionDue} />
          {overdue && (
            <p className="mt-1 flex items-center gap-1 text-[11px] text-clay-error">
              <CalendarClock className="w-3 h-3" /> This date is already in the past.
            </p>
          )}
        </div>

        <div className="lg:col-span-2">
          <span className={LABEL}>Effect on the deal board</span>
          <p className="mt-1 text-[11px] leading-snug text-clay-body">{plan.note}</p>
          {multiDeal.kind === 'multiple' && (
            <div className="mt-2">
              <label className={LABEL} htmlFor={`deal-${companyId}`}>
                Which deal?
              </label>
              <select
                id={`deal-${companyId}`}
                value={draft.followupDealId}
                onChange={(e) => set('followupDealId', e.target.value)}
                className={clsx(FIELD, 'mt-1')}
              >
                <option value="">Choose a deal…</option>
                {multiDeal.deals.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.title}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Evidence */}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <div>
          <label className={LABEL} htmlFor={`evidence-${companyId}`}>
            Evidence notes
          </label>
          <textarea
            id={`evidence-${companyId}`}
            value={draft.evidenceNote}
            onChange={(e) => set('evidenceNote', e.target.value)}
            rows={2}
            className={clsx(FIELD, 'mt-1 resize-y')}
            placeholder="What was checked, and what it showed"
          />
        </div>
        <div>
          <label className={LABEL} htmlFor={`links-${companyId}`}>
            Source links (one per line)
          </label>
          <textarea
            id={`links-${companyId}`}
            value={draft.evidenceLinks}
            onChange={(e) => set('evidenceLinks', e.target.value)}
            rows={2}
            className={clsx(FIELD, 'mt-1 resize-y')}
            placeholder="https://…"
          />
          <FieldError message={errors.evidenceLinks} />
        </div>
      </div>

      {saveError && (
        <div role="alert" className="mt-3 flex items-start gap-2 rounded-lg border border-clay-hairline bg-clay-canvas px-3 py-2">
          <AlertTriangle className="mt-0.5 w-3.5 h-3.5 shrink-0 text-clay-error" />
          <p className="text-[11px] text-clay-body">{saveError}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-1.5 rounded-lg bg-clay-lavender px-3 py-1.5 text-xs font-semibold text-white motion-press disabled:opacity-60"
        >
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : justSaved ? <Check className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
          {saving ? 'Saving…' : justSaved ? 'Saved' : 'Save review'}
        </button>
        {review && (
          <button
            type="button"
            onClick={handleClear}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg border border-clay-hairline px-3 py-1.5 text-xs font-medium text-clay-body motion-press hover:text-clay-ink disabled:opacity-60"
          >
            <Trash2 className="w-3.5 h-3.5" /> Clear review
          </button>
        )}
        <span className="text-[11px] text-clay-muted">Nothing changes until you press Save.</span>
      </div>

      <p className="mt-2 text-[11px] text-clay-muted">{NO_REVIEWER_NOTE}</p>
    </section>
  );
}
