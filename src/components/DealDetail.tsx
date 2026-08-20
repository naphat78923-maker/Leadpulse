'use client';

import { useState } from 'react';
import { Check, Edit2, Loader2, Undo2, X } from 'lucide-react';
import clsx from 'clsx';
import { Deal, DealStage, DealWorkflowAction, NudgeStage, SampleStatus, STAGE_LABELS } from '@/types/crm';
import { useToast } from '@/components/ToastProvider';
import { useCrm } from '@/components/CrmProvider';
import * as crm from '@/lib/crm';
import { NUDGE_OPTIONS, SAMPLE_STATUS_OPTIONS, WORKFLOW_BY_ID, WORKFLOW_LANES, getWorkflowAction, nudgeLabel } from '@/utils/deal-workflow';

const stageOptions: DealStage[] = ['research', 'contacted', 'proposal', 'negotiation', 'closed_won', 'closed_lost'];

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

export default function DealDetail({ deal, onClose, onSaved }: DealDetailProps) {
  const { addToast } = useToast();
  const { logActivity } = useCrm();
  const currentWorkflow = getWorkflowAction(deal);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [undoSnapshot, setUndoSnapshot] = useState<Partial<Deal> | null>(null);
  const [confirmSuccess, setConfirmSuccess] = useState(false);
  const [editData, setEditData] = useState({
    title: deal.title,
    client: deal.client,
    stage: deal.stage,
    product: deal.product,
    priority: deal.priority,
    value: deal.value != null ? String(deal.value) : '',
    workflow_action: currentWorkflow,
    nudge_stage: deal.nudge_stage || '',
    sample_status: deal.sample_status || '',
    next_action: deal.next_action || '',
    followup_date: deal.followup_date || '',
    last_outcome: deal.last_outcome || '',
    last_outcome_new: '',
  });

  const beforeSnapshot = (): Partial<Deal> => ({
    title: deal.title,
    client: deal.client,
    stage: deal.stage,
    product: deal.product,
    priority: deal.priority,
    value: deal.value,
    workflow_action: currentWorkflow,
    nudge_stage: deal.nudge_stage || null,
    sample_status: deal.sample_status || null,
    next_action: deal.next_action,
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
        title: editData.title,
        client: editData.client,
        stage: newStage,
        product: editData.product,
        priority: editData.priority,
        value: editData.value.trim() === '' ? null : Number.isFinite(parsedValue) ? parsedValue : null,
        workflow_action: actionToSave,
        nudge_stage: actionToSave === 'reschedule' ? editData.nudge_stage as NudgeStage : null,
        sample_status: actionToSave === 'sample' ? editData.sample_status as SampleStatus : null,
        next_action: editData.next_action,
        followup_date: newFollowup || null,
        last_outcome: finalOutcome,
      });

      setEditData(prev => ({
        ...prev,
        title: updated.title,
        client: updated.client,
        stage: updated.stage,
        product: updated.product,
        priority: updated.priority,
        value: updated.value != null ? String(updated.value) : '',
        workflow_action: updated.workflow_action || prev.workflow_action,
        nudge_stage: updated.nudge_stage || '',
        sample_status: updated.sample_status || '',
        next_action: updated.next_action || '',
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
        label: workflowChanged ? `${workflow.icon} ${workflow.label}` : `Updated ${updated.client || deal.client}`,
        description: workflowChanged ? `${deal.client} moved to the ${workflow.shortLabel} lane` : `Pipeline stage: ${STAGE_LABELS[updated.stage as DealStage]}`,
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
    persistSave();
  };

  const handleUndo = async () => {
    if (!undoSnapshot) return;
    setSaving(true);
    setError(null);
    try {
      await crm.updateDeal(deal.id, undoSnapshot);
      setEditData(prev => ({
        ...prev,
        title: undoSnapshot.title || prev.title,
        client: undoSnapshot.client || prev.client,
        stage: (undoSnapshot.stage as DealStage) || prev.stage,
        product: undoSnapshot.product || prev.product,
        priority: undoSnapshot.priority || prev.priority,
        value: undoSnapshot.value != null ? String(undoSnapshot.value) : '',
        workflow_action: (undoSnapshot.workflow_action as DealWorkflowAction) || prev.workflow_action,
        nudge_stage: undoSnapshot.nudge_stage || '',
        sample_status: undoSnapshot.sample_status || '',
        next_action: undoSnapshot.next_action || '',
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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end md:items-center justify-center z-50 p-0 md:p-4" onClick={onClose}>
      <div className={clsx('bg-white dark:bg-clay-card w-full md:max-w-md md:rounded-2xl rounded-t-2xl p-6 max-h-[86vh] overflow-y-auto transition-all duration-300', saving ? 'scale-[0.98] opacity-80' : saved ? 'ring-2 ring-clay-success/40' : '')} onClick={event => event.stopPropagation()}>
        <div className="flex items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <p className="text-[10px] text-clay-muted font-medium tracking-wider">DEAL</p>
            {editing ? <input value={editData.client} onChange={event => setEditData(prev => ({ ...prev, client: event.target.value }))} className="w-full text-lg font-semibold text-clay-ink bg-transparent border-b border-clay-ink outline-none" /> : <h2 className="text-lg font-semibold text-clay-ink truncate">{deal.client}</h2>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {editing && <button onClick={handleSave} disabled={saving} className="p-2 text-clay-success active:opacity-70 disabled:opacity-50" aria-label="Save deal">{saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}</button>}
            <button onClick={() => { setError(null); setEditing(value => !value); }} className="p-2 text-clay-muted active:opacity-70" aria-label="Edit deal"><Edit2 className="w-5 h-5" /></button>
            <button onClick={onClose} className="p-2 text-clay-muted active:opacity-70" aria-label="Close"><X className="w-5 h-5" /></button>
          </div>
        </div>

        {saving && <div className="mb-4 flex items-center gap-2 text-sm text-clay-success animate-pulse"><Loader2 className="w-4 h-4 animate-spin" />Saving…</div>}
        {saved && !saving && <div className="mb-4 flex items-center gap-2 text-sm text-clay-success"><Check className="w-4 h-4" />Saved</div>}
        {error && !saving && <div className="mb-4 rounded-lg bg-clay-error/10 px-3 py-2 text-sm text-clay-error">{error}</div>}

        <div className="space-y-4 text-sm">
          <section className="rounded-xl border border-clay-hairline bg-clay-surface p-3">
            <p className="text-[10px] font-semibold tracking-wider text-clay-muted mb-2">ACTION LANE — WHAT HAPPENS NEXT</p>
            {editing ? (
              <>
                <select value={editData.workflow_action} onChange={event => setEditData(prev => ({ ...prev, workflow_action: event.target.value as DealWorkflowAction, nudge_stage: event.target.value === 'reschedule' ? prev.nudge_stage : '', sample_status: event.target.value === 'sample' ? prev.sample_status : '' }))} className="w-full px-3 py-2.5 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card">
                  {WORKFLOW_LANES.map(lane => <option key={lane.id} value={lane.id}>{lane.icon} {lane.label}</option>)}
                </select>
                <p className="text-xs text-clay-muted mt-2">{WORKFLOW_BY_ID[editData.workflow_action].description}</p>
                {editData.workflow_action === 'sample' && <label className="block mt-3 text-xs text-clay-body">Sample status<select value={editData.sample_status} onChange={event => setEditData(prev => ({ ...prev, sample_status: event.target.value as SampleStatus }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"><option value="">Choose status</option>{SAMPLE_STATUS_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>}
                {editData.workflow_action === 'reschedule' && <label className="block mt-3 text-xs text-clay-body">Nudge stage<select value={editData.nudge_stage} onChange={event => setEditData(prev => ({ ...prev, nudge_stage: event.target.value as NudgeStage }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"><option value="">Choose nudge</option>{NUDGE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label} · {option.days} days</option>)}</select></label>}
              </>
            ) : (
              <div className="flex items-start gap-3"><span className="text-2xl">{workflow.icon}</span><div><p className="font-semibold text-clay-ink">{workflow.label}</p><p className="text-xs text-clay-muted mt-0.5">{workflow.description}</p>{deal.nudge_stage && <p className="text-xs text-clay-ochre mt-1">{nudgeLabel(deal.nudge_stage)}</p>}{deal.sample_status && <p className="text-xs text-clay-ochre mt-1">Sample {deal.sample_status}</p>}</div></div>
            )}
          </section>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-clay-body">Pipeline stage{editing ? <select value={editData.stage} onChange={event => setEditData(prev => ({ ...prev, stage: event.target.value as DealStage }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card">{stageOptions.map(stage => <option key={stage} value={stage}>{STAGE_LABELS[stage]}</option>)}</select> : <span className="block mt-1 px-2 py-1.5 bg-clay-card rounded text-xs">{STAGE_LABELS[deal.stage]}</span>}</label>
            <label className="text-clay-body">Priority{editing ? <select value={editData.priority} onChange={event => setEditData(prev => ({ ...prev, priority: event.target.value as Deal['priority'] }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select> : <span className="block mt-1 px-2 py-1.5 bg-clay-card rounded text-xs capitalize">{deal.priority}</span>}</label>
          </div>

          <label className="block text-clay-body">Deal title{editing ? <input value={editData.title} onChange={event => setEditData(prev => ({ ...prev, title: event.target.value }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 font-medium text-clay-ink">{deal.title}</p>}</label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-clay-body">Product{editing ? <input value={editData.product} onChange={event => setEditData(prev => ({ ...prev, product: event.target.value }))} className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 text-clay-ink">{deal.product}</p>}</label>
            <label className="text-clay-body">Value (THB){editing ? <input type="text" inputMode="decimal" value={editData.value} onChange={event => setEditData(prev => ({ ...prev, value: event.target.value }))} placeholder="e.g., 50000" className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 font-medium text-clay-ink">{deal.value != null ? Number(deal.value).toLocaleString('en-US') : '—'}</p>}</label>
          </div>
          <label className="block text-clay-body">Next action note{editing ? <input value={editData.next_action} onChange={event => setEditData(prev => ({ ...prev, next_action: event.target.value }))} placeholder="What exactly will happen next?" className="w-full mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className="mt-1 rounded-lg bg-clay-surface p-3 text-xs text-clay-body">{deal.next_action || '—'}</p>}</label>
          <label className="block text-clay-body">{editing && editData.workflow_action === 'parked' ? 'Revisit date' : editing && editData.workflow_action === 'testing' ? 'Testing date' : 'Follow-up date'}{editing ? <input type="date" value={editData.followup_date} onChange={event => setEditData(prev => ({ ...prev, followup_date: event.target.value }))} className="block mt-1 px-3 py-2 border border-clay-hairline rounded-lg text-base bg-white dark:bg-clay-card" /> : <p className={clsx('mt-1', isOverdue ? 'text-clay-error font-medium' : 'text-clay-ink')}>{deal.followup_date || '—'}</p>}</label>

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
      </div>
    </div>
  );
}
