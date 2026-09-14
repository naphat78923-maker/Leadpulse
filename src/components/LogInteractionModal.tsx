'use client';

import { useEffect, useState } from 'react';
import { MeetingType, Meeting, Deal, Contact, Company, SampleStatus, DealWorkflowAction, MeetingDirection } from '@/types/crm';
import { X, MessageCircle, Phone, Mail, Users, FileText, ArrowRight, AlertTriangle, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import ContactPicker from '@/components/ContactPicker';
import * as crm from '@/lib/crm';
import { useCrm } from '@/components/CrmProvider';
import { SAMPLE_STATUS_OPTIONS, WORKFLOW_BY_ID, getWorkflowAction } from '@/utils/deal-workflow';
import { buildInteractionWorkflowUpdate, laneTargetOptions } from '@/utils/interaction-workflow';
import {
  currentDealSchedule,
  describeDealSchedule,
  scheduleUpdateForIntent,
  validateScheduleIntent,
  type ScheduleIntent,
  type ScheduleMode,
} from '@/utils/deal-schedule';
import {
  INTERACTION_EVENT_OPTIONS,
  defaultEventKind,
  directionForEvent,
  validateInteractionEvent,
  type InteractionEventKind,
} from '@/utils/interaction-event';
import { localDateKey } from '@/utils/deal-board';
import ModalShell from '@/components/motion/ModalShell';

interface LogInteractionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (meeting: Omit<Meeting, 'id' | 'created_at'>) => Promise<void>;
  deals: Deal[];
  contacts: Contact[];
  companies: Company[];
  selectedDealId?: string;
  initialContactIds?: string[];
  initialCompanyId?: string;
}

// De-bloated: 5 interaction types. Sample/Nudge are workflow steps, not meeting logs.
const typeOptions: { value: MeetingType; label: string; icon: React.ReactNode }[] = [
  { value: 'call', label: 'Call', icon: <Phone className="w-4 h-4" /> },
  { value: 'email', label: 'Email', icon: <Mail className="w-4 h-4" /> },
  { value: 'dm', label: 'DM', icon: <MessageCircle className="w-4 h-4" /> },
  { value: 'meeting', label: 'Meeting', icon: <Users className="w-4 h-4" /> },
  { value: 'note', label: 'Note', icon: <FileText className="w-4 h-4" /> },
];

const outcomeOptions = [
  { value: 'positive', label: 'Positive', color: 'bg-clay-success/10 text-clay-success border-clay-success/20' },
  { value: 'neutral', label: 'Neutral', color: 'bg-clay-card text-clay-body border-clay-hairline' },
  { value: 'negative', label: 'Negative', color: 'bg-clay-error/10 text-clay-error border-clay-error/20' },
  { value: 'no_response', label: 'No Response', color: 'bg-clay-card text-clay-muted border-clay-hairline' },
];

export default function LogInteractionModal({
  isOpen,
  onClose,
  onSave,
  deals,
  contacts,
  companies,
  selectedDealId,
  initialContactIds,
  initialCompanyId,
}: LogInteractionModalProps) {
  const { refresh, logActivity } = useCrm();
  const [type, setType] = useState<MeetingType>('call');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [selectedDeal, setSelectedDeal] = useState(selectedDealId || '');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(initialContactIds || []);
  const [summary, setSummary] = useState('');
  const [outcome, setOutcome] = useState<Meeting['outcome']>(null);
  const [followupDate, setFollowupDate] = useState('');
  const [nextWorkflowAction, setNextWorkflowAction] = useState<DealWorkflowAction | ''>('');
  const [sampleStatus, setSampleStatus] = useState<SampleStatus | ''>('');
  /** Explicit event kind. `null` follows the channel's default until the user says otherwise. */
  const [eventKind, setEventKind] = useState<InteractionEventKind | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  /** What the save should do to the DEAL's schedule: preserve by default, never inferred. */
  const [scheduleMode, setScheduleMode] = useState<ScheduleMode>('preserve');
  const [pendingDealUpdate, setPendingDealUpdate] = useState<{
    dealId: string;
    dealLabel: string;
    expectedUpdatedAt: string;
    targetAction: DealWorkflowAction | null;
    updates: Partial<Deal>;
    before: Partial<Deal>;
    label: string;
    description: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initialDeal = deals.find(item => item.id === selectedDealId);
      // Reset the form only on the closed → open transition.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedContactIds(initialContactIds || []);
      setSelectedDeal(selectedDealId || '');
      setNextWorkflowAction(initialDeal ? getWorkflowAction(initialDeal) : '');
      setSampleStatus('');
      setEventKind(null);
      setScheduleMode('preserve');
      setConfirmSuccess(false);
      setType('call');
      setDescription('');
      setDate(localDateKey());
      setSummary('');
      setOutcome(null);
      setFollowupDate('');
      setSaving(false);
      setSaveError(null);
      setPendingDealUpdate(null);
    }
    // Only reset when the modal opens. Data refreshes while open must not erase the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const deal = deals.find(item => item.id === selectedDeal);
  const dealAction = deal ? getWorkflowAction(deal) : undefined;
  // The event owns direction and sentiment; the lane move is a separate explicit choice.
  const effectiveKind: InteractionEventKind = eventKind ?? defaultEventKind(type);
  const laneTargets = deal ? laneTargetOptions(deal, effectiveKind) : [];
  const selectedAction = deal ? (nextWorkflowAction || dealAction) : undefined;
  const isChangingLane = !!dealAction && !!selectedAction && selectedAction !== dealAction;
  // A move into Testing or a Follow-up carries the date the lane needs, so it OWNS the deal's
  // schedule for this save; otherwise the user's explicit preserve/replace/clear choice does.
  const laneRequiresDate = isChangingLane && (selectedAction === 'testing' || selectedAction === 'reschedule');
  const scheduleIntent: ScheduleIntent =
    scheduleMode === 'replace'
      ? { mode: 'replace', date: followupDate }
      : scheduleMode === 'clear'
        ? { mode: 'clear' }
        : { mode: 'preserve' };
  const scheduleUpdates = scheduleUpdateForIntent(deal ?? null, scheduleIntent);

  const applyEventKind = (kind: InteractionEventKind | null) => {
    setEventKind(kind);
    setSaveError(null);
    if (!deal || !dealAction) return;
    // The safe default is always the current lane: a target the new event does not
    // permit is dropped rather than silently kept.
    const allowed = laneTargetOptions(deal, kind ?? defaultEventKind(type));
    setNextWorkflowAction(prev => (prev && allowed.some(option => option.target === prev) ? prev : dealAction));
  };

  const resetAndClose = () => {
    setDescription('');
    setSummary('');
    setFollowupDate('');
    setOutcome(null);
    setSelectedDeal('');
    setSelectedContactIds([]);
    setNextWorkflowAction('');
    setSampleStatus('');
    setEventKind(null);
    setConfirmSuccess(false);
    setSaveError(null);
    setPendingDealUpdate(null);
    onClose();
  };

  const handleDealChange = (dealId: string) => {
    const nextDeal = deals.find(item => item.id === dealId);
    setSelectedDeal(dealId);
    setNextWorkflowAction(nextDeal ? getWorkflowAction(nextDeal) : '');
    setSampleStatus('');
    setEventKind(null);
    setConfirmSuccess(false);
    setSaveError(null);
  };

  const persistDealUpdate = async (request: NonNullable<typeof pendingDealUpdate>) => {
    await crm.updateDealIfUnchanged(request.dealId, request.expectedUpdatedAt, request.updates);
    await refresh();
    logActivity({
      type: 'edit',
      entity: 'deal',
      entityId: request.dealId,
      label: request.label,
      description: request.description,
      undoPayload: request.before,
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim() || saving) return;

    // The event is written on every save, with or without a lane move, so it is
    // validated before anything is persisted.
    const eventError = validateInteractionEvent({ kind: effectiveKind, outcome });
    if (eventError) {
      setSaveError(eventError);
      return;
    }

    // The DEAL schedule is a separate, explicit decision: a lane that needs a date sets it,
    // otherwise the user's preserve/replace/clear choice is honoured exactly.
    const scheduleError = laneRequiresDate ? null : validateScheduleIntent(scheduleIntent);
    if (scheduleError) {
      setSaveError(scheduleError);
      return;
    }

    setSaving(true);
    setSaveError(null);
    let interactionSavedThisAttempt = false;

    try {
      if (pendingDealUpdate) {
        await persistDealUpdate(pendingDealUpdate);
        resetAndClose();
        return;
      }

      const workflowUpdates = deal && selectedAction
        ? buildInteractionWorkflowUpdate(deal, selectedAction, {
            kind: effectiveKind,
            outcome,
            interactionDescription: summary.trim() || description.trim(),
            channel: type,
            sampleStatus: sampleStatus || null,
            testingDate: followupDate || null,
            confirmSuccess,
          })
        : null;

      // Scheduling rides in the SAME update as the lane move, so one write carries both and
      // a partial save can never leave the deal's schedule and its lane disagreeing.
      const dealPatch: Partial<Deal> = {
        ...(workflowUpdates || {}),
        ...(laneRequiresDate ? {} : scheduleUpdates),
      };

      const selectedContacts = contacts.filter(contact => selectedContactIds.includes(contact.id));
      const companyId = selectedContacts[0]?.company_id || deal?.company_id || initialCompanyId || null;

      // Direction comes from the chosen event, never from the lane the deal moves to.
      // An internal note and a captured client reply are their own categories.
      const direction: MeetingDirection = directionForEvent(effectiveKind);

      await onSave({
        description: description.trim(),
        type,
        date,
        company_id: companyId,
        contact_ids: selectedContactIds,
        deal_id: selectedDeal || null,
        product: deal?.product || 'Butter',
        summary: summary.trim() || null,
        outcome,
        followup_date: followupDate || null,
        direction,
      });
      interactionSavedThisAttempt = true;

      if (deal && Object.keys(dealPatch).length > 0) {
        const laneLabel =
          workflowUpdates && selectedAction
            ? `Interaction → ${WORKFLOW_BY_ID[selectedAction].shortLabel}`
            : 'Interaction schedule updated';
        const laneDescription = workflowUpdates
          ? `${deal.client} moved after a confirmed interaction`
          : `${deal.client} follow-up schedule updated by a logged interaction`;
        const request = {
          dealId: deal.id,
          dealLabel: deal.client,
          expectedUpdatedAt: deal.updated_at,
          targetAction: workflowUpdates ? (selectedAction ?? null) : null,
          updates: dealPatch,
          before: {
            workflow_action: dealAction,
            stage: deal.stage,
            sample_status: deal.sample_status || null,
            nudge_stage: deal.nudge_stage || null,
            followup_date: deal.followup_date,
            next_action: deal.next_action,
            last_outcome: deal.last_outcome,
          },
          label: laneLabel,
          description: laneDescription,
        };
        setPendingDealUpdate(request);
        await persistDealUpdate(request);
      }

      resetAndClose();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The interaction could not be saved.';
      setSaveError(interactionSavedThisAttempt
        ? `Interaction saved, but the deal update was not confirmed. Retry the deal update. ${message}`
        : message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      lockDismiss={saving}
      panelClassName="bg-white dark:bg-clay-card md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[90vh] overflow-y-auto"
    >
      <>
        <div className="sticky top-0 bg-white dark:bg-clay-card flex items-center justify-between p-4 border-b border-clay-hairline z-10">
          <h2 className="text-lg font-semibold text-clay-ink">Log Interaction</h2>
          <button onClick={onClose} disabled={saving} className="text-clay-muted hover:text-clay-ink p-2 -mr-2 disabled:opacity-40">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <fieldset disabled={saving || !!pendingDealUpdate} className="space-y-4 disabled:opacity-70">
          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-2">Type</label>
            <div className="grid grid-cols-3 gap-2">
              {typeOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setType(opt.value)}
                  className={clsx(
                    'flex items-center justify-center gap-2 px-3 py-3 rounded-lg text-sm font-medium border transition-colors min-h-[44px]',
                    type === opt.value
                      ? 'bg-clay-ink text-clay-canvas border-clay-ink'
                      : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
                  )}
                >
                  {opt.icon}
                  <span className="hidden sm:inline">{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* What happened — the event owns direction; the lane never redefines it. */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-2">What happened?</label>
            <div className="grid gap-2" role="radiogroup" aria-label="What happened?">
              {INTERACTION_EVENT_OPTIONS.map(option => (
                <button
                  key={option.value}
                  type="button"
                  role="radio"
                  aria-checked={effectiveKind === option.value}
                  onClick={() => applyEventKind(option.value)}
                  className={clsx(
                    'min-h-[48px] rounded-lg border px-3 py-2.5 text-left transition-colors',
                    effectiveKind === option.value
                      ? 'border-clay-ink bg-clay-ink/5 text-clay-ink'
                      : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                  )}
                >
                  <span className="block text-sm font-semibold">{option.label}</span>
                  <span className="block text-[10px] mt-0.5 opacity-75">{option.hint}</span>
                </button>
              ))}
            </div>
            <p className="text-[11px] text-clay-muted mt-1.5">
              Recorded as <span className="font-medium text-clay-body">{directionForEvent(effectiveKind)}</span>
              {effectiveKind === 'customer_response'
                ? ' — a customer response.'
                : effectiveKind === 'internal_note'
                  ? ' — never counts as outreach or a reply.'
                  : ' — an outreach attempt.'}
            </p>
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Description *</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              required
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
              placeholder="e.g., Follow-up call with K. Oil about test results"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
            />
          </div>

          {/* Linked Deal — drives the single state advance */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Linked Deal</label>
            <select
              value={selectedDeal}
              onChange={e => handleDealChange(e.target.value)}
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
            >
              <option value="">— None (just log a note) —</option>
              {deals.filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost').map(d => (
                <option key={d.id} value={d.id}>{d.client} — {d.product}</option>
              ))}
            </select>
          </div>

          {/* Explicit post-interaction action. The safe default is always the current lane. */}
          {deal && dealAction && (
            <div className="bg-clay-surface rounded-xl p-3 border border-clay-hairline space-y-3">
              <div>
                <p className="text-sm font-medium text-clay-ink">Next action after this interaction</p>
                <p className="text-[11px] text-clay-muted mt-0.5">Nothing moves unless you choose it.</p>
              </div>

              <div className="grid gap-2" role="radiogroup" aria-label="Next action after this interaction">
                <button
                  type="button"
                  role="radio"
                  aria-checked={selectedAction === dealAction}
                  onClick={() => {
                    setNextWorkflowAction(dealAction);
                    setSaveError(null);
                  }}
                  className={clsx(
                    'min-h-[48px] rounded-lg border px-3 py-2.5 text-left transition-colors',
                    selectedAction === dealAction
                      ? 'border-clay-lavender bg-clay-lavender/20 text-clay-ink'
                      : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                  )}
                >
                  <span className="block text-sm font-semibold">Keep current · {WORKFLOW_BY_ID[dealAction].shortLabel}</span>
                  <span className="block text-[10px] mt-0.5 opacity-75">Recommended for outbound messages, notes, and no response.</span>
                </button>

                {laneTargets.map(option => (
                  <button
                    key={option.target}
                    type="button"
                    role="radio"
                    aria-checked={selectedAction === option.target}
                    onClick={() => {
                      setNextWorkflowAction(option.target);
                      setSaveError(null);
                    }}
                    className={clsx(
                      'min-h-[48px] rounded-lg border px-3 py-2.5 text-left transition-colors',
                      selectedAction === option.target
                        ? 'border-clay-mint bg-clay-mint/15 text-clay-ink'
                        : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                    )}
                  >
                    <span className="flex items-center gap-2 text-sm font-semibold">
                      {option.label} <ArrowRight className="w-3.5 h-3.5" /> {WORKFLOW_BY_ID[option.target].shortLabel}
                    </span>
                    {option.hint && <span className="block text-[10px] mt-0.5 opacity-75">{option.hint}</span>}
                  </button>
                ))}
              </div>

              {laneTargets.length === 0 && (
                <p className="text-[11px] text-clay-muted">
                  An internal note records information — it never moves the journey or counts as outreach.
                </p>
              )}

              {effectiveKind === 'customer_response' && (
                <p className="text-[11px] text-clay-muted">
                  A recorded reply is not a wait: choose the next action above, or keep the current lane.
                </p>
              )}

              {selectedAction === 'sample' && isChangingLane && (
                <div>
                  <p className="text-xs font-medium text-clay-body mb-2">Sample status *</p>
                  <div className="grid grid-cols-2 gap-2">
                    {SAMPLE_STATUS_OPTIONS.map(option => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setSampleStatus(option.value)}
                        className={clsx(
                          'min-h-[44px] rounded-lg border px-3 py-2 text-sm font-medium',
                          sampleStatus === option.value
                            ? 'border-clay-ochre bg-clay-ochre/15 text-clay-ochre'
                            : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selectedAction === 'testing' && isChangingLane && (
                <p className="text-[11px] text-clay-muted">Set the required testing date in the date field below.</p>
              )}

              {selectedAction === 'success' && isChangingLane && (
                <button
                  type="button"
                  onClick={() => setConfirmSuccess(value => !value)}
                  className={clsx(
                    'w-full min-h-[44px] rounded-lg border px-3 py-2.5 text-left text-sm font-medium',
                    confirmSuccess
                      ? 'border-clay-mint bg-clay-mint/15 text-clay-teal'
                      : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                  )}
                >
                  {confirmSuccess ? '✓ Confirmed: this deal is won' : 'Confirm this deal is won'}
                </button>
              )}
            </div>
          )}

          {/* Linked Contacts */}
          <ContactPicker
            contacts={contacts}
            companies={companies}
            selectedCompanyId={deal?.company_id ?? undefined}
            selectedIds={selectedContactIds}
            onChange={setSelectedContactIds}
          />

          {/* Summary */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-1">Summary / Notes</label>
            <textarea
              value={summary}
              onChange={e => setSummary(e.target.value)}
              rows={3}
              className="w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink resize-none bg-white dark:bg-clay-card text-clay-ink"
              placeholder="What was discussed, decided, or needs follow-up..."
            />
          </div>

          {/* Outcome */}
          <div>
            <label className="block text-sm font-medium text-clay-body mb-2">Outcome</label>
            <div className="grid grid-cols-2 gap-2">
              {outcomeOptions.map(opt => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setOutcome(opt.value as Meeting['outcome'])}
                  className={clsx(
                    'px-3 py-3 rounded-lg text-sm font-medium border transition-colors min-h-[44px]',
                    outcome === opt.value ? opt.color : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* One authoritative deal schedule: the interaction keeps its own date as history. */}
          <div className="rounded-xl border border-clay-hairline bg-clay-surface p-3 space-y-3">
            <div>
              <p className="text-sm font-medium text-clay-ink">Next follow-up</p>
              {deal ? (
                <p className="mt-0.5 text-[11px] text-clay-muted">
                  Current deal schedule ·{' '}
                  <span data-deal-schedule className="font-medium text-clay-body">
                    {describeDealSchedule(currentDealSchedule(deal))}
                  </span>
                </p>
              ) : (
                <p className="mt-0.5 text-[11px] text-clay-muted">
                  No deal linked — this date is recorded on the interaction only, and no deal schedule changes.
                </p>
              )}
            </div>

            <label className="block text-sm font-medium text-clay-body">
              Next follow-up date
              <input
                aria-label="Next follow-up date"
                type="date"
                value={followupDate}
                onChange={e => setFollowupDate(e.target.value)}
                className="mt-1 block w-full px-3 py-3 border border-clay-hairline rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-clay-ink bg-white dark:bg-clay-card text-clay-ink"
              />
            </label>

            {deal && !laneRequiresDate && (
              <div className="grid gap-2" role="radiogroup" aria-label="Deal schedule">
                <button
                  type="button"
                  role="radio"
                  aria-checked={scheduleMode === 'preserve'}
                  onClick={() => setScheduleMode('preserve')}
                  className={clsx(
                    'min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors',
                    scheduleMode === 'preserve'
                      ? 'border-clay-lavender bg-clay-lavender/20 text-clay-ink'
                      : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                  )}
                >
                  <span className="block text-sm font-semibold">Leave the schedule alone</span>
                  <span className="block text-[10px] mt-0.5 opacity-75">The deal&apos;s date is left exactly as it is.</span>
                </button>

                <button
                  type="button"
                  role="radio"
                  aria-checked={scheduleMode === 'replace'}
                  onClick={() => setScheduleMode('replace')}
                  className={clsx(
                    'min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors',
                    scheduleMode === 'replace'
                      ? 'border-clay-mint bg-clay-mint/15 text-clay-ink'
                      : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                  )}
                >
                  <span className="block text-sm font-semibold">Replace the deal schedule</span>
                  <span className="block text-[10px] mt-0.5 opacity-75">Uses the date above as the deal&apos;s next follow-up.</span>
                </button>

                {deal.followup_date && (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={scheduleMode === 'clear'}
                    onClick={() => {
                      setScheduleMode('clear');
                      setFollowupDate('');
                    }}
                    className={clsx(
                      'min-h-[44px] rounded-lg border px-3 py-2 text-left transition-colors',
                      scheduleMode === 'clear'
                        ? 'border-clay-ochre bg-clay-ochre/15 text-clay-ochre'
                        : 'border-clay-hairline bg-white dark:bg-clay-card text-clay-muted'
                    )}
                  >
                    <span className="block text-sm font-semibold">Clear the deal schedule</span>
                    <span className="block text-[10px] mt-0.5 opacity-75">Removes the date and leaves none on this interaction.</span>
                  </button>
                )}
              </div>
            )}

            {deal && laneRequiresDate && (
              <p className="text-[11px] text-clay-muted">
                This move sets the deal&apos;s follow-up to the date above.
              </p>
            )}
          </div>
          </fieldset>

          {pendingDealUpdate && !saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-clay-ochre/30 bg-clay-ochre/10 px-3 py-2.5 text-xs text-clay-ochre" role="status">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>The interaction is saved. Finish the deal update before closing.</span>
            </div>
          )}

          {saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-clay-error/30 bg-clay-error/10 px-3 py-2.5 text-xs text-clay-error" role="alert">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{saveError}</span>
            </div>
          )}

          <div className="flex items-center gap-3 pt-2 pb-4">
            <button
              type="submit"
              disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg motion-press min-h-[48px] disabled:opacity-60"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              {saving ? 'Saving…' : pendingDealUpdate ? 'Retry deal update' : 'Save Interaction'}
            </button>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-3 bg-clay-card text-clay-ink text-sm font-medium rounded-lg motion-press min-h-[48px] disabled:opacity-40"
            >
              Cancel
            </button>
          </div>
        </form>
      </>
    </ModalShell>
  );
}
