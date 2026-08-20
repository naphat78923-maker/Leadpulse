'use client';

import { useState } from 'react';
import Image from 'next/image';
import { Deal, DealWorkflowAction, NudgeStage, SampleStatus } from '@/types/crm';
import { WORKFLOW_BY_ID, NUDGE_OPTIONS, SAMPLE_STATUS_OPTIONS } from '@/utils/deal-workflow';
import { X, Loader2 } from 'lucide-react';
import clsx from 'clsx';

export interface LaneGatePayload {
  workflow_action: DealWorkflowAction;
  sample_status?: SampleStatus | null;
  followup_date?: string | null;
  nudge_stage?: NudgeStage | null;
  next_action?: string | null;
  reply_outcome?: string | null;
  reply_summary?: string | null;
}

interface LaneGateModalProps {
  deal: Deal;
  targetLane: DealWorkflowAction;
  onCancel: () => void;
  onConfirm: (payload: LaneGatePayload) => Promise<void>;
}

const OUTCOME_OPTIONS = [
  { value: 'positive', label: 'Positive', cls: 'border-clay-success/30 bg-clay-success/10 text-clay-success' },
  { value: 'neutral', label: 'Neutral', cls: 'border-clay-hairline bg-clay-card text-clay-body' },
  { value: 'negative', label: 'Negative', cls: 'border-clay-error/30 bg-clay-error/10 text-clay-error' },
  { value: 'no_response', label: 'No response', cls: 'border-clay-ochre/30 bg-clay-ochre/10 text-clay-ochre' },
];

export default function LaneGateModal({ deal, targetLane, onCancel, onConfirm }: LaneGateModalProps) {
  const lane = WORKFLOW_BY_ID[targetLane];
  const [sampleStatus, setSampleStatus] = useState<SampleStatus | ''>(deal.sample_status || '');
  const [followupDate, setFollowupDate] = useState<string>(deal.followup_date || '');
  const [nudgeStage, setNudgeStage] = useState<NudgeStage | ''>('');
  const [nextAction, setNextAction] = useState<string>('');
  const [replyOutcome, setReplyOutcome] = useState<string>('');
  const [replySummary, setReplySummary] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    if (targetLane === 'sample' && !sampleStatus) return 'Choose whether the sample was sent or received.';
    if (targetLane === 'testing' && !followupDate) return 'Set the client testing date before saving.';
    if (targetLane === 'reschedule' && !followupDate) return 'Set the rescheduled follow-up date.';
    if (targetLane === 'reschedule' && !nudgeStage) return 'Choose Warm, Remind, Firm, or Parking nudge.';
    if (targetLane === 'parked' && !followupDate) return 'Parked deals need a revisit date.';
    if (targetLane === 'reply' && !replyOutcome) return 'Capture the client response before moving on.';
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
        workflow_action: targetLane,
        sample_status: targetLane === 'sample' ? (sampleStatus as SampleStatus) : null,
        followup_date: ['testing', 'reschedule', 'parked'].includes(targetLane) ? followupDate : null,
        nudge_stage: targetLane === 'reschedule' ? (nudgeStage as NudgeStage) : null,
        next_action: targetLane === 'outreach' && nextAction.trim() ? nextAction.trim() : null,
        reply_outcome: targetLane === 'reply' ? replyOutcome : null,
        reply_summary: targetLane === 'reply' && replySummary.trim() ? replySummary.trim() : null,
      });
    } catch (err2: any) {
      setError('Could not save: ' + (err2.message || 'Unknown error'));
      setSaving(false);
    }
  };

  const fieldLabel = (label: string, required: boolean) => (
    <span className="zams-mono text-[10px] uppercase tracking-[0.16px] text-clay-muted">
      {label} {required && <span className="text-clay-ochre">*</span>}
    </span>
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onCancel} />
      <div className="relative bg-white dark:bg-clay-card w-full sm:max-w-md rounded-t-2xl sm:rounded-lg animate-slide-up max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-clay-card border-b border-clay-hairline px-5 py-4 z-10">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="relative w-10 h-10 shrink-0">
                <div className="absolute inset-0 rounded-full bg-clay-lavender/20" />
                <Image
                  src="/assets/mascot-teardrop.png"
                  alt="LeadPulse mascot"
                  width={1024}
                  height={1024}
                  className="relative w-10 h-10 object-contain"
                />
              </div>
              <div>
                <p className="zams-eyebrow mb-0.5">Gate · {lane.shortLabel}</p>
                <h2 className="text-sm font-semibold text-clay-ink leading-tight">
                  {lane.icon} Move {deal.client} to {lane.label}
                </h2>
              </div>
            </div>
            <button onClick={onCancel} className="p-2 text-clay-muted hover:bg-clay-surface rounded-lg shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-clay-muted bg-clay-surface rounded-lg px-3 py-2">{lane.description}</p>

          {targetLane === 'sample' && (
            <div>
              {fieldLabel('Sample status', true)}
              <div className="flex gap-2 mt-2">
                {SAMPLE_STATUS_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setSampleStatus(opt.value)}
                    className={clsx(
                      'flex-1 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                      sampleStatus === opt.value ? 'border-zams-violet bg-zams-powder/50 text-zams-deep' : 'border-clay-hairline text-clay-muted hover:border-zams-mist'
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {(targetLane === 'testing' || targetLane === 'reschedule' || targetLane === 'parked') && (
            <div>
              {fieldLabel(targetLane === 'parked' ? 'Revisit date' : targetLane === 'testing' ? 'Testing date' : 'Follow-up date', true)}
              <input
                type="date"
                value={followupDate}
                onChange={(e) => setFollowupDate(e.target.value)}
                className="w-full mt-2 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-zams-violet/40"
              />
            </div>
          )}

          {targetLane === 'reschedule' && (
            <div>
              {fieldLabel('Nudge level', true)}
              <div className="grid grid-cols-2 gap-2 mt-2">
                {NUDGE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    onClick={() => setNudgeStage(opt.value)}
                    className={clsx(
                      'px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors text-left',
                      nudgeStage === opt.value ? 'border-zams-violet bg-zams-powder/50 text-zams-deep' : 'border-clay-hairline text-clay-muted hover:border-zams-mist'
                    )}
                  >
                    {opt.label}
                    <span className="block text-[10px] opacity-60 mt-0.5">+{opt.days} days</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {targetLane === 'reply' && (
            <>
              <div>
                {fieldLabel('Client response', true)}
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {OUTCOME_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setReplyOutcome(opt.value)}
                      className={clsx(
                        'px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                        replyOutcome === opt.value ? opt.cls : 'border-clay-hairline text-clay-muted hover:border-zams-mist'
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {fieldLabel('Summary', false)}
                <textarea
                  value={replySummary}
                  onChange={(e) => setReplySummary(e.target.value)}
                  rows={2}
                  placeholder="What did they say?"
                  className="w-full mt-2 px-3 py-2.5 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-zams-violet/40 resize-none"
                />
              </div>
            </>
          )}

          {targetLane === 'outreach' && (
            <div>
              {fieldLabel('Next action (optional)', false)}
              <input
                type="text"
                value={nextAction}
                onChange={(e) => setNextAction(e.target.value)}
                placeholder="e.g. Call K. Oil about the 10kg trial"
                className="w-full mt-2 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-zams-violet/40"
              />
            </div>
          )}

          {targetLane === 'success' && (
            <div className="bg-clay-mint/20 border border-clay-mint/30 rounded-lg px-3 py-3 text-xs text-clay-teal">
              🎉 This closes the deal as <strong>won</strong>. The card moves to the Successful lane and leaves the active pipeline.
            </div>
          )}

          {error && (
            <p className="text-xs font-medium text-clay-error bg-clay-error/10 border border-clay-error/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-white dark:bg-clay-card border-t border-clay-hairline px-5 py-3 flex items-center justify-end gap-2 z-10">
          <button onClick={onCancel} className="zams-btn-outline">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="zams-btn-primary min-w-[110px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Move deal'}
          </button>
        </div>
      </div>
    </div>
  );
}
