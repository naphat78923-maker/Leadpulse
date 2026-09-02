'use client';

import { useState } from 'react';
import { Check, Edit2, Loader2, Undo2, X, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import { Deal, DealStage, DealWorkflowAction, NudgeStage, SampleStatus } from '@/types/crm';
import { useToast } from '@/components/ToastProvider';
import { useCrm } from '@/components/CrmProvider';
import { dealClientName } from '@/utils/dealLabel';
import * as crm from '@/lib/crm';
import { NUDGE_OPTIONS, SAMPLE_STATUS_OPTIONS, WORKFLOW_BY_ID, WORKFLOW_LANES, getWorkflowAction, nudgeLabel, canNudge } from '@/utils/deal-workflow';
import { motion } from 'framer-motion';
import { overlayVariants, panelVariants, tweenBase, tweenSlow } from '@/lib/motion';

interface DealDetailProps {
  deal: Deal;
  onClose: () => void;
  onSaved: () => void;
}

function timestampedEntry(text: string) {
  const now = new Date();
  const tzOffset = now.getTimezoneOffset() * -1;
  const tzHours = Math.floor(Math.abs(tzOffset) / 60);
  const tzMinutes = Math.abs(tzOffset) % 60;
  const tzSign = tzOffset >= 0 ? '+' : '-';
  const tzString = `${tzSign}${String(tzHours).padStart(2, '0')}:${String(tzMinutes).padStart(2, '0')}`;
  const stamp = now.toISOString().replace('T', ' ').substring(0, 19) + ` UTC${tzString}`;
  return `[${stamp}] ${text}`;
}

function appendOutcome(existing: string, entry?: string) {
  if (!entry) return existing;
  return existing ? `${existing}\n---\n${entry}` : entry;
}

const DRAFTING_WORKFLOWS = new Set<DealWorkflowAction>(['outreach', 'reply', 'reschedule']);

export default function DealDetail({ deal, onClose, onSaved }: DealDetailProps) {
  const { addToast } = useToast();
  const { logActivity, deleteEntity, companies, contacts } = useCrm();
  const currentWorkflow = getWorkflowAction(deal);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<Partial<Deal> | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [confirmLost, setConfirmLost] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const isWon = deal.stage === 'closed_won';
  const isLost = deal.stage === 'closed_lost';
  const dealStatus: 'open' | 'won' | 'lost' = isWon ? 'won' : isLost ? 'lost' : 'open';
  const [editData, setEditData] = useState({
    stage: deal.stage,
    product: deal.product,
    priority: deal.priority,
    value: deal.value != null ? String(deal.value) : '',
    workflow_action: currentWorkflow,
    nudge_stage: deal.nudge_stage || '',
    sample_status: deal.sample_status || '',
    next_action: deal.next_action || '',
    draft_primary_ask: deal.draft_primary_ask || '',
    followup_date: deal.followup_date || '',
    last_outcome: deal.last_outcome || '',
    last_outcome_new: '',
  });

  const beforeSnapshot = (): Partial<Deal> => ({
    stage: deal.stage,
    product: deal.product,
    priority: deal.priority,
    value: deal.value,
    workflow_action: currentWorkflow,
    nudge_stage: deal.nudge_stage || null,
    sample_status: deal.sample_status || null,
    next_action: deal.next_action,
    draft_primary_ask: deal.draft_primary_ask || null,
    followup_date: deal.followup_date,
    last_outcome: deal.last_outcome,
  });

  const validateWorkflow = () => {
    if (editData.workflow_action === 'sample' && !editData.sample_status) {
      return 'Choose whether the sample was sent or received.';
    }
    if (editData.workflow_action === 'testing' && !editData.followup_date) {
      return 'Set the client testing date before saving.';
    }
    if (editData.workflow_action === 'reschedule' && !editData.followup_date) {
      return 'Set the rescheduled follow-up date.';
    }
    if (editData.workflow_action === 'reschedule' && !editData.nudge_stage) {
      return 'Choose Warm, Remind, Firm, or Parking nudge.';
    }
    if (editData.workflow_action === 'parked' && !editData.followup_date) {
      return 'Parked deals need a revisit date.';
    }
    return null;
  };

  const persistSave = async () => {
    const workflowError = validateWorkflow();
    if (workflowError) {
      setError(workflowError);
      return;
    }

    setSaving(true);
    setError(null);
    const before = beforeSnapshot();
    const actionToSave: DealWorkflowAction = editData.stage === 'closed_won' ? 'success' : editData.workflow_action;
    const workflowChanged = actionToSave !== currentWorkflow;
    const workflow = WORKFLOW_BY_ID[actionToSave];
    let newStage = editData.stage;
    let newFollowup = editData.followup_date;

    // "Successful" is a real outcome, so it alone closes a deal automatically.
    // All other action lanes stay separate from the sales stage on purpose.
    if (actionToSave === 'success') {
      newStage = 'closed_won';
      newFollowup = '';
    }

    let finalOutcome = editData.last_outcome || '';
    if (workflowChanged) {
      const detail = actionToSave === 'sample' && editData.sample_status
        ? ` — sample ${editData.sample_status}`
        : actionToSave === 'reschedule' && editData.nudge_stage
          ? ` — ${nudgeLabel(editData.nudge_stage as NudgeStage)}`
          : '';
      finalOutcome = appendOutcome(finalOutcome, timestampedEntry(`${workflow.icon} Workflow set to ${workflow.label}${detail}`));
    }
    if (editData.last_outcome_new.trim()) {
      finalOutcome = appendOutcome(finalOutcome, timestampedEntry(editData.last_outcome_new.trim()));
    }

    try {
      const parsedValue = parseFloat(editData.value);
      const updated = await crm.updateDeal(deal.id, {
        stage: newStage,
        product: editData.product,
        priority: editData.priority,
        value: editData.value.trim() === '' ? null : Number.isFinite(parsedValue) ? parsedValue : null,
        workflow_action: actionToSave,
        nudge_stage: actionToSave === 'reschedule' ? editData.nudge_stage as NudgeStage : null,
        sample_status: actionToSave === 'sample' ? editData.sample_status as SampleStatus : null,
        next_action: editData.next_action,
        draft_primary_ask: editData.draft_primary_ask.trim() || null,
        followup_date: newFollowup || null,
        last_outcome: finalOutcome,
      });

      setEditData(prev => ({
        ...prev,
        stage: updated.stage,
        product: updated.product,
        priority: updated.priority,
        value: updated.value != null ? String(updated.value) : '',
        workflow_action: updated.workflow_action || prev.workflow_action,
        nudge_stage: updated.nudge_stage || '',
        sample_status: updated.sample_status || '',
        next_action: updated.next_action || '',
        draft_primary_ask: updated.draft_primary_ask || '',
        followup_date: updated.followup_date || '',
        last_outcome: updated.last_outcome || '',
        last_outcome_new: '',
      }));
      setUndoSnapshot(before);
      setEditing(false);
      logActivity({
        type: 'edit',
        entity: 'deal',
        entityId: deal.id,
        label: workflowChanged ? `${workflow.icon} ${workflow.label}` : `Updated ${dealClientName(deal, companies, contacts)}`,
        description: workflowChanged ? `${dealClientName(deal, companies, contacts)} moved to the ${workflow.shortLabel} lane` : `Action lane: ${WORKFLOW_BY_ID[updated.workflow_action as DealWorkflowAction].label}`,
        undoPayload: before,
      });
      onSaved();
      setSaved(true);
      addToast(workflowChanged ? 'Action lane updated' : 'Deal saved!');
      setTimeout(() => setSaved(false), 2000);
    } catch (err: any) {
      setError('Could not save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => {
    setError(null);
    if ((editData.workflow_action === 'success' || editData.stage === 'closed_won') && currentWorkflow !== 'success') {
      setConfirmSuccess(true);
      return;
    }
    if (editData.stage === 'closed_lost' && !isLost) {
      setConfirmLost(true);
      return;
    }
    persistSave();
  };

  // Set the deal to won/lost/open from the status control (not the inline editor).
  const handleStatusChange = (next: 'open' | 'won' | 'lost') => {
    setError(null);
    if (next === 'won') {
      if (currentWorkflow === 'success') return;
      setConfirmSuccess(true);
      return;
    }
    if (next === 'lost') {
      if (isLost) return;
      setConfirmLost(true);
      return;
    }
    // Back to open from a closed state — restore a sensible open stage.
    if (isWon || isLost) {
      const before = beforeSnapshot();
      setSaving(true);
      crm.updateDeal(deal.id, { stage: 'research', followup_date: new Date().toISOString().split('T')[0], workflow_action: 'outreach' })
        .then(() => {
          setUndoSnapshot(before);
          logActivity({
            type: 'edit',
            entity: 'deal',
            entityId: deal.id,
            label: `Reopened ${dealClientName(deal, companies, contacts)}`,
            description: `${dealClientName(deal, companies, contacts)} moved back to open pipeline`,
            undoPayload: before,
          });
          onSaved();
          addToast('Deal reopened');
        })
        .catch(err => setError('Could not reopen: ' + (err.message || 'Unknown error')))
        .finally(() => setSaving(false));
    }
  };

  const confirmLostSave = async () => {
    setConfirmLost(false);
    setSaving(true);
    setError(null);
    const before = beforeSnapshot();
    try {
      await crm.updateDeal(deal.id, {
        stage: 'closed_lost',
        followup_date: null,
        workflow_action: 'parked',
      });
      setUndoSnapshot(before);
      logActivity({
        type: 'edit',
        entity: 'deal',
        entityId: deal.id,
        label: `📉 Marked lost`,
        description: `${dealClientName(deal, companies, contacts)} closed as lost`,
        undoPayload: before,
      });
      onSaved();
      addToast('Deal marked lost');
    } catch (err: any) {
      setError('Could not save: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (!undoSnapshot) return;
    setSaving(true);
    setError(null);
    try {
      await crm.updateDeal(deal.id, undoSnapshot);
      setEditData(prev => ({
        ...prev,
        stage: (undoSnapshot.stage as DealStage) || prev.stage,
        product: undoSnapshot.product || prev.product,
        priority: undoSnapshot.priority || prev.priority,
        value: undoSnapshot.value != null ? String(undoSnapshot.value) : '',
        workflow_action: (undoSnapshot.workflow_action as DealWorkflowAction) || prev.workflow_action,
        nudge_stage: undoSnapshot.nudge_stage || '',
        sample_status: undoSnapshot.sample_status || '',
        next_action: undoSnapshot.next_action || '',
        draft_primary_ask: undoSnapshot.draft_primary_ask || '',
        followup_date: undoSnapshot.followup_date || '',
        last_outcome: undoSnapshot.last_outcome || '',
        last_outcome_new: '',
      }));
      setUndoSnapshot(null);
      onSaved();
      addToast('Change undone');
    } catch (err: any) {
      setError('Could not undo: ' + (err.message || 'Unknown error'));
    } finally {
      setSaving(false);
    }
  };

  const isOverdue = deal.followup_date && new Date(`${deal.followup_date}T12:00:00`) < new Date() && !['closed_won', 'closed_lost'].includes(deal.stage);
  const workflow = WORKFLOW_BY_ID[currentWorkflow];
  const visibleWorkflow = editing ? editData.workflow_action : currentWorkflow;
  const visiblePrimaryAsk = editing ? editData.draft_primary_ask : deal.draft_primary_ask;
  const showDraftingBrief = DRAFTING_WORKFLOWS.has(visibleWorkflow) || Boolean(visiblePrimaryAsk?.trim());

  return (
    <div className="fixed inset-0 flex items-end md:items-center justify-center z-50 p-0 md:p-4">
      <motion.div
        className="absolute inset-0 bg-black/50"
        variants={overlayVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={tweenBase}
        onClick={onClose}
      />
      <motion.div
        className={clsx('relative bg-white dark:bg-clay-card w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-6 max-h-[86vh] overflow-y-auto', saving ? 'opacity-80' : saved ? 'ring-2 ring-clay-success/40' : '')}
        variants={panelVariants}
        initial="initial"
        animate="animate"
        exit="exit"
        transition={tweenSlow}
        onClick={event => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] text-clay-muted font-medium tracking-wider">DEAL</p>
            <h2 className="text-lg font-semibold text-clay-ink truncate">{dealClientName(deal, companies, contacts)}</h2>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editing && <button onClick={handleSave} disabled={saving} className="p-2 text-clay-success active:opacity-70 disabled:opacity-50" aria-label="Save deal">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}</button>}
            <button onClick={() => setEditing(value => !value)} className="p-2 text-clay-muted active:opacity-70" aria-label="Edit deal"><Edit2 className="w-5 h-5" /></button>
            <button onClick={() => setConfirmArchive(true)} className="p-2 text-clay-muted-soft active:opacity-70 hover:text-clay-error transition-colors" aria-label="Archive deal"><Trash2 className="w-5 h-5" /></button>
            <button onClick={onClose} className="p-2 text-clay-muted active:opacity-70" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {saving && <div className="mb-4 flex items-center gap-2 text-sm text-clay-success animate-pulse"><Loader2 className="w-4 h-4 animate-spin" />Saving…</div>}
        {saved && !saving && <div className="mb-4 flex items-center gap-2 text-sm text-clay-success"><Check className="w-4 h-4" />Saved</div>}
        {error && !saving && <div className="mb-4 rounded-lg bg-clay-error/10 px-3 py-2 text-sm text-clay-error">{error}</div>}

        <div className="space-y-4 text-sm">
          {/* Deal status: open / won / lost */}
          <section className="rounded-xl border border-clay-hairline bg-clay-surface p-3">
            <p className="text-[10px] font-semibold tracking-wider text-clay-muted mb-2">DEAL STATUS</p>
            <div className="grid grid-cols-3 gap-2">
              {(['open', 'won', 'lost'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => handleStatusChange(s)}
                  disabled={saving}
                  className={clsx(
                    'px-3 py-2.5 rounded-lg text-sm font-medium border transition-colors disabled:opacity-50',
                    dealStatus === s
                      ? s === 'won'
                        ? 'bg-clay-mint/20 border-clay-mint text-clay-teal'
                        : s === 'lost'
                        ? 'bg-clay-error/10 border-clay-error text-clay-error'
                        : 'bg-clay-ink text-clay-canvas border-clay-ink'
                      : 'bg-white dark:bg-clay-card text-clay-muted border-clay-hairline active:bg-clay-surface'
                  )}
                >
                  {s === 'won' ? '🎉 Won' : s === 'lost' ? '📉 Lost' : '● Open'}
                </button>
              ))}
            </div>
          </section>
          <section className="rounded-xl border border-clay-hairline bg-clay-surface p-3">
            <p className="text-[10px] font-semibold tracking-wider text-clay-muted mb-2">ACTION LANE — WHAT HAPPENS NEXT</p>
            {editing ? (
              <>
                <select aria-label="Action lane" value={editData.workflow_action} onChange={event => setEditData(prev => ({ ...prev, workflow_action: event.target.value as DealWorkflowAction, nudge_stage: canNudge(event.target.value as DealWorkflowAction) ? prev.nudge_stage : '', sample_status: event.target.value === 'sample' ? prev.sample_status : '' }))} className="w-full px-3 py-2.5 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card">
                  {WORKFLOW_LANES.filter(lane => canNudge(currentWorkflow) || (lane.id !== 'reschedule' && lane.id !== 'parked')).map(lane => <option key={lane.id} value={lane.id}>{lane.icon} {lane.label}</option>)}
                </select>
                <p className="text-xs text-clay-muted mt-2">{WORKFLOW_BY_ID[editData.workflow_action].description}</p>
                {editData.workflow_action === 'sample' && <label className="block mt-3 text-xs text-clay-body">Sample status<select value={editData.sample_status} onChange={event => setEditData(prev => ({ ...prev, sample_status: event.target.value as SampleStatus }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"><option value="">Choose status</option>{SAMPLE_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
                {canNudge(editData.workflow_action) && <label className="block mt-3 text-xs text-clay-body">Nudge stage<select value={editData.nudge_stage} onChange={event => setEditData(prev => ({ ...prev, nudge_stage: event.target.value as NudgeStage }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"><option value="">Choose nudge</option>{NUDGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label} · {option.days} days</option>)}</select></label>}
              </>
            ) : (
              <div className="flex items-start gap-3"><span className="text-2xl">{workflow.icon}</span><div><p className="font-semibold text-clay-ink">{workflow.label}</p><p className="text-xs text-clay-muted mt-0.5">{workflow.description}</p>{deal.nudge_stage && <p className="text-xs text-clay-ochre mt-1">🔔 {nudgeLabel(deal.nudge_stage)}</p>}{deal.sample_status && <p className="text-xs text-clay-ochre mt-1">Sample {deal.sample_status}</p>}{!deal.nudge_stage && !canNudge(currentWorkflow) && <p className="text-xs text-clay-muted-soft mt-1">🔔 Nudge unlocks after sample is sent</p>}</div></div>
            )}
          </section>

          <label className="block text-clay-body">CRM next action{editing ? <input value={editData.next_action} onChange={event => setEditData(prev => ({ ...prev, next_action: event.target.value }))} placeholder="What needs to happen internally?" className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 rounded-lg bg-clay-surface p-3 text-xs text-clay-body">{deal.next_action || '—'}</p>}</label>
          {showDraftingBrief && (
            <section className="rounded-xl border border-clay-lavender/30 bg-clay-lavender/10 p-3">
              <p className="text-[10px] font-semibold tracking-wider text-clay-muted">EBIMARU DRAFTING BRIEF</p>
              <p className="mt-1 text-xs text-clay-muted">One client question only. This is drafting guidance, not a send instruction.</p>
              <label className="block mt-3 text-clay-body">Primary client ask{editing ? <input value={editData.draft_primary_ask} onChange={event => setEditData(prev => ({ ...prev, draft_primary_ask: event.target.value }))} placeholder="What one thing should the client answer?" className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 rounded-lg bg-white/60 dark:bg-clay-card p-3 text-xs text-clay-body">{deal.draft_primary_ask || '—'}</p>}</label>
            </section>
          )}
          <label className="block text-clay-body">{editing && editData.workflow_action === 'parked' ? 'Revisit date' : editing && editData.workflow_action === 'testing' ? 'Testing date' : 'Follow-up date'}{editing ? <input type="date" value={editData.followup_date} onChange={event => setEditData(prev => ({ ...prev, followup_date: event.target.value }))} className="block mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className={clsx('mt-1', isOverdue ? 'text-clay-error font-medium' : 'text-clay-ink')}>{deal.followup_date || '—'}</p>}</label>

          <details className="rounded-xl border border-clay-hairline bg-clay-surface">
            <summary className="cursor-pointer px-3 py-3 text-sm font-medium text-clay-body">Commercial details</summary>
            <div className="grid grid-cols-1 gap-3 border-t border-clay-hairline px-3 py-3 sm:grid-cols-3">
              <label className="text-clay-body">Product{editing ? <input value={editData.product} onChange={event => setEditData(prev => ({ ...prev, product: event.target.value }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 text-clay-ink">{deal.product}</p>}</label>
              <label className="text-clay-body">Priority{editing ? <select value={editData.priority} onChange={event => setEditData(prev => ({ ...prev, priority: event.target.value as Deal['priority'] }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select> : <span className="block mt-1 px-2 py-1.5 bg-clay-card rounded text-xs capitalize">{deal.priority}</span>}</label>
              <label className="text-clay-body">Value (THB){editing ? <input type="text" inputMode="decimal" value={editData.value} onChange={event => setEditData(prev => ({ ...prev, value: event.target.value }))} placeholder="e.g., 50000" className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 font-medium text-clay-ink">{deal.value != null ? Number(deal.value).toLocaleString('en-US') : '—'}</p>}</label>
            </div>
          </details>

          <section>
            <p className="text-clay-body">Outcome history</p>
            {editing ? <textarea value={editData.last_outcome_new} onChange={event => setEditData(prev => ({ ...prev, last_outcome_new: event.target.value }))} rows={3} placeholder="Add a note — the date will be recorded automatically" className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card resize-none" /> : null}
            <div className="mt-1 rounded-lg bg-clay-surface p-3 text-xs text-clay-body leading-relaxed space-y-2">{(editing ? editData.last_outcome : deal.last_outcome) ? (editing ? editData.last_outcome : deal.last_outcome || '').split('\n---\n').map((entry, index) => <p key={index} className="border-b border-clay-hairline/60 pb-2 last:border-0 last:pb-0">{entry}</p>) : 'No outcomes recorded yet.'}</div>
          </section>

          {undoSnapshot && <button onClick={handleUndo} disabled={saving} className="w-full flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-lg border border-clay-hairline bg-clay-surface text-sm font-medium text-clay-muted active:scale-[0.98] disabled:opacity-50"><Undo2 className="w-4 h-4" />Undo last change</button>}
        </div>

        {confirmSuccess && (
          <div className="mt-4 rounded-xl border border-clay-teal/30 bg-clay-mint/10 p-4">
            <div className="flex gap-3"><span className="text-2xl">🎉</span><div><p className="font-semibold text-clay-ink">Mark this deal successful?</p><p className="text-xs text-clay-muted mt-1">This sets the pipeline stage to Closed Won and places it in Happy customers. You can undo it after saving.</p></div></div>
            <div className="grid grid-cols-2 gap-2 mt-3"><button onClick={() => { setConfirmSuccess(false); persistSave(); }} className="px-3 py-2.5 bg-clay-ink text-clay-canvas text-sm font-medium rounded-lg">Confirm success</button><button onClick={() => setConfirmSuccess(false)} className="px-3 py-2.5 bg-clay-card text-clay-ink text-sm font-medium rounded-lg">Cancel</button></div>
          </div>
        )}

        {confirmLost && (
          <div className="mt-4 rounded-xl border border-clay-error/30 bg-clay-error/10 p-4">
            <div className="flex gap-3"><span className="text-2xl">📉</span><div><p className="font-semibold text-clay-ink">Mark this deal lost?</p><p className="text-xs text-clay-muted mt-1">This sets the pipeline stage to Closed Lost and removes it from the active board. You can undo it after saving.</p></div></div>
            <div className="grid grid-cols-2 gap-2 mt-3"><button onClick={confirmLostSave} className="px-3 py-2.5 bg-clay-error text-white text-sm font-medium rounded-lg">Confirm lost</button><button onClick={() => setConfirmLost(false)} className="px-3 py-2.5 bg-clay-card text-clay-ink text-sm font-medium rounded-lg">Cancel</button></div>
          </div>
        )}

        {confirmArchive && (
          <div className="mt-4 rounded-xl border border-clay-hairline bg-clay-surface p-4">
            <div className="flex gap-3"><span className="text-2xl">🗑️</span><div><p className="font-semibold text-clay-ink">Archive this deal?</p><p className="text-xs text-clay-muted mt-1">{dealClientName(deal, companies, contacts)} will be hidden from the board and lists. You can undo this from the Activity feed.</p></div></div>
            <div className="grid grid-cols-2 gap-2 mt-3"><button onClick={() => { setConfirmArchive(false); setSaving(true); deleteEntity('deal', deal.id, dealClientName(deal, companies, contacts)).then(() => { setSaving(false); addToast('Deal archived', 'success', { label: 'Undo', onClick: () => { /* undo handled via activity feed */ } }); onClose(); }).catch(err => { setSaving(false); setError('Could not archive: ' + (err.message || 'Unknown error')); }); }} className="px-3 py-2.5 bg-clay-error text-white text-sm font-medium rounded-lg">Archive</button><button onClick={() => setConfirmArchive(false)} className="px-3 py-2.5 bg-clay-card text-clay-ink text-sm font-medium rounded-lg">Cancel</button></div>
          </div>
        )}
      </motion.div>
    </div>
  );
}
