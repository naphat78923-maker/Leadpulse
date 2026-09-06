import type { Deal, DealWorkflowAction, Meeting, NudgeStage, SampleStatus } from '@/types/crm';
import { NEXT_WORKFLOW, canNudge, getWorkflowAction, stageFromWorkflow } from '@/utils/deal-workflow';

export interface InteractionWorkflowDetails {
  outcome: Meeting['outcome'];
  interactionDescription: string;
  sampleStatus?: SampleStatus | null;
  testingDate?: string | null;
  nudgeStage?: NudgeStage | null;
  confirmSuccess?: boolean;
}

/**
 * Resolves an explicitly selected post-interaction lane into a deal update.
 * Selecting the current lane is always a no-op. Nothing is inferred from the
 * interaction channel or outcome.
 */
export function buildInteractionWorkflowUpdate(
  deal: Deal,
  targetAction: DealWorkflowAction,
  details: InteractionWorkflowDetails,
): Partial<Deal> | null {
  const currentAction = getWorkflowAction(deal);
  if (targetAction === currentAction) return null;

  // Won / Park are exits — never offered as a post-log next lane.
  if (targetAction === 'success' || targetAction === 'parked') {
    throw new Error('Mark won or park from the deal exit menu — not by logging a touch.');
  }

  const expectedNextAction = NEXT_WORKFLOW[currentAction];
  if (!expectedNextAction || targetAction !== expectedNextAction) {
    throw new Error('Choose either the current lane or the next workflow action.');
  }

  const updates: Partial<Deal> = {
    workflow_action: targetAction,
    stage: stageFromWorkflow(targetAction, deal.stage),
  };

  if (targetAction === 'reply') {
    if (!details.outcome || details.outcome === 'no_response') {
      throw new Error('A customer reply needs a real response outcome. No response keeps the deal in Outreach.');
    }
    const replyEntry = `Customer reply (${details.outcome}): ${details.interactionDescription.trim()}`;
    updates.last_outcome = deal.last_outcome
      ? `${deal.last_outcome}\n---\n${replyEntry}`
      : replyEntry;
  }

  if (targetAction === 'sample') {
    if (!details.sampleStatus) {
      throw new Error('Choose a sample status before moving this deal to Sample.');
    }
    updates.sample_status = details.sampleStatus;
  }

  if (targetAction === 'testing') {
    if (!details.testingDate) {
      throw new Error('Choose a testing date before moving this deal to Testing.');
    }
    updates.followup_date = details.testingDate;
  }

  if (targetAction === 'reschedule') {
    if (!details.testingDate && !deal.followup_date) {
      throw new Error('Set a follow-up date before moving this deal to Follow-up.');
    }
    if (details.testingDate) updates.followup_date = details.testingDate;
  }

  // Nudges are derived from follow-up + silence; never written from the log modal.
  void details.nudgeStage;
  void canNudge;

  return updates;
}
