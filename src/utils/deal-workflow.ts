// Type-only: the Node-run report scripts load this module directly, and a value
// import of types fails at runtime (types have no runtime export). See
// retentionCadence.ts for the same convention.
import type { Deal, DealWorkflowAction, NudgeStage, SampleStatus } from '@/types/crm';

export interface WorkflowLane {
  id: DealWorkflowAction;
  icon: string;
  label: string;
  shortLabel: string;
  description: string;
  className: string;
}

/**
 * Journey board columns only. Won / Lost / Park are exits (card menu), not lanes.
 * Drag moves along this journey; exits never appear as drop targets.
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
    label: 'Waiting on reply',
    shortLabel: 'Waiting on reply',
    description: 'Outreach logged — waiting for the client to respond.',
    className: 'border-clay-mint/40 bg-clay-mint/10',
  },
  {
    id: 'sample',
    icon: '📦',
    label: 'Track sample delivery',
    shortLabel: 'Sample',
    description: 'Address and send intent confirmed; track delivery.',
    className: 'border-clay-ochre/30 bg-clay-ochre/5',
  },
  {
    id: 'testing',
    icon: '🧪',
    label: 'Set testing date',
    shortLabel: 'Testing',
    description: 'Sample delivered — book the client kitchen test.',
    className: 'border-clay-lavender/40 bg-clay-lavender/10',
  },
  {
    id: 'reschedule',
    icon: '📅',
    label: 'Follow-up',
    shortLabel: 'Follow-up',
    description: 'Feedback due or logged — schedule the next touch.',
    className: 'border-clay-hairline bg-clay-surface',
  },
];

/** Exit states kept for DB compatibility / filters — never journey columns. */
export const EXIT_WORKFLOW_META: Record<'parked' | 'success', WorkflowLane> = {
  parked: {
    id: 'parked',
    icon: '⏸',
    label: 'Parked',
    shortLabel: 'Parked',
    description: 'Paused until a revisit date.',
    className: 'border-clay-hairline bg-clay-card/60',
  },
  success: {
    id: 'success',
    icon: '🎉',
    label: 'Won',
    shortLabel: 'Won',
    description: 'Closed won — first order recorded.',
    className: 'border-clay-teal/30 bg-clay-mint/10',
  },
};

export const WORKFLOW_BY_ID = {
  ...Object.fromEntries(WORKFLOW_LANES.map(lane => [lane.id, lane])),
  ...EXIT_WORKFLOW_META,
} as Record<DealWorkflowAction, WorkflowLane>;

export const JOURNEY_LANE_IDS: DealWorkflowAction[] = WORKFLOW_LANES.map(l => l.id);

export function isJourneyLane(action: DealWorkflowAction): boolean {
  return JOURNEY_LANE_IDS.includes(action);
}

/** Claymation mascot per lane / exit. */
export const LANE_MASCOT_PATHS: Record<DealWorkflowAction, string> = {
  outreach: '/assets/mascots/mascot-outreach.png',
  reply: '/assets/mascots/mascot-reply.png',
  sample: '/assets/mascots/mascot-sample.png',
  testing: '/assets/mascots/mascot-testing.png',
  reschedule: '/assets/mascots/mascot-teardrop.png',
  parked: '/assets/mascots/mascot-parked.png',
  success: '/assets/mascots/mascot-won-trophy.png',
};

/** Derived nudge thresholds (silence days past follow-up). Not editable stages. */
export const DERIVED_NUDGE_OPTIONS: Array<{
  value: NudgeStage;
  label: string;
  code: string;
  minDays: number;
}> = [
  { value: 'warm', label: 'Warm', code: 'NG-001', minDays: 3 },
  { value: 'remind', label: 'Remind', code: 'NG-002', minDays: 7 },
  { value: 'firm', label: 'Firm', code: 'NG-003', minDays: 14 },
  { value: 'parking', label: 'Suggest Park', code: 'NG-004', minDays: 21 },
];

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

/** @deprecated Prefer DERIVED_NUDGE_OPTIONS — kept for legacy imports. */
export const NUDGE_OPTIONS = DERIVED_NUDGE_OPTIONS.map(o => ({
  value: o.value,
  label: `${o.label} nudge`,
  days: o.minDays,
}));

export const SAMPLE_STATUS_OPTIONS: Array<{ value: SampleStatus; label: string }> = [
  { value: 'sent', label: 'Sent to client' },
  { value: 'received', label: 'Received by client' },
];

export const LOST_REASON_OPTIONS = [
  { value: 'price', label: 'Price' },
  { value: 'taste', label: 'Taste' },
  { value: 'timing', label: 'Timing' },
  { value: 'vendor_list', label: 'Vendor list' },
  { value: 'no_reply', label: 'No reply' },
  { value: 'other', label: 'Other' },
] as const;

export type LostReason = (typeof LOST_REASON_OPTIONS)[number]['value'];

/** Active journey board membership (excludes exits). */
export function isOnJourneyBoard(deal: Deal): boolean {
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return false;
  const action = getWorkflowAction(deal);
  return action !== 'parked' && action !== 'success';
}

/** Keeps existing database records useful before they have been explicitly assigned. */
export function getWorkflowAction(deal: Deal): DealWorkflowAction {
  if (deal.workflow_action) return deal.workflow_action;
  if (deal.stage === 'closed_won') return 'success';
  if (deal.stage === 'closed_lost') return 'parked';
  if (deal.stage === 'negotiation') return 'testing';
  if (deal.stage === 'proposal') return 'sample';
  if (deal.stage === 'contacted') return 'reply';
  return 'outreach';
}

export function nudgeLabel(nudgeStage?: NudgeStage | null) {
  const hit = DERIVED_NUDGE_OPTIONS.find(option => option.value === nudgeStage);
  return hit ? `${hit.label} ${hit.code}` : null;
}

/**
 * Days of silence past the follow-up date (0 if not overdue / no date).
 */
export function silenceDaysPastFollowup(deal: Deal, today: string): number {
  if (!deal.followup_date) return 0;
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return 0;
  if (getWorkflowAction(deal) === 'parked') return 0;
  if (deal.followup_date >= today) return 0;
  const a = new Date(`${deal.followup_date}T00:00:00`).getTime();
  const b = new Date(`${today}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

export interface DerivedNudge {
  stage: NudgeStage;
  label: string;
  code: string;
  silenceDays: number;
  suggestPark: boolean;
}

/** Human channels only: phone / LINE / IG / WhatsApp (call + dm + meeting). Not email. */
export const HUMAN_TOUCH_MEETING_TYPES = ['call', 'dm', 'meeting'] as const;

export function isHumanTouchMeetingType(type: string): boolean {
  return (HUMAN_TOUCH_MEETING_TYPES as readonly string[]).includes(type);
}

/** Latest human-touch date (YYYY-MM-DD) for a deal. */
export function lastHumanTouchDateForDeal(
  meetings: Array<{ deal_id?: string | null; type: string; date: string }>,
  dealId: string
): string | null {
  const touches = meetings
    .filter(m => m.deal_id === dealId && isHumanTouchMeetingType(m.type) && m.date)
    .map(m => m.date.slice(0, 10))
    .sort((a, b) => b.localeCompare(a));
  return touches[0] || null;
}

function daysBetweenKeys(earlier: string, later: string): number {
  const a = new Date(`${earlier.slice(0, 10)}T00:00:00`).getTime();
  const b = new Date(`${later.slice(0, 10)}T00:00:00`).getTime();
  return Math.max(0, Math.round((b - a) / 86400000));
}

/**
 * Silence for the ladder — prefer last human touch; fall back to overdue follow-up.
 * Log touch resets toward Warm by advancing lastHumanTouch to today.
 */
export function silenceDaysForLadder(
  deal: Deal,
  today: string,
  lastHumanTouch?: string | null
): number {
  if (deal.stage === 'closed_won' || deal.stage === 'closed_lost') return 0;
  if (getWorkflowAction(deal) === 'parked') return 0;
  if (lastHumanTouch) return daysBetweenKeys(lastHumanTouch, today);
  return silenceDaysPastFollowup(deal, today);
}

/**
 * Nudge badge derived from last human touch (preferred) or follow-up silence — never editable.
 */
export function deriveNudge(
  deal: Deal,
  today: string,
  opts?: { lastHumanTouch?: string | null }
): DerivedNudge | null {
  const silence = silenceDaysForLadder(deal, today, opts?.lastHumanTouch);
  if (silence < 3) return null;
  let match = DERIVED_NUDGE_OPTIONS[0];
  for (const opt of DERIVED_NUDGE_OPTIONS) {
    if (silence >= opt.minDays) match = opt;
  }
  return {
    stage: match.value,
    label: match.label,
    code: match.code,
    silenceDays: silence,
    suggestPark: match.value === 'parking',
  };
}

/** Human chip like "~7d Remind NG-002". */
export function formatDerivedNudgeBadge(n: DerivedNudge): string {
  const approx =
    n.stage === 'warm' ? 3 : n.stage === 'remind' ? 7 : n.stage === 'firm' ? 14 : 21;
  return `~${approx}d ${n.label} ${n.code}`;
}

export function derivedNudgeChip(deal: Deal, today: string): string | null {
  const n = deriveNudge(deal, today);
  return n ? formatDerivedNudgeBadge(n) : null;
}

/**
 * Interaction log is the single source of truth for derived pipeline stage.
 * Journey moves no longer go straight to closed_won via drag.
 */
export const STAGE_FROM_WORKFLOW: Record<DealWorkflowAction, Deal['stage']> = {
  outreach: 'research',
  reply: 'contacted',
  sample: 'proposal',
  testing: 'negotiation',
  reschedule: 'contacted',
  parked: 'research',
  success: 'closed_won',
};

export function stageFromWorkflow(action: DealWorkflowAction, current?: Deal['stage']): Deal['stage'] {
  if (action === 'reschedule' || action === 'parked') return current || STAGE_FROM_WORKFLOW[action];
  return STAGE_FROM_WORKFLOW[action];
}

/** @deprecated Nudge is derived — never gated as an editable lane field. */
export function canNudge(_workflow: DealWorkflowAction): boolean {
  return false;
}

/**
 * Normal forward journey. Testing advances to Follow-up, not Won.
 * Won is an exit only.
 */
export const NEXT_WORKFLOW: Partial<Record<DealWorkflowAction, DealWorkflowAction>> = {
  outreach: 'reply',
  reply: 'sample',
  sample: 'testing',
  testing: 'reschedule',
  reschedule: 'reschedule',
  parked: 'parked',
  success: 'success',
};

export const NUDGE_COLOR_CLASS: Record<NudgeStage, string> = {
  // Clay/VG Saveur ladder: green Warm → orange Remind → rust Firm → grey Parking
  warm: 'bg-clay-success/20 text-clay-success border-clay-success/40',
  remind: 'bg-[#d97706]/15 text-[#c2410c]/90 border-[#d97706]/40',
  firm: 'bg-[#c2410c]/15 text-[#9a3412] border-[#c2410c]/40',
  parking: 'bg-clay-muted-soft/25 text-clay-muted border-clay-hairline',
};

export function nudgeColorClass(nudgeStage?: NudgeStage | null): string {
  if (!nudgeStage) return 'bg-clay-card text-clay-muted-soft border-clay-hairline';
  return NUDGE_COLOR_CLASS[nudgeStage];
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Ladder rungs for NudgeLadderRail — Warm → Remind → Firm → Parking. */
export const NUDGE_LADDER_RUNGS: Array<{
  stage: NudgeStage;
  label: string;
  shortLabel: string;
  days: number;
  code: string;
  /** Clay/VG Saveur: green → orange → rust → grey */
  color: string;
  track: string;
}> = [
  { stage: 'warm', label: 'Warm 3d', shortLabel: 'Warm', days: 3, code: 'NG-001', color: '#3daf7a', track: 'rgba(61,175,122,0.22)' },
  { stage: 'remind', label: 'Remind 7d', shortLabel: 'Remind', days: 7, code: 'NG-002', color: '#d97706', track: 'rgba(217,119,6,0.22)' },
  { stage: 'firm', label: 'Firm 14d', shortLabel: 'Firm', days: 14, code: 'NG-003', color: '#c2410c', track: 'rgba(194,65,12,0.22)' },
  { stage: 'parking', label: 'Parking 21d', shortLabel: 'Parking', days: 21, code: 'NG-004', color: '#78716c', track: 'rgba(120,113,108,0.28)' },
];

export function nudgeLadderIndex(stage?: NudgeStage | null): number {
  if (!stage) return -1;
  return NUDGE_LADDER_RUNGS.findIndex(r => r.stage === stage);
}

/** Map raw silence days to a ladder stage (null if under Warm threshold). */
export function stageFromSilenceDays(silenceDays: number): NudgeStage | null {
  if (silenceDays < 3) return null;
  let match: NudgeStage = 'warm';
  for (const rung of NUDGE_LADDER_RUNGS) {
    if (silenceDays >= rung.days) match = rung.stage;
  }
  return match;
}
