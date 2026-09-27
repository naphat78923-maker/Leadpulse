'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { MeetingType, Meeting, Deal, Contact, Company, SampleStatus, DealWorkflowAction, MeetingDirection } from '@/types/crm';
import { X, MessageCircle, Phone, Mail, Users, ArrowRight, AlertTriangle, Loader2, ChevronRight, ChevronDown } from 'lucide-react';
import clsx from 'clsx';
import ContactPicker from '@/components/ContactPicker';
import * as crm from '@/lib/crm';
import { useCrm } from '@/components/CrmProvider';
import { useToast } from '@/components/ToastProvider';
import { SAMPLE_STATUS_OPTIONS, WORKFLOW_BY_ID, addDaysToDateKey, getWorkflowAction } from '@/utils/deal-workflow';
import { buildInteractionWorkflowUpdate, laneTargetOptions } from '@/utils/interaction-workflow';
import {
  formatScheduleDate,
  scheduleUpdateForIntent,
  validateScheduleIntent,
  type ScheduleIntent,
} from '@/utils/deal-schedule';
import { directionForEvent, type InteractionEventKind } from '@/utils/interaction-event';
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

const KINDS: { value: InteractionEventKind; label: string }[] = [
  { value: 'outbound_attempt', label: 'I reached out' },
  { value: 'customer_response', label: 'They replied' },
  { value: 'internal_note', label: 'Note' },
];

type Channel = Exclude<MeetingType, 'note' | 'sample_sent' | 'nudge' | 'reward'>;

const CHANNELS: { value: Channel; label: string; icon: ReactNode }[] = [
  { value: 'call', label: 'Call', icon: <Phone className="w-3.5 h-3.5" /> },
  { value: 'email', label: 'Email', icon: <Mail className="w-3.5 h-3.5" /> },
  { value: 'dm', label: 'DM', icon: <MessageCircle className="w-3.5 h-3.5" /> },
  { value: 'meeting', label: 'Meeting', icon: <Users className="w-3.5 h-3.5" /> },
];

const QUICK_FOLLOWUPS = [
  { label: '+3 days', days: 3 },
  { label: '+1 week', days: 7 },
];

/** Keep = leave the deal's date; pick = a new date (replaces it); clear = remove it. */
type FollowupChoice = 'keep' | 'pick' | 'clear';

function shortDate(dateKey: string): string {
  return formatScheduleDate(dateKey).replace(/ \d{4}$/, '');
}

/** Title used when nothing is typed, so a quick "called, no answer" needs no typing. */
function autoTitle(kind: InteractionEventKind, channel: Channel): string {
  if (kind === 'internal_note') return 'Note';
  if (kind === 'customer_response') {
    return { call: 'They replied by phone', email: 'They replied by email', dm: 'They replied by DM', meeting: 'They replied in a meeting' }[channel];
  }
  return { call: 'Called', email: 'Sent an email', dm: 'Sent a DM', meeting: 'Met' }[channel];
}

function Chip({
  selected,
  onClick,
  children,
  tone,
  role = 'radio',
  ariaLabel,
}: {
  selected: boolean;
  onClick: () => void;
  children: ReactNode;
  tone?: string;
  role?: 'radio' | 'button';
  ariaLabel?: string;
}) {
  return (
    <button
      type="button"
      role={role}
      aria-checked={role === 'radio' ? selected : undefined}
      aria-pressed={role === 'button' ? selected : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      className={clsx(
        'inline-flex h-9 items-center gap-1.5 rounded-lg border px-3 text-sm transition-colors',
        selected
          ? tone ?? 'border-clay-lavender/60 bg-clay-lavender/20 text-clay-ink'
          : 'border-clay-hairline text-clay-body hover:border-clay-ink/30 hover:text-clay-ink',
      )}
    >
      {children}
    </button>
  );
}

function Row({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-sm text-clay-muted">{label}</p>
        {hint && <p className="truncate text-xs text-clay-muted">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

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
  const { addToast } = useToast();
  const [kind, setKind] = useState<InteractionEventKind>('outbound_attempt');
  const [channel, setChannel] = useState<Channel>('call');
  const [notes, setNotes] = useState('');
  const [date, setDate] = useState(localDateKey());
  const [editingDate, setEditingDate] = useState(false);
  const [selectedDeal, setSelectedDeal] = useState(selectedDealId || '');
  const [selectedContactIds, setSelectedContactIds] = useState<string[]>(initialContactIds || []);
  const [followupChoice, setFollowupChoice] = useState<FollowupChoice>('keep');
  const [followupDate, setFollowupDate] = useState('');
  /** Typed = replace the deal's next action in the same write; empty = keep, never write. */
  const [nextActionEdit, setNextActionEdit] = useState('');
  const [nextWorkflowAction, setNextWorkflowAction] = useState<DealWorkflowAction | ''>('');
  const [sampleStatus, setSampleStatus] = useState<SampleStatus | ''>('');
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (isOpen) {
      const initialDeal = deals.find(item => item.id === selectedDealId);
      // Reset the form only on the closed → open transition.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedContactIds(initialContactIds || []);
      setSelectedDeal(selectedDealId || '');
      setNextWorkflowAction(initialDeal ? getWorkflowAction(initialDeal) : '');
      setSampleStatus('');
      setKind('outbound_attempt');
      setChannel('call');
      setFollowupChoice('keep');
      setConfirmSuccess(false);
      setNotes('');
      setDate(localDateKey());
      setEditingDate(false);
      setFollowupDate('');
      setNextActionEdit('');
      setMoreOpen(false);
      setSaving(false);
      setSaveError(null);
      setPendingDealUpdate(null);
    }
    // Only reset when the modal opens. Data refreshes while open must not erase the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const deal = deals.find(item => item.id === selectedDeal);
  const dealAction = deal ? getWorkflowAction(deal) : undefined;
  const company = companies.find(c => c.id === (deal?.company_id ?? initialCompanyId));
  const type: MeetingType = kind === 'internal_note' ? 'note' : channel;
  // The event owns direction and sentiment; the lane move is a separate explicit choice.
  const laneTargets = deal ? laneTargetOptions(deal, kind) : [];
  const selectedAction = deal ? (nextWorkflowAction || dealAction) : undefined;
  const isChangingLane = !!dealAction && !!selectedAction && selectedAction !== dealAction;

  // A move into Testing or a Follow-up carries the date the lane needs, so it OWNS the deal's
  // schedule for this save; otherwise the follow-up choice does.
  const laneRequiresDate = isChangingLane && (selectedAction === 'testing' || selectedAction === 'reschedule');
  const scheduleIntent: ScheduleIntent =
    followupChoice === 'pick'
      ? { mode: 'replace', date: followupDate }
      : followupChoice === 'clear'
        ? { mode: 'clear' }
        : { mode: 'preserve' };
  const scheduleUpdates = scheduleUpdateForIntent(deal ?? null, scheduleIntent);

  const today = localDateKey();
  const quickDates = QUICK_FOLLOWUPS.map(q => ({ ...q, date: addDaysToDateKey(today, q.days) }));
  const isQuickDate = followupChoice === 'pick' && quickDates.some(q => q.date === followupDate);
  const contactCount = selectedContactIds.length;

  const chooseKind = (next: InteractionEventKind) => {
    setKind(next);
    setSaveError(null);
    if (!deal || !dealAction) return;
    // The safe default is always the current lane: a target the new event does not
    // permit is dropped rather than silently kept.
    const allowed = laneTargetOptions(deal, next);
    setNextWorkflowAction(prev => (prev && allowed.some(option => option.target === prev) ? prev : dealAction));
  };

  const chooseFollowup = (choice: FollowupChoice, dateKey = '') => {
    setFollowupChoice(choice);
    setFollowupDate(dateKey);
    setSaveError(null);
  };

  const resetAndClose = () => {
    setNotes('');
    setFollowupDate('');
    setNextActionEdit('');
    setSelectedDeal('');
    setSelectedContactIds([]);
    setNextWorkflowAction('');
    setSampleStatus('');
    setKind('outbound_attempt');
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
    setNextActionEdit('');
    setConfirmSuccess(false);
    setFollowupChoice(followupChoice === 'clear' ? 'keep' : followupChoice);
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

  // Sentiment isn't asked for: the event (reached out / replied / note) is what counts.
  const outcome: Meeting['outcome'] = null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    // The DEAL schedule is a separate, explicit decision: a lane that needs a date sets it,
    // otherwise the follow-up choice is honoured exactly.
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
        addToast('Touch logged');
        resetAndClose();
        return;
      }

      // One text box: the first line is the title, anything after it is the notes.
      const [firstLine = '', ...rest] = notes.trim().split('\n');
      const description = firstLine.trim() || autoTitle(kind, channel);
      const summary = rest.join('\n').trim() || null;

      const workflowUpdates = deal && selectedAction
        ? buildInteractionWorkflowUpdate(deal, selectedAction, {
            kind,
            outcome,
            interactionDescription: notes.trim() || description,
            channel: type,
            sampleStatus: sampleStatus || null,
            testingDate: followupDate || null,
            confirmSuccess,
          })
        : null;

      // Scheduling rides in the SAME update as the lane move, so one write carries both and
      // a partial save can never leave the deal's schedule and its lane disagreeing.
      // A typed next action joins that write too; an empty field keeps the current one.
      const typedNextAction = nextActionEdit.trim();
      const dealPatch: Partial<Deal> = {
        ...(workflowUpdates || {}),
        ...(laneRequiresDate ? {} : scheduleUpdates),
        ...(deal && typedNextAction && typedNextAction !== (deal.next_action ?? '').trim()
          ? { next_action: typedNextAction }
          : {}),
      };

      const selectedContacts = contacts.filter(contact => selectedContactIds.includes(contact.id));
      const companyId = selectedContacts[0]?.company_id || deal?.company_id || initialCompanyId || null;

      // Direction comes from the chosen event, never from the lane the deal moves to.
      const direction: MeetingDirection = directionForEvent(kind);

      await onSave({
        description,
        type,
        date,
        company_id: companyId,
        contact_ids: selectedContactIds,
        deal_id: selectedDeal || null,
        product: deal?.product || 'Butter',
        summary,
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

      // Success is claimed only once the WHOLE action is durable: the interaction and, when the
      // user chose one, the deal update. A half-save keeps the modal open with its retry.
      addToast('Touch logged');
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

  const locked = saving || !!pendingDealUpdate;
  const moreSummary = [
    isChangingLane && selectedAction ? `→ ${WORKFLOW_BY_ID[selectedAction].shortLabel}` : null,
    contactCount > 0 ? `${contactCount} contact${contactCount === 1 ? '' : 's'}` : null,
    nextActionEdit.trim() ? 'new next action' : null,
  ].filter(Boolean).join(' · ');
  const title = deal?.client || company?.name || 'Log a touch';
  const openDeals = deals
    .filter(d => d.stage !== 'closed_won' && d.stage !== 'closed_lost')
    // The account's own deals first when logging against an account.
    .sort((a, b) => Number(b.company_id === initialCompanyId) - Number(a.company_id === initialCompanyId));

  return (
    <ModalShell
      open={isOpen}
      onClose={onClose}
      lockDismiss={locked}
      panelClassName="bg-white dark:bg-clay-card md:max-w-md md:rounded-2xl rounded-t-2xl shadow-2xl max-h-[92vh] flex flex-col"
    >
      <form
        ref={formRef}
        onSubmit={handleSubmit}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
        className="flex min-h-0 flex-1 flex-col"
        aria-label={`Log a touch · ${title}`}
      >
        {/* Header: who and when. The deal is already known when opened from one. */}
        <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-3">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-clay-ink">{title === 'Log a touch' ? title : `Log · ${title}`}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-clay-muted">
              {deal && <span>{deal.product} deal ·</span>}
              {editingDate ? (
                <input
                  type="date"
                  aria-label="Date of this touch"
                  value={date}
                  max={today}
                  onChange={e => setDate(e.target.value || today)}
                  onBlur={() => setEditingDate(false)}
                  autoFocus
                  className="rounded border border-clay-hairline bg-transparent px-1 text-sm text-clay-ink"
                />
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingDate(true)}
                  aria-label="Change the date of this touch"
                  className="inline-flex items-center gap-1 rounded hover:text-clay-ink"
                >
                  {date === today ? 'Today' : formatScheduleDate(date)}
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={locked}
            aria-label="Close"
            className="-mr-2 -mt-1 rounded-lg p-2 text-clay-muted hover:bg-clay-surface hover:text-clay-ink disabled:opacity-40"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <fieldset disabled={locked} className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 pb-4 disabled:opacity-70">
          {/* What happened: one segmented control; the event owns direction. */}
          <div role="radiogroup" aria-label="What happened?" className="grid grid-cols-3 gap-2">
            {KINDS.map(option => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={kind === option.value}
                onClick={() => chooseKind(option.value)}
                className={clsx(
                  'h-10 rounded-lg border text-sm font-medium transition-colors',
                  kind === option.value
                    ? 'border-clay-ink bg-clay-ink text-clay-canvas'
                    : 'border-clay-hairline text-clay-ink hover:border-clay-ink/30',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>

          {kind !== 'internal_note' && (
            <div role="radiogroup" aria-label="Channel" className="flex flex-wrap gap-2">
              {CHANNELS.map(option => (
                <Chip key={option.value} selected={channel === option.value} onClick={() => setChannel(option.value)}>
                  {option.icon}
                  {option.label}
                </Chip>
              ))}
            </div>
          )}

          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={3}
            aria-label="What happened"
            placeholder="What happened? (first line becomes the title)"
            className="w-full resize-none rounded-xl border border-clay-hairline bg-transparent px-3.5 py-3 text-sm text-clay-ink placeholder:text-clay-muted focus:border-clay-ink/40 focus:outline-none focus:ring-2 focus:ring-clay-ink/10"
          />

          {!selectedDealId && (
            <Row label="Deal">
              <select
                aria-label="Linked deal"
                value={selectedDeal}
                onChange={e => handleDealChange(e.target.value)}
                className="h-9 w-full rounded-lg border border-clay-hairline bg-transparent px-3 text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-ink/10"
              >
                <option value="">No deal</option>
                {openDeals.map(d => (
                  <option key={d.id} value={d.id}>{d.client} · {d.product}</option>
                ))}
              </select>
            </Row>
          )}

          {/* One follow-up date: picking one sets the deal's next follow-up. */}
          <Row
            label={laneRequiresDate
              ? `Date for ${WORKFLOW_BY_ID[selectedAction!].shortLabel}`
              : `Next follow-up${deal?.followup_date ? ` · now ${shortDate(deal.followup_date)}` : ''}`}
          >
            <div role="radiogroup" aria-label="Next follow-up" className="flex flex-wrap gap-2">
              {!laneRequiresDate && deal?.followup_date && (
                <Chip selected={followupChoice === 'keep'} onClick={() => chooseFollowup('keep')}>Keep</Chip>
              )}
              {quickDates.map(q => (
                <Chip
                  key={q.label}
                  selected={followupChoice === 'pick' && followupDate === q.date}
                  onClick={() => chooseFollowup('pick', q.date)}
                  ariaLabel={`${q.label} (${formatScheduleDate(q.date)})`}
                >
                  {q.label}
                </Chip>
              ))}
              <Chip
                selected={followupChoice === 'pick' && !isQuickDate}
                onClick={() => chooseFollowup('pick', isQuickDate ? '' : followupDate)}
                ariaLabel="Pick date"
              >
                {followupChoice === 'pick' && !isQuickDate && followupDate ? shortDate(followupDate) : 'Pick…'}
              </Chip>
              {!laneRequiresDate && (
                // With a saved date, None clears it; without one, None simply keeps there being none.
                <Chip
                  selected={deal?.followup_date ? followupChoice === 'clear' : followupChoice === 'keep'}
                  onClick={() => chooseFollowup(deal?.followup_date ? 'clear' : 'keep')}
                >
                  None
                </Chip>
              )}
            </div>
            {followupChoice === 'pick' && !isQuickDate && (
              <input
                type="date"
                aria-label="Next follow-up date"
                value={followupDate}
                min={today}
                onChange={e => setFollowupDate(e.target.value)}
                className="mt-2 h-9 w-full rounded-lg border border-clay-hairline bg-transparent px-3 text-sm text-clay-ink focus:outline-none focus:ring-2 focus:ring-clay-ink/10"
              />
            )}
            {laneRequiresDate && !followupDate && (
              <p className="mt-1.5 text-xs text-clay-muted">No date picked: the deal keeps its current follow-up.</p>
            )}
          </Row>

          {/* Rarely needed: who was involved and the deal's next action. */}
          <div>
            <button
              type="button"
              onClick={() => setMoreOpen(open => !open)}
              aria-expanded={moreOpen}
              className="flex w-full items-center gap-1.5 text-sm text-clay-muted hover:text-clay-ink"
            >
              <ChevronRight className={clsx('h-4 w-4 transition-transform', moreOpen && 'rotate-90')} />
              <span>More: move lane, contacts, next action</span>
              {moreSummary && <span className="ml-auto truncate font-normal text-clay-ink">{moreSummary}</span>}
            </button>
            {moreOpen && (
              <div className="mt-3 space-y-4">
                {/* Stage: nothing moves unless chosen. Notes never move the journey. */}
                {deal && dealAction && laneTargets.length > 0 && (
                  <Row label="Stage">
                    <div role="radiogroup" aria-label="Deal stage after this touch" className="flex flex-wrap gap-2">
                      <Chip
                        selected={selectedAction === dealAction}
                        onClick={() => { setNextWorkflowAction(dealAction); setSaveError(null); }}
                        ariaLabel={`Keep current stage · ${WORKFLOW_BY_ID[dealAction].shortLabel}`}
                      >
                        Stay in {WORKFLOW_BY_ID[dealAction].shortLabel}
                      </Chip>
                      {laneTargets.map(option => (
                        <Chip
                          key={option.target}
                          selected={selectedAction === option.target}
                          tone="border-clay-teal bg-clay-mint/20 text-clay-teal"
                          onClick={() => { setNextWorkflowAction(option.target); setSaveError(null); }}
                          ariaLabel={option.label}
                        >
                          <ArrowRight className="h-3 w-3" />
                          {WORKFLOW_BY_ID[option.target].shortLabel}
                        </Chip>
                      ))}
                    </div>

                    {selectedAction === 'sample' && isChangingLane && (
                      <div role="radiogroup" aria-label="Sample status" className="mt-2 flex flex-wrap gap-2">
                        {SAMPLE_STATUS_OPTIONS.map(option => (
                          <Chip key={option.value} selected={sampleStatus === option.value} onClick={() => setSampleStatus(option.value)}>
                            {option.label}
                          </Chip>
                        ))}
                      </div>
                    )}

                    {selectedAction === 'success' && isChangingLane && (
                      <label className="mt-2 flex items-center gap-2 text-sm text-clay-body">
                        <input
                          type="checkbox"
                          checked={confirmSuccess}
                          onChange={e => setConfirmSuccess(e.target.checked)}
                          className="h-4 w-4 accent-clay-ink"
                        />
                        Confirm this deal is won
                      </label>
                    )}
                  </Row>
                )}
                {deal && (
                  <Row label="Next action on this deal">
                    <input
                      aria-label="Next action on this deal"
                      type="text"
                      value={nextActionEdit}
                      onChange={e => setNextActionEdit(e.target.value)}
                      placeholder={deal.next_action ? `Keep: ${deal.next_action}` : 'Start with a verb: call, send, ask…'}
                      className="h-9 w-full rounded-lg border border-clay-hairline bg-transparent px-3 text-sm text-clay-ink placeholder:text-clay-muted focus:outline-none focus:ring-2 focus:ring-clay-ink/10"
                    />
                  </Row>
                )}
                <ContactPicker
                  contacts={contacts}
                  companies={companies}
                  selectedCompanyId={deal?.company_id ?? initialCompanyId}
                  selectedIds={selectedContactIds}
                  onChange={setSelectedContactIds}
                />
              </div>
            )}
          </div>

          {pendingDealUpdate && !saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-clay-ochre/30 bg-clay-ochre/10 px-3 py-2.5 text-xs text-clay-ochre" role="status">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>The interaction is saved. Finish the deal update before closing.</span>
            </div>
          )}

          {saveError && (
            <div className="flex items-start gap-2 rounded-lg border border-clay-error/30 bg-clay-error/10 px-3 py-2.5 text-xs text-clay-error" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}
        </fieldset>

        <div className="flex justify-end px-5 pb-5 pt-1">
          <button
            type="submit"
            disabled={saving}
            title="Save (⌘ Enter)"
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-clay-ink px-5 text-sm font-medium text-clay-canvas hover:opacity-90 disabled:opacity-60"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {saving ? 'Saving…' : pendingDealUpdate ? 'Retry deal update' : 'Save'}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
