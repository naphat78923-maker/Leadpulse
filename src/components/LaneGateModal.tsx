'use client';

import { useState } from 'react';
import { Deal, DealWorkflowAction, MeetingType, Meeting, SampleStatus, Contact, Company } from '@/types/crm';
import { WORKFLOW_BY_ID, SAMPLE_STATUS_OPTIONS } from '@/utils/deal-workflow';
import { Blob } from '@/components/blob';
import { LANE_BLOB_STATE } from '@/utils/lane-blob';
import ContactPicker from '@/components/ContactPicker';
import { X, Loader2, Phone, Mail, MessageCircle } from 'lucide-react';
import clsx from 'clsx';
import { motion } from 'framer-motion';
import { overlayVariants, panelVariants, tweenBase, tweenSlow } from '@/lib/motion';

export interface LaneGatePayload {
  workflow_action: DealWorkflowAction;
  sample_status?: SampleStatus | null;
  followup_date?: string | null;
  next_action?: string | null;
  reply_outcome?: Meeting['outcome'] | null;
  reply_summary?: string | null;
  channel?: MeetingType | null;
  contact_ids?: string[];
  address_confirmed?: boolean;
  outreach_logged?: boolean;
  feedback_touch?: boolean;
}

const CHANNEL_OPTIONS: { value: MeetingType; label: string; icon: React.ReactNode }[] = [
  { value: 'call', label: 'Call', icon: <Phone className="w-4 h-4" /> },
  { value: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { value: 'dm', label: 'DM', icon: <MessageCircle className="w-4 h-4" /> },
];

interface LaneGateModalProps {
  deal: Deal;
  targetLane: DealWorkflowAction;
  contacts?: Contact[];
  companies?: Company[];
  onCancel: () => void;
  onConfirm: (payload: LaneGatePayload) => Promise<void>;
}

const OUTCOME_OPTIONS: Array<{ value: NonNullable<Meeting['outcome']>; label: string; cls: string }> = [
  { value: 'positive', label: 'Positive', cls: 'border-clay-success/30 bg-clay-success/10 text-clay-success' },
  { value: 'neutral', label: 'Neutral', cls: 'border-clay-hairline bg-clay-card text-clay-body' },
  { value: 'negative', label: 'Negative', cls: 'border-clay-error/30 bg-clay-error/10 text-clay-error' },
  { value: 'no_response', label: 'No response yet', cls: 'border-clay-ochre/30 bg-clay-ochre/10 text-clay-ochre' },
];

export default function LaneGateModal({ deal, targetLane, contacts = [], companies = [], onCancel, onConfirm }: LaneGateModalProps) {
  const lane = WORKFLOW_BY_ID[targetLane];
  const [sampleStatus, setSampleStatus] = useState<SampleStatus | ''>(deal.sample_status || '');
  const [followupDate, setFollowupDate] = useState<string>(deal.followup_date || '');
  const [nextAction, setNextAction] = useState<string>('');
  const [channel, setChannel] = useState<MeetingType>('call');
  const [replyOutcome, setReplyOutcome] = useState<Meeting['outcome'] | ''>('');
  const [replySummary, setReplySummary] = useState<string>('');
  const [addressConfirmed, setAddressConfirmed] = useState(false);
  const [outreachLogged, setOutreachLogged] = useState(Boolean(deal.last_outcome?.trim()));
  const [feedbackTouch, setFeedbackTouch] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(deal.contact_ids || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validate = (): string | null => {
    // Outreach — no gate
    if (targetLane === 'outreach') return null;
    // Waiting on reply — last outreach logged
    if (targetLane === 'reply' && !outreachLogged) return 'Confirm that the last outreach was logged.';
    // Sample — address / send intent confirmed
    if (targetLane === 'sample') {
      if (!addressConfirmed) return 'Confirm address / send intent.';
      if (!sampleStatus) return 'Choose whether the sample was sent or received.';
    }
    // Testing — sample delivered + testing date
    if (targetLane === 'testing') {
      if (!deal.sample_status && !sampleStatus) return 'Confirm sample was delivered (sent or received).';
      if (!followupDate) return 'Set the client testing date before saving.';
    }
    // Follow-up — feedback touch logged or due
    if (targetLane === 'reschedule') {
      if (!followupDate) return 'Set the follow-up date.';
      if (!feedbackTouch && !deal.last_outcome?.trim()) {
        return 'Confirm feedback touch logged, or note that follow-up is due.';
      }
    }
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
      const effectiveSample =
        targetLane === 'sample'
          ? (sampleStatus as SampleStatus)
          : targetLane === 'testing'
            ? ((sampleStatus as SampleStatus) || deal.sample_status || null)
            : null;
      await onConfirm({
        workflow_action: targetLane,
        sample_status: effectiveSample,
        followup_date: ['testing', 'reschedule'].includes(targetLane) ? followupDate : null,
        next_action: targetLane === 'outreach' && nextAction.trim() ? nextAction.trim() : null,
        reply_outcome: targetLane === 'reply' && replyOutcome ? replyOutcome : null,
        reply_summary: targetLane === 'reply' && replySummary.trim() ? replySummary.trim() : null,
        channel: (targetLane === 'outreach' || targetLane === 'reply') ? channel : null,
        contact_ids: selectedContactIds,
        address_confirmed: addressConfirmed,
        outreach_logged: outreachLogged,
        feedback_touch: feedbackTouch,
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
            <div className="flex items-center gap-3">
              <Blob state={LANE_BLOB_STATE[targetLane]} size={40} aria-label={lane.shortLabel} />
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

        <div className="px-5 py-4 space-y-4">
          <p className="text-xs text-clay-muted bg-clay-surface rounded-lg px-3 py-2">{lane.description}</p>

          {targetLane === 'sample' && (
            <>
              <label className="flex items-start gap-3 rounded-lg border border-clay-hairline px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addressConfirmed}
                  onChange={e => setAddressConfirmed(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs text-clay-body">
                  <span className="font-medium text-clay-ink">Address / send intent confirmed</span>
                  <span className="block text-clay-muted mt-0.5">Ship-to address ready and client expects the sample.</span>
                </span>
              </label>
              <div>
                {fieldLabel('Sample status', true)}
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
            </>
          )}

          {targetLane === 'testing' && (
            <>
              {!deal.sample_status && (
                <div>
                  {fieldLabel('Sample delivered', true)}
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
              <div>
                {fieldLabel('Testing date', true)}
                <input
                  type="date"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full mt-2 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender/40"
                />
              </div>
            </>
          )}

          {targetLane === 'reschedule' && (
            <>
              <div>
                {fieldLabel('Follow-up date', true)}
                <input
                  type="date"
                  value={followupDate}
                  onChange={(e) => setFollowupDate(e.target.value)}
                  className="w-full mt-2 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender/40"
                />
              </div>
              <label className="flex items-start gap-3 rounded-lg border border-clay-hairline px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={feedbackTouch}
                  onChange={e => setFeedbackTouch(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs text-clay-body">
                  <span className="font-medium text-clay-ink">Feedback touch logged or due</span>
                  <span className="block text-clay-muted mt-0.5">Nudges derive from this date + silence — no nudge stage to pick.</span>
                </span>
              </label>
            </>
          )}

          {targetLane === 'reply' && (
            <>
              <label className="flex items-start gap-3 rounded-lg border border-clay-hairline px-3 py-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={outreachLogged}
                  onChange={e => setOutreachLogged(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-xs text-clay-body">
                  <span className="font-medium text-clay-ink">Last outreach logged</span>
                  <span className="block text-clay-muted mt-0.5">Required before waiting on a reply.</span>
                </span>
              </label>
              <div>
                {fieldLabel('Channel', false)}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {CHANNEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setChannel(opt.value)}
                      className={clsx(
                        'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                        channel === opt.value ? 'border-clay-lavender bg-clay-lavender/20 text-clay-lavender' : 'border-clay-hairline text-clay-muted hover:border-clay-muted-soft'
                      )}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {fieldLabel('Client response (optional)', false)}
                <p className="mt-1 text-[10px] text-clay-muted">
                  Leave this as “No response yet” when nothing has come back — that records the outreach and waiting, not a reply.
                </p>
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
                {fieldLabel('Summary', false)}
                <textarea
                  value={replySummary}
                  onChange={(e) => setReplySummary(e.target.value)}
                  rows={2}
                  placeholder="What did they say? Or note that you are waiting."
                  className="w-full mt-2 px-3 py-2.5 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender/40 resize-none"
                />
              </div>
            </>
          )}

          {targetLane === 'outreach' && (
            <>
              <div>
                {fieldLabel('Channel', false)}
                <div className="grid grid-cols-3 gap-2 mt-2">
                  {CHANNEL_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setChannel(opt.value)}
                      className={clsx(
                        'flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border text-xs font-medium transition-colors',
                        channel === opt.value ? 'border-clay-lavender bg-clay-lavender/20 text-clay-lavender' : 'border-clay-hairline text-clay-muted hover:border-clay-muted-soft'
                      )}
                    >
                      {opt.icon} {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                {fieldLabel('Next action (optional)', false)}
                <input
                  type="text"
                  value={nextAction}
                  onChange={(e) => setNextAction(e.target.value)}
                  placeholder="e.g. Call K. Oil about the 10kg trial"
                  className="w-full mt-2 px-3 py-3 bg-white dark:bg-clay-card border border-clay-hairline rounded-lg text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-lavender/40"
                />
              </div>
            </>
          )}

          {(targetLane === 'outreach' || targetLane === 'reply' || targetLane === 'sample') && (
            <ContactPicker
              contacts={contacts}
              companies={companies}
              selectedCompanyId={deal.company_id ?? undefined}
              selectedIds={selectedContactIds}
              onChange={setSelectedContactIds}
            />
          )}

          {error && (
            <p className="text-xs font-medium text-clay-error bg-clay-error/10 border border-clay-error/20 rounded-lg px-3 py-2">{error}</p>
          )}
        </div>

        <div className="sticky bottom-0 bg-white dark:bg-clay-card border-t border-clay-hairline px-5 py-3 flex items-center justify-end gap-2 z-10">
          <button onClick={onCancel} className="clay-btn-outline">Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="clay-btn-primary min-w-[110px]"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Move deal'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
