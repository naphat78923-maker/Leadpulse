// Deal editor draft — keeps the edit form and the saved record in agreement.
//
// The bug this module exists to prevent: the editor used to snapshot the deal once on
// mount and then write the whole snapshot back. A deal that moved while the editor was
// open (an interaction-driven lane change) was therefore reverted by the next save, and
// the form showed the lane and history the user had already left behind.
//
// Rules:
// - The form is always derived from the LATEST record plus the user's own edits.
// - A save writes ONLY the fields the user edited (plus the explicit lane move), so an
//   unrelated background change can never be reverted by this editor.
// - Nothing edited means nothing written: an empty payload is a no-op, never a success.
import type { Deal, DealWorkflowAction, SampleStatus } from '@/types/crm';
import { getWorkflowAction, stageFromWorkflow } from '@/utils/deal-workflow';

export interface DealEditDraft {
  product: string;
  priority: Deal['priority'];
  value: string;
  workflow_action: DealWorkflowAction;
  sample_status: SampleStatus | '';
  next_action: string;
  draft_primary_ask: string;
  followup_date: string;
  last_outcome_new: string;
}

export type DealEditField = keyof DealEditDraft;

/** Fields the user can type into — the ones that count as "edited". */
export const EDITABLE_DEAL_FIELDS: DealEditField[] = [
  'product',
  'priority',
  'value',
  'workflow_action',
  'sample_status',
  'next_action',
  'draft_primary_ask',
  'followup_date',
  'last_outcome_new',
];

export function dealToEditDraft(deal: Deal): DealEditDraft {
  return {
    product: deal.product,
    priority: deal.priority,
    value: deal.value != null ? String(deal.value) : '',
    workflow_action: getWorkflowAction(deal),
    sample_status: (deal.sample_status as SampleStatus) || '',
    next_action: deal.next_action || '',
    draft_primary_ask: deal.draft_primary_ask || '',
    followup_date: deal.followup_date || '',
    last_outcome_new: '',
  };
}

/** The draft the form shows: latest record underneath, the user's unsaved edits on top. */
export function mergeDraft(base: DealEditDraft, edits: Partial<DealEditDraft>): DealEditDraft {
  return { ...base, ...edits, last_outcome_new: edits.last_outcome_new ?? '' };
}

/**
 * A conflict is a field the record moved on *since the user began editing it* while the
 * user's own value still differs from the record. The user's value is kept and surfaced;
 * nothing is silently discarded in either direction.
 */
export function detectDraftConflicts(
  baseline: Partial<DealEditDraft>,
  currentBase: DealEditDraft,
  edits: Partial<DealEditDraft>
): DealEditField[] {
  return (Object.keys(edits) as DealEditField[]).filter(
    field =>
      field !== 'last_outcome_new' &&
      field in baseline &&
      baseline[field] !== currentBase[field] &&
      edits[field] !== currentBase[field]
  );
}

function appendOutcome(existing: string, entry?: string) {
  if (!entry) return existing;
  return existing ? `${existing}\n---\n${entry}` : entry;
}

export function timestampedEntry(text: string) {
  const stamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  return `[${stamp}] ${text}`;
}

export interface BuildDealEditPayloadInput {
  /** The authoritative record as currently loaded — journal appends build on this, never on a draft copy. */
  deal: Deal;
  draft: DealEditDraft;
  editedFields: ReadonlySet<DealEditField>;
  /** Extra journal line for the lane move itself (e.g. "Workflow set to Waiting on reply"). */
  laneJournalEntry?: string;
}

/**
 * The write payload for a deal edit. Only touched fields appear; the lane move drags its
 * own stage/sample fields with it and clears the deprecated stored nudge stage.
 */
export function buildDealEditPayload({
  deal,
  draft,
  editedFields,
  laneJournalEntry,
}: BuildDealEditPayloadInput): Partial<Deal> {
  const touched = (field: DealEditField) => editedFields.has(field);
  const payload: Partial<Deal> = {};
  const currentAction = getWorkflowAction(deal);
  const laneChanged = touched('workflow_action') && draft.workflow_action !== currentAction;

  if (touched('product')) payload.product = draft.product;
  if (touched('priority')) payload.priority = draft.priority;

  if (touched('value')) {
    const trimmed = draft.value.trim();
    const parsed = parseFloat(trimmed);
    // Blank stays blank (unknown) — never 0.
    payload.value = trimmed === '' ? null : Number.isFinite(parsed) ? parsed : null;
  }

  if (laneChanged) {
    const target = draft.workflow_action;
    payload.workflow_action = target;
    payload.stage = stageFromWorkflow(target, deal.stage);
    // Nudges are derived; the stored column is legacy and is cleared only by a real lane move.
    payload.nudge_stage = null;
  }

  // Sample status is a field the user can edit WITHOUT moving the lane (the select is shown for
  // the sample/testing lanes), so it is written on an edit of its own — not only on a lane change.
  if ((laneChanged && (draft.workflow_action === 'sample' || draft.workflow_action === 'testing')) || touched('sample_status')) {
    payload.sample_status = (draft.sample_status as SampleStatus) || null;
  }

  if (touched('next_action')) payload.next_action = draft.next_action.trim() ? draft.next_action : null;
  if (touched('draft_primary_ask')) payload.draft_primary_ask = draft.draft_primary_ask.trim() || null;
  if (touched('followup_date')) payload.followup_date = draft.followup_date || null;

  const newNote = draft.last_outcome_new.trim();
  if (newNote || laneChanged) {
    let next = deal.last_outcome || '';
    if (laneChanged && laneJournalEntry) next = appendOutcome(next, timestampedEntry(laneJournalEntry));
    if (newNote) next = appendOutcome(next, timestampedEntry(newNote));
    payload.last_outcome = next;
  }

  return payload;
}

export function isEmptyPayload(payload: Partial<Deal>): boolean {
  return Object.keys(payload).length === 0;
}

/** Human labels for the fields a conflict notice can name. */
export const DEAL_EDIT_FIELD_LABELS: Record<DealEditField, string> = {
  product: 'Product',
  priority: 'Priority',
  value: 'Value',
  workflow_action: 'Action lane',
  sample_status: 'Sample status',
  next_action: 'Next action',
  draft_primary_ask: 'Primary client ask',
  followup_date: 'Follow-up date',
  last_outcome_new: 'New note',
};

export function dealEditFieldLabel(field: DealEditField): string {
  return DEAL_EDIT_FIELD_LABELS[field] ?? field;
}
