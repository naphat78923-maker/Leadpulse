import { Deal, DealWorkflowAction, NudgeStage, SampleStatus } from '@/types/crm';

export interface WorkflowLane {
  id: DealWorkflowAction;
  icon: string;
  label: string;
  shortLabel: string;
  description: string;
  className: string;
}

/**
 * The Deal Action Board is the source of truth for *what Pat does next*.
 * Pipeline stage remains a separate sales-health signal (research → won/lost).
 */
export const WORKFLOW_LANES: WorkflowLane[] = [
  {
    id: 'outreach',
    icon: '✅',
    label: 'Log outreach',
    shortLabel: 'Outreach',
    description: 'Send the next call, email, or message.',
    className: 'border-clay-pink/30 bg-clay-pink/5',
  },
  {
    id: 'reply',
    icon: '💬',
    label: 'Log client reply',
    shortLabel: 'Client reply',
    description: 'Capture the response and decide the next move.',
    className: 'border-clay-mint/40 bg-clay-mint/10',
  },
  {
    id: 'sample',
    icon: '📦',
    label: 'Mark sample sent / received',
    shortLabel: 'Sample',
    description: 'Track whether the sample is sent or received.',
    className: 'border-clay-ochre/30 bg-clay-ochre/5',
  },
  {
    id: 'testing',
    icon: '🧪',
    label: 'Set testing date',
    shortLabel: 'Testing',
    description: 'Book the client kitchen test.',
    className: 'border-clay-lavender/40 bg-clay-lavender/10',
  },
  {
    id: 'reschedule',
    icon: '📅',
    label: 'Reschedule follow-up',
    shortLabel: 'Follow-up',
    description: 'Set the next date and one nudge level.',
    className: 'border-clay-hairline bg-clay-surface',
  },
  {
    id: 'parked',
    icon: '⏸',
    label: 'Park deal',
    shortLabel: 'Parked',
    description: 'Pause the deal until its revisit date.',
    className: 'border-clay-hairline bg-clay-card/60',
  },
  {
    id: 'success',
    icon: '🎉',
    label: 'Deal successful / happy customer',
    shortLabel: 'Successful',
    description: 'Won customers and their next success step.',
    className: 'border-clay-teal/30 bg-clay-mint/10',
  },
];

export const WORKFLOW_BY_ID = Object.fromEntries(
  WORKFLOW_LANES.map(lane => [lane.id, lane])
) as Record<DealWorkflowAction, WorkflowLane>;

/** Claymation mascot per lane. Success uses the trophy variant; celebrations randomize trophy/confetti. */
export const LANE_MASCOT_PATHS: Record<DealWorkflowAction, string> = {
  outreach: '/assets/mascots/mascot-outreach.png',
  reply: '/assets/mascots/mascot-reply.png',
  sample: '/assets/mascots/mascot-sample.png',
  testing: '/assets/mascots/mascot-testing.png',
  reschedule: '/assets/mascots/mascot-teardrop.png',
  parked: '/assets/mascots/mascot-parked.png',
  success: '/assets/mascots/mascot-won-trophy.png',
};

export const NUDGE_OPTIONS: Array<{ value: NudgeStage; label: string; days: number }> = [
  { value: 'warm', label: 'Warm nudge', days: 3 },
  { value: 'remind', label: 'Remind nudge', days: 7 },
  { value: 'firm', label: 'Firm nudge', days: 14 },
  { value: 'parking', label: 'Parking nudge', days: 21 },
];

export const SAMPLE_STATUS_OPTIONS: Array<{ value: SampleStatus; label: string }> = [
  { value: 'sent', label: 'Sent to client' },
  { value: 'received', label: 'Received by client' },
];

/** Keeps existing database records useful before they have been explicitly assigned. */
export function getWorkflowAction(deal: Deal): DealWorkflowAction {
  if (deal.workflow_action) return deal.workflow_action;
  if (deal.stage === 'closed_won') return 'success';
  if (deal.stage === 'negotiation') return 'testing';
  if (deal.stage === 'proposal') return 'sample';
  if (deal.stage === 'contacted') return 'reply';
  return 'outreach';
}

export function nudgeLabel(nudgeStage?: NudgeStage | null) {
  return NUDGE_OPTIONS.find(option => option.value === nudgeStage)?.label || null;
}
