// ─── Quick-Action Stages ───
// Predefined deal progression actions replacing free-text next_action fills
// Each maps to a stage transition + optional date/nudge selection

export type QuickAction =
  | 'log_outreach'      // ✅ Log outreach
  | 'log_reply'         // 💬 Log client reply
  | 'sample_sent'       // 📦 Mark sample sent
  | 'sample_received'   // 📦 Mark sample received
  | 'testing_date'      // 🧪 Set testing date
  | 'reschedule'        // 📅 Reschedule follow-up
  | 'park'              // ⏸ Park deal with revisit date
  | 'success'           // 🎉 Deal successful
  | 'custom';           // ⚙️ Custom action (free text)

export interface QuickActionMeta {
  icon: string;
  label: string;
  color: string;
  description: string;
  stageFrom: string[];      // stages this action applies to
  stageTo: string;          // resulting stage
  requiresDate: boolean;    // show date picker
  requiresFollowupDate: boolean; // sets followup_date
}

export const QUICK_ACTIONS: Record<string, QuickActionMeta> = {
  log_outreach: {
    icon: '✅',
    label: 'Log outreach',
    color: 'bg-clay-pink/10 text-clay-pink border-clay-pink/30',
    description: 'Log that you sent an email, call, or nudge',
    stageFrom: ['research'],
    stageTo: 'contacted',
    requiresDate: true,
    requiresFollowupDate: true,
  },
  log_reply: {
    icon: '💬',
    label: 'Log client reply',
    color: 'bg-clay-mint/10 text-clay-teal border-clay-mint/30',
    description: 'Record positive, neutral, or negative client response',
    stageFrom: ['contacted', 'proposal', 'negotiation', 'research'],
    stageTo: 'proposal',
    requiresDate: true,
    requiresFollowupDate: true,
  },
  sample_sent: {
    icon: '📦',
    label: 'Mark sample sent',
    color: 'bg-clay-ochre/10 text-clay-ochre border-clay-ochre/30',
    description: 'Butter/sample dispatched to client kitchen',
    stageFrom: ['contacted', 'proposal', 'negotiation'],
    stageTo: 'proposal',
    requiresDate: true,
    requiresFollowupDate: true,
  },
  sample_received: {
    icon: '📦',
    label: 'Mark sample received',
    color: 'bg-clay-lavender/10 text-clay-lavender border-clay-lavender/30',
    description: 'Client confirmed receipt of sample',
    stageFrom: ['proposal'],
    stageTo: 'negotiation',
    requiresDate: true,
    requiresFollowupDate: true,
  },
  testing_date: {
    icon: '🧪',
    label: 'Set testing date',
    color: 'bg-clay-pink/10 text-clay-pink border-clay-pink/30',
    description: 'Client agreed to test butter in their kitchen',
    stageFrom: ['proposal', 'negotiation'],
    stageTo: 'negotiation',
    requiresDate: true,
    requiresFollowupDate: true,
  },
  reschedule: {
    icon: '📅',
    label: 'Reschedule follow-up',
    color: 'bg-clay-ink/10 text-clay-ink border-clay-hairline',
    description: 'Pick a new follow-up date with nudge stage (N1, N2, N3, N4)',
    stageFrom: ['research', 'contacted', 'proposal', 'negotiation'],
    stageTo: 'contacted',
    requiresDate: true,
    requiresFollowupDate: true,
  },
  park: {
    icon: '⏸',
    label: 'Park deal (revisit date)',
    color: 'bg-clay-muted/10 text-clay-muted border-clay-hairline',
    description: 'Pause this deal and set a revisit date',
    stageFrom: ['research', 'contacted', 'proposal', 'negotiation'],
    stageTo: 'research',
    requiresDate: true,
    requiresFollowupDate: true,
  },
  success: {
    icon: '🎉',
    label: 'Deal successful',
    color: 'bg-clay-teal/10 text-clay-teal border-clay-teal/30',
    description: 'Close deal as won — move to closed_won',
    stageFrom: ['negotiation', 'proposal', 'contacted'],
    stageTo: 'closed_won',
    requiresDate: true,
    requiresFollowupDate: false,
  },
  custom: {
    icon: '⚙️',
    label: 'Custom action',
    color: 'bg-clay-card text-clay-muted border-clay-hairline',
    description: 'Write a custom outcome and set next steps',
    stageFrom: [],
    stageTo: '',
    requiresDate: true,
    requiresFollowupDate: true,
  },
};

// ── Nudge stage options for reschedule ──
export const NUDGE_STAGES = [
  { label: 'Warm nudge', value: 'warm', days: 3 },
  { label: 'Remind nudge', value: 'remind', days: 7 },
  { label: 'Firm nudge', value: 'firm', days: 14 },
  { label: 'Parking nudge', value: 'parking', days: 21 },
];

// ── Sentiment options for log_reply ──
export const REPLY_SENTIMENTS = [
  { label: '✅ Positive — interested', value: 'positive' },
  { label: '🟡 Neutral — need more info', value: 'neutral' },
  { label: '🔴 Negative — not interested', value: 'negative' },
];
