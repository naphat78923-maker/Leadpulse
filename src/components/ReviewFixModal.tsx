'use client';

import { useState } from 'react';
import { Deal, DealWorkflowAction, SampleStatus } from '@/types/crm';
import { SAMPLE_STATUS_OPTIONS, WORKFLOW_BY_ID } from '@/utils/deal-workflow';
import { REVIEW_LABEL, ReviewReason } from '@/utils/deal-board';
import { X, Loader2, AlertCircle } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { overlayVariants, panelVariants, tweenBase, tweenSlow } from '@/lib/motion';

export interface ReviewFixPayload {
  sample_status?: SampleStatus | null;
  followup_date?: string | null;
  reply_outcome?: string | null;
  reply_summary?: string | null;
  next_action?: string | null;
}

interface ReviewFixModalProps {
  deal: Deal;
  reasons: ReviewReason[];
  onCancel: () => void;
  onConfirm: (payload: ReviewFixPayload) => Promise<void>;
}

const OUTCOME_OPTIONS = [
  { value: 'positive', label: 'Positive', cls: 'border-clay-success/30 bg-clay-success/10 text-clay-success' },
  { value: 'neutral', label: 'Neutral', cls: 'border-clay-hairline bg-clay-card text-clay-body' },
  { value: 'negative', label: 'Negative', cls: 'border-clay-error/30 bg-clay-error/10 text-clay-error' },
  { value: 'no_response', label: 'No response', cls: 'border-clay-ochre/30 bg-clay-ochre/10 text-clay-ochre' },
];

const fieldLabel = (label: string) => (
  <span className="zams-mono text-[10px] uppercase tracking-[0.16px] text-clay-muted">{label}</span>
);

export default function ReviewFixModal({ deal, reasons, onCancel, onConfirm }: ReviewFixModalProps) {
  const lane = WORKFLOW_BY_ID[getWorkflowActionFromReasons(deal, reasons)];
  const needsSample = reasons.includes('sample-status-missing');
  const needsDate =
    reasons.includes('testing-date-missing') ||
    reasons.includes('parked-revisit-missing') ||
    reasons.includes('followup-date-missing');
  const needsReply = reasons.includes('reply-outcome-missing');
  const needsNextAction = reasons.includes('pre-contact-action');

  const [sampleStatus, setSampleStatus] = useState<SampleStatus | ''>(deal.sample_status || '');
  const [followupDate, setFollowupDate] = useState<string>(deal.followup_date || '');
  const [replyOutcome, setReplyOutcome] = useState<string>('');
  const [replySummary, setReplySummary] = useState<string>('');
  const [nextAction, setNextAction] = useState<string>(deal.next_action || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (needsSample && !sampleStatus) return 'Choose whether the sample was sent or received.';
    if (needsDate && !followupDate) return 'Add the required date before saving.';
    if (needsReply && !replyOutcome) return 'Capture the client response before saving.';
    if (needsNextAction && !nextAction.trim()) return 'Add the next action before saving.';
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setError(err);
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfirm({
        sample_status: needsSample ? (sampleStatus as SampleStatus) : null,
        followup_date: needsDate ? followupDate : null,
        reply_outcome: needsReply ? replyOutcome : null,
        reply_summary: needsReply && replySummary.trim() ? replySummary.trim() : null,
        next_action: needsNextAction && nextAction.trim() ? nextAction.trim() : null,
      });
    } catch (err2: any) {
      setError('Could not save: ' + (err2.message || 'Unknown error'));
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <motion.div
        className="absolute inset-0 bg-black/50"
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={tweenBase}
        onClick={onCancel}
      />
      <motion.div
        className="relative bg-white dark:bg-clay-card w-full sm:max-w-md rounded-t-2xl sm:rounded-lg max-h-[90vh] overflow-y-auto"
        variants={panelVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={tweenSlow}
      >
        <div className="sticky top-0 bg-white dark:bg-clay-card border-b border-clay-hairline px-5 py-4 z-10">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="zams-eyebrow mb-0.5">Fix data hygiene · {lane.shortLabel}</p>
              <h2 className="text-sm font-semibold text-clay-ink leading-tight">{deal.client}</h2>
            </div>
            <button onClick={onCancel} className="p-2 text-clay-muted hover:bg-clay-surface rounded-lg shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div className="flex items-start gap-2 text-[11px] text-clay-muted bg-clay-lavender/10 border border-clay-lavender/20 rounded-lg px-3 py-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 text-clay-lavender shrink-0" />
            <span>Completing these fields clears the review flag for this deal. Nothing else on the deal is changed.</span>
          </div>

          <ul className="space-y-1">
            {reasons.map(r => (
              <li key={r} className="text-[11px] text-clay-body flex items-start gap-1.5">
                <span className="text-clay-lavender mt-0.5">•</span>
                <span>{REVIEW_LABEL[r]}</span>
              </li>
            ))}
          </ul>

          {needsSample && (
            <div>
              {fieldLabel('Sample status')}
              <div className="flex gap-2 mt-2">
                {SAMPLE_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSampleStatus(opt.value)}
                    className={clsx(
                      'flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                      sampleStatus === opt.value ? 'border-clay-lavender bg-clay-lavender/20 text-clay-lavender' : 'border-clay-hairline text-clay-muted hover:border-clay-muted-soft'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {needsDate && (
            <div>
              {fieldLabel(reasons.includes('parked-revisit-missing') ? 'Revisit date' : reasons.includes('testing-date-missing') ? 'Testing date' : 'Follow-up date')}
              <input
                type="date"
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
                className="w-full mt-2 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender/40"
              />
            </div>
          )}

          {needsReply && (
            <>
              <div>
                {fieldLabel('Client response')}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {OUTCOME_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReplyOutcome(opt.value)}
                      className={clsx(
                        'px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                        replyOutcome === opt.value ? opt.cls : 'border-clay-hairline text-clay-muted hover:border-clay-muted-soft'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {fieldLabel('Summary (optional)')}
                <textarea
                  value={replySummary}
                  onChange={(e) => setReplySummary(e.target.value)}
                  rows={2}
                  placeholder="What did they say?"
                  className="w-full mt-2 px-3 py-2.5 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 resize-none"
                />
              </div>
            </>
          )}

          {needsNextAction && (
            <div>
              {fieldLabel('Pre-contact research step')}
              <input
                type="text"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="e.g. Find R&D buyer before sample"
                className="w-full mt-2 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender/40"
              />
            </div>
          )}

          {error && (
            <p className="text-xs font-medium text-clay-error bg-clay-error/10 border border-clay-error/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-clay-card border-t border-clay-hairline px-5 py-3 flex items-center justify-end gap-2 z-10">
          <button onClick={onCancel} className="clay-btn-outline">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="clay-btn-primary min-w-[110px]">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save fix'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function getWorkflowActionFromReasons(deal: Deal, reasons: ReviewReason[]): DealWorkflowAction {
  if (reasons.includes('sample-status-missing')) return 'sample';
  if (reasons.includes('testing-date-missing')) return 'testing';
  if (reasons.includes('followup-date-missing')) return 'reschedule';
  if (reasons.includes('parked-revisit-missing')) return 'parked';
  if (reasons.includes('reply-outcome-missing')) return 'reply';
  if (reasons.includes('pre-contact-action')) return 'sample';
  return deal.workflow_action || 'outreach';
}
