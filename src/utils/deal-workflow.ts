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

/** Soft HexFace kind per lane (SVG faces — replaces PNG mascots on the board chrome). */
export type DealHexKind = 'call' | 'message' | 'package' | 'search' | 'pause' | 'success';

export const LANE_HEX_KIND: Record<DealWorkflowAction, DealHexKind> = {
  outreach: 'call',
  reply: 'message',
  sample: 'package',
  testing: 'search',
  reschedule: 'pause',
  parked: 'pause',
  success: 'success',
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
  if (deal.stage === 'closed_lost') return 'parked'; // archived/closed deals rest in Parked
  if (deal.stage === 'negotiation') return 'testing';
  if (deal.stage === 'proposal') return 'sample';
  if (deal.stage === 'contacted') return 'reply';
  return 'outreach';
}

export function nudgeLabel(nudgeStage?: NudgeStage | null) {
  return NUDGE_OPTIONS.find(option => option.value === nudgeStage)?.label || null;
}

/**
 * Interaction log is the single source of truth. Logging an interaction against a
 * deal advances its workflow lane AND its derived pipeline stage in the same save.
 * These mappings keep stage in sync with workflow_action so both boards agree.
 */
export const STAGE_FROM_WORKFLOW: Record<DealWorkflowAction, Deal['stage']> = {
  outreach: 'research',
  reply: 'contacted',
  sample: 'proposal',
  testing: 'negotiation',
  reschedule: 'contacted', // cadence touch — assume still in conversation
  parked: 'research', // shelved
  success: 'closed_won',
};

export function stageFromWorkflow(action: DealWorkflowAction, current?: Deal['stage']): Deal['stage'] {
  // reschedule / parked are cadence-only: keep the deal's current stage.
  if (action === 'reschedule' || action === 'parked') return current || STAGE_FROM_WORKFLOW[action];
  return STAGE_FROM_WORKFLOW[action];
}

/**
 * Nudge stage only applies at/after the sample-sent step. Earlier lanes
 * (outreach, reply) must NOT offer a nudge — per Pat's rule.
 */
export function canNudge(workflow: DealWorkflowAction): boolean {
  return ['sample', 'testing', 'reschedule', 'success'].includes(workflow);
}

/**
 * Normal forward workflow lane. Logging an interaction never applies this
 * automatically; the Log modal may offer it as an explicit, validated choice.
 */
export const NEXT_WORKFLOW: Partial<Record<DealWorkflowAction, DealWorkflowAction>> = {
  outreach: 'reply',
  reply: 'sample',
  sample: 'testing',
  testing: 'success',
  reschedule: 'reschedule',
  parked: 'parked',
  success: 'success',
};

/**
 * Coherent nudge-stage colors — one hue per stage, used everywhere
 * (chips, LaneGate, DealDetail, Nudges legend).
 *   warm    → butter/ochre  (gentle first tap)
 *   remind  → lavender      (the primary clay accent)
 *   firm    → coral         (escalating attention)
 *   parking → muted         (stepped-back / shelved)
 */
export const NUDGE_COLOR_CLASS: Record<NudgeStage, string> = {
  warm: 'bg-clay-ochre/15 text-clay-ochre border-clay-ochre/30',
  remind: 'bg-clay-lavender/20 text-clay-lavender border-clay-lavender/30',
  firm: 'bg-clay-coral/15 text-clay-coral border-clay-coral/30',
  parking: 'bg-clay-card text-clay-muted-soft border-clay-hairline',
};

export function nudgeColorClass(nudgeStage?: NudgeStage | null): string {
  if (!nudgeStage) return 'bg-clay-card text-clay-muted-soft border-clay-hairline';
  return NUDGE_COLOR_CLASS[nudgeStage];
}
