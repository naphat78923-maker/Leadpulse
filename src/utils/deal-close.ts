// Closing a deal truthfully.
//
// Three rules this module exists to enforce, each learned from the walked-through Won flow:
//   1. Won is an OPPORTUNITY OUTCOME. It is not an order, a delivery, or cash received, so no
//      copy and no write may claim otherwise.
//   2. A sale signal (`account_events`) is recorded ONLY when a positive order value was given.
//      A blank value stays unknown and records nothing; it is never coerced to 0 to satisfy a
//      write path.
//   3. The pre-close sales action is resolved EXPLICITLY — completed, replaced with a post-sale
//      action, or kept on purpose — never silently carried forward and never silently dropped.
//
// Both call sites (the deal detail and the board's exit menu) use this one module so the two
// cannot drift apart again.
import type { Deal, DealWorkflowAction, DealStage } from '@/types/crm';
import { isDateKey } from './business-time.ts';

export type ExitKind = 'won' | 'lost' | 'park';
export type CloseActionResolution = 'complete' | 'replace' | 'keep';

export interface CloseActionPlan {
  resolution: CloseActionResolution;
  /** Required when the resolution is `replace`. */
  action?: string | null;
  /** Optional date for the replacement action. */
  date?: string | null;
}

export interface CloseIntent {
  kind: ExitKind;
  close_date?: string | null;
  won_note?: string | null;
  value?: number | null;
  lost_reason?: string | null;
  followup_date?: string | null;
  park_reason?: string | null;
  action?: CloseActionPlan | null;
}

export interface CloseResolution {
  updates: Partial<Deal>;
  /** A journal fragment describing how the previous action was resolved, when there was one. */
  actionNote: string | null;
  error: string | null;
}

export const DEFAULT_ACTION_PLAN: CloseActionPlan = { resolution: 'complete' };

function timestampedEntry(text: string) {
  const stamp = new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC';
  return `[${stamp}] ${text}`;
}

function appendOutcome(existing: string | null | undefined, entry: string) {
  return existing ? `${existing}\n---\n${entry}` : entry;
}

const hasAction = (deal: Deal) => !!deal.next_action?.trim();

/**
 * How the current sales action is resolved by this close. `keep` writes nothing, so a close can
 * never quietly erase an action the user still intends to do — and a `complete` archives it in
 * the journal rather than dropping it.
 */
export function resolveCloseAction(deal: Deal, plan: CloseActionPlan = DEFAULT_ACTION_PLAN): CloseResolution {
  const previous = deal.next_action?.trim() || '';

  if (plan.resolution === 'replace') {
    const action = plan.action?.trim() || '';
    if (!action) {
      return { updates: {}, actionNote: null, error: 'Name the post-sale action, or keep the current one.' };
    }
    return {
      updates: {
        next_action: action,
        followup_date: isDateKey(plan.date) ? (plan.date as string) : null,
      },
      actionNote: `Post-sale action: ${action}${isDateKey(plan.date) ? ` (from ${plan.date})` : ''}`,
      error: null,
    };
  }

  if (plan.resolution === 'keep') {
    return {
      updates: {},
      actionNote: previous ? `Previous action kept on purpose: ${previous}` : null,
      error: null,
    };
  }

  return {
    updates: { next_action: null, followup_date: null },
    actionNote: previous ? `Previous action marked done: ${previous}` : null,
    error: null,
  };
}

/**
 * The amount to record as a sale signal, or null to record nothing at all.
 * Blank and zero stay unknown: a rejected order value must never become a zero-amount order row.
 */
export function orderAmountForRecord(value: number | null | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function closeJournalLines(deal: Deal, intent: CloseIntent, resolution: CloseResolution) {
  const parts: string[] = [];
  if (intent.kind === 'won') {
    const note = intent.won_note?.trim() ? ` — ${intent.won_note.trim()}` : '';
    parts.push(timestampedEntry(`🎉 Marked won${note}`));
  } else if (intent.kind === 'lost') {
    parts.push(timestampedEntry(`📉 Marked lost — ${intent.lost_reason || 'reason not recorded'}`));
  } else {
    const why = intent.park_reason?.trim() || 'reason not recorded';
    const revisit = isDateKey(intent.followup_date) ? ` · revisit ${intent.followup_date}` : '';
    parts.push(timestampedEntry(`⏸ Parked — ${why}${revisit}`));
  }
  if (resolution.actionNote) parts.push(timestampedEntry(resolution.actionNote));
  return parts;
}

const STAGE_FOR_EXIT: Record<ExitKind, DealStage> = {
  won: 'closed_won',
  lost: 'closed_lost',
  park: 'research',
};

const ACTION_FOR_EXIT: Record<ExitKind, DealWorkflowAction> = {
  won: 'success',
  lost: 'parked',
  park: 'parked',
};

/** The single deal patch for an exit. Both surfaces call this, so they cannot disagree. */
export function buildCloseUpdate(deal: Deal, intent: CloseIntent): CloseResolution & { recordOrderAmount: number | null } {
  // Only the Won exit has to resolve a live sales action: losing and parking remove the deal from
  // the journey board, and a parked deal's date is the REVISIT date — not an action schedule.
  const resolution =
    intent.kind === 'won'
      ? resolveCloseAction(deal, intent.action ?? DEFAULT_ACTION_PLAN)
      : { updates: {} as Partial<Deal>, actionNote: null, error: null };
  if (resolution.error) {
    return { ...resolution, recordOrderAmount: null };
  }

  const patch: Partial<Deal> = {
    stage: STAGE_FOR_EXIT[intent.kind],
    workflow_action: ACTION_FOR_EXIT[intent.kind],
    nudge_stage: null,
    last_outcome: closeJournalLines(deal, intent, resolution).reduce(
      (acc, line) => appendOutcome(acc, line),
      deal.last_outcome || ''
    ),
  };

  if (intent.kind === 'won') {
    patch.close_date = intent.close_date || null;
    if (intent.won_note?.trim()) patch.won_note = intent.won_note.trim();
    if ('value' in intent && intent.value != null) patch.value = intent.value;
  }

  if (intent.kind === 'lost') {
    patch.lost_reason = (intent.lost_reason as Deal['lost_reason']) || null;
  }

  if (intent.kind === 'park') {
    patch.park_reason = intent.park_reason?.trim() || null;
    patch.followup_date = isDateKey(intent.followup_date) ? (intent.followup_date as string) : null;
  }

  return {
    updates: { ...patch, ...resolution.updates },
    actionNote: resolution.actionNote,
    error: null,
    recordOrderAmount: intent.kind === 'won' ? orderAmountForRecord(intent.value ?? null) : null,
  };
}

/** Won is never presentable as collected money, whatever the stored value says. */
export const WON_IS_NOT_CASH_COPY = 'Marked won records the outcome — not an order, delivery, or payment.';
